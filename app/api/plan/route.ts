import { NextRequest } from 'next/server'
import { runAgent, type AgentEvent } from '@/lib/agent/agent'
import { parsePlanInput } from '@/lib/agent/plan'
import { isQlooMock } from '@/lib/qloo'
import { isLLMMock } from '@/lib/agent/llm'

export const maxDuration = 90

// Visible pacing for instant mock runs so the streaming UI is legible in demos.
const MOCK_STEP_DELAY_MS = 250

export async function POST(req: NextRequest) {
  const deadline = Date.now() + (maxDuration - 5) * 1000

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const input = parsePlanInput(body)
  if ('error' in input) {
    return Response.json({ error: input.error }, { status: 400 })
  }

  // The demo preset always runs on fixtures so judges get instant, key-free results.
  const mock = input.demo || (isQlooMock() && isLLMMock())

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      sendEvent({ step: 'start', text: mock ? 'Running on sample data (mock mode).' : 'Connecting to Qloo…', partial: { mock } })
      try {
        await runAgent(input, sendEvent, {
          mock: input.demo,
          stepDelayMs: mock && process.env.NODE_ENV !== 'test' ? MOCK_STEP_DELAY_MS : 0,
          deadline,
        })
      } catch (error) {
        sendEvent({
          step: 'error',
          text: 'Something went wrong while planning.',
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
