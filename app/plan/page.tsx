'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Stop } from '@/components/Map'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

interface PlanEvent {
  step: string
  text: string
  partial?: unknown
  error?: string
}

function PlanContent() {
  const searchParams = useSearchParams()
  // State is reset per query via the `key` on <PlanContent> below, so the initial log is derived here
  // instead of being set synchronously inside the effect.
  const [logs, setLogs] = useState<string[]>(() =>
    searchParams.get('artist') ? ['Starting tour plan generation...'] : []
  )
  const [stops, setStops] = useState<Stop[]>([])
  const [planResult, setPlanResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const artist = searchParams.get('artist')
    const region = searchParams.get('region')
    const cities = searchParams.get('cities')
    const stopsParam = searchParams.get('stops')

    if (!artist) return

    const controller = new AbortController()

    const handleEvent = (data: PlanEvent) => {
      setLogs(prev => [...prev, data.error ? `${data.text} ${data.error}` : data.text])

      // Handle mock data population for UI demonstration
      if (data.step === 'plan_route_result' && Array.isArray(data.partial)) {
        // Mock up some stops if they are strings
        const mockStops = (data.partial as (string | Stop)[]).map((s) => {
          return typeof s === 'string' ? { name: s, lat: Math.random()*20+30, lng: Math.random()*-20-70, why: 'Top hotspot', venues: [{name: 'Venue 1', affinity: 0.9, why: 'Matches vibe'}], coBills: ['Band A', 'Band B'], merch: ['Brand X'] } : s
        })
        setStops(mockStops)
      }

      if (data.step === 'done') {
        setPlanResult(typeof data.partial === 'string' ? data.partial : null)
      }
    }

    const fetchPlan = async () => {
      try {
        const res = await fetch('/api/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artist, region, cities, stops: stopsParam }),
          signal: controller.signal,
        })

        if (!res.body) throw new Error('No readable stream')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        // SSE events can be split across chunks, so buffer until a full "\n\n"-terminated event arrives.
        let buffer = ''
        let done = false
        while (!done) {
          const { value, done: readerDone } = await reader.read()
          done = readerDone
          buffer += decoder.decode(value, { stream: !done })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const event of events) {
            if (event.startsWith('data: ')) {
              handleEvent(JSON.parse(event.substring(6)))
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    fetchPlan()
    return () => controller.abort()
  }, [searchParams])

  const exportMarkdown = () => {
    let md = `# Tour Plan for ${searchParams.get('artist')}\n\n`
    md += `*Note: Results describe group tendencies, not individual preferences.*\n\n`
    stops.forEach((stop, i) => {
      md += `## Stop ${i + 1}: ${stop.name}\n`
      md += `- Why: ${stop.why || 'Fan hotspot'}\n`
      if (stop.venues) {
        md += `- Top Venues:\n`
        stop.venues.forEach((v) => {
          md += `  - ${v.name} (Affinity: ${v.affinity || 0.9}) - ${v.why || 'Great match'}\n`
        })
      }
      md += `\n`
    })
    if (planResult) {
       md += `## Additional Notes\n${planResult}\n`
    }

    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tour-plan.md'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const copyPitch = (venue: string) => {
    const pitch = `Hi ${venue} booking team, I represent ${searchParams.get('artist')}. We noticed our audience overlaps significantly with your typical crowd. We'd love to discuss a potential date.`
    navigator.clipboard.writeText(pitch)
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-900 text-white">
      {/* Sidebar: Logs and Stops */}
      <div className="w-full md:w-1/3 flex flex-col p-4 border-r border-gray-700 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Live Plan Log</h2>
        <div className="bg-gray-800 p-3 rounded mb-6 text-sm font-mono h-48 overflow-y-auto">
          {logs.map((log, i) => <div key={i}>{log}</div>)}
          {error && <div className="text-red-500">{error}</div>}
        </div>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Stops</h2>
          {stops.length > 0 && (
            <button onClick={exportMarkdown} className="bg-blue-600 hover:bg-blue-700 px-3 py-1 text-sm rounded transition-colors">
              Export Itinerary
            </button>
          )}
        </div>

        <div className="space-y-4">
          {stops.map((stop, i) => (
            <div key={i} className="bg-gray-800 p-4 rounded shadow">
              <h3 className="text-xl font-bold">{i + 1}. {stop.name}</h3>
              <p className="text-sm text-gray-400 mb-2">{stop.why || 'Identified as a high affinity location for this artist.'}</p>
              
              {stop.venues && stop.venues.length > 0 && (
                <div className="mb-2">
                  <strong className="text-sm">Top Venues:</strong>
                  <ul className="text-sm space-y-2 mt-1">
                    {stop.venues.map((v, j) => (
                      <li key={j} className="bg-gray-700 p-2 rounded">
                        <div className="flex justify-between">
                          <span>{v.name}</span>
                          <button onClick={() => copyPitch(v.name)} className="text-blue-400 hover:text-blue-300 text-xs">Copy Pitch</button>
                        </div>
                        <div className="w-full bg-gray-600 h-1 mt-1 rounded">
                          <div className="bg-blue-500 h-1 rounded" style={{ width: `${(v.affinity || 0.9) * 100}%` }}></div>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{v.why || 'Audience overlaps with typical crowd.'}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-6">* Note: Results describe group tendencies, not individual preferences.</p>
      </div>

      {/* Main content: Map */}
      <div className="w-full md:w-2/3 h-64 md:h-full p-4">
        {stops.length > 0 ? (
          <Map stops={stops} />
        ) : (
          <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
            Map will appear here once stops are generated...
          </div>
        )}
      </div>
    </div>
  )
}

// Remount PlanContent whenever the query changes so its state starts fresh for each plan.
function PlanForQuery() {
  const searchParams = useSearchParams()
  return <PlanContent key={searchParams.toString()} />
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white">Loading...</div>}>
      <PlanForQuery />
    </Suspense>
  )
}
