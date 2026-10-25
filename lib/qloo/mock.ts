import 'server-only'
import type {
  InsightsParams,
  QlooApiEntity,
  QlooClient,
  QlooEntity,
  QlooInsightsResponse,
  QlooSearchResponse,
  QlooTag,
  QlooTagsResponse,
} from './types'
import {
  clampTake,
  crossDomainParams,
  fanHotspotsParams,
  normalizeEntity,
  similarArtistsParams,
  venuesInCityParams,
} from './requests'
import mockData from './fixtures/mock-data.json'

interface Fixtures {
  seedEntityId: string
  search: QlooSearchResponse
  tags: QlooTagsResponse
  insights: {
    artist: QlooInsightsResponse
    destination: QlooInsightsResponse
    place: Record<string, QlooInsightsResponse>
    brand: QlooInsightsResponse
    movie: QlooInsightsResponse
  }
}

const fixtures = mockData as unknown as Fixtures
const ARTIST = 'urn:entity:artist'

/** Regions covered by the fixture destinations, for honest "no sample data here" messages. */
export const MOCK_REGIONS = ['UK', 'USA']

const REGION_ALIASES: Record<string, string> = {
  'united kingdom': 'uk',
  'great britain': 'uk',
  britain: 'uk',
  england: 'uk',
  gb: 'uk',
  us: 'usa',
  'united states': 'usa',
  'united states of america': 'usa',
  america: 'usa',
}

function regionAlias(location: string): string {
  const q = location.trim().toLowerCase()
  return REGION_ALIASES[q] ?? q
}

/** Every artist that appears anywhere in the fixtures: the search results plus the similar artists. */
function searchableArtists(): QlooApiEntity[] {
  const seen = new Set(fixtures.search.results.map((a) => a.entity_id))
  const similar = fixtures.insights.artist.results.entities
    .filter((a) => !seen.has(a.entity_id))
    .map((a) => ({ entity_id: a.entity_id, name: a.name, types: [ARTIST], popularity: a.popularity, tags: a.tags }))
  return [...fixtures.search.results, ...similar]
}

