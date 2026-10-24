import type { Driver } from '@/lib/agent/plan'
import type { QlooTag } from '@/lib/qloo/types'

export const pct = (n?: number) => (n == null ? '–' : `${Math.round(n * 100)}%`)

export function AffinityBar({ value, label }: { value?: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-zinc-800" aria-hidden="true">
        <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </div>
      <span className="w-24 text-right text-xs tabular-nums text-zinc-300">
        <span className="sr-only">{label}: </span>
        {pct(value)}
        <span aria-hidden="true"> {label.toLowerCase()}</span>
      </span>
    </div>
  )
}

export function TagChips({ tags, highlight }: { tags: QlooTag[]; highlight?: Set<string> }) {
  if (tags.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((t) => {
        const match = highlight?.has(t.id)
        return (
          <li
            key={t.id}
            className={
              match
                ? 'rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200'
                : 'rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300'
            }
          >
            {match && (
              <span aria-hidden="true" className="mr-1">
                ✓
              </span>
            )}
            {t.name}
            {match && <span className="sr-only"> (matches your sound)</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** "Why this city / venue" panel built from Qloo affinity + explainability. */
export function WhyPanel({
  subject,
  affinity,
  drivers,
  tags,
  matching,
}: {
  subject: string
  affinity?: number
  drivers: Driver[]
  tags: QlooTag[]
  matching: QlooTag[]
}) {
  const highlight = new Set(matching.map((t) => t.id))
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
      <p className="text-zinc-300">
        Qloo affinity <strong className="text-zinc-100">{pct(affinity)}</strong>: how strongly the audience for{' '}
        {subject} over-indexes on your taste profile.
      </p>
      {drivers.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Driven by fans of</h4>
          <ul className="space-y-1.5">
            {drivers.map((d) => (
              <li key={d.id}>
                <div className="mb-0.5 text-zinc-200">{d.name}</div>
                <AffinityBar value={d.score} label="Influence" />
              </li>
            ))}
          </ul>
        </div>
      )}
      {tags.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {matching.length > 0 ? `${matching.length} matching tag${matching.length > 1 ? 's' : ''}` : 'Tags'}
          </h4>
          <TagChips tags={tags} highlight={highlight} />
        </div>
      )}
      {drivers.length === 0 && tags.length === 0 && (
        <p className="text-zinc-400">Qloo did not return explainability details for this result.</p>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} aria-hidden="true" />
}

export function StopSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4" aria-hidden="true">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}
