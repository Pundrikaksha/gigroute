import 'server-only'
import { matchingTags, type Plan } from './plan'

export const NEBIUS_DEFAULTS = {
  baseUrl: 'https://api.tokenfactory.nebius.com/v1/',
  model: 'nvidia/nemotron-3-super-120b-a12b',
  timeoutMs: 8000,
}

export function isNebiusEnabled(): boolean {
  return Boolean(process.env.NEBIUS_API_KEY)
}

export async function polishSummary(
  plan: Plan,
  fallback: string,
  opts?: { fetchImpl?: typeof fetch }
): Promise<{ summary: string; model: string } | null> {
  if (!isNebiusEnabled()) return null
  if (!plan.artist || plan.stops.length === 0) return null

  const apiKey = process.env.NEBIUS_API_KEY
  const baseUrl = (process.env.NEBIUS_BASE_URL || NEBIUS_DEFAULTS.baseUrl).replace(/\/$/, '')
  const model = process.env.NEBIUS_MODEL || NEBIUS_DEFAULTS.model
  const timeoutMs = Number(process.env.NEBIUS_TIMEOUT_MS) || NEBIUS_DEFAULTS.timeoutMs

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
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const fetcher = opts?.fetchImpl ?? fetch

  try {
    const res = await fetcher(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) return null

    const data = await res.json()
    let content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    // Strip <think>...</think> and markdown quotes/backticks
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '')
    content = content.replace(/^["'`\s]+|["'`\s]+$/g, '')

    if (!content || content.length > 700 || content.includes('http') || content.includes('@')) {
      return null
    }

    return { summary: content, model }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
