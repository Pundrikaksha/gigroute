// Pure plan model shared by the agent (server) and the /plan page (client).
// Tool results are folded into a Plan as they stream in; the UI renders it.
import type { ExplainabilityEntry, QlooEntity, QlooTag } from '../qloo/types'

export const DEFAULT_STOPS = 5
export const MAX_STOPS = 8

export interface PlanInput {
  artist: string
  region?: string
  cities: string[]
  stops: number
  demo: boolean
}

export interface PlanStop {
  city: string
  lat?: number
  lng?: number
  affinity?: number
  tags: QlooTag[]
  explainability: ExplainabilityEntry[]
  /** null until venues_in_city has returned for this city. */
  venues: QlooEntity[] | null
}

export interface Plan {
  input: PlanInput
  artist?: { id: string; name: string; tags: QlooTag[] }
  artistNotFound?: boolean
  candidates?: { id: string; name: string }[]
  similarArtists: QlooEntity[]
  stops: PlanStop[]
  merch: QlooEntity[]
  pitch?: string
  routed: boolean
}

export interface Driver {
  id: string
  name: string
  score: number
}

export function parsePlanInput(body: unknown): PlanInput | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Request body must be a JSON object' }
  const b = body as Record<string, unknown>
  const artist = typeof b.artist === 'string' ? b.artist.trim() : ''
  if (!artist) return { error: 'artist is required' }
  if (artist.length > 100) return { error: 'artist must be at most 100 characters' }
  const region = typeof b.region === 'string' && b.region.trim() ? b.region.trim().slice(0, 100) : undefined
  const rawCities = Array.isArray(b.cities) ? b.cities : typeof b.cities === 'string' ? b.cities.split(',') : []
  const cities = rawCities
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, MAX_STOPS)
  const n = Number(b.stops)
  const stops = Number.isFinite(n) && n > 0 ? Math.min(MAX_STOPS, Math.floor(n)) : DEFAULT_STOPS
  return { artist, region, cities, stops, demo: b.demo === true || b.demo === '1' }
}

export function createPlan(input: PlanInput): Plan {
  return { input, similarArtists: [], stops: [], merch: [], routed: false }
}

const cityKey = (city: string) => city.split(',')[0].trim().toLowerCase()
const sameCity = (a: string, b: string) => cityKey(a) === cityKey(b)

function isEntityList(result: unknown): result is QlooEntity[] {
  return Array.isArray(result) && result.every((r) => r && typeof r === 'object' && 'id' in r && 'name' in r)
}

function stopFromHotspot(h: QlooEntity, existing?: PlanStop): PlanStop {
  return {
    city: h.name,
    lat: h.lat,
    lng: h.lng,
    affinity: h.affinity,
    tags: h.tags,
    explainability: h.explainability,
    venues: existing?.venues ?? null,
  }
}

function centroid(venues: QlooEntity[]): { lat?: number; lng?: number } {
  const located = venues.filter((v) => v.lat != null && v.lng != null)
  if (located.length === 0) return {}
  return {
    lat: located.reduce((s, v) => s + (v.lat as number), 0) / located.length,
    lng: located.reduce((s, v) => s + (v.lng as number), 0) / located.length,
  }
}

/** Fold one tool result into the plan. Returns a new Plan; never mutates. */
export function applyToolResult(plan: Plan, tool: string, args: Record<string, unknown>, result: unknown): Plan {
  switch (tool) {
    case 'resolve_artist': {
      if (result && typeof result === 'object' && 'needs_input' in result) {
        const candidates = (result as { candidates?: QlooEntity[] }).candidates ?? []
        return { ...plan, candidates: candidates.map((c) => ({ id: c.id, name: c.name })) }
      }
      if (!isEntityList(result) || result.length === 0) return { ...plan, artistNotFound: true }
      const a = result[0]
      return { ...plan, artist: { id: a.id, name: a.name, tags: a.tags ?? [] }, artistNotFound: false }
    }
    case 'similar_artists':
      return isEntityList(result) ? { ...plan, similarArtists: result } : plan
    case 'fan_hotspots': {
      if (!isEntityList(result)) return plan
      const ranked = [...result].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))
      const preferred = plan.input.cities
      const picked =
        preferred.length > 0
          ? preferred.map(
              (c) =>
                ranked.find((h) => sameCity(h.name, c)) ??
                ({ id: c, name: c, type: 'urn:entity:destination', tags: [], explainability: [] } as QlooEntity)
            )
          : ranked.slice(0, plan.input.stops)
      const stops = picked.map((h) => stopFromHotspot(h, plan.stops.find((s) => sameCity(s.city, h.name))))
      return { ...plan, stops, routed: false }
    }
    case 'venues_in_city': {
      if (!isEntityList(result)) return plan
      const city = String(args.city ?? '')
      const venues = [...result].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))
      const idx = plan.stops.findIndex((s) => sameCity(s.city, city))
      if (idx === -1) {
        const stop: PlanStop = { city, tags: [], explainability: [], venues, ...centroid(venues) }
        return { ...plan, stops: [...plan.stops, stop] }
      }
      const stops = plan.stops.map((s, i) => {
        if (i !== idx) return s
        const fallback = s.lat == null || s.lng == null ? centroid(venues) : {}
        return { ...s, ...fallback, venues }
      })
      return { ...plan, stops }
    }
    case 'cross_domain_tastes': {
      if (!isEntityList(result)) return plan
      const seen = new Set(plan.merch.map((m) => m.id))
      return { ...plan, merch: [...plan.merch, ...result.filter((m) => !seen.has(m.id))] }
    }
    case 'plan_route': {
      const order = Array.isArray(result) ? result.map(String) : []
      const rank = (s: PlanStop) => {
        const i = order.findIndex((o) => sameCity(o, s.city))
        return i === -1 ? Number.MAX_SAFE_INTEGER : i
      }
      const ordered = [...plan.stops].sort((a, b) => rank(a) - rank(b))
      return { ...plan, stops: nearestNeighbourRoute(ordered), routed: true }
    }
    case 'draft_pitch':
      return typeof result === 'string' ? { ...plan, pitch: result } : plan
    default:
      return plan
  }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * Greedy nearest-neighbour ordering that keeps the first stop as the start.
 * Stops without coordinates keep their relative order at the end.
 */
