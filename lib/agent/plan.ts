// Pure plan model shared by the agent (server) and the /plan page (client).
// Tool results are folded into a Plan as they stream in; the UI renders it.
import type { ExplainabilityEntry, QlooEntity, QlooTag } from '../qloo/types'

export const DEFAULT_STOPS = 5
export const MAX_STOPS = 8

/** Shown when fan hotspots come back empty. Later steps are skipped, not left pending. */
export const NO_PLAN_STATUS = 'No plan: no hotspots in this region'

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
  /** sampleOf is set in mock mode when an unknown artist was mapped onto a fixture profile. */
  artist?: { id: string; name: string; tags: QlooTag[]; sampleOf?: string; sampleProfileId?: string }
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
      const artist: NonNullable<Plan['artist']> = { id: a.id, name: a.name, tags: a.tags ?? [] }
      if (a.sampleOf) artist.sampleOf = a.sampleOf
      if (a.sampleProfileId) artist.sampleProfileId = a.sampleProfileId
      return { ...plan, artist, artistNotFound: false }
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

/**
 * Map explainability entries to names using the artist and similar artists in the plan.
 * Sample fallbacks attribute the fixture share to the profile ("artists like Big Thief"),
 * never to the name the user typed.
 */
export function resolveDrivers(plan: Plan, entries: ExplainabilityEntry[]): Driver[] {
  const names = new Map<string, string>()
  if (plan.artist) {
    const like = plan.artist.sampleOf ? `artists like ${plan.artist.sampleOf}` : null
    names.set(plan.artist.id, like ?? plan.artist.name)
    if (like && plan.artist.sampleProfileId) names.set(plan.artist.sampleProfileId, like)
  }
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

// ---------------------------------------------------------------------------
// Narration, pitches and exports. All pure and deterministic, so the MockLLM, the
// UI and the exports tell the same story from the same Qloo evidence.
// ---------------------------------------------------------------------------

const pct = (n?: number) => (n == null ? 'n/a' : `${Math.round(n * 100)}%`)
const shortCity = (city: string) => city.split(',')[0].trim()

/**
 * "the Big Thief taste profile", or "The Strokes taste profile" when the name
 * already starts with "The", so the sentence never reads "the The Strokes".
 */
export function tasteProfilePhrase(name: string): string {
  const trimmed = name.trim()
  const article = /^the\s/i.test(trimmed) ? '' : 'the '
  return `${article}${trimmed} taste profile`
}
const PLACE_CATEGORY = 'urn:tag:category:place'

/** "a", "a and b", "a, b and c" */
function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const driverText = (drivers: Driver[], n = 2) => list(drivers.slice(0, n).map((d) => `${d.name} (${pct(d.score)})`))

export interface StopNarrative {
  city: string
  text: string
}

export interface TourNarrative {
  summary: string
  stops: StopNarrative[]
}

function venueKind(venue: QlooEntity): string | undefined {
  return venue.tags.find((t) => t.type === PLACE_CATEGORY)?.name
}

function narrateStop(plan: Plan, stop: PlanStop): string {
  if (stop.affinity == null && (stop.venues ?? []).length === 0) {
    return `${stop.city}: you asked for this city, but Qloo returned no audience data for it, so treat it as a wildcard date.`
  }
  const parts: string[] = []
  const shared = matchingTags(plan, stop.tags).map((t) => t.name)
  const drivers = resolveDrivers(plan, stop.explainability)
  let lead = `${stop.city} (${pct(stop.affinity)} audience affinity)`
  if (shared.length > 0) lead += ` shares ${list(shared)} with your sound`
  parts.push(drivers.length > 0 ? `${lead}; the score is driven by fans of ${driverText(drivers)}.` : `${lead}.`)
  const [top, backup] = stop.venues ?? []
  if (top) {
    const tags = matchingTags(plan, top.tags).filter((t) => t.type !== PLACE_CATEGORY).map((t) => t.name)
    const kind = venueKind(top)
    parts.push(
      `Headline room: ${top.name} (${pct(top.affinity)}${kind ? `, ${kind.toLowerCase()}` : ''}${tags.length ? `; tagged ${list(tags)}` : ''}).`
    )
  }
  if (backup) parts.push(`Backup: ${backup.name} (${pct(backup.affinity)}).`)
  return parts.join(' ')
}

/** A judge-friendly explanation of why each city and room made the cut, citing Qloo signals. */
export function narrateTour(plan: Plan): TourNarrative {
  const name = plan.artist?.name ?? plan.input.artist
  const stops = plan.stops.map((s) => ({ city: s.city, text: narrateStop(plan, s) }))
  if (plan.stops.length === 0) return { summary: '', stops }

  const sentences: string[] = []
  const route = plan.stops.map((s) => shortCity(s.city)).join(' → ')
  // Sample plans are ranked on the fixture profile, so attribution names that profile.
  const taste = plan.artist?.sampleOf ? `artists like ${plan.artist.sampleOf}` : name
  const similarClause =
    plan.similarArtists.length === 0 ? '' : plan.artist?.sampleOf ? ' and the closest similar artists' : ' and its closest similar artists'
  sentences.push(
    `A ${plan.stops.length}-stop run for ${name}: ${route}. Every city and room was ranked by Qloo audience affinity for ${taste}${similarClause}, not by guesswork.`
  )
  const best = [...plan.stops].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))[0]
  if (best.affinity != null) {
    const drivers = resolveDrivers(plan, best.explainability)
    sentences.push(
      `The strongest overlap is ${shortCity(best.city)} at ${pct(best.affinity)}${
        drivers.length > 0 ? `, driven mostly by fans of ${driverText(drivers)}` : ''
      }.`
    )
  }
  if (plan.similarArtists.length > 0) {
    sentences.push(
      `Co-bill with ${list(plan.similarArtists.slice(0, 2).map((a) => `${a.name} (${pct(a.affinity)})`))} to pull from the same crowd.`
    )
  }
  if (plan.merch.length > 0) {
    sentences.push(`For posters and merch, this audience over-indexes on ${list(plan.merch.slice(0, 3).map((m) => m.name))}.`)
  }
  if (plan.artist?.sampleOf) {
    sentences.push(
      `Sample data: ${name} isn't in the built-in fixtures, so this plan uses ${tasteProfilePhrase(plan.artist.sampleOf)}.`
    )
  }
  return { summary: sentences.join(' '), stops }
}

