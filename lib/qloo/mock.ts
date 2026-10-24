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
  async search(query: string, _types?: string[], take = 10): Promise<QlooEntity[]> {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return fixtures.search.results
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, clampTake(take))
      .map(normalizeEntity)
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

    let entities = response.results.entities
    if (filterType === 'urn:entity:destination' && location) {
      const q = location.toLowerCase()
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
  const entries = explain
    .map((e) => (e.entity_id === fixtures.seedEntityId ? { ...e, entity_id: signals[0] } : e))
    .filter((e) => signals.includes(e.entity_id))
  return {
    ...entity,
    query: { ...entity.query, explainability: { 'signal.interests.entities': entries } },
  }
}
