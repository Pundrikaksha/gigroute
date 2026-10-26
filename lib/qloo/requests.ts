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

/**
 * Region names Qloo's locality search does not resolve on its own. Live checks on 27 Oct 2026:
 * "US" and "USA" returned no destinations, "United States" did.
 */
const REGION_QUERIES: Record<string, string> = {
  us: 'United States',
  usa: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  america: 'United States',
  'united states of america': 'United States',
}

/** ISO 3166-1 alpha-2 codes for regions, used to keep venue lookups inside the touring country. */
const COUNTRY_CODES: Record<string, string> = {
  us: 'US', usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US', 'united states': 'US', 'united states of america': 'US',
  uk: 'GB', gb: 'GB', britain: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'united kingdom': 'GB',
  india: 'IN', canada: 'CA', australia: 'AU', ireland: 'IE', germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT',
  netherlands: 'NL', japan: 'JP', mexico: 'MX', brazil: 'BR', 'new zealand': 'NZ', sweden: 'SE', norway: 'NO',
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', IN: 'India', CA: 'Canada', AU: 'Australia', IE: 'Ireland', DE: 'Germany',
  FR: 'France', ES: 'Spain', IT: 'Italy', NL: 'Netherlands', JP: 'Japan', MX: 'Mexico', BR: 'Brazil', NZ: 'New Zealand',
  SE: 'Sweden', NO: 'Norway',
}

/** "Edinburgh" + "GB" -> "Edinburgh, United Kingdom", so the locality search prefers the right country. */
export function cityInCountry(city: string, countryCode: string): string {
  const name = COUNTRY_NAMES[countryCode]
  const base = city.split(',')[0].trim()
  return name ? `${base}, ${name}` : base
}

/** The locality query to send for a region, e.g. "US" -> "United States". Unknown regions pass through. */
export function regionQuery(region: string): string {
  const q = region.trim()
  return REGION_QUERIES[q.toLowerCase()] ?? q
}

/** Two-letter country code for a region name or alias, or undefined when it is not a known country. */
export function countryCodeFor(region?: string): string | undefined {
  if (!region) return undefined
  return COUNTRY_CODES[region.trim().toLowerCase()]
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
  if (region && region.trim()) params['filter.location.query'] = regionQuery(region)
  return params
}

/**
 * Venues in one city. With a country code the city query is pinned to that country, so
 * "Edinburgh" on a UK tour cannot resolve to Edinburgh, Indiana.
 */
export function venuesInCityParams(entityIds: string[], city: string, take = 5, countryCode?: string): InsightsParams {
  const params: InsightsParams = {
    'filter.type': ENTITY_TYPES.place,
    'signal.interests.entities': signal(entityIds),
    'filter.location.query': city,
    'feature.explainability': true,
    take: clampTake(take),
  }
  if (countryCode) params['filter.geocode.country_code'] = countryCode
  return params
}

/**
 * Second try for a city whose locality query failed or resolved abroad: match the place's
 * geocoded city name exactly inside the country instead of searching for a locality.
 */
export function venuesByGeocodeParams(entityIds: string[], city: string, countryCode: string, take = 5): InsightsParams {
  return {
    'filter.type': ENTITY_TYPES.place,
    'signal.interests.entities': signal(entityIds),
    'filter.geocode.name': city.split(',')[0].trim(),
    'filter.geocode.country_code': countryCode,
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
    // Some live tags (e.g. urn:tag:voice_type:qloo) arrive with only a type and no name or id.
    tags: (raw.tags ?? []).filter((t) => t && typeof t.name === 'string' && t.name.trim() !== '').map(normalizeTag),
    explainability,
    lat: raw.location?.lat,
    lng: raw.location?.lon,
    address: raw.properties?.address,
    description: raw.properties?.short_description,
    countryCode: raw.properties?.geocode?.country_code,
  }
}
