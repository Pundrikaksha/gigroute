import { describe, expect, test } from 'vitest'
import { runAgent } from '../lib/agent/agent'
import {
  narrateTour,
  parsePlanInput,
  pitchEmail,
  planToJSON,
  planToMarkdown,
  resolveDrivers,
  type Plan,
  type PlanInput,
} from '../lib/agent/plan'
import mockData from '../lib/qloo/fixtures/mock-data.json'

interface Named {
  name: string
  entity_id?: string
}

interface ProfileBundle {
  similarArtists?: Named[]
  brand?: Named[]
  movie?: Named[]
}

const CASES: { artist: string; profile: string }[] = [
  { artist: 'Phoebe Bridgers', profile: 'Big Thief' },
  { artist: 'Arijit Singh', profile: 'The Strokes' },
  { artist: 'Bon Iver', profile: 'Radiohead' },
  { artist: 'Clairo', profile: 'Khruangbin' },
]

function tasteNames(): Map<string, Set<string>> {
  const byId = new Map(mockData.search.results.map((a) => [a.entity_id, a.name]))
  const map = new Map<string, Set<string>>()
  for (const artist of mockData.search.results) map.set(artist.name, new Set([artist.name]))

  const radiohead = map.get('Radiohead')!
  for (const e of mockData.insights.artist.results.entities) radiohead.add(e.name)
  for (const e of mockData.insights.brand.results.entities) radiohead.add(e.name)
  for (const e of mockData.insights.movie.results.entities) radiohead.add(e.name)

  const profiles = (mockData as { profiles?: Record<string, ProfileBundle> }).profiles ?? {}
  for (const [id, bundle] of Object.entries(profiles)) {
    const set = map.get(byId.get(id) ?? '')
    if (!set) continue
    for (const list of [bundle.similarArtists, bundle.brand, bundle.movie]) {
      for (const e of list ?? []) set.add(e.name)
    }
  }
  return map
}

const TASTE = tasteNames()

function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

function attributionText(plan: Plan): string {
  const narrative = narrateTour(plan)
  const chunks = [narrative.summary, ...narrative.stops.map((s) => s.text)]
  for (const stop of plan.stops) {
    chunks.push(...resolveDrivers(plan, stop.explainability).map((d) => d.name))
    for (const venue of stop.venues ?? []) {
      chunks.push(...resolveDrivers(plan, venue.explainability).map((d) => d.name))
      chunks.push(pitchEmail(plan, stop, venue).body)
    }
  }
  const joined = chunks.join('\n')
  const clauses = joined.match(/fans of [^.\n]*|over-index on [^.\n]*/gi) ?? []
  return [...clauses, ...plan.stops.flatMap((s) => resolveDrivers(plan, s.explainability).map((d) => d.name))].join('\n')
}

async function planFor(body: Record<string, unknown>): Promise<Plan> {
  const input = parsePlanInput(body) as PlanInput
  let plan: Plan | undefined
  await runAgent(input, (e) => {
    if (e.step === 'done' || e.step === 'no_plan') plan = e.plan
  })
  return plan as Plan
}

describe('sample fallback plans stay on one taste profile', () => {
  test('the four fixture profiles are covered by the cases', () => {
    expect(new Set(CASES.map((c) => c.profile))).toEqual(new Set(TASTE.keys()))
  })

  for (const { artist, profile } of CASES) {
    for (const region of ['UK', 'US']) {
      test(`${artist} in ${region} matches the ${profile} profile and never the typed name`, async () => {
        const plan = await planFor({ artist, region, stops: 3 })
        expect(plan.artist).toMatchObject({ name: artist, sampleOf: profile })
        expect(plan.stops.length).toBeGreaterThan(0)
        expect(plan.stops.every((s) => (s.venues?.length ?? 0) > 0)).toBe(true)
        const place = region === 'UK' ? 'UK' : 'USA'
        expect(plan.stops.every((s) => s.city.endsWith(place))).toBe(true)

        const own = TASTE.get(profile)!
        const foreign = [...TASTE.values()].flatMap((set) => [...set].filter((name) => !own.has(name)))

        for (const name of plan.similarArtists.map((a) => a.name)) expect(own.has(name)).toBe(true)
        expect(plan.similarArtists.length).toBeGreaterThan(0)
        for (const name of plan.merch.map((m) => m.name)) expect(own.has(name)).toBe(true)
        expect(plan.merch.length).toBeGreaterThan(0)

        const narrative = narrateTour(plan)
        const docs = [
          narrative.summary,
          ...narrative.stops.map((s) => s.text),
          planToMarkdown(plan),
          planToJSON(plan),
          ...plan.stops.flatMap((stop) => (stop.venues ?? []).map((venue) => pitchEmail(plan, stop, venue).body)),
        ]
        for (const doc of docs) {
          for (const name of foreign) expect(mentions(doc, name), `${name} leaked into a ${profile} plan`).toBe(false)
        }

        const like = `artists like ${profile}`
        expect(narrative.summary).toContain(like)
        expect(narrative.summary).toContain(`${profile} taste profile`)
        for (const stop of plan.stops) {
          const drivers = resolveDrivers(plan, stop.explainability)
          expect(drivers.some((d) => d.name === like)).toBe(true)
          expect(drivers.every((d) => d.name !== 'Related artist')).toBe(true)
          for (const driver of drivers) {
            if (driver.name !== like) expect(own.has(driver.name)).toBe(true)
          }
          for (const venue of stop.venues ?? []) {
            const venueDrivers = resolveDrivers(plan, venue.explainability)
            expect(venueDrivers.some((d) => d.name === like)).toBe(true)
            expect(venueDrivers.every((d) => d.name !== 'Related artist')).toBe(true)
          }
        }

        const attribution = attributionText(plan)
        expect(attribution).toContain(like)
        expect(mentions(attribution, artist)).toBe(false)
        expect(attribution).not.toMatch(new RegExp(`fans of ${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))
      })
    }
  }
})
