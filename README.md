# GigRoute

GigRoute is a taste-grounded tour planner for independent musicians. It uses an agent interacting with the Qloo Taste API to plan a tour route, find similar artists for local co-bills, locate fan hotspots, find suitable venues, and suggest merch/poster ideas based on cross-domain tastes. 

## Qloo Endpoints Used and Why
- `GET /search?query=..&types=..`: Used to resolve an artist's name to Qloo entity IDs.
- `GET /v2/tags?filter.query=..`: To find tags associated with an entity.
- `GET /v2/insights`: Used via specific queries (and not the standard `/recommendations` endpoint) for finding:
  - Similar artists (local co-bill ideas)
  - Fan hotspots (cities where fans of this taste concentrate)
  - Top venues/bars/record shops in each top city whose audience overlaps the taste
  - Cross-domain tastes (brands, movies) for merch/poster ideas

## Setup

The app can run completely offline without keys using built-in mock data. 

1. Install dependencies:
   ```bash
   npm i
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values if you want to use the real APIs.

- `QLOO_API_KEY`: Your Qloo API Key.
- `QLOO_BASE_URL`: Defaults to `https://hackathon.api.qloo.com`.
- `QLOO_MOCK`: Set to `1` to force mock mode even if `QLOO_API_KEY` is present.
- `LLM_BASE_URL`: OpenAI-compatible endpoint URL.
- `LLM_API_KEY`: API key for the LLM. If unset, a deterministic `MockLLM` is used.
- `LLM_MODEL`: Model name (e.g., `gpt-4o`).

## Architecture
- **Next.js 14+ App Router** with React 19.
- **Tailwind CSS** for styling.
- **React Leaflet** for maps.
- **Agent**: An AI agent wrapper built around tools that interface with Qloo endpoints. Output is streamed using Server-Sent Events (SSE).
- **Cache**: In-memory LRU cache to reduce redundant API calls.

## Known Limits
- The mock mode uses hardcoded fixtures.
- Map routing uses naive nearest-neighbor instead of true road distance routing.

## Responsible Data Use
- **No Personally Identifiable Information (PII)** is sent to Qloo. Only artist names and general locations are sent.
- Qloo data is not committed to the repository (the real API key must never be committed).
- Results describe general group tendencies, not specific individual tastes.
