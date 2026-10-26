import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RealQlooClient } from '../lib/qloo/real'
import { qlooCache } from '../lib/qloo/cache'
import { countryCodeFor, fanHotspotsParams, normalizeEntity, regionQuery, venuesInCityParams } from '../lib/qloo/requests'
import { createPlan, matchingTags } from '../lib/agent/plan'
import type { QlooApiEntity, QlooTag } from '../lib/qloo/types'

// Regressions seen against the live Qloo hackathon API on 27 Oct 2026.

const params = (url: URL) => Object.fromEntries(url.searchParams.entries())

function place(id: string, city: string, country: string): QlooApiEntity {
  return {
    entity_id: id,
    name: `${id} Hall`,
    type: 'urn:entity',
    subtype: 'urn:entity:place',
    properties: { geocode: { name: city, country_code: country } },
    tags: [{ tag_id: 'urn:tag:genre:music:indie_rock', name: 'Indie Rock', type: 'urn:tag:genre:music' }],
    query: { affinity: 0.9 },
  }
}

function stubSequence(responses: { status: number; body: unknown }[]) {
  const urls: URL[] = []
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      urls.push(new URL(String(input)))
      const r = responses[Math.min(i++, responses.length - 1)]
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
    }),
  )
  return urls
}

const ok = (entities: QlooApiEntity[]) => ({ status: 200, body: { success: true, results: { entities } } })

describe('nameless tags from live Qloo', () => {
  test('normalizeEntity drops tags with no name (e.g. urn:tag:voice_type:qloo)', () => {
    const raw = {
      entity_id: 'A1',
      name: 'Someone',
      subtype: 'urn:entity:artist',
      tags: [{ type: 'urn:tag:voice_type:qloo' }, { tag_id: 'g', name: 'Indie', type: 'urn:tag:genre:music' }],
    } as unknown as QlooApiEntity
    expect(normalizeEntity(raw).tags).toEqual([{ id: 'g', name: 'Indie', type: 'urn:tag:genre:music' }])
  })

  test('matchingTags does not throw on a tag without a name', () => {
    const plan = createPlan({ artist: 'X', cities: [], stops: 3, demo: false })
    const bad = { id: 'x', type: 'urn:tag:voice_type:qloo' } as unknown as QlooTag
    plan.artist = { id: 'A', name: 'X', tags: [bad, { id: 'g', name: 'Indie' }] }
    plan.similarArtists = [{ id: 'B', name: 'Y', type: 'urn:entity:artist', tags: [bad], explainability: [] }]
    expect(() => matchingTags(plan, [bad, { id: 'g', name: 'INDIE' }])).not.toThrow()
    expect(matchingTags(plan, [bad, { id: 'g', name: 'INDIE' }]).map((t) => t.id)).toEqual(['g'])
  })
})

describe('region handling', () => {
  test('US aliases are sent as "United States"; other regions pass through', () => {
    expect(regionQuery('US')).toBe('United States')
    expect(regionQuery('usa')).toBe('United States')
    expect(regionQuery('UK')).toBe('UK')
    expect(regionQuery('India')).toBe('India')
    expect(fanHotspotsParams(['A'], 'USA')['filter.location.query']).toBe('United States')
    expect(fanHotspotsParams(['A'], '  ')['filter.location.query']).toBeUndefined()
  })

  test('country codes for known regions only', () => {
    expect(countryCodeFor('UK')).toBe('GB')
    expect(countryCodeFor('United States')).toBe('US')
    expect(countryCodeFor('india')).toBe('IN')
    expect(countryCodeFor('New York')).toBeUndefined()
    expect(countryCodeFor(undefined)).toBeUndefined()
  })

  test('venuesInCityParams pins the city to a country when given one', () => {
    expect(venuesInCityParams(['A'], 'Edinburgh', 5, 'GB')['filter.geocode.country_code']).toBe('GB')
    expect(venuesInCityParams(['A'], 'Edinburgh')).not.toHaveProperty('filter.geocode.country_code')
  })
})

