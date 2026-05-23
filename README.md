# Content to Project Compiler

SvelteKit + Vite + Tailwind + TypeScript MVP for the daily.dev hackathon concept described in [Outline.md](./Outline.md).

## Stack

- SvelteKit
- Svelte 5
- Vite
- Tailwind CSS
- TypeScript

## Local development

```bash
npm install
npm run dev
```

## Current scope

- live daily.dev token-based import path with demo fallback
- streamed live import progress so profile, bookmarks, feed, and stack signals appear as they arrive
- explicit support for pasted user tokens and server-side env tokens
- imported profile summary when the public API returns it
- server-first LLM analysis via OpenAI, Ollama, or a compatible API
- typed normalization pipeline with deterministic fallback if the LLM fails
- generated interest clusters, project recommendation, and rationale
- roadmap, architecture, and learning-goal views

## Live import notes

- Generate a personal access token from daily.dev API Settings.
- Paste the token into the dashboard to import your own profile, bookmarks, and stack signals.
- If a server token exists in `.env` as `DAILY_DEV_API_TOKEN`, the app can use that for shared local demo sessions.
- LLM configuration is now server-first. Configure provider/model/base URL/token in `.env`, and use the UI override only when you intentionally want a request-level override.
- If an OpenAI key exists in `.env` as `OPENAI_API_KEY` or `OPEN_AI_API_TOKEN`, OpenAI becomes the default LLM provider unless `LLM_PROVIDER` says otherwise.
- Ollama and compatible APIs can be configured in `.env` and optionally overridden in the compact `Override model settings` panel.
- Provider timeouts are configurable with `LLM_TIMEOUT_MS`, `OPENAI_TIMEOUT_MS`, `COMPATIBLE_TIMEOUT_MS`, and `OLLAMA_TIMEOUT_MS`.
  Current defaults are 60s, 120s, 120s, and 180s respectively.
- If the API call fails or returns no usable content, the app falls back to demo data so the experience remains usable.
- If the configured LLM fails or returns unusable JSON, the app falls back to the deterministic compiler instead of returning an empty result.

## Documentation

- Product and implementation notes live in [`docs/IMPLEMENTATION_NOTES.md`](./docs/IMPLEMENTATION_NOTES.md).
- Update that file when behavior changes, especially around API assumptions, fallback rules, and generation heuristics.

## Next step

Tighten the LLM output contract and persist imported snapshots for returning users.
