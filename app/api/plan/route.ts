import { NextRequest } from 'next/server'
import { runAgent, type AgentEvent } from '@/lib/agent/agent'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: AgentEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`
        controller.enqueue(encoder.encode(data))
      }

      try {
        await runAgent(body, sendEvent)
      } catch (error) {
        sendEvent({
          step: 'error',
          text: 'An error occurred.',
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
