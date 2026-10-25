'use client'

import { useState } from 'react'
import { matchingTags, pitchEmail, pitchText, resolveDrivers, type Plan, type PlanStop } from '@/lib/agent/plan'
import type { QlooEntity } from '@/lib/qloo/types'
import { AffinityBar, Skeleton, WhyPanel } from './ui'

const PLACE_CATEGORY = 'urn:tag:category:place'

function VenueRow({ plan, stop, venue }: { plan: Plan; stop: PlanStop; venue: QlooEntity }) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const kind = venue.tags.find((t) => t.type === PLACE_CATEGORY)?.name
  const matching = matchingTags(plan, venue.tags)
  const pitch = pitchEmail(plan, stop, venue)

  // Copy only: GigRoute never sends email or opens a mail client.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pitchText(pitch))
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    setTimeout(() => setCopied('idle'), 2500)
  }

  return (
    <li className="rounded-lg bg-zinc-800/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-zinc-100">{venue.name}</div>
          <div className="text-xs text-zinc-400">{[kind, venue.address].filter(Boolean).join(' · ')}</div>
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-zinc-600 px-2.5 py-1 text-xs font-medium text-zinc-100 hover:border-amber-400 hover:text-amber-200 print:hidden"
        >
          {copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy failed' : 'Copy pitch'}
          <span className="sr-only"> for {venue.name}</span>
        </button>
      </div>
      <span role="status" className="sr-only">
        {copied === 'ok' ? `Pitch for ${venue.name} copied to clipboard` : copied === 'fail' ? 'Could not copy' : ''}
      </span>
      <div className="mt-2">
        <AffinityBar value={venue.affinity} label="Affinity" />
      </div>
      <details className="group mt-2">
        <summary className="text-xs font-medium text-amber-300 hover:text-amber-200">
          <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          Why this venue?
        </summary>
        <div className="mt-2">
          <WhyPanel
            subject={venue.name}
            affinity={venue.affinity}
            drivers={resolveDrivers(plan, venue.explainability)}
            tags={venue.tags.filter((t) => t.type !== PLACE_CATEGORY)}
            matching={matching}
          />
        </div>
      </details>
      <details className="group mt-1">
        <summary className="text-xs font-medium text-amber-300 hover:text-amber-200">
          <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          Pitch email draft
        </summary>
        <div className="mt-2 rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200">
          <p className="font-semibold text-zinc-100">Subject: {pitch.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">{pitch.body}</pre>
          <p className="mt-2 text-zinc-500 print:hidden">Draft only. Copy it into your own mail client; GigRoute never sends email.</p>
        </div>
      </details>
    </li>
  )
}

export default function StopCard({
  plan,
  stop,
  index,
  why,
}: {
  plan: Plan
  stop: PlanStop
  index: number
  why?: string
}) {
  const headingId = `stop-${index}`

  return (
    <article aria-labelledby={headingId} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-zinc-950"
        >
          {index + 1}
        </span>
        <h3 id={headingId} className="text-lg font-semibold text-zinc-50">
          <span className="sr-only">Stop {index + 1}: </span>
          {stop.city}
        </h3>
      </header>
      <div className="mt-3">
        <AffinityBar value={stop.affinity} label="Affinity" />
      </div>
      {why && <p className="mt-3 text-sm text-zinc-300">{why}</p>}

      <details className="group mt-3">
        <summary className="text-sm font-medium text-amber-300 hover:text-amber-200">
          <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          Why this city?
        </summary>
        <div className="mt-2">
          <WhyPanel
            subject={stop.city}
            affinity={stop.affinity}
            drivers={resolveDrivers(plan, stop.explainability)}
            tags={stop.tags}
            matching={matchingTags(plan, stop.tags)}
          />
        </div>
      </details>

      <h4 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Top rooms</h4>
      {stop.venues === null ? (
        <div className="space-y-2" role="status">
          <span className="sr-only">Loading venues for {stop.city}</span>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : stop.venues.length === 0 ? (
        <p className="text-sm text-zinc-400">Qloo returned no venues for this city.</p>
      ) : (
        <ul className="space-y-2">
          {stop.venues.map((v) => (
            <VenueRow key={v.id} plan={plan} stop={stop} venue={v} />
          ))}
        </ul>
      )}
    </article>
  )
}
