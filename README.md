# GigRoute

GigRoute is a taste-grounded tour planner for independent musicians. It uses an AI agent and the Qloo Taste API to plan logical, data-driven tour routes.

## What it does
- Resolves artists to Qloo entities.
- Finds similar artists for local co-bills.
- Finds fan hotspots (cities/regions) for a given taste.
- In top cities, ranks venues based on audience overlap.
- Finds cross-domain tastes (e.g. movies, brands) for merch ideas.
- Orders the stops by geographic proximity.
- Drafts a mock pitch email for venues.

## Setup
To run locally without API keys, we use a built-in deterministic MockLLM and a MockQloo client with hand-written fixtures.
To start the local server:
1. Run `npm ci`
2. Start the dev server.

## Environment Variables
- `QLOO_API_KEY`: API key for Qloo.
- `QLOO_BASE_URL`: Defaults to `https://hackathon.api.qloo.com`.
- `QLOO_MOCK`: Set to `1` to force mock mode.
- `LLM_BASE_URL`: OpenAI-compatible endpoint URL.
- `LLM_API_KEY`: OpenAI API key.
- `LLM_MODEL`: The LLM model to use (e.g., `gpt-4o`).

If `LLM_API_KEY` is not set, a deterministic `MockLLM` is used.
If `QLOO_API_KEY` is not set (or `QLOO_MOCK=1`), a local hand-written mock Qloo client is used.

## Architecture
- **Next.js App Router**: Backend API routes and frontend UI.
- **Agent Loop**: A custom loop using OpenAI tool calling to fetch Qloo data.
- **Server-Sent Events (SSE)**: Streams step-by-step progress from the agent to the UI.

## Limitations
- This is a hackathon scaffold. The actual map UI is currently limited.
- The mock data covers a limited set of artists and venues.

## Responsible Data Use
No personally identifiable information (PII) is sent to Qloo.
Qloo API responses are strictly cached locally and are never committed to this repository. All mocked data consists of hand-written fixtures.
