'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { planToMarkdown, type Plan } from '@/lib/agent/plan'
import StopCard from '@/components/plan/StopCard'
import { Skeleton, StopSkeleton, TagChips, pct } from '@/components/plan/ui'

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
})

interface PlanEvent {
  step: string
  text: string
  partial?: unknown
  error?: string
  plan?: Plan
}

type Status = 'streaming' | 'done' | 'error'

const PHASES = [
  { tool: 'resolve_artist', label: 'Resolve the artist in Qloo' },
  { tool: 'similar_artists', label: 'Find similar artists for co-bills' },
  { tool: 'fan_hotspots', label: 'Map fan hotspots' },
  { tool: 'venues_in_city', label: 'Rank venues in each city' },
  { tool: 'cross_domain_tastes', label: 'Cross-domain merch ideas' },
  { tool: 'plan_route', label: 'Route the tour' },
] as const

const DEMO_HREF = '/plan?artist=Radiohead&region=UK&stops=3&demo=1'

const buttonPrimary =
  'inline-flex items-center justify-center rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300'
const buttonSecondary =
  'inline-flex items-center justify-center rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-400'

function PhaseList({ started, finished, status }: { started: Set<string>; finished: Set<string>; status: Status }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {PHASES.map(({ tool, label }) => {
        const state = finished.has(tool) ? 'done' : started.has(tool) && status === 'streaming' ? 'active' : 'pending'
        return (
          <li key={tool} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={
                state === 'done'
                  ? 'flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-zinc-950'
                  : state === 'active'
                    ? 'h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent'
                    : 'h-4 w-4 rounded-full border-2 border-zinc-700'
              }
            >
              {state === 'done' ? '✓' : ''}
            </span>
            <span className={state === 'pending' ? 'text-zinc-500' : 'text-zinc-200'}>
              {label}
              <span className="sr-only"> ({state === 'done' ? 'done' : state === 'active' ? 'in progress' : 'pending'})</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Notice({
  tone,
  title,
  children,
  actions,
}: {
  tone: 'error' | 'empty'
  title: string
  children: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border p-5 ${tone === 'error' ? 'border-red-500/50 bg-red-950/40' : 'border-zinc-700 bg-zinc-900'}`}
    >
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      <div className="mt-1 text-sm text-zinc-300">{children}</div>
      <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}

function PlanContent({ onRetry }: { onRetry: () => void }) {
  const searchParams = useSearchParams()
  const artist = searchParams.get('artist')?.trim() ?? ''
  const [plan, setPlan] = useState<Plan | null>(null)
  const [status, setStatus] = useState<Status>('streaming')
  const [error, setError] = useState<string | null>(null)
  const [toolErrors, setToolErrors] = useState<string[]>([])
  const [started, setStarted] = useState<Set<string>>(new Set())
  const [finished, setFinished] = useState<Set<string>>(new Set())
  const [summary, setSummary] = useState<string | null>(null)
  const [mock, setMock] = useState(false)
  const [candidates, setCandidates] = useState<{ id: string; name: string }[]>([])
  const [liveText, setLiveText] = useState('')

  useEffect(() => {
    if (!artist) return
    const controller = new AbortController()

    const handleEvent = (e: PlanEvent) => {
      if (e.plan) setPlan(e.plan)
      if (e.step === 'start') setMock(Boolean((e.partial as { mock?: boolean })?.mock))
      if (PHASES.some((p) => p.tool === e.step)) {
        setStarted((s) => new Set(s).add(e.step))
        setLiveText(e.text)
      }
      const base = e.step.replace(/_(result|error)$/, '')
      if (base !== e.step) setFinished((s) => new Set(s).add(base))
      if (e.step.endsWith('_error') && e.error) setToolErrors((errs) => [...errs, e.error as string])
      if (e.step === 'needs_input') {
        setCandidates(((e.partial as { candidates?: { id: string; name: string }[] })?.candidates ?? []).slice(0, 5))
        setStatus('done')
      }
      if (e.step === 'error') {
        setError(e.error ?? e.text)
        setStatus('error')
      }
      if (e.step === 'done') {
        setSummary(typeof e.partial === 'string' ? e.partial : null)
        setStatus('done')
        setLiveText('Tour plan ready.')
      }
    }

    const run = async () => {
      try {
        const res = await fetch('/api/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artist,
            region: searchParams.get('region') ?? undefined,
            cities: searchParams.get('cities') ?? undefined,
            stops: searchParams.get('stops') ?? undefined,
            demo: searchParams.get('demo') === '1',
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? `Request failed (${res.status})`)
        }
        if (!res.body) throw new Error('The server did not return a stream.')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        // SSE events can be split across chunks, so buffer until a full "\n\n"-terminated event arrives.
        let buffer = ''
        let done = false
        let sawTerminal = false
        while (!done) {
          const { value, done: readerDone } = await reader.read()
          done = readerDone
          buffer += decoder.decode(value, { stream: !done })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const event of events) {
            if (!event.startsWith('data: ')) continue
            const parsed: PlanEvent = JSON.parse(event.substring(6))
            if (['done', 'error', 'needs_input'].includes(parsed.step)) sawTerminal = true
            handleEvent(parsed)
          }
        }
        if (!sawTerminal) throw new Error('The connection closed before the plan finished.')
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }

    run()
    return () => controller.abort()
  }, [artist, searchParams])

  const exportMarkdown = () => {
    if (!plan) return
    const blob = new Blob([planToMarkdown(plan)], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gigroute-${(plan.artist?.name ?? 'tour').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (!artist) {
    return (
      <main id="main" className="mx-auto w-full max-w-xl p-6">
        <Notice
          tone="empty"
          title="No artist selected"
          actions={
            <>
              <Link href="/#plan-form" className={buttonPrimary}>
                Plan a tour
              </Link>
              <Link href={DEMO_HREF} className={buttonSecondary}>
                Try the demo
              </Link>
            </>
          }
        >
          Start from the home page and enter an artist, or run the sample tour.
        </Notice>
      </main>
    )
  }

  const stops = plan?.stops ?? []
  const streaming = status === 'streaming'
  const failedWithoutResults = status === 'done' && stops.length === 0 && toolErrors.length > 0
  const retryActions = (
    <>
      <button type="button" onClick={onRetry} className={buttonPrimary}>
        Retry
      </button>
      <Link href="/#plan-form" className={buttonSecondary}>
        Edit search
      </Link>
      <Link href={DEMO_HREF} className={buttonSecondary}>
        Try the demo
      </Link>
    </>
  )

  let notice: React.ReactNode = null
  if (status === 'error' || failedWithoutResults) {
    notice = (
      <Notice tone="error" title="We couldn't finish this plan" actions={retryActions}>
        <p>The Qloo or LLM request failed. This is usually temporary.</p>
        <p className="mt-1 font-mono text-xs text-red-200">{error ?? toolErrors[toolErrors.length - 1]}</p>
      </Notice>
    )
  } else if (candidates.length > 0) {
    notice = (
      <Notice
        tone="empty"
        title={`Which “${artist}” did you mean?`}
        actions={candidates.map((c) => {
          const next = new URLSearchParams(searchParams)
          next.set('artist', c.name)
          return (
            <Link key={c.id} href={`/plan?${next}`} className={buttonSecondary}>
              {c.name}
            </Link>
          )
        })}
      >
        Several artists match. Pick one to continue.
      </Notice>
    )
  } else if (status === 'done' && plan?.artistNotFound) {
    notice = (
      <Notice tone="empty" title={`No match for “${artist}”`} actions={retryActions}>
        Qloo doesn&apos;t know this artist yet. Try a different spelling, or enter a better-known artist your music
        sounds like.
        {mock && ' Mock mode only knows: Radiohead, The Strokes, Big Thief and Khruangbin.'}
      </Notice>
    )
  } else if (status === 'done' && stops.length === 0) {
    notice = (
      <Notice tone="empty" title="No fan hotspots found" actions={retryActions}>
        Qloo returned no cities for this taste{searchParams.get('region') ? ` in ${searchParams.get('region')}` : ''}.
        Try a broader region or leave it blank.
      </Notice>
    )
  }

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row">
      <main id="main" className="order-2 flex-1 overflow-y-auto p-4 sm:p-6 lg:order-1 lg:max-w-xl lg:border-r lg:border-zinc-800">
        <nav className="mb-4 flex items-center justify-between text-sm">
          <Link href="/" className="font-semibold text-zinc-100 hover:text-amber-200">
            ← GigRoute
          </Link>
          {mock && (
            <span className="rounded-full border border-sky-400/50 bg-sky-400/10 px-2.5 py-0.5 text-xs text-sky-200">
              Sample data · mock mode
            </span>
          )}
        </nav>

        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Tour plan</p>
          <h1 className="text-2xl font-bold text-zinc-50 sm:text-3xl">{plan?.artist?.name ?? artist}</h1>
          {plan?.artist && plan.artist.tags.length > 0 && (
            <div className="mt-2">
              <TagChips tags={plan.artist.tags} />
            </div>
          )}
          {summary && status === 'done' && stops.length > 0 && <p className="mt-3 text-zinc-300">{summary}</p>}
        </header>

        <section aria-labelledby="progress-heading" className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 id="progress-heading" className="mb-3 text-sm font-semibold text-zinc-200">
            {streaming ? 'Planning…' : status === 'error' ? 'Stopped' : 'Steps'}
          </h2>
          <PhaseList started={started} finished={finished} status={status} />
          <p role="status" aria-live="polite" className="sr-only">
            {liveText}
          </p>
        </section>

        {notice && <div className="mb-6">{notice}</div>}

        {plan && plan.similarArtists.length > 0 && (
          <section aria-labelledby="cobill-heading" className="mb-6">
            <h2 id="cobill-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Co-bill ideas
            </h2>
            <ul className="flex flex-wrap gap-2">
              {plan.similarArtists.map((a) => (
                <li key={a.id} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200">
                  {a.name} <span className="text-xs text-zinc-400">{pct(a.affinity)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(stops.length > 0 || streaming) && (
          <section aria-labelledby="stops-heading" aria-busy={streaming}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="stops-heading" className="text-xl font-bold text-zinc-50">
                Stops{stops.length > 0 && ` (${stops.length})`}
              </h2>
              {status === 'done' && stops.length > 0 && (
                <button type="button" onClick={exportMarkdown} className={buttonSecondary}>
                  Export itinerary
                </button>
              )}
            </div>
            <div className="space-y-4">
              {stops.map((stop, i) => (
                <StopCard key={stop.city} plan={plan as Plan} stop={stop} index={i} />
              ))}
              {streaming && stops.length === 0 && (
                <>
                  <StopSkeleton />
                  <StopSkeleton />
                </>
              )}
            </div>
          </section>
        )}

        {plan && plan.merch.length > 0 && (
          <section aria-labelledby="merch-heading" className="mt-6">
            <h2 id="merch-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Merch &amp; poster cues (cross-domain tastes)
            </h2>
            <ul className="flex flex-wrap gap-2">
              {plan.merch.map((m) => (
                <li key={m.id} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200">
                  {m.name}{' '}
                  <span className="text-xs text-zinc-400">{m.type === 'urn:entity:movie' ? 'film' : 'brand'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-xs text-zinc-400">
          Affinities describe group tendencies of audiences, not individual preferences. No personal data is sent to Qloo.
        </p>
      </main>

      <aside
        aria-label="Tour route map"
        className="order-1 h-72 shrink-0 border-b border-zinc-800 sm:h-96 lg:order-2 lg:h-auto lg:flex-1 lg:border-b-0"
      >
        {stops.some((s) => s.lat != null) ? (
          <Map stops={stops} routed={plan?.routed ?? false} />
        ) : (
          <div className="flex h-full items-center justify-center bg-zinc-900 text-sm text-zinc-400">
            {streaming ? 'The map fills in as fan hotspots arrive…' : 'No stops to map yet.'}
          </div>
        )}
      </aside>
    </div>
  )
}

// Remount PlanContent whenever the query changes (or on retry) so each run starts fresh.
function PlanForQuery() {
  const searchParams = useSearchParams()
  const [attempt, setAttempt] = useState(0)
  return <PlanContent key={`${searchParams.toString()}#${attempt}`} onRetry={() => setAttempt((a) => a + 1)} />
}

export default function PlanPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-xl space-y-4 p-6" role="status">
          <span className="sr-only">Loading plan…</span>
          <Skeleton className="h-8 w-1/2" />
          <StopSkeleton />
        </div>
      }
    >
      <PlanForQuery />
    </Suspense>
  )
}
