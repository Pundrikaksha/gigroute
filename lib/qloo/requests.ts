// Request builders and response normalizers shared by the real and mock clients,
// so both see exactly the parameters documented at https://docs.qloo.com.
import type {
  ExplainabilityEntry,
  InsightsParams,
  QlooApiEntity,
  QlooApiTag,
  QlooEntity,
  QlooTag,
} from './types'

/** Documented maximum for `take` on /v2/insights and /v2/tags. */
export const MAX_TAKE = 50

export const ENTITY_TYPES = {
  artist: 'urn:entity:artist',
  place: 'urn:entity:place',
  destination: 'urn:entity:destination',
  brand: 'urn:entity:brand',
  movie: 'urn:entity:movie',
} as const

export const CROSS_DOMAIN_TYPES = ['brand', 'movie'] as const
export type CrossDomainType = (typeof CROSS_DOMAIN_TYPES)[number]

export function clampTake(take: number): number {
  if (!Number.isFinite(take)) return 20
  return Math.min(MAX_TAKE, Math.max(1, Math.floor(take)))
}

function signal(entityIds: string[]): string {
  return entityIds.filter(Boolean).join(',')
}

export function similarArtistsParams(entityIds: string[], take = 6): InsightsParams {
  return {
    'filter.type': ENTITY_TYPES.artist,
    'signal.interests.entities': signal(entityIds),
    take: clampTake(take),
  }
}

export function fanHotspotsParams(entityIds: string[], region?: string, take = 10): InsightsParams {
  const params: InsightsParams = {
    'filter.type': ENTITY_TYPES.destination,
    'signal.interests.entities': signal(entityIds),
    'feature.explainability': true,
    take: clampTake(take),
  }
  if (region) params['filter.location.query'] = region
  return params
}

export function venuesInCityParams(entityIds: string[], city: string, take = 5): InsightsParams {
  return {
    'filter.type': ENTITY_TYPES.place,
    'signal.interests.entities': signal(entityIds),
    'filter.location.query': city,
    'feature.explainability': true,
    take: clampTake(take),
  }
}

export function crossDomainParams(entityIds: string[], type: string, take = 5): InsightsParams {
  if (!(CROSS_DOMAIN_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Unsupported cross-domain type: ${type}`)
  }
  return {
    'filter.type': ENTITY_TYPES[type as CrossDomainType],
    'signal.interests.entities': signal(entityIds),
    take: clampTake(take),
  }
}

export function toSearchParams(params: InsightsParams): URLSearchParams {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) search.append(key, String(value))
  return search
}

export function normalizeTag(tag: QlooApiTag): QlooTag {
  return { id: tag.tag_id ?? tag.id ?? tag.value ?? tag.name, name: tag.name, type: tag.type }
}

export function normalizeEntity(raw: QlooApiEntity): QlooEntity {
  const explainability: ExplainabilityEntry[] = (
    raw.query?.explainability?.['signal.interests.entities'] ?? []
  )
    .map((e) => ({ entityId: e.entity_id, score: e.score }))
    .sort((a, b) => b.score - a.score)

  return {
    id: raw.entity_id,
    name: raw.name,
    type: raw.subtype ?? raw.types?.[0] ?? raw.type ?? 'urn:entity',
    popularity: raw.popularity,
    affinity: raw.query?.affinity,
    tags: (raw.tags ?? []).map(normalizeTag),
    explainability,
    lat: raw.location?.lat,
    lng: raw.location?.lon,
    address: raw.properties?.address,
    description: raw.properties?.short_description,
  }
}
