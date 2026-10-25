import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, test } from 'vitest'
import { PhaseList, phaseVisual } from '../components/plan/phases'

describe('phaseVisual', () => {
  const started = new Set(['resolve_artist', 'similar_artists', 'fan_hotspots'])
  const finished = new Set(['resolve_artist', 'similar_artists', 'fan_hotspots'])

  test('a finished no-plan marks the steps that never ran as skipped', () => {
    expect(phaseVisual('fan_hotspots', started, finished, 'done', true)).toBe('done')
    expect(phaseVisual('venues_in_city', started, finished, 'done', true)).toBe('skipped')
    expect(phaseVisual('cross_domain_tastes', started, finished, 'done', true)).toBe('skipped')
    expect(phaseVisual('plan_route', started, finished, 'done', true)).toBe('skipped')
  })

  test('the same unfinished steps stay pending while a plan is still running or when a plan exists', () => {
    expect(phaseVisual('venues_in_city', started, finished, 'streaming', false)).toBe('pending')
    expect(phaseVisual('venues_in_city', started, finished, 'done', false)).toBe('pending')
    expect(phaseVisual('fan_hotspots', started, new Set(), 'streaming', false)).toBe('active')
  })
})

describe('PhaseList', () => {
  test('skipped steps are a distinct state from pending and done', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    act(() => {
      root.render(
        <PhaseList
          started={new Set(['resolve_artist', 'similar_artists', 'fan_hotspots'])}
          finished={new Set(['resolve_artist', 'similar_artists', 'fan_hotspots'])}
          status="done"
          noPlan
        />
      )
    })

    const state = (tool: string) => el.querySelector(`[data-phase="${tool}"]`)?.getAttribute('data-state')
    expect(state('resolve_artist')).toBe('done')
    expect(state('fan_hotspots')).toBe('done')
    expect(state('venues_in_city')).toBe('skipped')
    expect(state('cross_domain_tastes')).toBe('skipped')
    expect(state('plan_route')).toBe('skipped')
    expect(el.textContent).toContain('(skipped)')
    expect(el.textContent).not.toContain('(pending)')
    const skipped = el.querySelector('[data-phase="venues_in_city"] span[aria-hidden="true"]')
    expect(skipped?.textContent).toBe('–')
    expect(skipped?.className).toContain('border-dashed')

    act(() => root.unmount())
    el.remove()
  })
})
