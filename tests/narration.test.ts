import { beforeAll, describe, expect, test } from 'vitest'
import { runAgent } from '../lib/agent/agent'
import {
  createPlan,
  narrateTour,
  parsePlanInput,
  pitchEmail,
  pitchText,
  planFileName,
  planHref,
  planToJSON,
  planToMarkdown,
  tasteProfilePhrase,
  type Plan,
  type PlanInput,
} from '../lib/agent/plan'

async function planFor(body: Record<string, unknown>): Promise<Plan> {
  const input = parsePlanInput(body) as PlanInput
  let plan: Plan | undefined
  await runAgent(input, (e) => {
    if (e.step === 'done') plan = e.plan
  })
  return plan as Plan
}

describe('narrateTour', () => {
  let plan: Plan
  beforeAll(async () => {
    plan = await planFor({ artist: 'Radiohead', region: 'UK', stops: 3 })
  })

  test('is deterministic', async () => {
    const again = await planFor({ artist: 'Radiohead', region: 'UK', stops: 3 })
    expect(narrateTour(again)).toEqual(narrateTour(plan))
  })

  test('summary cites the route, scores, drivers, co-bills and merch', () => {
    const { summary } = narrateTour(plan)
    const route = plan.stops.map((s) => s.city.split(',')[0]).join(' → ')
    expect(summary).toContain(`A 3-stop run for Radiohead: ${route}.`)
    expect(summary).toMatch(/London at 96%, driven mostly by fans of Radiohead \(62%\) and Thom Yorke \(21%\)/)
    expect(summary).toMatch(/Co-bill with Thom Yorke \(95%\) and Portishead \(90%\)/)
    expect(summary).toMatch(/over-indexes on /)
    expect(summary).not.toMatch(/Sample data/)
  })

  test('explains every stop with affinity, shared tags and the headline room', () => {
    const { stops } = narrateTour(plan)
    expect(stops).toHaveLength(3)
    const london = stops.find((s) => s.city === 'London, UK')!
    expect(london.text).toMatch(/^London, UK \(96% audience affinity\) shares Alternative Rock/)
    expect(london.text).toMatch(/Headline room: O2 Academy Brixton \(95%, live music venue; tagged /)
    expect(london.text).toMatch(/Backup: /)
  })

  test('a user-picked city without data is called out honestly', () => {
    const p = createPlan({ artist: 'X', cities: ['Atlantis'], stops: 1, demo: false })
    p.stops = [{ city: 'Atlantis', tags: [], explainability: [], venues: [] }]
    expect(narrateTour(p).stops[0].text).toMatch(/no audience data/)
  })

  test('sample-profile plans are labelled and attribute the profile, not the typed name', async () => {
    const sample = await planFor({ artist: 'Arijit Singh', region: 'UK', stops: 2 })
    const { summary } = narrateTour(sample)
    expect(sample.artist?.sampleOf).toBe('The Strokes')
    expect(summary).toMatch(
      /Sample data: Arijit Singh isn't in the built-in fixtures, so this plan uses The Strokes taste profile\./
    )
    expect(summary).not.toMatch(/the The Strokes/)
    expect(summary).toMatch(/driven mostly by fans of artists like The Strokes \(/)
    expect(summary).not.toMatch(/fans of Arijit Singh/)
    expect(summary).not.toMatch(/Thom Yorke|Portishead|Radiohead|Dr\. Martens/)
  })

  test('a profile name that starts with The does not double the article', () => {
    expect(tasteProfilePhrase('The Strokes')).toBe('The Strokes taste profile')
    expect(tasteProfilePhrase('Big Thief')).toBe('the Big Thief taste profile')
  })

  test('The Strokes sample copy drops the extra article; other profiles keep it', async () => {
    const strokes = await planFor({ artist: 'Arijit Singh', region: 'UK', stops: 2 })
    const strokesSummary = narrateTour(strokes).summary
    expect(strokesSummary).toContain('uses The Strokes taste profile.')
    expect(strokesSummary).not.toContain('the The Strokes')

    const bigThief = await planFor({ artist: 'Phoebe Bridgers', region: 'US', stops: 2 })
    expect(narrateTour(bigThief).summary).toContain('uses the Big Thief taste profile.')
  })

  test('a sample pitch credits fans of similar artists, not the typed artist\'s own listeners', async () => {
    const plan = await planFor({ artist: 'Arijit Singh', region: 'UK', stops: 2 })
    const body = pitchEmail(plan, plan.stops[0], plan.stops[0].venues![0]).body
    expect(body).toContain('affinity with fans of similar artists')
    expect(body).toContain('The figures come from The Strokes taste profile, not Arijit Singh\'s own audience.')
    expect(body).not.toContain('our listeners')
    expect(body).not.toContain('the The Strokes')
  })

  test('an empty plan has no summary', () => {
    expect(narrateTour(createPlan({ artist: 'X', cities: [], stops: 3, demo: false })).summary).toBe('')
  })
})

describe('pitchEmail', () => {
  test('a grounded draft with subject, evidence and placeholders, never auto-filled contact details', async () => {
    const plan = await planFor({ artist: 'Radiohead', region: 'UK', stops: 3 })
    const stop = plan.stops.find((s) => s.city === 'London, UK')!
    const venue = stop.venues![0]
    const p = pitchEmail(plan, stop, venue)
    expect(p.subject).toBe(`Booking enquiry: Radiohead at ${venue.name}, London`)
    expect(p.body).toMatch(new RegExp(`^Hi ${venue.name} booking team,`))
    expect(p.body).toContain(`puts ${venue.name} at 95% affinity with our listeners, in a city that scores 96% overall.`)
    expect(p.body).toMatch(/Shared taste tags: /)
    expect(p.body).toMatch(/also over-index on Thom Yorke/)
    expect(p.body).toMatch(/acts like Thom Yorke and Portishead/)
    expect(p.body).toContain('[Your name]')
    expect(p.body).not.toMatch(/@|mailto:/)
    expect(pitchText(p)).toBe(`Subject: ${p.subject}\n\n${p.body}`)
    expect(pitchEmail(plan, stop, venue)).toEqual(p)
  })
})

describe('permalink and exports', () => {
  test('planHref round-trips through parsePlanInput', () => {
    const input: PlanInput = { artist: 'Big Thief', region: 'USA', cities: ['Austin', 'Seattle'], stops: 2, demo: false }
    const href = planHref(input)
    expect(href).toBe('/plan?artist=Big+Thief&region=USA&cities=Austin%2C+Seattle&stops=2')
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams)
    expect(parsePlanInput(params)).toEqual(input)
    expect(planHref({ ...input, demo: true })).toMatch(/&demo=1$/)
  })

  test('JSON export is versioned, has the permalink, narration and pitches', async () => {
    const plan = await planFor({ artist: 'Radiohead', region: 'UK', stops: 3 })
    const data = JSON.parse(planToJSON(plan, 'https://gigroute.vercel.app'))
    expect(data.format).toBe('gigroute-plan@1')
    expect(data.permalink).toBe('https://gigroute.vercel.app/plan?artist=Radiohead&region=UK&stops=3')
    expect(data.summary).toBe(narrateTour(plan).summary)
    expect(data.stops).toHaveLength(3)
    expect(data.stops[0].venues[0].pitch.subject).toMatch(/^Booking enquiry/)
    expect(data.stops[0].drivers[0]).toEqual({ name: 'Radiohead', score: expect.any(Number) })
  })

  test('Markdown export includes the summary, per-stop why and a pitch draft', async () => {
    const plan = await planFor({ artist: 'Radiohead', region: 'UK', stops: 3 })
    const md = planToMarkdown(plan)
    expect(md).toContain('Permalink: /plan?artist=Radiohead&region=UK&stops=3')
    expect(md).toContain(narrateTour(plan).summary)
    expect(md).toMatch(/### Pitch draft: /)
    expect(md).toMatch(/> Hi .* booking team,/)
    expect(planFileName(plan, 'json')).toBe('gigroute-radiohead.json')
  })
})