/** Small, stable string hash (FNV-1a) so the same name always maps to the same profile. */
export function stableHash(text: string): number {
  let h = 0x811c9dc5
  for (const ch of text.toLowerCase()) {
    h ^= ch.codePointAt(0) as number
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * Mock mode only knows a handful of artists. Rather than a dead end, map any other name
 * deterministically onto one of the fixture taste profiles and label it as sample data.
 */
export function sampleArtist(name: string): QlooEntity {
  const profiles = fixtures.search.results
  const profile = profiles[stableHash(name) % profiles.length]
  const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'artist'
  return {
    ...normalizeEntity({
      ...profile,
      entity_id: `mock-sample-${slug}`,
      name,
      properties: { short_description: `Sample data: mapped onto the ${profile.name} taste profile.` },
    }),
    sampleOf: profile.name,
  }
}

const empty = (filterType: unknown): QlooInsightsResponse => ({
  success: true,
  results: { entities: [] },
  query: { 'filter.type': filterType },
})

/**
 * Serves the hand-written fixtures in lib/qloo/fixtures, interpreting the same
 * documented /v2/insights parameters the real client sends (filter.type,
 * filter.location.query, signal.interests.entities, take).
 */
export class MockQlooClient implements QlooClient {
  async search(query: string, types?: string[], take = 10): Promise<QlooEntity[]> {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const matches = searchableArtists()
      .filter((a) => a.name.toLowerCase().includes(q))
      // Exact matches first, so "Muse" resolves directly instead of asking which one.
      .sort((a, b) => Number(b.name.toLowerCase() === q) - Number(a.name.toLowerCase() === q))
      .slice(0, clampTake(take))
      .map(normalizeEntity)
    if (matches.length > 0 || (types && !types.includes(ARTIST))) return matches
    return [sampleArtist(query.trim())]
  }

  async findTags(query: string, _parentType?: string, take = 20): Promise<QlooTag[]> {
    const q = query.trim().toLowerCase()
    return fixtures.tags.results.tags
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, clampTake(take))
      .map((t) => ({ id: t.id, name: t.name, type: t.types?.[0] }))
  }

  async insights(params: InsightsParams): Promise<QlooInsightsResponse> {
    const filterType = params['filter.type']
    const location = params['filter.location.query'] ? String(params['filter.location.query']) : ''
    const take = clampTake(Number(params.take ?? 20))

    let response: QlooInsightsResponse | undefined
    switch (filterType) {
      case 'urn:entity:artist':
        response = fixtures.insights.artist
        break
      case 'urn:entity:destination':
        response = fixtures.insights.destination
        break
      case 'urn:entity:place':
        response = fixtures.insights.place[findCityKey(location)]
        break
      case 'urn:entity:brand':
        response = fixtures.insights.brand
        break
      case 'urn:entity:movie':
        response = fixtures.insights.movie
        break
    }
    if (!response) return empty(filterType)

    const signals = String(params['signal.interests.entities'] ?? '').split(',').filter(Boolean)
    let entities = response.results.entities
    if (filterType === ARTIST) {
      // An artist is never "similar" to itself.
      entities = entities.filter((e) => !signals.includes(e.entity_id))
    }
    if (filterType === 'urn:entity:destination' && location) {
      const q = regionAlias(location)
      entities = entities.filter((e) => e.name.toLowerCase().includes(q))
    }
    entities = entities.slice(0, take)
    if (params['feature.explainability'] === true || params['feature.explainability'] === 'true') {
      entities = entities.map((e) => remapSeed(e, String(params['signal.interests.entities'] ?? '')))
    } else {
      entities = entities.map(({ query, ...rest }) => ({ ...rest, query: { affinity: query?.affinity } }))
    }
    return { ...response, results: { entities } }
  }

  private async entities(params: InsightsParams): Promise<QlooEntity[]> {
    const res = await this.insights(params)
    return res.results.entities.map(normalizeEntity)
  }

  similarArtists(entityIds: string[], take?: number) {
    return this.entities(similarArtistsParams(entityIds, take))
  }

  fanHotspots(entityIds: string[], region?: string, take?: number) {
    return this.entities(fanHotspotsParams(entityIds, region, take))
  }

  venuesInCity(entityIds: string[], city: string, take?: number) {
    return this.entities(venuesInCityParams(entityIds, city, take))
  }

  crossDomain(entityIds: string[], type: string, take?: number) {
    return this.entities(crossDomainParams(entityIds, type, take))
  }
}

/** Match "London", "london, uk" or "London, UK" to the fixture key "London, UK". */
function findCityKey(location: string): string {
  const q = location.trim().toLowerCase()
  if (!q) return ''
  return (
    Object.keys(fixtures.insights.place).find((k) => {
      const key = k.toLowerCase()
      return key === q || key.split(',')[0] === q.split(',')[0].trim()
    }) ?? ''
  )
}

/**
 * Fixture explainability is written against the seed artist (Radiohead). When the
 * mock is asked about another artist, credit the seed's share to that artist and
 * keep only entries for entities that were actually sent as signals.
 */
function remapSeed(entity: QlooApiEntity, signalParam: string): QlooApiEntity {
  const signals = signalParam.split(',').filter(Boolean)
  const explain = entity.query?.explainability?.['signal.interests.entities']
  if (!explain || signals.length === 0) return entity
  const merged = new Map<string, number>()
  for (const e of explain) {
    const id = e.entity_id === fixtures.seedEntityId ? signals[0] : e.entity_id
    if (signals.includes(id)) merged.set(id, Math.round(((merged.get(id) ?? 0) + e.score) * 100) / 100)
  }
  const entries = [...merged].map(([entity_id, score]) => ({ entity_id, score }))
  return {
    ...entity,
    query: { ...entity.query, explainability: { 'signal.interests.entities': entries } },
  }
}
