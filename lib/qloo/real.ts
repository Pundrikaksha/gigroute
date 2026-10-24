import 'server-only'
import { QlooClient, QlooEntity, QlooTag, InsightsResult } from './types'
import { qlooCache } from './cache'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class RealQlooClient implements QlooClient {
  private baseUrl: string
  private apiKey: string

  constructor() {
    this.baseUrl = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com'
    this.apiKey = process.env.QLOO_API_KEY || ''
  }

  private async fetchWithRetry(path: string, options: RequestInit, retries = 2): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    
    // Sort query string for cache key if GET
    let cacheKey = null
    if (options.method === 'GET' || !options.method) {
      const [pathname, search] = path.split('?')
      if (search) {
        const params = new URLSearchParams(search)
        params.sort()
        cacheKey = `${pathname}?${params.toString()}`
      } else {
        cacheKey = pathname
      }
    }

    if (cacheKey && qlooCache.has(cacheKey)) {
      return new Response(JSON.stringify(qlooCache.get(cacheKey)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const headers = new Headers(options.headers)
    headers.set('X-Api-Key', this.apiKey)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal })
      clearTimeout(timeoutId)

      if (res.ok) {
        // We need to clone the response to read it for caching and returning
        const clonedRes = res.clone()
        const text = await clonedRes.text()
        if (text) {
          const data = JSON.parse(text)
          // Empty 200 check
          if ((!data.items || data.items.length === 0) && data.metadata && data.metadata.count === 0) {
            // "params may be invalid for this filter.type"
          }
          if (cacheKey) {
            qlooCache.set(cacheKey, data)
          }
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: res.headers
          })
        }
        return res
      }

      if (res.status === 401) throw new Error("check base URL/key")
      if (res.status === 403) throw new Error("unsupported entity type")
      if (res.status === 400) throw new Error("Bad Request")

      if ((res.status === 429 || res.status >= 500) && retries > 0) {
        await delay(1000)
        return this.fetchWithRetry(path, options, retries - 1)
      }

      throw new Error(`API Error: ${res.status}`)
    } catch (e) {
      clearTimeout(timeoutId)
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error("Request timeout")
      }
      throw e
    }
  }

  async search(query: string, types?: string[]): Promise<QlooEntity[]> {
    const params = new URLSearchParams({ query })
    if (types && types.length > 0) {
      types.forEach(t => params.append('types', t))
    }
    const res = await this.fetchWithRetry(`/search?${params.toString()}`, {})
    const data = await res.json()
    return data.items || []
  }

  async findTags(query: string, typeFilter?: string): Promise<QlooTag[]> {
    const params = new URLSearchParams({ 'filter.query': query })
    if (typeFilter) {
      params.append('filter.type', typeFilter)
    }
    const res = await this.fetchWithRetry(`/v2/tags?${params.toString()}`, {})
    const data = await res.json()
    return data.items || []
  }

  async insights(params: Record<string, string | number | boolean>): Promise<InsightsResult> {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      searchParams.append(key, String(value))
    }
    const res = await this.fetchWithRetry(`/v2/insights?${searchParams.toString()}`, {})
    const data = await res.json()
    return data
  }

  async similarArtists(entityIds: string[], take: number = 6): Promise<QlooEntity[]> {
    const res = await this.insights({
      'filter.type': 'urn:entity:artist',
      'signal.interests.entities': entityIds.join(','),
      'paging.take': take
    })
    return res.items || []
  }

  async fanHotspots(entityIds: string[], region?: string): Promise<QlooEntity[]> {
    const params: Record<string, string | number | boolean> = {
      'filter.type': 'urn:entity:destination',
      'signal.interests.entities': entityIds.join(','),
      'paging.take': 10
    }
    if (region) {
      params['filter.location.query'] = region
    }
    const res = await this.insights(params)
    return res.items || []
  }

  async venuesInCity(entityIds: string[], city: string, take: number = 5): Promise<QlooEntity[]> {
    const res = await this.insights({
      'filter.type': 'urn:entity:place',
      'filter.location.query': city,
      'signal.interests.entities': entityIds.join(','),
      'feature.explainability': true,
      'paging.take': take
    })
    return res.items || []
  }

  async crossDomain(entityIds: string[], type: string): Promise<QlooEntity[]> {
    const res = await this.insights({
      'filter.type': `urn:entity:${type}`,
      'signal.interests.entities': entityIds.join(','),
      'paging.take': 5
    })
    return res.items || []
  }
}
