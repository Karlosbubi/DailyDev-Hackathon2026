# Implementation Notes

## What the app does today

The app compiles daily.dev activity into a project recommendation flow:

- import live user data from the daily.dev public API when a token is available
- normalize imported data into internal activity items
- cluster technical interests with deterministic heuristics
- synthesize a project recommendation, roadmap, and learning goals
- optionally refine the deterministic project with an LLM provider
- fall back to demo data if the live path is missing data or fails

## Why the token flow works this way

We support two live-token sources on purpose:

- pasted user token:
  lets any user fetch their own daily.dev profile and activity without changing server configuration
- server env token:
  keeps the demo usable for local development and presentations when a shared token is acceptable

The pasted token is explicit and user-controlled. The server token is a convenience fallback, not a replacement.

## Why the generation pipeline is deterministic first

The current project synthesis is rule-based instead of LLM-first because:

- hackathon demos need repeatable output
- failures are easier to debug when each stage is inspectable
- the UI contract can stabilize before a prompt-based layer is introduced

This keeps the pipeline understandable while still leaving a clear insertion point for AI generation later.

## LLM providers

The current LLM layer is server-side, optional, and server-configured first.

Supported providers:

- OpenAI
- Ollama
- OpenAI-compatible API

Why it is implemented as a refinement step instead of the primary generator:

- clustering and imported signals stay inspectable even if the model call fails
- provider outages should not break the core product flow
- model choice is useful, but should not dominate the main UX

The UI keeps provider settings in a compact `Model settings` disclosure for that reason.

## Server-first LLM configuration

Primary configuration now lives on the server via environment variables.

Current server-side env knobs:

- `LLM_PROVIDER`
- `LLM_MODEL`
- `OPENAI_API_KEY`
- `OPEN_AI_API_TOKEN`
- `OLLAMA_BASE_URL`
- `COMPATIBLE_API_BASE_URL`
- `COMPATIBLE_API_TOKEN`

Behavior:

- if the UI sends no override, the request uses server LLM settings
- if the UI explicitly enables override mode, request-level settings replace the server defaults for that request only
- if the provider call fails or times out, the app returns deterministic output with generation warnings

This keeps deploy-time behavior stable while preserving a testing escape hatch.

## OpenAI implementation note

OpenAI requests use the Responses API, which is the recommended interface for new OpenAI integrations in the current official docs.

Current env key lookup order:

- `OPENAI_API_KEY`
- `OPEN_AI_API_TOKEN`

The second name exists here for compatibility with the current local `.env`.

## daily.dev API assumptions

Current implementation is based on the public API docs at `https://api.daily.dev/public/v1/docs/json`.

Endpoints currently targeted:

- `/bookmarks/`
- `/feeds/foryou`
- `/profile/`
- `/profile/stack/`

Observed behavior in this repo so far:

- bookmarks are available with the current token
- feed and stack may be unavailable depending on API account state or endpoint support
- profile data may or may not be returned, so the UI treats it as optional

When these assumptions change, update this file and the importer in `src/lib/server/dailydev.ts`.

## Fallback rules

- no token available: run demo mode
- force demo selected: run demo mode even if a token exists
- live import fails: return demo mode with warnings
- live import succeeds partially: use live data and surface warnings instead of failing hard

This is intentional. The product should stay demoable even when the external API is incomplete.

## Next documentation targets

- add a request/response contract note for the LLM settings payload
- add a request/response contract note for `/api/compile`
- document the clustering heuristics and keyword families
- add a changelog section for product-facing behavior changes