export interface PitchEmail {
  subject: string
  body: string
}

/**
 * A booking-enquiry draft for one venue, grounded in the plan's Qloo evidence.
 * Shown on screen to copy; GigRoute never sends email.
 */
export function pitchEmail(plan: Plan, stop: PlanStop, venue: QlooEntity): PitchEmail {
  const artist = plan.artist?.name ?? plan.input.artist
  const city = shortCity(stop.city)
  const evidence: string[] = []
  const cityScore = stop.affinity != null ? `, in a city that scores ${pct(stop.affinity)} overall.` : '.'
  if (plan.artist?.sampleOf) {
    evidence.push(
      `Qloo audience data puts ${venue.name} at ${pct(venue.affinity)} affinity with fans of similar artists${cityScore} The figures come from ${tasteProfilePhrase(plan.artist.sampleOf)}, not ${artist}'s own audience.`
    )
  } else {
    evidence.push(`Qloo audience data puts ${venue.name} at ${pct(venue.affinity)} affinity with our listeners${cityScore}`)
  }
  const tags = matchingTags(plan, venue.tags).filter((t) => t.type !== PLACE_CATEGORY).map((t) => t.name)
  if (tags.length > 0) evidence.push(`Shared taste tags: ${list(tags)}.`)
  const drivers = resolveDrivers(plan, venue.explainability).filter(
    (d) => d.id !== plan.artist?.id && d.id !== plan.artist?.sampleProfileId,
  )
  if (drivers.length > 0) evidence.push(`Your regulars also over-index on ${list(drivers.slice(0, 2).map((d) => d.name))}.`)
  const coBills = plan.similarArtists.slice(0, 2).map((a) => a.name)
  if (coBills.length > 0) evidence.push(`We're open to sharing the bill with acts like ${list(coBills)}, who draw the same crowd.`)

  const route = plan.stops.length > 1 ? ` (${plan.stops.map((s) => shortCity(s.city)).join(', ')})` : ''
  const body = [
    `Hi ${venue.name} booking team,`,
    `I'm writing on behalf of ${artist}. We're routing a ${plan.stops.length}-city run${route} and ${venue.name} is our first choice in ${city}.`,
    `Why we think it's a fit:\n${evidence.map((e) => `- ${e}`).join('\n')}`,
    `We'd love to talk about available dates and your usual terms. Happy to send a press kit, streaming links and recent draw numbers.`,
    `Thanks,\n[Your name]\n${artist} · [email] · [phone]`,
    `(Affinity figures are Qloo group-level audience tendencies, not ticket guarantees.)`,
  ].join('\n\n')
  return { subject: `Booking enquiry: ${artist} at ${venue.name}, ${city}`, body }
}

