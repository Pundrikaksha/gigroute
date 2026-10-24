import 'server-only'
import { QlooClient, QlooEntity, QlooTag, InsightsResult } from './types'
import mockData from './fixtures/mock-data.json'

export class MockQlooClient implements QlooClient {
  async search(query: string): Promise<QlooEntity[]> {
    const q = query.toLowerCase()
    return mockData.artists.filter((a) => a.name.toLowerCase().includes(q))
  }

  async findTags(): Promise<QlooTag[]> {
    return [{ id: 'mock-tag-1', name: 'Indie Rock', category: 'Genre' }]
  }

  async insights(params: Record<string, string | number | boolean>): Promise<InsightsResult> {
    // Basic mock logic based on filter.type
    if (params['filter.type'] === 'urn:entity:artist') {
      return { items: mockData.similar_artists }
    }
    if (params['filter.type'] === 'urn:entity:destination') {
      let hotspots = mockData.hotspots
      if (params['filter.location.query']) {
        const query = String(params['filter.location.query']).toLowerCase()
        hotspots = hotspots.filter(h => h.name.toLowerCase().includes(query))
      }
      return { items: hotspots }
    }
    if (params['filter.type'] === 'urn:entity:place') {
      const city = String(params['filter.location.query'] || '')
      const venues = (mockData.venues as Record<string, QlooEntity[]>)[city] || []
      return { items: venues }
    }
    if (params['filter.type'] === 'urn:entity:brand' || params['filter.type'] === 'urn:entity:movie') {
      return { items: mockData.cross_domain.filter(d => d.type === params['filter.type']) }
    }
    return { items: [] }
  }

  async similarArtists(entityIds: string[], take: number = 6): Promise<QlooEntity[]> {
    const res = await this.insights({ 'filter.type': 'urn:entity:artist' })
    return res.items.slice(0, take)
  }

  async fanHotspots(entityIds: string[], region?: string): Promise<QlooEntity[]> {
    const params: Record<string, string> = { 'filter.type': 'urn:entity:destination' }
    if (region) {
      params['filter.location.query'] = region
    }
    const res = await this.insights(params)
    return res.items
  }

  async venuesInCity(entityIds: string[], city: string, take: number = 5): Promise<QlooEntity[]> {
    const res = await this.insights({
      'filter.type': 'urn:entity:place',
      'filter.location.query': city
    })
    return res.items.slice(0, take)
  }

  async crossDomain(entityIds: string[], type: string): Promise<QlooEntity[]> {
    const res = await this.insights({ 'filter.type': `urn:entity:${type}` })
    return res.items
  }
}
