import Link from 'next/link'
import PlanForm from '@/components/PlanForm'

const DEMO_HREF = '/plan?artist=Radiohead&region=UK&stops=3&demo=1'

const problems = [
  {
    title: 'Booking blind',
    body: 'Independent artists pick tour cities by gut feel or by where friends live, then play half-empty rooms.',
  },
  {
    title: 'Wrong room, wrong crowd',
    body: 'A great venue for one scene is a dead night for another. Capacity charts say nothing about taste.',
  },
  {
    title: 'Cold pitches',
    body: 'Bookers get hundreds of emails. “We think your crowd would like us” isn’t evidence.',
  },
]

const steps = [
  {
    title: 'Resolve your sound',
    body: 'We match your artist (or a “sounds like”) to a Qloo entity, then pull similar artists for co-bills.',
    api: 'GET /search · /v2/insights (artist)',
  },
  {
    title: 'Find fan hotspots',
    body: 'Qloo’s taste graph ranks the cities where audiences for that taste over-index.',
    api: '/v2/insights (destination)',
  },
  {
    title: 'Rank the rooms',
    body: 'For each city, venues, bars and record shops are scored by audience affinity, with an explanation.',
    api: '/v2/insights (place) + explainability',
  },
  {
    title: 'Route and pitch',
    body: 'Stops are ordered into a drivable route, with a data-backed pitch you can copy for every venue.',
    api: 'Nearest-neighbour routing',
  },
]

const qlooUsage = [
  { call: 'GET /search', use: 'Resolves the artist you type to a Qloo entity ID.' },
  {
    call: '/v2/insights · filter.type=urn:entity:artist',
    use: 'Similar artists, used for co-bill ideas and as extra taste signals.',
  },
  {
    call: '/v2/insights · filter.type=urn:entity:destination',
    use: 'Fan hotspots: the cities where this taste over-indexes, optionally within a region.',
  },
  {
    call: '/v2/insights · filter.type=urn:entity:place',
    use: 'Venues, bars and record shops in each city, ranked by audience affinity.',
  },
  {
    call: 'signal.interests.entities',
    use: 'The artist plus its top similar artists are sent together as the taste signal.',
  },
  {
    call: 'feature.explainability=true',
    use: 'Shows which of those artists drove each city and venue (“driven by fans of…”).',
  },
  { call: 'tags', use: 'Genre and place tags shared with your sound explain each match and fill the pitch emails.' },
  { call: 'filter.type=urn:entity:brand / movie', use: 'Cross-domain tastes for merch and poster cues.' },
]

export default function Home() {
  return (
    <main id="main" className="flex-1">
      <section className="relative overflow-hidden border-b border-zinc-800">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.18),transparent_55%)]"
        />
        <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">GigRoute</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight text-zinc-50 sm:text-6xl">
            Route your next tour to where your fans already are.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-zinc-300">
            GigRoute uses Qloo&apos;s cultural taste graph to find the cities, venues and co-bills where audiences for
            your sound over-index, and shows you <em>why</em> each one made the cut.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={DEMO_HREF}
              className="inline-flex items-center justify-center rounded-lg bg-amber-400 px-5 py-3 font-semibold text-zinc-950 hover:bg-amber-300"
            >
              ▶ See a sample tour
              <span className="ml-2 text-sm font-normal text-zinc-800">Radiohead · UK</span>
            </Link>
            <a
              href="#plan-form"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-600 px-5 py-3 font-semibold text-zinc-100 hover:border-zinc-400"
            >
              Plan your own
            </a>
          </div>
          <p className="mt-3 text-sm text-zinc-400">The sample runs instantly on built-in sample data. No sign-up.</p>
        </div>
      </section>

      <section aria-labelledby="problem-heading" className="mx-auto max-w-5xl px-6 py-14">
        <h2 id="problem-heading" className="text-2xl font-bold text-zinc-50 sm:text-3xl">
          Touring is a guess. It shouldn&apos;t be.
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {problems.map((p) => (
            <li key={p.title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="font-semibold text-zinc-100">{p.title}</h3>
              <p className="mt-2 text-sm text-zinc-300">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="border-y border-zinc-800 bg-zinc-900/50">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 id="how-heading" className="text-2xl font-bold text-zinc-50 sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-zinc-950"
                >
                  {i + 1}
                </span>
                <h3 className="mt-3 font-semibold text-zinc-100">{s.title}</h3>
                <p className="mt-2 text-sm text-zinc-300">{s.body}</p>
                <p className="mt-3 font-mono text-xs text-zinc-400">{s.api}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="qloo-heading" className="mx-auto max-w-5xl px-6 py-14">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">Powered by Qloo</p>
        <h2 id="qloo-heading" className="mt-2 text-2xl font-bold text-zinc-50 sm:text-3xl">
          Every pick traces back to a Qloo API signal
        </h2>
        <p className="mt-3 max-w-3xl text-zinc-300">
          GigRoute never asks for personal data. It sends only an artist name and place names, and reads Qloo&apos;s
          privacy-safe, group-level affinity signals back.
        </p>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {qlooUsage.map((u) => (
            <div key={u.call} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <dt className="font-mono text-sm text-amber-200">{u.call}</dt>
              <dd className="mt-1 text-sm text-zinc-300">{u.use}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-sm text-zinc-400">
          Read the API reference at{' '}
          <a
            href="https://docs.qloo.com"
            className="font-medium text-amber-300 underline underline-offset-2 hover:text-amber-200"
            target="_blank"
            rel="noopener noreferrer"
          >
            docs.qloo.com
          </a>
          . The public demo runs on built-in sample data shaped like these responses until an API key is configured.
        </p>
      </section>

      <section id="plan-form" aria-labelledby="form-heading" className="mx-auto grid max-w-5xl gap-10 px-6 py-14 lg:grid-cols-2">
        <div>
          <h2 id="form-heading" className="text-2xl font-bold text-zinc-50 sm:text-3xl">
            Plan your tour
          </h2>
          <p className="mt-3 text-zinc-300">
            Tell us who you sound like and where you want to play. You&apos;ll get a routed list of stops, the best-fit
            rooms in each city, co-bill ideas, merch cues, and a pitch for every venue.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-zinc-300">
            <li>✓ Explainable picks: affinity, matching tags and the artists that drove each result</li>
            <li>✓ Live streaming results as the agent works</li>
            <li>✓ A pitch email draft for every venue, ready to copy (never sent for you)</li>
            <li>✓ Share a permalink, export Markdown or JSON, or print the plan</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <PlanForm />
        </div>
      </section>

      <footer className="border-t border-zinc-800 px-6 py-8 text-center text-xs text-zinc-400">
        Built for the Qloo hackathon. Affinities describe group tendencies, not individual preferences.
      </footer>
    </main>
  )
}
