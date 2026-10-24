import 'server-only'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { getLLMClient } from './llm'
import { tools, executeTool, type ToolArgs } from './tools'

const SYSTEM_PROMPT = `You are a tour planning assistant for GigRoute.
Use only tool results as evidence.
Never invent venues.
Label affinities as group tendencies, not individual preferences.
Ask the user to confirm ambiguous entities if resolve_artist returns needs_input.
You can make a maximum of 12 tool calls.`

export interface AgentEvent {
  step: string
  text: string
  partial?: unknown
  error?: string
}

export async function runAgent(input: unknown, onEvent: (event: AgentEvent) => void) {
  const llm = getLLMClient()
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(input) }
  ]

  let callCount = 0
  let finalResult: string | null = null

  while (callCount < 12) {
    callCount++
    const message = await llm.chat(messages, tools)
    messages.push(message)

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const name = toolCall.function.name
        const args: ToolArgs = JSON.parse(toolCall.function.arguments)

        onEvent({ step: name, text: `Running ${name}...`, partial: args })

        try {
          const result = await executeTool(name, args)
          if (typeof result === 'object' && 'needs_input' in result) {
            onEvent({ step: 'needs_input', text: 'Ambiguous artist, needs confirmation.', partial: result })
            return result
          }
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          })
          onEvent({ step: `${name}_result`, text: `Completed ${name}`, partial: result })
        } catch (e) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
          })
        }
      }
    } else {
      finalResult = message.content ?? null
      break
    }
  }

  onEvent({ step: 'done', text: 'Planning complete.', partial: finalResult })
  return finalResult
}
