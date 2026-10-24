import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RealQlooClient } from '../lib/qloo/real'
import { qlooCache } from '../lib/qloo/cache'
import { MAX_TAKE, crossDomainParams } from '../lib/qloo/requests'

const FAKE_KEY = 'test-key-not-real'

interface Call {
  url: URL
  init: RequestInit
}

// Stub global fetch: no network request is ever made.
function stubFetch(body: unknown = { success: true, results: { entities: [] } }, status = 200) {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} })
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

const params = (url: URL) => Object.fromEntries(url.searchParams.entries())

describe('RealQlooClient request building (docs.qloo.com)', () => {
  beforeEach(() => {
    qlooCache.clear()
    vi.stubEnv('QLOO_API_KEY', FAKE_KEY)
    vi.stubEnv('QLOO_BASE_URL', '')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  test('uses the hackathon base URL and X-Api-Key header by default', async () => {
    const { calls } = stubFetch()
    await new RealQlooClient().similarArtists(['A1'])
    expect(calls).toHaveLength(1)
    expect(calls[0].url.origin).toBe('https://hackathon.api.qloo.com')
    expect(calls[0].init.method).toBe('GET')
    expect(new Headers(calls[0].init.headers).get('X-Api-Key')).toBe(FAKE_KEY)
  })

  test('honours QLOO_BASE_URL (trailing slash trimmed)', async () => {
    vi.stubEnv('QLOO_BASE_URL', 'https://example.test/')
    const { calls } = stubFetch()
    await new RealQlooClient().similarArtists(['A1'])
    expect(calls[0].url.href.startsWith('https://example.test/v2/insights?')).toBe(true)
  })

  test('similarArtists -> GET /v2/insights filter.type=urn:entity:artist', async () => {
    const { calls } = stubFetch()
    await new RealQlooClient().similarArtists(['A1', 'A2'])
    expect(calls[0].url.pathname).toBe('/v2/insights')
    expect(params(calls[0].url)).toEqual({
      'filter.type': 'urn:entity:artist',
      'signal.interests.entities': 'A1,A2',
      take: '6',
    })
  })

  test('fanHotspots -> destinations with explainability and filter.location.query', async () => {
    const { calls } = stubFetch()
    await new RealQlooClient().fanHotspots(['A1'], 'UK')
    expect(params(calls[0].url)).toEqual({
      'filter.type': 'urn:entity:destination',
      'signal.interests.entities': 'A1',
      'feature.explainability': 'true',
      take: '10',
      'filter.location.query': 'UK',
    })
  })

  test('venuesInCity -> urn:entity:place with filter.location.query and explainability', async () => {
    const { calls } = stubFetch()
    await new RealQlooClient().venuesInCity(['A1', 'A2'], 'Chicago')
    expect(calls[0].url.pathname).toBe('/v2/insights')
    expect(params(calls[0].url)).toEqual({
      'filter.type': 'urn:entity:place',
      'signal.interests.entities': 'A1,A2',
      'filter.location.query': 'Chicago',
      'feature.explainability': 'true',
      take: '5',
    })
  })

  test('crossDomain -> urn:entity:brand / urn:entity:movie only', async () => {
    const { calls } = stubFetch()
    await new RealQlooClient().crossDomain(['A1'], 'movie')
    expect(params(calls[0].url)['filter.type']).toBe('urn:entity:movie')
    expect(() => crossDomainParams(['A1'], 'podcast')).toThrow(/Unsupported/)
  })

  test(`take is clamped to the documented max of ${MAX_TAKE}`, async () => {
    const { calls } = stubFetch()
    await new RealQlooClient().similarArtists(['A1'], 500)
    expect(params(calls[0].url).take).toBe(String(MAX_TAKE))
  })

  test('no deprecated paging.take parameter is sent', async () => {
    const { calls } = stubFetch()
    await new RealQlooClient().venuesInCity(['A1'], 'Austin', 3)
    expect(calls[0].url.searchParams.has('paging.take')).toBe(false)
  })

  test('search -> GET /search with comma-separated types', async () => {
    const { calls } = stubFetch({
      success: true,
      results: [{ entity_id: 'X1', name: 'Fake Band', types: ['urn:entity:artist'], tags: [] }],
    })
    const res = await new RealQlooClient().search('Fake Band', ['urn:entity:artist', 'urn:entity:place'])
    expect(calls[0].url.pathname).toBe('/search')
    expect(params(calls[0].url)).toEqual({
      query: 'Fake Band',
      types: 'urn:entity:artist,urn:entity:place',
      take: '10',
    })
    expect(res[0]).toMatchObject({ id: 'X1', name: 'Fake Band', type: 'urn:entity:artist' })
  })

  test('findTags -> GET /v2/tags with filter.query and filter.parents.types', async () => {
    const { calls } = stubFetch({ success: true, results: { tags: [{ id: 'urn:tag:x', name: 'X', types: ['urn:entity:artist'] }] } })
    const tags = await new RealQlooClient().findTags('indie', 'urn:entity:artist')
    expect(calls[0].url.pathname).toBe('/v2/tags')
    expect(params(calls[0].url)).toEqual({
      'filter.query': 'indie',
      'filter.parents.types': 'urn:entity:artist',
      take: '20',
    })
    expect(tags).toEqual([{ id: 'urn:tag:x', name: 'X', type: 'urn:entity:artist' }])
  })

  test('parses results.entities, query.affinity and query.explainability', async () => {
    stubFetch({
      success: true,
      results: {
        entities: [
          {
            entity_id: 'P1',
            name: 'Fake Hall',
            type: 'urn:entity',
            subtype: 'urn:entity:place',
            location: { lat: 1, lon: 2 },
            popularity: 0.8,
            tags: [{ tag_id: 'urn:tag:genre:music:indie_rock', name: 'Indie Rock', type: 'urn:tag:genre:music' }],
            query: {
              affinity: 0.91,
              explainability: { 'signal.interests.entities': [{ entity_id: 'A2', score: 0.2 }, { entity_id: 'A1', score: 0.7 }] },
            },
          },
        ],
      },
    })
    const [venue] = await new RealQlooClient().venuesInCity(['A1', 'A2'], 'Somewhere')
    expect(venue).toMatchObject({
      id: 'P1',
      type: 'urn:entity:place',
      affinity: 0.91,
      lat: 1,
      lng: 2,
      tags: [{ id: 'urn:tag:genre:music:indie_rock', name: 'Indie Rock' }],
      explainability: [
        { entityId: 'A1', score: 0.7 },
        { entityId: 'A2', score: 0.2 },
      ],
    })
  })

  test('caches identical GETs', async () => {
    const { fetchMock } = stubFetch()
    const client = new RealQlooClient()
    await client.similarArtists(['A1'])
    await client.similarArtists(['A1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('401 surfaces a helpful error', async () => {
    stubFetch({ message: 'nope' }, 401)
    await expect(new RealQlooClient().similarArtists(['A1'])).rejects.toThrow(/QLOO_API_KEY/)
  })
})
