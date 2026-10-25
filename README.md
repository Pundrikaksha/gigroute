# GigRoute

**Route your next tour to where your fans already are.**

GigRoute is a taste-grounded tour planner for independent musicians, built on the [Qloo Taste AI](https://docs.qloo.com) Insights API. Enter your artist (or a better-known artist you sound like) and a region. An agent then:

1. resolves the artist in Qloo and finds similar artists for local co-bills,
2. ranks the cities where audiences for that taste over-index (fan hotspots),
3. ranks venues, bars and record shops in each city by audience affinity,
4. finds cross-domain tastes (brands, films) for merch and poster ideas,
5. orders the stops into a route and drafts a data-backed pitch for each venue.

Every city and venue has a **“Why this city / venue?”** panel built from Qloo's `query.affinity` and `query.explainability`: the affinity score, the tags that match your sound, and the artists whose fans drove the result.

> **Try it in one click:** the landing page has a **“See a sample tour”** button (Radiohead · UK). It always runs on built-in sample data, so it works instantly with no keys.

## Quick start

Requires Node 20 or 22 (see `.nvmrc`).

```bash
nvm use            # optional, picks Node 22
npm ci
npm run dev        # http://localhost:3000
```

With no environment variables, the app runs in **mock mode**: a deterministic mock LLM drives the agent against hand-written fixture data. No network calls are made to Qloo or to any LLM.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Vitest unit tests (all mocked, no network) |
| `npm run lint` | ESLint |
| `npm run contract-check` | Optional live contract check against Qloo (see below). |

### Live contract check (when the Qloo key arrives)

The key lives only in your shell for the length of one command. It is never written to a file or committed:

```bash
QLOO_API_KEY=... npm run contract-check
```

The script (`scripts/qloo-contract-check.ts`) makes one real request per endpoint GigRoute uses (search, similar artists, fan hotspots, venues with explainability, brand and movie cross-domain, tags) and checks that the response has the fields the app reads. It prints one line per check, with counts and field names only. It never prints response data or the key (anything it prints is scrubbed of the key as a safeguard).

```text
PASS  GET /search (artist): 10 artists; fields: id, name, type, popularity, tags, explainability
PASS  /v2/insights filter.type=urn:entity:place (venues in London) + explainability: 5 places; ...; explainability on 5/5
FAIL  /v2/insights filter.type=urn:entity:movie (cross-domain): Qloo 403: entity type or endpoint not enabled for this key
```

- **PASS**: the endpoint answered and the fields GigRoute needs are there.
- **FAIL**: the message says what was missing or which HTTP error came back (401 means a bad key or base URL, 403 means the entity type isn't enabled for the key, 400 means a parameter is rejected).
- **SKIP**: `/search` failed, so the checks that need an artist ID didn't run.
- Exit code `0` means everything passed; `1` means at least one check failed or was skipped. With no key set it calls nothing, prints a skip message and exits `0`.

## Environment variables

Set these in `.env.local` for local development (it is gitignored) or in **Vercel → Project → Settings → Environment Variables**. Never commit real values.

| Variable | Required | Example (empty means unset) | Purpose |
| --- | --- | --- | --- |
| `QLOO_API_KEY` | For live Qloo | `QLOO_API_KEY=` | Sent as the `X-Api-Key` header. If empty, mock mode is used. |
| `QLOO_BASE_URL` | No | `QLOO_BASE_URL=` | Defaults to `https://hackathon.api.qloo.com`. |
| `QLOO_MOCK` | No | `QLOO_MOCK=` | Set to `1` to force mock Qloo data even when a key is present. |
| `LLM_BASE_URL` | No | `LLM_BASE_URL=` | Any OpenAI-compatible chat completions endpoint. Defaults to OpenAI. |
| `LLM_API_KEY` | For a live LLM | `LLM_API_KEY=` | If empty, the deterministic `MockLLM` plans the tour. |
| `LLM_MODEL` | With `LLM_API_KEY` | `LLM_MODEL=` | Model name for the endpoint above. Must support tool calling. |

**Going live:** set `QLOO_API_KEY` (and leave `QLOO_MOCK` unset). That is the only change. The real client already sends the documented requests (see below). The LLM is independent: with no LLM key, the mock LLM drives the real Qloo client.

## Deploy to Vercel

1. Push this repo to GitHub and **Import Project** in Vercel (framework preset: Next.js, defaults are fine).
2. Vercel reads `"engines": { "node": ">=20 <23" }` from `package.json` and uses Node 22.
3. Optionally add the environment variables above. Without them, the deployment runs fully in mock mode, which is good for a judging demo.
4. Deploy. `/api/plan` is a streaming (SSE) route function; `/` and `/plan` are static.

A build with `QLOO_MOCK=1` and no LLM key is tested as part of CI-style verification (`npm ci && npm run build && npm test && npm run lint`).

## How GigRoute uses the Qloo API

All requests are `GET` with the `X-Api-Key` header. The parameters are built in `lib/qloo/requests.ts`, the same builders feed the mock, and the URLs are asserted in `tests/params.test.ts`.

| Purpose | Request |
| --- | --- |
| Resolve artist | `GET /search?query=<name>&types=urn:entity:artist&take=10` |
| Tag lookup | `GET /v2/tags?filter.query=<q>&filter.parents.types=urn:entity:artist&take=20` |
| Similar artists (co-bills) | `GET /v2/insights?filter.type=urn:entity:artist&signal.interests.entities=<id>&take=6` |
| Fan hotspots | `GET /v2/insights?filter.type=urn:entity:destination&signal.interests.entities=<ids>&feature.explainability=true&take=10[&filter.location.query=<region>]` |
| Venues per city | `GET /v2/insights?filter.type=urn:entity:place&signal.interests.entities=<ids>&filter.location.query=<city>&feature.explainability=true&take=5` |
| Merch cues | `GET /v2/insights?filter.type=urn:entity:brand` or `urn:entity:movie` `&signal.interests.entities=<id>&take=5` |

- `take` is clamped to the documented maximum of 50.
- For hotspots and venues, GigRoute signals on the artist **plus its top 3 similar artists**. Explainability then shows which of those artists' fans drove each result.
- Responses are parsed from `results.entities[]` (insights), `results[]` (search) and `results.tags[]` (tags). Each entity contributes `entity_id`, `name`, `subtype`, `properties`, `location`, `tags`, `popularity`, `query.affinity` and `query.explainability["signal.interests.entities"]`.
- Successful GETs are cached in memory for 24 hours (LRU, 500 entries). 429 and 5xx responses are retried twice.

## Mock mode notes

- Fixtures in `lib/qloo/fixtures/mock-data.json` are **hand-written fake data**, not real API responses. They copy the documented response shapes. Entity IDs are prefixed `mock-`, and addresses are placeholders.
- Mock search knows every artist in the fixtures: Radiohead, The Strokes, Big Thief and Khruangbin, plus the similar artists (Thom Yorke, Portishead, Interpol, Yeah Yeah Yeahs, Arcade Fire, Muse).
- Any other name (say “Phoebe Bridgers”) is mapped deterministically onto one of the four fixture taste profiles (a stable hash of the name), so judges typing their own artist still get a full plan. The plan page, the summary and the exports label it clearly as sample data and name the profile used. With a real key, an unknown artist gets the honest “no match” state with a retry and suggested artists instead.
- Mock hotspots cover London, Manchester, Bristol, New York, Chicago, Los Angeles, Austin and Seattle. `filter.location.query` filters them by name (for example `UK` or `USA`; `United Kingdom`, `England`, `US` and `United States` work too). Other regions (for example `India` or `Germany`) end with a message explaining the sample data's coverage, with links to try the UK, the USA or everywhere.
- Fixture explainability is written against the seed artist. When you plan for another mock artist, the seed's share is credited to that artist.
- Mock runs add a 250 ms pause between agent steps so the streaming UI is visible. Tests run without the pause.
- Mock mode is active when `QLOO_MOCK=1` or `QLOO_API_KEY` is empty. The demo preset (`demo=1`) always uses mock mode.

## Architecture

- **Next.js App Router** (React 19, Tailwind CSS 4), deployed on Vercel.
- `lib/qloo`: `RealQlooClient` and `MockQlooClient` behind one `QlooClient` interface, with shared request builders and normalizers.
- `lib/agent`: a tool-calling agent over any OpenAI-compatible LLM (or `MockLLM`). Tool results are folded into a typed `Plan` (`lib/agent/plan.ts`), and a snapshot of that plan streams to the browser over SSE after every step.
- `app/plan`: renders the streamed plan, with progress, skeletons, empty and error states, the explainability panels, and a Leaflet/OpenStreetMap route map.
- Narration and pitches (`narrateTour`, `pitchEmail` in `lib/agent/plan.ts`) are pure and deterministic. The MockLLM's closing summary, the per-stop “why” text, the per-venue pitch drafts and the exports all come from the same Qloo evidence (affinity, tags, explainability, similar artists). Pitch drafts are shown with a copy button only; GigRoute never sends email.
- **Permalinks and export:** `/plan?artist=…&region=…&cities=…&stops=…` encodes every input, so a shared link re-runs the same plan (deterministic in mock mode). The plan page can copy that link, download Markdown or JSON (`gigroute-plan@1`), or print a clean light-on-paper view. Nothing is stored on a server.
- SSE events carry a plan snapshot only on result events (one per parallel batch), not the raw tool results, which keeps the demo stream around 70 KB.
- Open Graph and Twitter card images are rendered by `next/og` (`app/opengraph-image.tsx`, `app/twitter-image.tsx`); the icon is `app/icon.svg`. Set `NEXT_PUBLIC_SITE_URL` to change the absolute URL used in the meta tags (defaults to `https://gigroute.vercel.app`).

## Known limits

- Routing is greedy nearest-neighbour on straight-line distance, not road routing or dates.
- Qloo returns *places* in general, so results can include bars and record shops as well as venues. There is no capacity or availability data.
- The `filter.location.query` locality matching is fuzzy on Qloo's side. Very broad or unusual regions may return no destinations.
- The cache lives in memory per serverless instance. It is not shared and is lost on a cold start.
- Each plan makes up to roughly 10 Qloo requests and up to 12 LLM calls. Watch rate limits on shared hackathon keys.
- The explainability field layout follows the Insights docs description (`query.explainability` keyed by signal, with per-entity scores normalized 0–1). If the live API differs, the panels fall back to affinity and tags.

## Responsible data use

- No personal data is sent to Qloo. Only artist names, entity IDs and place names are sent.
- No Qloo data is committed to the repo; the fixtures are fabricated.
- Affinities describe group tendencies of audiences, not individual preferences, and the UI says so.
