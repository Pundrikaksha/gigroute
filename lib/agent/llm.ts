import 'server-only'
import OpenAI from 'openai'
import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import {
  applyToolResult,
  createPlan,
  matchingTags,
  narrateTour,
  signalEntityIds,
  type Plan,
  type PlanInput,
} from './plan'

export interface AssistantMessage {
  role: 'assistant'
  content?: string | null
  tool_calls?: ChatCompletionMessageFunctionToolCall[]
}

export interface LLMClient {
  chat(messages: ChatCompletionMessageParam[], tools: ChatCompletionFunctionTool[]): Promise<AssistantMessage>
}

export function isLLMMock(): boolean {
  return !process.env.LLM_API_KEY
}

export function getLLMClient(options: { forceMock?: boolean } = {}): LLMClient {
  if (options.forceMock || isLLMMock()) {
    return new MockLLM()
  }
  return new OpenAILLM()
}

// Thin adapter over any OpenAI-compatible chat completions endpoint.
class OpenAILLM implements LLMClient {
  private client = new OpenAI({
    baseURL: process.env.LLM_BASE_URL || undefined,
    apiKey: process.env.LLM_API_KEY,
  })

  async chat(messages: ChatCompletionMessageParam[], tools: ChatCompletionFunctionTool[]): Promise<AssistantMessage> {
    const model = process.env.LLM_MODEL
    if (!model) throw new Error('LLM_MODEL must be set when LLM_API_KEY is set')

    const res = await this.client.chat.completions.create({ model, messages, tools })
    const message = res.choices[0]?.message
    return {
      role: 'assistant',
      content: message?.content ?? null,
      tool_calls: message?.tool_calls?.filter((t) => t.type === 'function'),
    }
  }
}

/** Rebuild the plan and the set of completed tools from the conversation so far. */
function replay(messages: ChatCompletionMessageParam[]): { plan: Plan; done: Set<string> } {
  const userMessage = messages.find((m) => m.role === 'user')
  const input = JSON.parse(String(userMessage?.content ?? '{}')) as PlanInput
  let plan = createPlan(input)
  const done = new Set<string>()
  const calls = new Map<string, { name: string; args: Record<string, unknown> }>()
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const c of m.tool_calls) {
        if (c.type === 'function') calls.set(c.id, { name: c.function.name, args: JSON.parse(c.function.arguments) })
      }
    }
    if (m.role === 'tool') {
      const call = calls.get(m.tool_call_id)
      if (!call) continue
      done.add(call.name)
      plan = applyToolResult(plan, call.name, call.args, JSON.parse(String(m.content)))
    }
  }
  return { plan, done }
}

/**
 * A deterministic planner that walks the tool chain the same way the system prompt asks a real
 * LLM to, reading earlier tool results from the conversation. No network, no key needed.
 */
export class MockLLM implements LLMClient {
  private callCount = 0

  async chat(messages: ChatCompletionMessageParam[]): Promise<AssistantMessage> {
    this.callCount++
    const { plan, done } = replay(messages)
    const ids = signalEntityIds(plan)

    if (!done.has('resolve_artist')) {
      return this.toolCalls([['resolve_artist', { artist_name: plan.input.artist }]])
    }
    if (!plan.artist) {
      return this.text(`I couldn't find "${plan.input.artist}" in Qloo. Try another spelling or a better-known artist.`)
    }
    if (!done.has('similar_artists')) {
      return this.toolCalls([['similar_artists', { entity_ids: [plan.artist.id] }]])
    }
    if (!done.has('fan_hotspots')) {
      return this.toolCalls([['fan_hotspots', { entity_ids: ids, region: plan.input.region }]])
    }
    if (plan.stops.length === 0) {
      return this.text(`Qloo returned no fan hotspots for ${plan.artist.name}${plan.input.region ? ` in ${plan.input.region}` : ''}.`)
    }
    if (!done.has('venues_in_city')) {
      return this.toolCalls(plan.stops.map((s) => ['venues_in_city', { entity_ids: ids, city: s.city, ...(plan.input.region ? { region: plan.input.region } : {}) }]))
    }
    if (!done.has('cross_domain_tastes')) {
      return this.toolCalls([
        ['cross_domain_tastes', { entity_ids: [plan.artist.id], type: 'brand' }],
        ['cross_domain_tastes', { entity_ids: [plan.artist.id], type: 'movie' }],
      ])
    }
    if (!done.has('plan_route')) {
      return this.toolCalls([['plan_route', { stops: plan.stops.map((s) => s.city) }]])
    }
    // The first routed stop can have no venues (e.g. its lookup failed), so pitch the first stop that has one.
    const topVenue = plan.stops.find((s) => s.venues && s.venues.length > 0)?.venues?.[0]
    if (!done.has('draft_pitch') && topVenue) {
      const why = matchingTags(plan, topVenue.tags).map((t) => t.name).join(', ')
      return this.toolCalls([['draft_pitch', { venue_name: topVenue.name, artist_name: plan.artist.name, why, ...(plan.artist.sampleOf ? { sample_of: plan.artist.sampleOf } : {}) }]])
    }

    return this.text(narrateTour(plan).summary)
  }

  private text(content: string): AssistantMessage {
    return { role: 'assistant', content }
  }

  private toolCalls(calls: [string, Record<string, unknown>][]): AssistantMessage {
    return {
      role: 'assistant',
      tool_calls: calls.map(([name, args], i) => ({
        id: `call_${this.callCount}_${i}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      })),
    }
  }
}
