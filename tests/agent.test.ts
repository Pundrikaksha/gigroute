import { expect, test, describe } from 'vitest'
import { runAgent, type AgentEvent } from '../lib/agent/agent'
import { parsePlanInput, resolveDrivers, type PlanInput } from '../lib/agent/plan'

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

    expect(result).toMatch(/Planned 3 stops for Radiohead/)
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

  test('unknown artist ends with an empty plan, not an error', async () => {
    const { result, plan, events } = await run({ artist: 'Definitely Not A Band' })
    expect(result).toMatch(/couldn't find/)
    expect(plan?.artistNotFound).toBe(true)
    expect(plan?.stops).toEqual([])
    expect(events.some((e) => e.step === 'error')).toBe(false)
  })
})