export const pitchText = (p: PitchEmail) => `Subject: ${p.subject}\n\n${p.body}`

/** Relative permalink that re-runs the same plan: every input is in the query string. */
export function planHref(input: Omit<PlanInput, 'demo'> & { demo?: boolean }): string {
  const q = new URLSearchParams({ artist: input.artist })
  if (input.region) q.set('region', input.region)
  if (input.cities.length > 0) q.set('cities', input.cities.join(', '))
  q.set('stops', String(input.stops))
  if (input.demo) q.set('demo', '1')
  return `/plan?${q}`
}

export function planFileName(plan: Plan, ext: string): string {
  const slug = (plan.artist?.name ?? plan.input.artist).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `gigroute-${slug || 'tour'}.${ext}`
}

/** A compact, documented export of the plan (names and scores, not raw API payloads). */
export function planToJSON(plan: Plan, origin = ''): string {
  const narrative = narrateTour(plan)
  const data = {
    format: 'gigroute-plan@1',
    permalink: `${origin}${planHref(plan.input)}`,
    input: plan.input,
    artist: plan.artist && {
      name: plan.artist.name,
      tags: plan.artist.tags.map((t) => t.name),
      ...(plan.artist.sampleOf ? { sampleProfile: plan.artist.sampleOf } : {}),
    },
    summary: narrative.summary,
    coBills: plan.similarArtists.map((a) => ({ name: a.name, affinity: a.affinity })),
    stops: plan.stops.map((stop, i) => ({
      city: stop.city,
      lat: stop.lat,
      lng: stop.lng,
      affinity: stop.affinity,
      why: narrative.stops[i].text,
      drivers: resolveDrivers(plan, stop.explainability).map(({ name, score }) => ({ name, score })),
      venues: (stop.venues ?? []).map((v) => ({
        name: v.name,
        address: v.address,
        affinity: v.affinity,
        matchingTags: matchingTags(plan, v.tags).map((t) => t.name),
        pitch: pitchEmail(plan, stop, v),
      })),
    })),
    merch: plan.merch.map((m) => ({ name: m.name, type: m.type })),
    note: 'Affinities describe group tendencies of audiences, not individual preferences.',
  }
  return JSON.stringify(data, null, 2)
}

export function planToMarkdown(plan: Plan, origin = ''): string {
  const narrative = narrateTour(plan)
  let md = `# Tour plan for ${plan.artist?.name ?? plan.input.artist}\n\n`
  md += `_Affinities describe group tendencies of audiences, not individual preferences._\n\n`
  md += `Permalink: ${origin}${planHref(plan.input)}\n\n`
  if (narrative.summary) md += `${narrative.summary}\n\n`
  if (plan.similarArtists.length > 0) {
    md += `**Co-bill ideas:** ${plan.similarArtists.map((a) => a.name).join(', ')}\n\n`
  }
  plan.stops.forEach((stop, i) => {
    md += `## Stop ${i + 1}: ${stop.city} (affinity ${pct(stop.affinity)})\n\n`
    md += `${narrative.stops[i].text}\n\n`
    const drivers = resolveDrivers(plan, stop.explainability)
    if (drivers.length > 0) md += `- Driven by fans of: ${drivers.map((d) => `${d.name} (${pct(d.score)})`).join(', ')}\n`
    for (const v of stop.venues ?? []) {
      const tags = matchingTags(plan, v.tags).map((t) => t.name)
      md += `- ${v.name}: affinity ${pct(v.affinity)}${tags.length ? `; matching tags: ${tags.join(', ')}` : ''}\n`
    }
    const top = stop.venues?.[0]
    if (top) {
      const pitch = pitchEmail(plan, stop, top)
      md += `\n### Pitch draft: ${top.name}\n\n**Subject:** ${pitch.subject}\n\n${pitch.body
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')}\n`
    }
    md += `\n`
  })
  if (plan.merch.length > 0) md += `## Merch and poster ideas\n${plan.merch.map((m) => `- ${m.name}`).join('\n')}\n`
  return md
}
