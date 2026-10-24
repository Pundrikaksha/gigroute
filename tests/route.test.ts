import { expect, test, describe } from 'vitest'
import { NextRequest } from 'next/server'
import { executeTool } from '../lib/agent/tools'
import { POST } from '../app/api/plan/route'

describe('Agent tools', () => {
  test('plan_route echoes the stops (ordering happens in the plan with coordinates)', async () => {
    const stops = ['London', 'Manchester', 'Bristol']
    expect(await executeTool('plan_route', { stops })).toEqual(stops)
  })

  test('unknown tool throws', async () => {
    await expect(executeTool('nope', {})).rejects.toThrow(/Unknown tool/)
  })
})

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/plan', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

async function readEvents(res: Response) {
  const text = await res.text()
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6)))
}

describe('POST /api/plan', () => {
  test('400 on invalid JSON or missing artist', async () => {
    expect((await post('{nope')).status).toBe(400)
    const res = await post({ region: 'UK' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'artist is required' })
  })

  test('demo preset streams a full plan over SSE', async () => {
    const res = await post({ artist: 'Radiohead', region: 'UK', stops: 3, demo: true })
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    const events = await readEvents(res)
    expect(events[0]).toMatchObject({ step: 'start', partial: { mock: true } })
    const done = events.find((e) => e.step === 'done')
    expect(done.plan.stops).toHaveLength(3)
    expect(done.plan.stops[0].venues.length).toBeGreaterThan(0)
  })
})
