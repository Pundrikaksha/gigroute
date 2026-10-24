import { expect, test, describe } from 'vitest'
import { MockQlooClient } from '../lib/qloo/mock'
import mockData from '../lib/qloo/fixtures/mock-data.json'
import type { QlooApiEntity, QlooInsightsResponse } from '../lib/qloo/types'

const SEED = 'mock-artist-radiohead'

function expectDocumentedEntity(e: QlooApiEntity, subtype: string) {
  expect(typeof e.entity_id).toBe('string')
  expect(typeof e.name).toBe('string')
  expect(e.type).toBe('urn:entity')
  expect(e.subtype).toBe(subtype)
  expect(typeof e.popularity).toBe('number')
  expect(typeof e.query?.affinity).toBe('number')
  for (const t of e.tags ?? []) {
    expect(t.tag_id).toMatch(/^urn:tag:/)
    expect(typeof t.name).toBe('string')
  }
}

describe('fixtures mirror documented response shapes', () => {
  test('fixtures are labelled as fake', () => {
    expect(mockData._comment).toMatch(/FAKE/)
  })

  test('/search: { success, duration, results: entity[] }', () => {
    expect(mockData.search.success).toBe(true)
    for (const r of mockData.search.results) {
      expect(r.entity_id).toMatch(/^mock-/)
      expect(r.types).toContain('urn:entity:artist')
    }
  })

  test('/v2/tags: { success, results: { tags: [] } }', () => {
    expect(mockData.tags.results.tags.length).toBeGreaterThan(0)
    for (const t of mockData.tags.results.tags) expect(t.id).toMatch(/^urn:tag:/)
  })

  test('/v2/insights: { success, results: { entities: [] } } per filter.type', () => {
    const insights = mockData.insights as unknown as Record<string, QlooInsightsResponse | Record<string, QlooInsightsResponse>>
    const check = (res: QlooInsightsResponse, subtype: string) => {
      expect(res.success).toBe(true)
      expect(res.results.entities.length).toBeGreaterThan(0)
      res.results.entities.forEach((e) => expectDocumentedEntity(e, subtype))
    }
    check(insights.artist as QlooInsightsResponse, 'urn:entity:artist')
    check(insights.destination as QlooInsightsResponse, 'urn:entity:destination')
    check(insights.brand as QlooInsightsResponse, 'urn:entity:brand')
    check(insights.movie as QlooInsightsResponse, 'urn:entity:movie')
    for (const res of Object.values(insights.place as Record<string, QlooInsightsResponse>)) {
      check(res, 'urn:entity:place')
      for (const e of res.results.entities) {
        expect(e.location).toEqual({ lat: expect.any(Number), lon: expect.any(Number) })
        expect(e.query?.explainability?.['signal.interests.entities']?.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('MockQlooClient', () => {
  const client = new MockQlooClient()

  test('search finds Radiohead', async () => {
    const res = await client.search('Radiohead')
    expect(res[0]).toMatchObject({ id: SEED, name: 'Radiohead', type: 'urn:entity:artist' })
    expect(res[0].tags.map((t) => t.name)).toContain('Art Rock')
  })

  test('search for an unknown artist is empty', async () => {
    expect(await client.search('Definitely Not A Band')).toEqual([])
  })

  test('similarArtists returns entities sorted by affinity and honours take', async () => {
    const res = await client.similarArtists([SEED], 3)
    expect(res).toHaveLength(3)
    expect(res[0].name).toBe('Thom Yorke')
    expect(res[0].affinity).toBeGreaterThan(res[1].affinity ?? 0)
  })

  test('fanHotspots filters by filter.location.query and carries coordinates', async () => {
    const all = await client.fanHotspots([SEED])
    expect(all.length).toBeGreaterThan(3)
    const uk = await client.fanHotspots([SEED], 'UK')
    expect(uk.length).toBeGreaterThan(0)
    expect(uk.every((r) => r.name.includes('UK') && r.lat != null && r.lng != null)).toBe(true)
  })

  test('venuesInCity returns places with explainability limited to signalled entities', async () => {
    const res = await client.venuesInCity([SEED, 'mock-artist-thom-yorke'], 'London')
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].type).toBe('urn:entity:place')
    const ids = res.flatMap((v) => v.explainability.map((e) => e.entityId))
    expect(new Set(ids)).toEqual(new Set([SEED, 'mock-artist-thom-yorke']))
  })

  test('explainability credits a non-seed artist', async () => {
    const res = await client.venuesInCity(['mock-artist-the-strokes'], 'London, UK')
    expect(res[0].explainability[0].entityId).toBe('mock-artist-the-strokes')
  })

  test('venuesInCity for an unknown city is empty', async () => {
    expect(await client.venuesInCity([SEED], 'Atlantis')).toEqual([])
  })

  test('crossDomain returns brands or movies', async () => {
    const brands = await client.crossDomain([SEED], 'brand')
    expect(brands[0].type).toBe('urn:entity:brand')
    const movies = await client.crossDomain([SEED], 'movie')
    expect(movies[0].type).toBe('urn:entity:movie')
  })

  test('findTags filters by name', async () => {
    const tags = await client.findTags('rock')
    expect(tags.length).toBeGreaterThan(0)
    expect(tags.every((t) => t.name.toLowerCase().includes('rock'))).toBe(true)
  })
})
