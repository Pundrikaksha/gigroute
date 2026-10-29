import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { polishSummary, NEBIUS_DEFAULTS } from '../lib/agent/nebius'
import { type Plan } from '../lib/agent/plan'

vi.mock('server-only', () => ({}))

const mockPlan = {
  artist: { name: 'Test Artist', id: '1', tags: [] },
  stops: [
    { city: 'Test City', affinity: 0.8, venues: [{ name: 'Venue 1', tags: [] }], tags: [], explainability: [] },
  ],
  similarArtists: [{ name: 'Similar 1', id: '2', tags: [] }],
} as unknown as Plan

describe('polishSummary', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  test('returns null when NEBIUS_API_KEY is unset and logs fallback', async () => {
    delete process.env.NEBIUS_API_KEY
    const result = await polishSummary(mockPlan, 'fallback')
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[nebius] fallback: no_key')
  })

  test('returns null and logs invalid when fetch rejects with a network error', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Network error'))
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[nebius] fallback: invalid')
  })

  test('returns null and logs http_500 when fetch returns 500', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[nebius] fallback: http_500')
  })

  test('returns summary + model and strips <think> blocks and dangling prefix', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'unclosed think prefix</think>This is the final polished summary.',
            },
          },
        ],
      }),
    })

    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })

    expect(result).toEqual({
      summary: 'This is the final polished summary.',
      model: NEBIUS_DEFAULTS.model,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      `${NEBIUS_DEFAULTS.baseUrl.replace(/\/$/, '')}/chat/completions`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
      })
    )
  })

  test('sends max_tokens 2000, reasoning_effort none and enable_thinking false by default', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    delete process.env.NEBIUS_REASONING
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'summary' } }],
      }),
    })

    await polishSummary(mockPlan, 'fallback', { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"max_tokens":2000'),
      })
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"reasoning_effort":"none"'),
      })
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"chat_template_kwargs":{"enable_thinking":false}'),
      })
    )
  })

  test('omits reasoning fields if NEBIUS_REASONING=default', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    process.env.NEBIUS_REASONING = 'default'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'summary' } }],
      }),
    })

    await polishSummary(mockPlan, 'fallback', { fetchImpl })

    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(sent.max_tokens).toBe(2000)
    expect(sent).not.toHaveProperty('reasoning_effort')
    expect(sent).not.toHaveProperty('chat_template_kwargs')
  })

  test('uses message.content only and ignores reasoning_content / reasoning', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              reasoning_content: 'Hidden chain of thought that must not leak.',
              reasoning: 'Also hidden.',
              content: '<think>more thinking</think>Clean final summary.',
            },
          },
        ],
      }),
    })
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result?.summary).toBe('Clean final summary.')
  })

  test('falls back with empty when only reasoning_content is present', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { reasoning_content: 'Only thinking, no answer.', content: '<think>x</think>' } }],
      }),
    })
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[nebius] fallback: empty')
  })

  test('returns null and logs timeout on AbortError', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const abortError = new Error('AbortError')
    abortError.name = 'AbortError'
    const fetchImpl = vi.fn().mockRejectedValue(abortError)
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[nebius] fallback: timeout')
  })

  test('returns null and logs parse_error when json throws', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('Invalid JSON') },
    })
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[nebius] fallback: parse_error')
  })

  test('returns null and logs empty when content is empty', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '   ' } }],
      }),
    })
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[nebius] fallback: empty')
  })

  test('returns null and logs too_long when content > 700 chars', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'a'.repeat(701) } }],
      }),
    })
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[nebius] fallback: too_long')
  })

  test('returns null and logs no_time when deadline is in the past', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn()
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl, deadline: Date.now() - 1000 })
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('[nebius] fallback: no_time')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('exports default timeout of 20000', () => {
    expect(NEBIUS_DEFAULTS.timeoutMs).toBe(20000)
  })

  test('console warn arguments never contain test key', async () => {
    process.env.NEBIUS_API_KEY = 'super-secret-key-123'
    const abortError = new Error('AbortError')
    abortError.name = 'AbortError'
    const fetchImpl = vi.fn().mockRejectedValue(abortError)
    await polishSummary(mockPlan, 'fallback', { fetchImpl })

    // Check all calls to console.warn
    const warnCalls = vi.mocked(console.warn).mock.calls
    for (const call of warnCalls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain('super-secret-key-123')
      }
    }
  })
})