export function nearestNeighbourRoute<T extends { lat?: number; lng?: number }>(stops: T[]): T[] {
  const located = stops.filter((s) => s.lat != null && s.lng != null) as (T & { lat: number; lng: number })[]
  const unlocated = stops.filter((s) => s.lat == null || s.lng == null)
  if (located.length <= 2) return [...located, ...unlocated]
  const route = [located[0]]
  const remaining = located.slice(1)
  while (remaining.length > 0) {
    const last = route[route.length - 1]
    let best = 0
    for (let i = 1; i < remaining.length; i++) {
      if (haversineKm(last, remaining[i]) < haversineKm(last, remaining[best])) best = i
    }
    route.push(remaining.splice(best, 1)[0])
  }
  return [...route, ...unlocated]
}

/** Map explainability entries to names using the artist and similar artists in the plan. */
export function resolveDrivers(plan: Plan, entries: ExplainabilityEntry[]): Driver[] {
  const names = new Map<string, string>()
  if (plan.artist) names.set(plan.artist.id, plan.artist.name)
  for (const a of plan.similarArtists) names.set(a.id, a.name)
  return entries.map((e) => ({ id: e.entityId, name: names.get(e.entityId) ?? 'Related artist', score: e.score }))
}

/** Tags on a venue or city that also describe the artist or its similar artists. */
export function matchingTags(plan: Plan, tags: QlooTag[]): QlooTag[] {
  const taste = new Set<string>()
  for (const t of plan.artist?.tags ?? []) taste.add(t.name.toLowerCase())
  for (const a of plan.similarArtists) for (const t of a.tags) taste.add(t.name.toLowerCase())
  return tags.filter((t) => taste.has(t.name.toLowerCase()))
}

/** The entity IDs to signal on: the artist plus its top similar artists (drives explainability). */
export function signalEntityIds(plan: Plan, similarCount = 3): string[] {
  if (!plan.artist) return []
  return [plan.artist.id, ...plan.similarArtists.slice(0, similarCount).map((a) => a.id)]
}

export function draftPitch(venue: string, artist: string, why?: string): string {
  const reason = why ? ` Qloo taste data shows a strong overlap between our listeners and your regulars (${why}).` : ''
  return `Hi ${venue} booking team,\n\nI'm reaching out on behalf of ${artist}.${reason} We're routing a run through your city and would love to discuss a date.\n\nThanks!`
}

export function planToMarkdown(plan: Plan): string {
  const pct = (n?: number) => (n == null ? 'n/a' : `${Math.round(n * 100)}%`)
  let md = `# Tour plan for ${plan.artist?.name ?? plan.input.artist}\n\n`
  md += `_Affinities describe group tendencies of audiences, not individual preferences._\n\n`
  if (plan.similarArtists.length > 0) {
    md += `**Co-bill ideas:** ${plan.similarArtists.map((a) => a.name).join(', ')}\n\n`
  }
  plan.stops.forEach((stop, i) => {
    md += `## Stop ${i + 1}: ${stop.city} (affinity ${pct(stop.affinity)})\n`
    const drivers = resolveDrivers(plan, stop.explainability)
    if (drivers.length > 0) md += `- Driven by fans of: ${drivers.map((d) => `${d.name} (${pct(d.score)})`).join(', ')}\n`
    for (const v of stop.venues ?? []) {
      const tags = matchingTags(plan, v.tags).map((t) => t.name)
      md += `- ${v.name}: affinity ${pct(v.affinity)}${tags.length ? `; matching tags: ${tags.join(', ')}` : ''}\n`
    }
    md += `\n`
  })
  if (plan.merch.length > 0) md += `## Merch and poster ideas\n${plan.merch.map((m) => `- ${m.name}`).join('\n')}\n`
  return md
}
