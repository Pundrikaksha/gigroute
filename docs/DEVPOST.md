# GigRoute (Devpost draft)

**Tagline:** Route your next tour to where your fans already are.

**Links:** live demo https://gigroute.vercel.app · repository https://github.com/Pundrikaksha/gigroute (MIT)

> **Note for judges:** the public demo runs on the **live Qloo API**. Typed artists are resolved and planned from real Qloo data. The "See a sample tour" button is the exception: it is a fixed Radiohead UK run on hand-written sample data, labelled "Sample data" on screen. `npm run contract-check` verifies the live API against the fields GigRoute reads.

## Inspiration

Independent musicians plan tours by gut feel: the cities where friends have couches, the venues a booker happened to answer. Then they play half-empty rooms 400 km from the crowd that would have loved them. Big acts have agents and data teams for this. Small acts have a spreadsheet.

Qloo's taste graph knows where audiences for a sound over-index, which rooms those audiences go to, and what else they love. We wanted to put that in the hands of a band with a van.

## What it does

Enter your artist (or a better-known artist you sound like), optionally a region and some candidate cities. GigRoute's agent then streams a tour plan in a few seconds:

- **Fan hotspots:** the cities where audiences for your taste over-index, ordered into a drivable route on a map.
- **Rooms per city:** venues, bars and record shops ranked by audience affinity.
- **The why behind every pick:** each city and venue shows its affinity score, the tags it shares with your sound, and which artists' fans drove the result (Qloo explainability), plus a plain-English narration of the whole route.
- **Co-bill ideas:** similar artists who draw the same crowd.
- **Merch and poster cues:** cross-domain tastes (brands, films) of the same audience.
- **A pitch email draft for every venue,** citing the affinity, shared tags and co-bill evidence. Shown on screen with a copy button; GigRoute never sends email for you.
- **Share and export:** a permalink that re-runs the same plan, Markdown and JSON downloads, and a print-friendly view.

## How we built it

- **Next.js 16 App Router, React 19, Tailwind CSS 4**, deployed on Vercel. Leaflet with OpenStreetMap tiles for the route map.
- **A tool-calling agent** (`lib/agent`) works against any OpenAI-compatible LLM, or a deterministic `MockLLM` that walks the same tool chain with no key. Tools: `resolve_artist`, `similar_artists`, `fan_hotspots`, `venues_in_city` (parallel, one per stop), `cross_domain_tastes`, `plan_route`, `draft_pitch`.
- **A typed Qloo client** (`lib/qloo`) with one interface and two implementations: the real client (caching, retries on 429/5xx, clamped `take`) and a mock client that interprets the same documented parameters against fixtures. Request builders are shared and asserted in tests.
- **Streaming:** each tool result is folded into a typed `Plan` and streamed to the browser over Server-Sent Events, so stops, venues and the map fill in live.
- **Deterministic narration and pitches** (`narrateTour`, `pitchEmail`) built from the plan's Qloo evidence, so the summary, the per-stop "why" text, the pitch drafts and the exports always agree, and are covered by unit tests.
- **Social cards** rendered with `next/og`; no stored state, because the URL is the plan.

## How Qloo is used

| Qloo feature | What GigRoute does with it |
| --- | --- |
| `GET /search` (`types=urn:entity:artist`) | Resolves the typed artist to an entity ID; ambiguous names ask the user to pick. |
| `/v2/insights` `filter.type=urn:entity:artist` | Similar artists for co-bills, and extra taste signals. |
| `/v2/insights` `filter.type=urn:entity:destination` (+ `filter.location.query`) | Fan hotspots: cities where the taste over-indexes, optionally within a region. |
| `/v2/insights` `filter.type=urn:entity:place` (+ `filter.location.query=<city>`, `filter.geocode.country_code`) | Venues, bars and record shops per city, ranked by affinity and kept inside the tour's country (with `filter.geocode.name` as a fallback). |
| `signal.interests.entities` | The artist **plus its top three similar artists** are sent together, so results reflect a scene rather than one name. |
| `feature.explainability=true` | Per-result breakdown of which of those artists drove the score ("driven by fans of Radiohead 62%, Thom Yorke 21%"). |
| `query.affinity` | The score behind every ranking, bar and sentence in the narration. |
| Entity `tags` (genre, place category) | Shared tags explain each match and give the pitch emails concrete evidence. |
| `/v2/insights` `filter.type=urn:entity:brand` / `urn:entity:movie` | Cross-domain tastes for merch and poster ideas. |
| `GET /v2/tags` | Tag lookup in the client; exercised by the contract check (not yet an agent tool). |

Only artist names, entity IDs and place names are sent. No personal data. Affinities are presented as group tendencies, not individual preferences.

## Challenges we ran into

- **Making explainability legible.** Raw per-entity scores mean little to a musician, so we resolve entity IDs back to names from the plan and turn them into "driven by fans of…" sentences and pitch evidence.
- **Real-world geography.** City names are ambiguous: on the live API "Edinburgh" first resolved to Edinburgh, Indiana. Venue lookups are now pinned to the tour's country, with fallbacks, and "US" is sent as "United States".
- **Building and demoing before the key arrived.** We wrote fixtures that mirror the documented response shapes, made the mock client interpret the same parameters as the real one, and added a contract check to run the moment the key lands. We also made sure judges typing *any* artist get a full, clearly labelled sample plan instead of a dead end.
- **Streaming without bloat.** Early versions resent every raw tool result in every event (about 134 KB for the demo). Folding results into one plan snapshot per step roughly halved that.
- **Keeping an LLM honest.** The agent may only cite tool results, and the closing narration is generated from the plan itself, so numbers in the text always match numbers on screen.

## Accomplishments that we're proud of

- Every recommendation is explainable down to an affinity score, a shared tag and the artists whose fans drove it.
- The whole demo works with zero keys and zero network calls to Qloo or an LLM, deterministically, which made it fully testable.
- Pitch drafts that a booker might actually read, because they lead with evidence instead of "we think your crowd would like us".
- A share link is the whole plan: no accounts, no database.

## What we learned

- Cross-domain taste data is most persuasive when it is specific: "your regulars over-index on Portishead" beats a generic score.
- Signalling on a small cluster of related artists gives steadier, more useful results than one artist alone, and explainability shows why.
- Designing the mock against the documented contract first made the real integration a configuration change rather than a rewrite.

## What's next for GigRoute

- Venue-type filtering with Qloo tags, so shortlists favour music rooms over restaurants and parks, and further tuning of `take` and the similar-artist signal mix against live responses.
- Dates and logistics: drive-time routing, day-of-week patterns, and avoiding clashes.
- Demographic and age-band signals to choose between all-ages rooms and bars.
- Saved tours and a booker CRM (with explicit consent, still no auto-sending).
- Venue capacity data from partners, so affinity and room size can be matched.

## Built with

Next.js · React · TypeScript · Tailwind CSS · Qloo Insights API · OpenAI-compatible tool calling (optional) · Server-Sent Events · Leaflet · OpenStreetMap · lru-cache · Vitest · ESLint · Vercel
