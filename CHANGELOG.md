# Changelog

## 2026-10-29

- **NVIDIA Nemotron on Nebius Token Factory (optional).** New `lib/agent/nebius.ts`: after the Qloo tool chain finishes, GigRoute sends the plan's grounded facts (artist, top co-bills, route-ordered cities with affinity, top venues, shared tags) and the deterministic summary to Nebius Token Factory's OpenAI-compatible `/chat/completions` endpoint (`https://api.tokenfactory.nebius.com/v1/`, default model `nvidia/nemotron-3-super-120b-a12b`) and asks it to rewrite the route summary using only those facts.
- **Off by default, safe fallback.** The step runs only when `NEBIUS_API_KEY` is set (`NEBIUS_BASE_URL`, `NEBIUS_MODEL`, `NEBIUS_TIMEOUT_MS` are optional, default 8 s timeout). Without a key, or on any HTTP error, timeout, bad response or a reply that fails validation (empty, over 700 characters, or containing links/emails), the plan keeps the existing deterministic summary. Qloo calls and venue selection are unchanged; the model never chooses venues or cities.
- **Visible in the app and exports.** The stream shows "Polishing the summary with NVIDIA Nemotron…", the plan page credits the model under the summary, and JSON exports gain `summarySource` (`nebius:<model>` or `deterministic`); Markdown exports use the rewritten summary.
- **Ops and tests.** `/api/plan` sets `maxDuration = 60` for Vercel; new `tests/nebius.test.ts` covers disabled, network error, HTTP 500, success with `<think>` stripping, and URL building. README and `.env.example` document the new variables (empty values only).
