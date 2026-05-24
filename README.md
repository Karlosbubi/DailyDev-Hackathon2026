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
- The app container waits for Ollama and pulls `llama3.1:8b` by default on first startup. Override with `OLLAMA_MODEL=...` or `OLLAMA_BOOTSTRAP_MODEL=...`.
- The app is configured to talk to Ollama over the internal compose network with `OLLAMA_BASE_URL=http://ollama:11434/api`.
- In Docker deployment, the app container always uses the internal service address `http://ollama:11434/api`, even if local development `.env` uses `localhost`.
- No app data is persisted on the server. Only the Ollama model cache is stored in the `ollama-data` volume.

## Auto-deploy watcher

The repo now includes a small polling deploy watcher in [scripts/auto-deploy.sh](/home/kurt/Projects/Daily_Dev_Hackathon/scripts/auto-deploy.sh:1).

What it does:

- checks `origin/<branch>` on an interval
- fast-forward pulls when upstream changed
- runs `docker compose up -d --build` or falls back to `docker-compose up -d --build`

Defaults:

- branch: current checked-out branch
- remote: `origin`
- interval: `60` seconds

Example:

```bash
DEPLOY_INTERVAL_SECONDS=60 ./scripts/auto-deploy.sh
```

Safety behavior:

- refuses to start if the git worktree is dirty
- uses `git pull --ff-only`
- does not delete volumes or reset the repo

A systemd unit template is included at [scripts/auto-deploy.service.example](/home/kurt/Projects/Daily_Dev_Hackathon/scripts/auto-deploy.service.example:1).

## Current scope

- live daily.dev token-based import path with demo fallback
- streamed live import progress so profile, bookmarks, feed, and stack signals appear as they arrive
- explicit support for pasted user tokens
- imported profile summary when the public API returns it
- server-first LLM analysis via OpenAI, Ollama, or a compatible API
- typed normalization pipeline with deterministic fallback if the LLM fails
- generated interest clusters, project recommendation, and rationale
- roadmap, architecture, and learning-goal views

## Current limitation

The product promise is that the output should feel close enough to start building, not just interesting enough to read. The current implementation still falls short of that bar.

Today the pipeline is better at producing a plausible recommendation than a true build-ready implementation spec. Even with stronger models, the current prompt contract still over-optimizes for summaries, rationale, and readable writeups instead of harder delivery artifacts like:

- target user
- core problem
- first release scope
- non-goals
- primary workflow
- domain entities
- first vertical slice
- acceptance criteria

The next major improvement is to move from recommendation generation toward spec generation, with stricter structure and validation.

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

Replace the current recommendation-style project contract with a build-spec contract and add stronger validation before a project is accepted.
