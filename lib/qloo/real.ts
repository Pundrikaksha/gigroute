import 'server-only'
import type {
  InsightsParams,
  QlooClient,
  QlooEntity,
  QlooInsightsResponse,
  QlooSearchResponse,
  QlooTag,
  QlooTagsResponse,
} from './types'
import { qlooCache } from './cache'
import {
  clampTake,
  crossDomainParams,
  fanHotspotsParams,
  normalizeEntity,
  similarArtistsParams,
  toSearchParams,
  venuesInCityParams,
} from './requests'

export const DEFAULT_QLOO_BASE_URL = 'https://hackathon.api.qloo.com'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class RealQlooClient implements QlooClient {
  private baseUrl: string
  private apiKey: string

  constructor() {
    this.baseUrl = (process.env.QLOO_BASE_URL || DEFAULT_QLOO_BASE_URL).replace(/\/+$/, '')
    this.apiKey = process.env.QLOO_API_KEY || ''
  }

  /** GET `path?params` with the X-Api-Key header, a 24h LRU cache, and retry on 429/5xx. */
  private async getJson<T>(path: string, params: URLSearchParams, retries = 2): Promise<T> {
    const sorted = new URLSearchParams(params)
    sorted.sort()
    const cacheKey = `${path}?${sorted.toString()}`
    const cached = qlooCache.get(cacheKey)
    if (cached) return cached as T

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}?${params.toString()}`, {
        method: 'GET',
        headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
        signal: controller.signal,
      })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw new Error('Qloo request timed out')
      throw e
    } finally {
      clearTimeout(timeoutId)
    }

    if (res.ok) {
      const data = (await res.json()) as T
      qlooCache.set(cacheKey, data as object)
      return data
    }

    if ((res.status === 429 || res.status >= 500) && retries > 0) {
      await delay(1000)
      return this.getJson<T>(path, params, retries - 1)
    }
    if (res.status === 401) throw new Error('Qloo 401: check QLOO_BASE_URL and QLOO_API_KEY')
    if (res.status === 403) throw new Error('Qloo 403: entity type or endpoint not enabled for this key')
    if (res.status === 400) throw new Error('Qloo 400: invalid parameters for this filter.type')
    throw new Error(`Qloo API error: ${res.status}`)
  }

  async search(query: string, types?: string[], take = 10): Promise<QlooEntity[]> {
    const params = new URLSearchParams({ query })
    // `types` is an array serialized comma-separated (explode: false).
    if (types && types.length > 0) params.set('types', types.join(','))
    params.set('take', String(clampTake(take)))
    const data = await this.getJson<QlooSearchResponse>('/search', params)
    return (data.results ?? []).map(normalizeEntity)
  }

  async findTags(query: string, parentType?: string, take = 20): Promise<QlooTag[]> {
    const params = new URLSearchParams({ 'filter.query': query })
    if (parentType) params.set('filter.parents.types', parentType)
    params.set('take', String(clampTake(take)))
    const data = await this.getJson<QlooTagsResponse>('/v2/tags', params)
    return (data.results?.tags ?? []).map((t) => ({ id: t.id, name: t.name, type: t.types?.[0] }))
  }

  async insights(params: InsightsParams): Promise<QlooInsightsResponse> {
    return this.getJson<QlooInsightsResponse>('/v2/insights', toSearchParams(params))
  }

  private async entities(params: InsightsParams): Promise<QlooEntity[]> {
    const res = await this.insights(params)
    return (res.results?.entities ?? []).map(normalizeEntity)
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
