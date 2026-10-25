import { expect, test, describe } from 'vitest'
import { runAgent, type AgentEvent } from '../lib/agent/agent'
import { parsePlanInput, resolveDrivers, type PlanInput } from '../lib/agent/plan'
import { MockQlooClient } from '../lib/qloo/mock'

function input(body: Record<string, unknown>): PlanInput {
  const parsed = parsePlanInput(body)
  if ('error' in parsed) throw new Error(parsed.error)
  return parsed
}

async function run(body: Record<string, unknown>) {
  const events: AgentEvent[] = []
  const result = await runAgent(input(body), (e) => events.push(e))
  const done = events.find((e) => e.step === 'done')
  return { events, result, plan: done?.plan }
}

describe('Agent end to end (MockLLM + MockQloo)', () => {
  test('plans a UK tour with venues and explainability for every stop', async () => {
    const { events, result, plan } = await run({ artist: 'Radiohead', region: 'UK', stops: 3 })

    expect(result).toMatch(/^A 3-stop run for Radiohead: /)
    expect(result).toMatch(/strongest overlap is London at 96%, driven mostly by fans of Radiohead \(62%\)/)
    expect(plan?.artist?.name).toBe('Radiohead')
    expect(plan?.routed).toBe(true)
    expect(plan?.stops.map((s) => s.city).sort()).toEqual(['Bristol, UK', 'London, UK', 'Manchester, UK'])
    for (const stop of plan!.stops) {
      expect(stop.lat).toBeTypeOf('number')
      expect(stop.venues?.length).toBeGreaterThan(0)
      expect(resolveDrivers(plan!, stop.explainability).map((d) => d.name)).toContain('Radiohead')
    }
    expect(plan?.merch.map((m) => m.type)).toEqual(expect.arrayContaining(['urn:entity:brand', 'urn:entity:movie']))
    expect(plan?.pitch).toMatch(/Radiohead/)
    // Venues are fetched in one parallel batch, one call per stop.
    expect(events.filter((e) => e.step === 'venues_in_city')).toHaveLength(3)
    // The plan streams progressively.
    expect(events.filter((e) => e.plan).length).toBeGreaterThan(5)
  })

  test('respects stop count without a region', async () => {
    const { plan } = await run({ artist: 'Radiohead', stops: 5 })
    expect(plan?.stops).toHaveLength(5)
  })

  test('uses candidate cities when given', async () => {
    const { plan } = await run({ artist: 'Radiohead', cities: 'Austin, Seattle' })
    expect(plan?.stops.map((s) => s.city).sort()).toEqual(['Austin, USA', 'Seattle, USA'])
  })

  test('in mock mode an unknown artist still gets a full, labelled sample plan', async () => {
    const { result, plan } = await run({ artist: 'Phoebe Bridgers', stops: 3 })
    expect(plan?.artist).toMatchObject({ name: 'Phoebe Bridgers', sampleOf: expect.any(String) })
    expect(plan?.stops).toHaveLength(3)
    expect(plan?.stops.every((s) => (s.venues?.length ?? 0) > 0)).toBe(true)
    expect(result).toMatch(/Sample data: Phoebe Bridgers isn't in the built-in fixtures/)
    // Explainability credits the user's artist, not the fixture seed.
    expect(resolveDrivers(plan!, plan!.stops[0].explainability)[0].name).toBe('Phoebe Bridgers')
  })

  test('a fixture similar artist (Muse) plans directly', async () => {
    const { plan } = await run({ artist: 'Muse', region: 'UK', stops: 2 })
    expect(plan?.artist).toMatchObject({ name: 'Muse' })
    expect(plan?.artist?.sampleOf).toBeUndefined()
    expect(plan?.similarArtists.map((a) => a.name)).not.toContain('Muse')
    expect(plan?.stops).toHaveLength(2)
  })

  test('a region without sample data ends cleanly with no stops', async () => {
    const { result, plan, events } = await run({ artist: 'Radiohead', region: 'India' })
    expect(result).toMatch(/no fan hotspots .* in India/)
    expect(plan?.stops).toEqual([])
    expect(events.some((e) => e.step === 'error')).toBe(false)
  })

  test('real mode: an artist Qloo does not know ends with an empty plan, not an error', async () => {
    const empty = new MockQlooClient()
    empty.search = async () => []
    const events: AgentEvent[] = []
    const result = await runAgent(input({ artist: 'Definitely Not A Band' }), (e) => events.push(e), { qloo: empty })
    const plan = events.find((e) => e.step === 'done')?.plan
    expect(result).toMatch(/couldn't find/)
    expect(plan?.artistNotFound).toBe(true)
    expect(plan?.stops).toEqual([])
    expect(events.some((e) => e.step === 'error')).toBe(false)
  })

  test('result events carry no raw partial and the stream stays small', async () => {
    const { events } = await run({ artist: 'Radiohead', region: 'UK', stops: 3 })
    expect(events.filter((e) => e.step.endsWith('_result')).every((e) => e.partial === undefined)).toBe(true)
    // One plan snapshot per parallel venues batch, not one per city.
    expect(events.filter((e) => e.step === 'venues_in_city_result' && e.plan)).toHaveLength(1)
    const bytes = events.reduce((n, e) => n + JSON.stringify(e).length, 0)
    expect(bytes).toBeLessThan(75_000)
  })
})
