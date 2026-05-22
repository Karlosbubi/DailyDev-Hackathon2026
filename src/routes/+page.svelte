<script lang="ts">
  import { onMount } from 'svelte';
  import type { CompilationResult } from '$lib/compiler/types';

  let token = '';
  let compilation: CompilationResult | null = null;
  let isLoading = false;
  let error = '';

  const fmtPercent = (value: number) => `${Math.round(value * 100)}% relevance`;

  const activityLabels: Record<string, string> = {
    bookmark: 'Bookmark',
    feed: 'Feed',
    history: 'History',
    stack: 'Stack',
    profile: 'Profile',
    discussion: 'Discussion',
    'tag-follow': 'Tag Follow',
    trending: 'Trending'
  };

  async function compile(useToken: boolean) {
    isLoading = true;
    error = '';

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          token: useToken ? token.trim() : '',
          forceDemo: !useToken
        })
      });

      if (!response.ok) {
        throw new Error(`Compile request failed with ${response.status}`);
      }

      compilation = (await response.json()) as CompilationResult;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown compile error';
    } finally {
      isLoading = false;
    }
  }

  function persistToken(value: string) {
    token = value;
    localStorage.setItem('dailydev-token', value);
  }

  onMount(async () => {
    token = localStorage.getItem('dailydev-token') ?? '';
    await compile(Boolean(token.trim()));
  });
</script>

<svelte:head>
  <title>Content to Project Compiler</title>
</svelte:head>

