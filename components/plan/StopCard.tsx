'use client'

import { useState } from 'react'
import { draftPitch, matchingTags, resolveDrivers, type Plan, type PlanStop } from '@/lib/agent/plan'
import type { QlooEntity } from '@/lib/qloo/types'
import { AffinityBar, Skeleton, WhyPanel } from './ui'

const PLACE_CATEGORY = 'urn:tag:category:place'

function VenueRow({ plan, venue, pitch }: { plan: Plan; venue: QlooEntity; pitch: string }) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const kind = venue.tags.find((t) => t.type === PLACE_CATEGORY)?.name
  const matching = matchingTags(plan, venue.tags)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pitch)
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
          className="shrink-0 rounded-md border border-zinc-600 px-2.5 py-1 text-xs font-medium text-zinc-100 hover:border-amber-400 hover:text-amber-200"
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
    </li>
  )
}

export default function StopCard({ plan, stop, index }: { plan: Plan; stop: PlanStop; index: number }) {
  const artistName = plan.artist?.name ?? plan.input.artist
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
          {stop.venues.map((v, i) => (
            <VenueRow
              key={v.id}
              plan={plan}
              venue={v}
              pitch={
                index === 0 && i === 0 && plan.pitch
                  ? plan.pitch
                  : draftPitch(v.name, artistName, matchingTags(plan, v.tags).map((t) => t.name).join(', '))
              }
            />
          ))}
        </ul>
      )}
    </article>
  )
}
