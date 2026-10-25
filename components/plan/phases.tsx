export const PHASES = [
  { tool: 'resolve_artist', label: 'Resolve the artist in Qloo' },
  { tool: 'similar_artists', label: 'Find similar artists for co-bills' },
  { tool: 'fan_hotspots', label: 'Map fan hotspots' },
  { tool: 'venues_in_city', label: 'Rank venues in each city' },
  { tool: 'cross_domain_tastes', label: 'Cross-domain merch ideas' },
  { tool: 'plan_route', label: 'Route the tour' },
] as const

export type PhaseStatus = 'streaming' | 'done' | 'error'
export type PhaseVisual = 'done' | 'active' | 'pending' | 'skipped'

/** Visual state for one planning step. A finished no-plan marks everything still outstanding as skipped. */
export function phaseVisual(
  tool: string,
  started: ReadonlySet<string>,
  finished: ReadonlySet<string>,
  status: PhaseStatus,
  noPlan: boolean,
): PhaseVisual {
  if (finished.has(tool)) return 'done'
  if (noPlan && status === 'done') return 'skipped'
  if (started.has(tool) && status === 'streaming') return 'active'
  return 'pending'
}

export function PhaseList({
  started,
  finished,
  status,
  noPlan = false,
}: {
  started: ReadonlySet<string>
  finished: ReadonlySet<string>
  status: PhaseStatus
  noPlan?: boolean
}) {
  return (
    <ol className="space-y-1.5 text-sm">
      {PHASES.map(({ tool, label }) => {
        const state = phaseVisual(tool, started, finished, status, noPlan)
        return (
          <li key={tool} className="flex items-center gap-2" data-phase={tool} data-state={state}>
            <span
              aria-hidden="true"
              className={
                state === 'done'
                  ? 'flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-zinc-950'
                  : state === 'active'
                    ? 'h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent'
                    : state === 'skipped'
                      ? 'flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-zinc-500 text-[10px] leading-none text-zinc-400'
                      : 'h-4 w-4 rounded-full border-2 border-zinc-700'
              }
            >
              {state === 'done' ? '✓' : state === 'skipped' ? '–' : ''}
            </span>
            <span
              className={
                state === 'pending' ? 'text-zinc-500' : state === 'skipped' ? 'text-zinc-500 line-through' : 'text-zinc-200'
              }
            >
              {label}
              <span className="sr-only">
                {' '}
                ({state === 'done' ? 'done' : state === 'active' ? 'in progress' : state === 'skipped' ? 'skipped' : 'pending'})
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
