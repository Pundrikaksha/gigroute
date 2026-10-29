import 'server-only'
import { matchingTags, type Plan } from './plan'

export const NEBIUS_DEFAULTS = {
  baseUrl: 'https://api.tokenfactory.nebius.com/v1/',
  model: 'nvidia/nemotron-3-super-120b-a12b',
  timeoutMs: 20000,
}

export function isNebiusEnabled(): boolean {
  return Boolean(process.env.NEBIUS_API_KEY)
}

async function doPolishSummary(
  plan: Plan,
  fallback: string,
  opts?: { fetchImpl?: typeof fetch; deadline?: number }
): Promise<{ summary: string; model: string } | { reason: string }> {
  if (!isNebiusEnabled()) return { reason: 'no_key' }
  if (!plan.artist || plan.stops.length === 0) return { reason: 'no_plan' }

  const apiKey = process.env.NEBIUS_API_KEY
  const baseUrl = (process.env.NEBIUS_BASE_URL || NEBIUS_DEFAULTS.baseUrl).replace(/\/$/, '')
  const model = process.env.NEBIUS_MODEL || NEBIUS_DEFAULTS.model
  const timeoutMs = Number(process.env.NEBIUS_TIMEOUT_MS) || NEBIUS_DEFAULTS.timeoutMs

  let effectiveTimeout = timeoutMs
  if (opts?.deadline) {
    effectiveTimeout = Math.min(timeoutMs, opts.deadline - Date.now())
  }
  if (effectiveTimeout < 2000) {
    return { reason: 'no_time' }
  }

  const facts = {
    artist: plan.artist.name,
    similar: plan.similarArtists.slice(0, 3).map((a) => a.name),
    stops: plan.stops.map((s) => ({
      city: s.city,
      affinity: s.affinity,
      venues: (s.venues ?? []).slice(0, 2).map((v) => v.name),
      sharedTags: (s.venues ?? [])
        .flatMap((v) => matchingTags(plan, v.tags))
        .map((t) => t.name)
        .filter((v, i, a) => a.indexOf(v) === i), // unique
    })),
    fallback,
  }

  const system = `write a 2-3 sentence tour summary for an indie artist's booking plan, use ONLY the facts provided, never invent venues, cities, numbers or artists, label affinities as group tendencies, plain text, no markdown, reply with the summary only.`
  const user = JSON.stringify(facts)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)

  const fetcher = opts?.fetchImpl ?? fetch

  try {
    const body: Record<string, unknown> = {
      model,
      temperature: 0.4,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }

    if (process.env.NEBIUS_REASONING !== 'default') {
      // Nebius Token Factory chat-completions schema accepts reasoning_effort none|minimal|low|medium|high|xhigh|max: https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion
      body.reasoning_effort = 'none'
      // NVIDIA model card: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b
      body.chat_template_kwargs = { enable_thinking: false }
    }

    const res = await fetcher(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) return { reason: `http_${res.status}` }

    let data
    try {
      data = await res.json()
    } catch {
      return { reason: 'parse_error' }
    }

    let content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') return { reason: 'invalid' }

    // Strip <think>...</think> and a dangling unclosed leading "...</think>" prefix
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '')
    const lastThinkIdx = content.lastIndexOf('</think>')
    if (lastThinkIdx !== -1) {
      content = content.substring(lastThinkIdx + 8)
    }

    content = content.replace(/^["'`\s]+|["'`\s]+$/g, '')

    if (!content) return { reason: 'empty' }
    if (content.length > 700) return { reason: 'too_long' }
    if (content.includes('http') || content.includes('@')) {
      return { reason: 'invalid' }
    }

    return { summary: content, model }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') return { reason: 'timeout' }
    return { reason: 'invalid' }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function polishSummary(
  plan: Plan,
  fallback: string,
  opts?: { fetchImpl?: typeof fetch; deadline?: number }
): Promise<{ summary: string; model: string } | null> {
  const result = await doPolishSummary(plan, fallback, opts)
  if ('reason' in result) {
    console.warn(`[nebius] fallback: ${result.reason}`)
    return null
  }
  return result
}
