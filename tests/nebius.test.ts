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
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  test('returns null when NEBIUS_API_KEY is unset', async () => {
    delete process.env.NEBIUS_API_KEY
    const result = await polishSummary(mockPlan, 'fallback')
    expect(result).toBeNull()
  })

  test('returns null when fetch rejects', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Network error'))
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result).toBeNull()
  })

  test('returns null when fetch returns 500', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const result = await polishSummary(mockPlan, 'fallback', { fetchImpl })
    expect(result).toBeNull()
  })

  test('returns summary + model and strips <think> blocks with correctly built URL', async () => {
    process.env.NEBIUS_API_KEY = 'test-key'
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '<think>some thinking process</think>This is the final polished summary.',
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
})
