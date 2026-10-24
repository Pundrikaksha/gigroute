import { describe, expect, test } from 'vitest'
import {
  applyToolResult,
  createPlan,
  matchingTags,
  nearestNeighbourRoute,
  parsePlanInput,
  planToMarkdown,
  type PlanInput,
} from '../lib/agent/plan'
import type { QlooEntity } from '../lib/qloo/types'

const baseInput: PlanInput = { artist: 'Fake Band', cities: [], stops: 2, demo: false }
const entity = (over: Partial<QlooEntity>): QlooEntity => ({
  id: 'x',
  name: 'x',
  type: 'urn:entity:destination',
  tags: [],
  explainability: [],
  ...over,
})

describe('parsePlanInput', () => {
  test('requires an artist', () => {
    expect(parsePlanInput({})).toEqual({ error: 'artist is required' })
    expect(parsePlanInput(null)).toHaveProperty('error')
  })

  test('normalizes cities, stops and demo', () => {
    expect(parsePlanInput({ artist: ' A ', cities: 'X, ,Y', stops: '99', demo: true })).toEqual({
      artist: 'A',
      region: undefined,
      cities: ['X', 'Y'],
      stops: 8,
      demo: true,
    })
    expect(parsePlanInput({ artist: 'A', stops: 'abc' })).toMatchObject({ stops: 5, demo: false })
  })
})

describe('applyToolResult', () => {
  test('fan_hotspots picks top-N by affinity, venues attach to the matching stop', () => {
    let plan = createPlan(baseInput)
    plan = applyToolResult(plan, 'fan_hotspots', {}, [
      entity({ id: 'a', name: 'Low, UK', affinity: 0.1 }),
      entity({ id: 'b', name: 'High, UK', affinity: 0.9 }),
      entity({ id: 'c', name: 'Mid, UK', affinity: 0.5 }),
    ])
    expect(plan.stops.map((s) => s.city)).toEqual(['High, UK', 'Mid, UK'])
    expect(plan.stops[0].venues).toBeNull()

    plan = applyToolResult(plan, 'venues_in_city', { city: 'High' }, [entity({ id: 'v', name: 'Hall', type: 'urn:entity:place' })])
    expect(plan.stops[0].venues?.[0].name).toBe('Hall')
  })

  test('resolve_artist with no match flags artistNotFound', () => {
    expect(applyToolResult(createPlan(baseInput), 'resolve_artist', {}, []).artistNotFound).toBe(true)
  })

  test('matchingTags compares by tag name with the artist taste', () => {
    let plan = createPlan(baseInput)
    plan = applyToolResult(plan, 'resolve_artist', {}, [
      entity({ id: 'art', name: 'Fake Band', type: 'urn:entity:artist', tags: [{ id: 't1', name: 'Indie Rock' }] }),
    ])
    const tags = [
      { id: 'p1', name: 'indie rock' },
      { id: 'p2', name: 'Bar' },
    ]
    expect(matchingTags(plan, tags).map((t) => t.id)).toEqual(['p1'])
    expect(planToMarkdown(plan)).toMatch(/# Tour plan for Fake Band/)
  })
})

describe('nearestNeighbourRoute', () => {
  test('orders greedily from the first stop', () => {
    const london = { name: 'London', lat: 51.5, lng: -0.13 }
    const edinburgh = { name: 'Edinburgh', lat: 55.95, lng: -3.19 }
    const brighton = { name: 'Brighton', lat: 50.82, lng: -0.14 }
    const manchester = { name: 'Manchester', lat: 53.48, lng: -2.24 }
    const nowhere: { name: string; lat?: number; lng?: number } = { name: 'Nowhere' }
    const route = nearestNeighbourRoute([london, edinburgh, nowhere, brighton, manchester])
    expect(route.map((s) => s.name)).toEqual(['London', 'Brighton', 'Manchester', 'Edinburgh', 'Nowhere'])
  })
})
