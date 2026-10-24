import { expect, test, describe } from 'vitest'
import { runAgent, type AgentEvent } from '../lib/agent/agent'

describe('Agent end to end', () => {
  test('agent runs on MockLLM + MockQloo', async () => {
    // We expect the mock LLM to run through its 7 steps deterministically
    const events: AgentEvent[] = []
    const onEvent = (event: AgentEvent) => {
      events.push(event)
    }

    const res = await runAgent({ artist: 'Radiohead' }, onEvent)

    // Check that we got the final result
    expect(res).toBe('Here is your tour plan based on the collected data.')

    // Check we called plan_route
    const planRouteEvent = events.find(e => e.step === 'plan_route')
    expect(planRouteEvent).toBeDefined()
    const { stops } = planRouteEvent?.partial as { stops: string[] }
    expect(stops.length).toBeGreaterThanOrEqual(2)
  })
})
