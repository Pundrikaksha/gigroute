// ---------------------------------------------------------------------------
// Raw response shapes, as documented at https://docs.qloo.com
// (GET /v2/insights, GET /search, GET /v2/tags). Only the fields GigRoute
// reads are typed; everything else is passed through untouched.
// ---------------------------------------------------------------------------

export interface QlooApiTag {
  tag_id?: string
  id?: string
  name: string
  type?: string
  value?: string
}

export interface QlooApiExplainabilityEntry {
  entity_id: string
  score: number
}

export interface QlooApiEntity {
  entity_id: string
  name: string
  /** Insights results: `type` is "urn:entity" and `subtype` the specific type. */
  type?: string
  subtype?: string
  /** Search results list the entity types instead. */
  types?: string[]
  properties?: {
    address?: string
    short_description?: string
    geocode?: { name?: string; country_code?: string; admin1_region?: string }
    [key: string]: unknown
  }
  location?: { lat: number; lon: number; geohash?: string }
  popularity?: number
  tags?: QlooApiTag[]
  query?: {
    affinity?: number
    /** Present when `feature.explainability=true`; keyed by signal, e.g. "signal.interests.entities". */
    explainability?: Record<string, QlooApiExplainabilityEntry[]>
  }
}

export interface QlooInsightsResponse {
  success: boolean
  results: { entities: QlooApiEntity[] }
  query?: Record<string, unknown>
  duration?: number
}

export interface QlooSearchResponse {
  success?: boolean
  duration?: number
  results: QlooApiEntity[]
}

export interface QlooApiTagItem {
  id: string
  name: string
  types?: string[]
  parents?: { id: string; name: string; type?: string }[]
}

export interface QlooTagsResponse {
  success: boolean
  duration?: number
  results: { tags: QlooApiTagItem[] }
}

// ---------------------------------------------------------------------------
// Normalized shapes used by the agent and UI.
// ---------------------------------------------------------------------------

export interface QlooTag {
  id: string
  name: string
  type?: string
}

export interface ExplainabilityEntry {
  entityId: string
  score: number
}

export interface QlooEntity {
  id: string
  name: string
  /** Most specific entity type URN, e.g. "urn:entity:place". */
  type: string
  popularity?: number
  affinity?: number
  tags: QlooTag[]
  /** Which input entities drove this result (from query.explainability). */
  explainability: ExplainabilityEntry[]
  lat?: number
  lng?: number
  address?: string
  description?: string
  /** Mock mode only: the fixture taste profile an unknown artist was mapped onto. */
  sampleOf?: string
  /** Mock mode only: fixture entity id of the profile named by sampleOf. */
  sampleProfileId?: string
}

export type InsightsParams = Record<string, string | number | boolean>

export interface QlooClient {
  search(query: string, types?: string[], take?: number): Promise<QlooEntity[]>
  findTags(query: string, parentType?: string, take?: number): Promise<QlooTag[]>
  insights(params: InsightsParams): Promise<QlooInsightsResponse>

  // Helpers on top of insights:
  similarArtists(entityIds: string[], take?: number): Promise<QlooEntity[]>
  fanHotspots(entityIds: string[], region?: string, take?: number): Promise<QlooEntity[]>
  venuesInCity(entityIds: string[], city: string, take?: number): Promise<QlooEntity[]>
  crossDomain(entityIds: string[], type: string, take?: number): Promise<QlooEntity[]>
}
