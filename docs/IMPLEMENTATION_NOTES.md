# Implementation Notes

## What the app does today

The app compiles daily.dev activity into a project recommendation flow:

- import live user data from the daily.dev public API when a token is available
- normalize imported data into internal activity items
- cluster technical interests with deterministic heuristics
- synthesize a project recommendation, roadmap, and learning goals
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

- add a request/response contract note for `/api/compile`
- document the clustering heuristics and keyword families
- add a changelog section for product-facing behavior changes