describe('RealQlooClient.venuesInCity with a region', () => {
  beforeEach(() => {
    qlooCache.clear()
    vi.stubEnv('QLOO_API_KEY', 'test-key-not-real')
    vi.stubEnv('QLOO_BASE_URL', '')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  test('first call is pinned to the country and drops venues from other countries', async () => {
    const urls = stubSequence([ok([place('P1', 'Edinburgh', 'US'), place('P2', 'Edinburgh', 'GB')])])
    const venues = await new RealQlooClient().venuesInCity(['A1'], 'Edinburgh', 5, 'UK')
    expect(params(urls[0])).toMatchObject({ 'filter.location.query': 'Edinburgh', 'filter.geocode.country_code': 'GB' })
    expect(venues.map((v) => v.id)).toEqual(['P2'])
    expect(urls).toHaveLength(1)
  })

  test('empty pinned result retries with "City, Country", then by geocoded city name', async () => {
    const urls = stubSequence([ok([]), ok([]), ok([place('P3', 'Inverness', 'GB')])])
    const venues = await new RealQlooClient().venuesInCity(['A1'], 'Inverness', 5, 'United Kingdom')
    expect(urls).toHaveLength(3)
    expect(params(urls[1])).toMatchObject({ 'filter.location.query': 'Inverness, United Kingdom', 'filter.geocode.country_code': 'GB' })
    expect(params(urls[2])).toMatchObject({ 'filter.geocode.name': 'Inverness', 'filter.geocode.country_code': 'GB' })
    expect(params(urls[2])).not.toHaveProperty('filter.location.query')
    expect(venues.map((v) => v.id)).toEqual(['P3'])
  })

  test('"City, Country" attempt stops the chain when it finds venues', async () => {
    const urls = stubSequence([ok([]), ok([place('P6', 'Edinburgh', 'GB')])])
    const venues = await new RealQlooClient().venuesInCity(['A1'], 'Edinburgh', 5, 'UK')
    expect(urls).toHaveLength(2)
    expect(venues.map((v) => v.id)).toEqual(['P6'])
  })

  test('a 400 on the locality query falls back to the geocode lookup', async () => {
    const urls = stubSequence([{ status: 400, body: { error: 'no locality' } }, ok([place('P4', 'Aviemore', 'GB')])])
    const venues = await new RealQlooClient().venuesInCity(['A1'], 'Aviemore', 5, 'UK')
    expect(urls).toHaveLength(2)
    expect(params(urls[1])['filter.location.query']).toBe('Aviemore, United Kingdom')
    expect(venues.map((v) => v.id)).toEqual(['P4'])
  })

  test('if both lookups fail the original error is raised', async () => {
    stubSequence([{ status: 400, body: {} }])
    await expect(new RealQlooClient().venuesInCity(['A1'], 'Nowhere', 5, 'UK')).rejects.toThrow(/400/)
  })

  test('without a known country the request is unchanged', async () => {
    const urls = stubSequence([ok([place('P5', 'Austin', 'US')])])
    await new RealQlooClient().venuesInCity(['A1'], 'Austin', 5)
    expect(params(urls[0])).not.toHaveProperty('filter.geocode.country_code')
  })
})

describe('draft_pitch on sample data', () => {
  test('does not claim "our listeners" for a sample profile', async () => {
    const { draftPitch } = await import('../lib/agent/plan')
    const sample = draftPitch('O2 Academy Brixton', 'Arijit Singh', 'Indie Rock', 'The Strokes')
    expect(sample).not.toContain('our listeners')
    expect(sample).toContain('fans of similar artists (from The Strokes taste profile)')
    expect(draftPitch('O2 Academy Brixton', 'Radiohead', 'Indie Rock')).toContain('our listeners')
  })
})

describe('venues far from their stop', () => {
  test('applyToolResult drops venues more than MAX_VENUE_DISTANCE_KM from the stop', async () => {
    const { applyToolResult, MAX_VENUE_DISTANCE_KM } = await import('../lib/agent/plan')
    expect(MAX_VENUE_DISTANCE_KM).toBe(800)
    let plan = createPlan({ artist: 'X', cities: [], stops: 1, demo: false })
    plan = { ...plan, stops: [{ city: 'Williamstown', lat: 42.71, lng: -73.2, tags: [], explainability: [], venues: null }] } as typeof plan
    const v = (id: string, lat: number, lng: number) => ({ id, name: id, type: 'urn:entity:place', tags: [], explainability: [], lat, lng, affinity: 0.5 })
    const next = applyToolResult(plan, 'venues_in_city', { city: 'Williamstown' }, [v('MA', 42.71, -73.21), v('KY', 38.64, -84.56)])
    expect(next.stops[0].venues?.map((x) => x.id)).toEqual(['MA'])
  })

  test('drops a neighbouring town\'s venues but keeps named-city venues when stop coords are off', async () => {
    const { applyToolResult } = await import('../lib/agent/plan')
    let plan = createPlan({ artist: 'X', cities: [], stops: 2, demo: false })
    // Live: Fort William's Qloo coords sit in London; Eastbourne's too.
    plan = { ...plan, stops: [
      { city: 'Fort William', lat: 51.49, lng: -0.22, tags: [], explainability: [], venues: null },
      { city: 'Eastbourne', lat: 51.51, lng: -0.23, tags: [], explainability: [], venues: null },
    ] } as typeof plan
    const v = (id: string, lat: number, lng: number, address: string) => ({ id, name: id, type: 'urn:entity:place', tags: [], explainability: [], lat, lng, address, affinity: 0.5 })
    const fw = applyToolResult(plan, 'venues_in_city', { city: 'Fort William' }, [v('ayr', 55.46, -4.63, 'High St Ayr KA7 1JX United Kingdom')])
    expect(fw.stops[0].venues).toEqual([])
    const eb = applyToolResult(plan, 'venues_in_city', { city: 'Eastbourne' }, [v('college', 50.76, 0.27, 'Old Wish Rd Eastbourne BN21 4JY United Kingdom')])
    expect(eb.stops[1].venues?.map((x) => x.id)).toEqual(['college'])
  })
})
