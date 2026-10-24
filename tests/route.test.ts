import { expect, test, describe } from 'vitest'
import { executeTool } from '../lib/agent/tools'

describe('Agent Tools', () => {
  test('plan_route ordering', async () => {
    // In our simplified mock, it just returns them
    const stops = ['London', 'Manchester', 'Bristol']
    const res = await executeTool('plan_route', { stops })
    expect(res).toEqual(stops)
  })
})
