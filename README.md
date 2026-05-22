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
- explicit support for pasted user tokens and server-side env tokens
- imported profile summary when the public API returns it
- optional LLM refinement via OpenAI, Ollama, or a compatible API
- typed normalization and topic clustering pipeline
- deterministic generated project recommendation with rationale
- roadmap, architecture, and learning-goal views

## Live import notes

- Generate a personal access token from daily.dev API Settings.
- Paste the token into the dashboard to import your own profile, bookmarks, and stack signals.
- If a server token exists in `.env` as `DAILY_DEV_API_TOKEN`, the app can use that for shared local demo sessions.
- LLM configuration is now server-first. Configure provider/model/base URL/token in `.env`, and use the UI override only when you intentionally want a request-level override.
- If an OpenAI key exists in `.env` as `OPENAI_API_KEY` or `OPEN_AI_API_TOKEN`, OpenAI becomes the default LLM provider unless `LLM_PROVIDER` says otherwise.
- Ollama and compatible APIs can be configured in `.env` and optionally overridden in the compact `Override model settings` panel.
- If the API call fails or returns no usable content, the app falls back to demo data so the experience remains usable.

## Documentation

- Product and implementation notes live in [`docs/IMPLEMENTATION_NOTES.md`](./docs/IMPLEMENTATION_NOTES.md).
- Update that file when behavior changes, especially around API assumptions, fallback rules, and generation heuristics.

## Next step

Add a true AI synthesis layer behind the deterministic compiler and persist imported snapshots for returning users.
