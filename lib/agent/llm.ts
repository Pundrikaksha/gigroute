import 'server-only'
import OpenAI from 'openai'
import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'

export interface AssistantMessage {
  role: 'assistant'
  content?: string | null
  tool_calls?: ChatCompletionMessageFunctionToolCall[]
}

export interface LLMClient {
  chat(messages: ChatCompletionMessageParam[], tools: ChatCompletionFunctionTool[]): Promise<AssistantMessage>
}

export function getLLMClient(): LLMClient {
  if (!process.env.LLM_API_KEY) {
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

// A deterministic MockLLM that walks the tool chain in a fixed order and writes template text.
export class MockLLM implements LLMClient {
  private callCount = 0

  async chat(): Promise<AssistantMessage> {
    this.callCount++

    // Fixed order of tool calls based on callCount
    if (this.callCount === 1) {
      return this.createToolResponse('resolve_artist', { artist_name: 'Radiohead' })
    }
    if (this.callCount === 2) {
      return this.createToolResponse('similar_artists', { entity_ids: ['urn:entity:artist:mock-radiohead'] })
    }
    if (this.callCount === 3) {
      return this.createToolResponse('fan_hotspots', { entity_ids: ['urn:entity:artist:mock-radiohead'], region: 'UK' })
    }
    if (this.callCount === 4) {
      return this.createToolResponse('venues_in_city', { entity_ids: ['urn:entity:artist:mock-radiohead'], city: 'London, UK' })
    }
    if (this.callCount === 5) {
      return this.createToolResponse('cross_domain_tastes', { entity_ids: ['urn:entity:artist:mock-radiohead'], type: 'brand' })
    }
    if (this.callCount === 6) {
      return this.createToolResponse('plan_route', { stops: ['London, UK', 'Manchester, UK'] })
    }
    if (this.callCount === 7) {
      return this.createToolResponse('draft_pitch', { venue_name: 'O2 Academy Brixton', artist_name: 'Radiohead' })
    }

    // After 7 calls, return a final text response
    return {
      role: 'assistant',
      content: 'Here is your tour plan based on the collected data.',
    }
  }

  private createToolResponse(name: string, args: Record<string, unknown>): AssistantMessage {
    return {
      role: 'assistant',
      tool_calls: [{
        id: `call_${this.callCount}`,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(args)
        }
      }]
    }
  }
}
