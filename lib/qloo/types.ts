export interface QlooEntity {
  id: string
  name: string
  type: string
  description?: string
  affinity?: number
  explainability?: {
    why: string
  }
  lat?: number
  lng?: number
}

export interface QlooTag {
  id: string
  name: string
  category?: string
}

export interface InsightsResult {
  items: QlooEntity[]
}

export interface QlooClient {
  search(query: string, types?: string[]): Promise<QlooEntity[]>
  findTags(query: string, typeFilter?: string): Promise<QlooTag[]>
  insights(params: Record<string, string | number | boolean>): Promise<InsightsResult>

  // Helpers on top of insights:
  similarArtists(entityIds: string[], take?: number): Promise<QlooEntity[]>
  fanHotspots(entityIds: string[], region?: string): Promise<QlooEntity[]>
  venuesInCity(entityIds: string[], city: string, take?: number): Promise<QlooEntity[]>
  crossDomain(entityIds: string[], type: string): Promise<QlooEntity[]>
}
