import 'server-only'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { getLLMClient } from './llm'
import { tools, executeTool, type ToolArgs } from './tools'
import { getQlooClient } from '../qloo'
import { applyToolResult, createPlan, type Plan, type PlanInput } from './plan'

const MAX_LLM_CALLS = 12

const SYSTEM_PROMPT = `You are a tour planning assistant for GigRoute.
Work in this order: resolve_artist, similar_artists, fan_hotspots, venues_in_city (once per stop, in parallel),
cross_domain_tastes (brand and movie), plan_route, then draft_pitch for the strongest venue.
For fan_hotspots and venues_in_city pass the artist ID plus its top 3 similar artist IDs.
Respect the requested stop count, region and candidate cities.
Use only tool results as evidence. Never invent venues or cities.
Label affinities as group tendencies, not individual preferences.
If resolve_artist returns needs_input, stop and ask the user to pick a candidate.
Finish with a two-sentence summary of the route. You can make at most ${MAX_LLM_CALLS} model calls.`

export interface AgentEvent {
  step: string
  text: string
  partial?: unknown
  error?: string
  plan?: Plan
}

export interface AgentOptions {
  /** Force MockLLM + MockQlooClient for this run (demo preset). */
  mock?: boolean
  /** Pause between steps so streaming is visible in instant mock runs. */
  stepDelayMs?: number
}

const STEP_LABELS: Record<string, (args: ToolArgs) => string> = {
  resolve_artist: (a) => `Looking up “${a.artist_name}” in Qloo`,
  similar_artists: () => 'Finding similar artists for co-bills',
  fan_hotspots: (a) => `Mapping fan hotspots${a.region ? ` in ${a.region}` : ''}`,
  venues_in_city: (a) => `Ranking venues in ${a.city}`,
  cross_domain_tastes: (a) => `Finding ${a.type} tastes for merch ideas`,
  plan_route: () => 'Ordering stops into a route',
  draft_pitch: (a) => `Drafting a pitch for ${a.venue_name}`,
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runAgent(input: PlanInput, onEvent: (event: AgentEvent) => void, options: AgentOptions = {}) {
  const llm = getLLMClient({ forceMock: options.mock })
  const qloo = getQlooClient({ forceMock: options.mock })
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(input) },
  ]
  let plan = createPlan(input)
  let finalResult: string | null = null

  for (let callCount = 0; callCount < MAX_LLM_CALLS; callCount++) {
    const message = await llm.chat(messages, tools)
    messages.push(message)

    if (!message.tool_calls || message.tool_calls.length === 0) {
      finalResult = message.content ?? null
      break
    }

    const calls = message.tool_calls.map((toolCall) => {
      const name = toolCall.function.name
      let args: ToolArgs = {}
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch {
        // Leave args empty; the tool will report what is missing.
      }
      onEvent({ step: name, text: `${STEP_LABELS[name]?.(args) ?? `Running ${name}`}…`, partial: args })
      return { toolCall, name, args }
    })

    // Parallel tool calls (e.g. venues for every stop) run concurrently.
    const outcomes = await Promise.allSettled(calls.map((c) => executeTool(c.name, c.args, qloo)))

    for (const [i, outcome] of outcomes.entries()) {
      const { toolCall, name, args } = calls[i]
      if (outcome.status === 'rejected') {
        const error = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error }) })
        onEvent({ step: `${name}_error`, text: `${name} failed.`, error })
        continue
      }
      const result = outcome.value
      if (result && typeof result === 'object' && 'needs_input' in result) {
        plan = applyToolResult(plan, name, args as Record<string, unknown>, result)
        onEvent({ step: 'needs_input', text: 'Several artists match. Pick one to continue.', partial: result, plan })
        return result
      }
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) })
      plan = applyToolResult(plan, name, args as Record<string, unknown>, result)
      onEvent({ step: `${name}_result`, text: `Done: ${STEP_LABELS[name]?.(args) ?? name}`, partial: result, plan })
    }

    if (options.stepDelayMs) await sleep(options.stepDelayMs)
  }

  onEvent({ step: 'done', text: 'Planning complete.', partial: finalResult, plan })
  return finalResult
}
