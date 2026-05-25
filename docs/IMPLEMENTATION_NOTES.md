# Implementation Notes

## What the app does today

The app compiles daily.dev activity into a project recommendation flow:

- import live user data from the daily.dev public API when a token is available
- stream import progress back to the UI as each source completes
- normalize imported data into internal activity items
- send imported signals to an LLM-first analysis step
- generate interest clusters, a project recommendation, roadmap, and learning goals from the model output
- fall back to deterministic clustering and synthesis only if the LLM call fails or returns unusable JSON
- fall back to demo data if the live path is missing data or fails

## Why the token flow works this way

The app now supports one live-token source on purpose:

- pasted user token:
  lets any user fetch their own daily.dev profile and activity without relying on shared server credentials

This keeps account access explicit and user-controlled. If no token is provided, the app stays in demo mode.

## Auto-deploy watcher

Deployment automation is intentionally kept outside the app process.

The repo now ships a simple polling watcher:

- `scripts/auto-deploy.sh`

Behavior:

- polls the configured git remote and branch every `DEPLOY_INTERVAL_SECONDS`
- fetches upstream state with `git fetch`
- compares `HEAD` to `remote/branch`
- if upstream changed, runs `git pull --ff-only`
- rebuilds and restarts the stack with `docker compose up -d --build`
- falls back to `docker-compose` if Docker Compose v2 is unavailable

Safety constraints:

- it exits immediately if the worktree is dirty
- it does not hard reset the repo
- it does not remove named volumes

There is also a systemd example unit in:

- `scripts/auto-deploy.service.example`

## HTTPS deployment

HTTPS is now handled by a dedicated reverse proxy container instead of the Node app directly.

Current Docker layout:

- `caddy` exposes ports `80` and `443`
- `app` stays internal on port `3000`
- `caddy` reverse proxies to `app:3000`
- Caddy manages certificate issuance and renewal automatically through Let's Encrypt

Why this shape:

- the SvelteKit app does not need to terminate TLS itself
- certificate lifecycle stays outside the application process
- the deployment path is simpler than running Certbot manually against a standalone Node server

Operational requirements:

- set `PUBLIC_DOMAIN` to a real fully qualified domain name
- point DNS at the server before starting the stack
- keep inbound `80` and `443` reachable for HTTP challenge and HTTPS traffic

Certificate state is stored in the named volumes:

- `caddy-data`
- `caddy-config`

## Why import progress now streams

The importer no longer waits for a single blocking response before updating the page.

Why:

- profile details are useful immediately and help confirm the right account was loaded
- bookmarks, feed items, and stack signals can arrive independently
- the LLM step can still take longer, so the user should see the import moving before analysis finishes

The streamed route returns NDJSON events from the server. The UI uses those events to update the trace panel and activity list while the compile pipeline is still running.

## Why the generation pipeline is now LLM-first

The main analysis step now comes from the configured LLM provider because:

- the product goal is personalized synthesis, not just rule-based classification
- project selection, cluster naming, and roadmap generation all benefit from cross-signal reasoning
- the streamed importer already exposes enough intermediate state to keep the pipeline debuggable

Deterministic clustering and project synthesis still exist, but only as a fallback when the LLM path fails or returns incomplete JSON.

## Current output gap

The product copy says the output should feel close enough to start building, not just interesting enough to read. The current system does not reliably meet that standard yet.

What is going wrong:

- the main project contract is still too recommendation-shaped
- the pipeline asks for titles, summaries, rationale, architecture, and milestones, but not enough build-critical structure
- partial LLM success still tends to inherit broad fallback scaffolding
- the final writeup is useful as narrative, but not yet strong enough as an implementation handoff

In practice, this means the system often returns:

- a plausible direction
- a readable project name
- a decent-looking roadmap

But still misses the harder artifacts that make a developer feel ready to start building:

- target user
- core problem
- first release scope
- explicit non-goals
- primary workflow
- domain entities
- version-one system boundaries
- first vertical slice
- acceptance criteria

This is not primarily a model-quality issue. Different models improve style and coherence, but the larger problem is that the current prompt and validation contract is underspecified for build-readiness.

The corrective direction is:

- replace the current project summary contract with a build-spec contract
- generate product brief, domain model, system boundaries, first slice, and acceptance criteria as first-class artifacts
- add a critique pass that rejects outputs that are still too vague to implement
- keep deterministic fallback structural, not prose-heavy, so it stops anchoring the LLM toward generic output

## LLM providers

The current LLM layer is server-side, primary, and server-configured first.

Supported providers:

- OpenAI
- Ollama
- OpenAI-compatible API

Why it is implemented server-side:

- imported tokens and provider credentials stay off the client
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
- `LLM_TIMEOUT_MS`
- `OPENAI_TIMEOUT_MS`
- `COMPATIBLE_TIMEOUT_MS`
- `OLLAMA_TIMEOUT_MS`

Behavior:

- if the UI sends no override, the request uses server LLM settings
- if the UI explicitly enables override mode, request-level settings replace the server defaults for that request only
- if the user selects OpenAI in override mode, they must provide their own API token for that request
- if the provider call fails or times out, the app returns deterministic output with generation warnings

This keeps deploy-time behavior stable while still allowing per-request model routing when a user wants a faster, stronger, or personally funded provider.

## Provider timeouts

Timeouts are now provider-specific because the latency profiles are different:

- default LLM timeout: 60s
- OpenAI timeout: 120s
- compatible API timeout: 120s
- Ollama timeout: 180s

These can all be overridden with env vars. The parser now ignores invalid or empty timeout values and falls back to the defaults above, so a malformed `.env` entry does not break outbound model requests.

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
- LLM analysis fails: keep the imported activity, then fall back to deterministic clustering/project synthesis with warnings

This is intentional. The product should stay demoable even when the external API is incomplete.

## Next documentation targets

- add a request/response contract note for the LLM settings payload
- add a request/response contract note for `/api/compile`
- document the new build-spec contract once the project schema is expanded
- add a changelog section for product-facing behavior changes
