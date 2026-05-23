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

## Container deployment

```bash
docker compose up --build
```

- The app is exposed on `http://localhost:3000`.
- Ollama is exposed on `http://localhost:11434`.
- The compose stack pulls `llama3.1:8b` by default on first startup. Override with `OLLAMA_MODEL=...`.
- The app is configured to talk to Ollama over the internal compose network with `OLLAMA_BASE_URL=http://ollama:11434/api`.
- No app data is persisted on the server. Only the Ollama model cache is stored in the `ollama-data` volume.

## Current scope

- live daily.dev token-based import path with demo fallback
- streamed live import progress so profile, bookmarks, feed, and stack signals appear as they arrive
- explicit support for pasted user tokens
- imported profile summary when the public API returns it
- server-first LLM analysis via OpenAI, Ollama, or a compatible API
- typed normalization pipeline with deterministic fallback if the LLM fails
- generated interest clusters, project recommendation, and rationale
- roadmap, architecture, and learning-goal views

## Live import notes

- Generate a personal access token from daily.dev API Settings.
- Paste the token into the dashboard to import your own profile, bookmarks, and stack signals.
- LLM configuration is now server-first. Configure provider/model/base URL/token in `.env`, and use the UI selector when you intentionally want a request-level model route instead.
- If an OpenAI key exists in `.env` as `OPENAI_API_KEY` or `OPEN_AI_API_TOKEN`, OpenAI becomes the default LLM provider unless `LLM_PROVIDER` says otherwise.
- OpenAI request-level override requires the user to supply their own API token in the UI.
- Ollama and compatible APIs can be configured in `.env` and optionally replaced per request in the compact model-route panel.
- Provider timeouts are configurable with `LLM_TIMEOUT_MS`, `OPENAI_TIMEOUT_MS`, `COMPATIBLE_TIMEOUT_MS`, and `OLLAMA_TIMEOUT_MS`.
  Current defaults are 60s, 120s, 120s, and 180s respectively.
- For longer streamed writeups, `LLM_WRITEUP_TIMEOUT_MS` can be set separately. The compose file defaults it to 300s.
- If the API call fails or returns no usable content, the app falls back to demo data so the experience remains usable.
- If the configured LLM fails or returns unusable JSON, the app falls back to the deterministic compiler instead of returning an empty result.

## Documentation

- Product and implementation notes live in [`docs/IMPLEMENTATION_NOTES.md`](./docs/IMPLEMENTATION_NOTES.md).
- Update that file when behavior changes, especially around API assumptions, fallback rules, and generation heuristics.

## Next step

Tighten the LLM output contract and persist imported snapshots for returning users.
