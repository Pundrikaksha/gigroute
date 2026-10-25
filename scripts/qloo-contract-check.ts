// Live contract check: calls the real Qloo API once per endpoint GigRoute uses and checks
// that the response has the fields the app reads. Prints only PASS/FAIL, counts and field
// names, never response data and never the API key.
//
//   QLOO_API_KEY=... npm run contract-check
//
// Exit code 0 = every check passed (or no key set, so nothing ran); 1 = at least one failed.
import { RealQlooClient } from '../lib/qloo/real'
import type { QlooEntity } from '../lib/qloo/types'

const key = process.env.QLOO_API_KEY ?? ''

/** Belt and braces: scrub the key from anything we print, e.g. an error message. */
const redact = (text: string) => (key ? text.split(key).join('[redacted]') : text)
const log = (text = '') => console.log(redact(text))

interface Check {
  name: string
  run: () => Promise<string>
}

function expectEntities(list: QlooEntity[], what: string, extra?: (e: QlooEntity) => string | null): string {
  if (list.length === 0) throw new Error(`no ${what} returned`)
  const problem = list.map((e) => (!e.id || !e.name ? 'missing id or name' : (extra?.(e) ?? null))).find(Boolean)
  if (problem) throw new Error(problem)
  return `${list.length} ${what}; fields: ${Object.keys(list[0]).filter((k) => list[0][k as keyof QlooEntity] != null).join(', ')}`
}

async function main() {
  if (!key) {
    log('No QLOO_API_KEY in the environment, so nothing was called. Skipping contract check.')
    return
  }

  const client = new RealQlooClient()
  let artistId = ''

  const checks: Check[] = [
    {
      name: 'GET /search (artist)',
      run: async () => {
        const res = await client.search('Radiohead', ['urn:entity:artist'])
        const out = expectEntities(res, 'artists')
        artistId = res[0].id
        return out
      },
    },
    {
      name: '/v2/insights filter.type=urn:entity:artist (similar artists)',
      run: async () => expectEntities(await client.similarArtists([artistId], 5), 'artists', (e) => (e.affinity == null ? 'missing query.affinity' : null)),
    },
    {
      name: '/v2/insights filter.type=urn:entity:destination (fan hotspots, UK)',
      run: async () =>
        expectEntities(await client.fanHotspots([artistId], 'UK', 5), 'destinations', (e) =>
          e.lat == null || e.lng == null ? 'missing location.lat/lon' : null
        ),
    },
    {
      name: '/v2/insights filter.type=urn:entity:place (venues in London) + explainability',
      run: async () => {
        const res = await client.venuesInCity([artistId], 'London', 5)
        const out = expectEntities(res, 'places')
        const explained = res.filter((v) => v.explainability.length > 0).length
        if (explained === 0) throw new Error('no query.explainability["signal.interests.entities"] on any place')
        return `${out}; explainability on ${explained}/${res.length}`
      },
    },
    {
      name: '/v2/insights filter.type=urn:entity:brand (cross-domain)',
      run: async () => expectEntities(await client.crossDomain([artistId], 'brand', 3), 'brands'),
    },
    {
      name: '/v2/insights filter.type=urn:entity:movie (cross-domain)',
      run: async () => expectEntities(await client.crossDomain([artistId], 'movie', 3), 'movies'),
    },
    {
      name: 'GET /v2/tags',
      run: async () => {
        const tags = await client.findTags('indie', 'urn:entity:artist', 5)
        if (tags.length === 0) throw new Error('no tags returned')
        return `${tags.length} tags`
      },
    },
  ]

  log('Qloo contract check (live API; prints field names and counts only)\n')
  let failed = 0
  for (const check of checks) {
    if (!artistId && check !== checks[0]) {
      log(`SKIP  ${check.name}: needs an artist ID from /search`)
      failed++
      continue
    }
    try {
      log(`PASS  ${check.name}: ${await check.run()}`)
    } catch (error) {
      failed++
      log(`FAIL  ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  log()
  log(failed === 0 ? `All ${checks.length} checks passed.` : `${failed} of ${checks.length} checks failed or were skipped.`)
  process.exitCode = failed === 0 ? 0 : 1
}

main().catch((error) => {
  log(`Contract check crashed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
