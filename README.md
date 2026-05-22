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
- typed normalization and topic clustering pipeline
- deterministic generated project recommendation with rationale
- roadmap, architecture, and learning-goal views

## Live import notes

- Generate a personal access token from daily.dev API Settings.
- Paste the token into the dashboard to import bookmarks, feed items, and stack signals.
- If the API call fails or returns no usable content, the app falls back to demo data so the experience remains usable.

## Next step

Add a true AI synthesis layer behind the deterministic compiler and persist imported snapshots for returning users.