<div class="mx-auto min-h-screen w-[min(1380px,calc(100%-32px))] py-8 md:py-10">
  <header class="glass-panel mb-6 flex flex-col gap-6 rounded-[28px] px-6 py-7 md:px-8 md:py-8 xl:flex-row xl:items-end xl:justify-between">
    <div>
      <p class="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-moss-500">daily.dev Hackathon MVP</p>
      <h1 class="max-w-[10ch] text-5xl leading-[0.9] font-bold text-ink-900 md:text-7xl">
        Content to Project Compiler
      </h1>
      <p class="mt-4 max-w-3xl text-base leading-7 text-black/60 md:text-lg">
        Turn reading history, saved posts, followed tags, and stack signals into a project plan that is specific enough to build.
      </p>
    </div>

    <div class="grid w-full max-w-xl gap-3 rounded-[24px] border border-black/10 bg-white/70 p-4">
      <label class="grid gap-2">
        <span class="font-mono text-[11px] uppercase tracking-[0.18em] text-black/55">
          daily.dev API token
        </span>
        <input
          class="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-moss-500"
          type="password"
          bind:value={token}
          oninput={(event) => persistToken((event.currentTarget as HTMLInputElement).value)}
          placeholder="Paste a personal access token for live import"
        />
      </label>
      <div class="flex flex-wrap gap-3">
        <button
          class="cursor-pointer rounded-full bg-linear-to-br from-moss-500 to-emerald-500 px-6 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(12,124,89,0.25)] transition hover:-translate-y-px hover:shadow-[0_18px_36px_rgba(12,124,89,0.32)] disabled:cursor-wait disabled:opacity-70"
          type="button"
          disabled={isLoading}
          onclick={() => compile(Boolean(token.trim()))}
        >
          {isLoading ? 'Compiling...' : token.trim() ? 'Import and Compile' : 'Compile Demo'}
        </button>
        <button
          class="cursor-pointer rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/70 transition hover:bg-black/3"
          type="button"
          disabled={isLoading}
          onclick={() => compile(false)}
        >
          Use Demo Data
        </button>
      </div>
      <p class="font-mono text-xs uppercase tracking-[0.14em] text-black/[0.55]">
        Token stays in local browser storage for this prototype. Live import falls back to demo mode on API failure.
      </p>
    </div>
  </header>

  <main class="grid gap-5 lg:grid-cols-[1.05fr_1.2fr_0.95fr]">
    <section class="glass-panel rounded-3xl p-5 lg:col-span-3">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-moss-500">Compiler Trace</p>
          <h2 class="text-xl font-semibold">Import Status</h2>
        </div>
        {#if compilation}
          <span class="w-fit rounded-full bg-black/[0.06] px-3 py-2 text-sm text-black/70">
            {compilation.importSummary.mode === 'live' ? 'Live daily.dev import' : 'Demo fallback'}
          </span>
        {/if}
      </div>

      {#if error}
        <p class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      {/if}

      {#if compilation}
        <div class="mt-5 grid gap-4 md:grid-cols-4">
          <article class="surface-card rounded-2xl p-4">
            <p class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">Imported items</p>
            <p class="text-2xl font-bold">{compilation.importSummary.importedCount}</p>
          </article>
          <article class="surface-card rounded-2xl p-4">
            <p class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">Sources</p>
            <p class="text-sm leading-6 text-black/70">
              {compilation.importSummary.importedSources.join(', ') || 'demo dataset'}
            </p>
          </article>
          <article class="surface-card rounded-2xl p-4">
            <p class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">Dominant cluster</p>
            <p class="text-sm leading-6 text-black/70">
              {compilation.clusters[0]?.name ?? 'No strong cluster detected'}
            </p>
          </article>
          <article class="surface-card rounded-2xl p-4">
            <p class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">Warnings</p>
            <p class="text-sm leading-6 text-black/70">{compilation.importSummary.warnings.length || 0}</p>
          </article>
        </div>

        {#if compilation.importSummary.warnings.length > 0}
          <div class="mt-4 grid gap-2">
            {#each compilation.importSummary.warnings as warning}
              <p class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {warning}
              </p>
            {/each}
          </div>
        {/if}
      {:else}
        <p class="mt-4 text-sm text-black/60">Loading compiler state...</p>
      {/if}
    </section>

    <section class="glass-panel rounded-3xl p-5 lg:row-span-2">
      <p class="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-moss-500">Input</p>
      <h2 class="mb-5 text-xl font-semibold">Developer Activity</h2>
      <div class="grid gap-4">
        {#if compilation}
          {#each compilation.activity as item}
            <article class="surface-card rounded-2xl p-4">
              <div class="mb-3 flex items-start justify-between gap-3">
                <span class="font-mono text-xs uppercase tracking-[0.16em] text-moss-500">
                  {activityLabels[item.type]}
                </span>
                <span class="text-xs text-black/50">{fmtPercent(item.weight)}</span>
              </div>
              <h3 class="mb-3 text-base font-semibold text-ink-900">{item.title}</h3>
              <div class="flex flex-wrap gap-2">
                {#each item.tags as tag}
                  <span class="rounded-full bg-moss-500/12 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-moss-500">
                    {tag}
                  </span>
                {/each}
              </div>
            </article>
          {/each}
        {/if}
      </div>
    </section>

    <section class="glass-panel rounded-3xl p-5">
      <p class="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-moss-500">Output</p>
      <h2 class="mb-5 text-xl font-semibold">Generated Project</h2>

      {#if compilation}
        <article class="surface-card rounded-2xl p-5 md:p-6">
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p class="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-moss-500">Recommended Build</p>
              <h3 class="max-w-[14ch] text-3xl leading-tight font-bold md:text-5xl">
                {compilation.project.title}
              </h3>
            </div>
            <span class="w-fit rounded-full bg-black/[0.06] px-3 py-2 text-sm text-black/70">
              {compilation.project.difficulty}
            </span>
          </div>

          <p class="mt-5 text-base leading-7 text-black/60">
            {compilation.project.summary}
          </p>

          <div class="mt-6 flex flex-wrap gap-3">
            <section class="min-w-[180px] flex-1 rounded-2xl bg-black/[0.035] p-4">
              <span class="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">
                Primary Direction
              </span>
              <p class="text-sm font-medium text-ink-900">{compilation.clusters[0]?.name ?? 'systems'}</p>
            </section>
            <section class="min-w-[180px] flex-1 rounded-2xl bg-black/[0.035] p-4">
              <span class="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">
                Estimated Timeline
              </span>
              <p class="text-sm font-medium text-ink-900">{compilation.project.timeline}</p>
            </section>
            <section class="min-w-[180px] flex-1 rounded-2xl bg-black/[0.035] p-4">
              <span class="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">
                Project Outcome
              </span>
              <p class="text-sm font-medium text-ink-900">Operator-grade portfolio piece</p>
            </section>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            {#each compilation.project.stack as item}
              <span class="rounded-full bg-moss-500/12 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-moss-500">
                {item}
              </span>
            {/each}
          </div>

          <div class="mt-6 rounded-2xl bg-black/[0.035] p-4">
            <p class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">Why this build</p>
            <ul class="grid gap-2">
              {#each compilation.project.rationale as reason}
                <li class="text-sm leading-6 text-black/65">{reason}</li>
              {/each}
            </ul>
          </div>
        </article>
      {/if}
    </section>

    <section class="glass-panel rounded-3xl p-5 lg:row-span-2">
      <p class="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-moss-500">Execution</p>
      <h2 class="mb-5 text-xl font-semibold">Roadmap</h2>

      <ol class="grid gap-4">
        {#if compilation}
          {#each compilation.project.milestones as [title, description], index}
            <li class="surface-card rounded-2xl p-4">
              <p class="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-moss-500">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 class="mb-2 text-base font-semibold">{title}</h3>
              <p class="text-sm leading-6 text-black/60">{description}</p>
            </li>
          {/each}
        {/if}
      </ol>
    </section>

    <section class="glass-panel rounded-3xl p-5 lg:row-span-2">
      <p class="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-moss-500">Inference</p>
      <h2 class="mb-5 text-xl font-semibold">Interest Clusters</h2>

      <div class="grid gap-4">
        {#if compilation}
          {#each compilation.clusters as cluster, index}
            <article class="surface-card rounded-2xl p-4">
              <p class="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-moss-500">
                Cluster {index + 1}
              </p>
              <h3 class="text-base font-semibold">{cluster.name}</h3>
              <div class="mt-3 h-2 rounded-full bg-black/[0.08]">
                <div
                  class="h-2 rounded-full bg-linear-to-r from-moss-500 to-emerald-400"
                  style={`width:${(cluster.score / (compilation.clusters[0]?.score || 1)) * 100}%`}
                ></div>
              </div>
              <p class="mt-3 text-sm leading-6 text-black/60">
                Confidence signal derived from imported bookmarks, feed items, and stack signals.
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                {#each cluster.relatedTags as tag}
                  <span
                    class={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] ${
                      index === 0
                        ? 'bg-coral-500/12 text-coral-500'
                        : 'bg-moss-500/12 text-moss-500'
                    }`}
                  >
                    {tag}
                  </span>
                {/each}
              </div>
            </article>
          {/each}
        {/if}
      </div>
    </section>

    <section class="glass-panel rounded-3xl p-5">
      <p class="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-moss-500">Architecture</p>
      <h2 class="mb-5 text-xl font-semibold">System Shape</h2>

      <div class="grid gap-4 md:grid-cols-2">
        {#if compilation}
          {#each compilation.project.architecture as [title, description]}
            <article class="surface-card rounded-2xl p-4">
              <h3 class="mb-2 text-base font-semibold">{title}</h3>
              <p class="text-sm leading-6 text-black/60">{description}</p>
            </article>
          {/each}
        {/if}
      </div>
    </section>

    <section class="glass-panel rounded-3xl p-5">
      <p class="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-moss-500">Growth</p>
      <h2 class="mb-5 text-xl font-semibold">Learning Goals</h2>

      <ul class="grid gap-4">
        {#if compilation}
          {#each compilation.project.learningGoals as goal}
            <li class="surface-card rounded-2xl p-4 text-sm leading-6 text-black/65">{goal}</li>
          {/each}
        {/if}
      </ul>
    </section>
  </main>
</div>
