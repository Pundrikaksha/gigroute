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

// Sentences that talk about the prompt or the data rather than the tour.
const META_SENTENCE =
  /\b(provided (data|facts)|additional details|invented|fallback|fixture data|derived (solely|directly)|come directly from|from the (input|data)|solely from|without (addition|assumption)|my instructions|these instructions)\b/i
// Trailing disclaimers such as ", not venue ranking or order." at the end of a sentence.
const META_CLAUSE =
  /[,;]?\s*(?:—\s*)?(?:and\s+)?(?:not|rather than|without|avoiding)\b[^.!?,;]*\b(?:rank(?:ing|ed)?|order(?:ing)?|hierarchy|guesswork|arbitrary|assumptions?|judg(?:e)?ment)\b[^.!?,;]*(?=[.!?])/gi

export function stripMetaSentences(text: string): string {
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text]
  return sentences
    .filter((sentence) => !META_SENTENCE.test(sentence))
    .map((sentence) => sentence.replace(META_CLAUSE, ''))
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function trimToSentences(text: string, soft = 600, hard = 700): string {
  let result = text.trim()

  let changed = true
  while (changed) {
    changed = false
    const match = result.match(
      /(?:^|([.!?]+\s+))([^.!?]*(?:provided data|provided facts|additional details)[^.!?]*[.!?]*)\s*$/i
    )
    if (match) {
      result = result.substring(0, result.length - match[2].length).trim()
      changed = true
    }
  }

  if (result.length > soft) {
    let lastBoundary = -1
    const punctuation = ['.', '!', '?']
    for (let i = soft; i >= 200; i--) {
      const char = result[i]
      const prevChar = result[i - 1]
      // boundary if current is space or undefined (end), and previous is punctuation
      if ((char === ' ' || char === undefined) && punctuation.includes(prevChar)) {
        lastBoundary = i - 1 // index of the punctuation
        break
      }
    }

    if (lastBoundary >= 200) {
      result = result.substring(0, lastBoundary + 1)
    } else {
      const upToSoft = result.substring(0, soft)
      const lastSpace = upToSoft.lastIndexOf(' ')
      if (lastSpace > -1) {
        result = upToSoft.substring(0, lastSpace) + '…'
      } else {
        result = upToSoft.substring(0, soft - 1) + '…'
      }
    }
  }

  if (result.length > hard) {
    result = result.substring(0, hard)
  }

  return result
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

  const system = `Write 2-3 plain-text sentences, under 450 characters in total, summarising this tour plan for an indie artist's booking agent. Use only the facts given and never invent venues, cities, numbers or artists. Describe affinities as group tendencies. Name the cities in the order given (the route is geographic). Write only about the tour itself: do not mention these instructions, the input data, the fallback text, how stops were ranked or ordered, or what you did not do. No markdown. Reply with the summary only.`
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
    content = trimToSentences(stripMetaSentences(content))

    if (!content) return { reason: 'empty' }
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
