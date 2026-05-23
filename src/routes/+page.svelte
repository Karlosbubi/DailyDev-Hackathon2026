<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    ActivityItem,
    AnalysisStageName,
    CompilationResult,
    CompilationStreamEvent,
    Cluster,
    ImportedProfile,
    LlmProvider,
    ProjectRecommendation,
    LlmServerConfigSummary,
    LlmSettings,
    ProjectSpec
  } from '$lib/compiler/types';

  export let data: {
    defaultLlm: LlmSettings;
    serverLlmConfig: LlmServerConfigSummary;
  };

  type ThemeMode = 'light' | 'dark';

  let token = '';
  let steeringNote = '';
  let compilation: CompilationResult | null = null;
  let isLoading = false;
  let error = '';
  let themeMode: ThemeMode = 'light';
  let overrideLlm = false;
  let streamPhase: 'idle' | 'starting' | 'importing' | 'synthesizing' | 'refining' | 'complete' = 'idle';
  let streamMessage = '';
  let partialActivity: ActivityItem[] = [];
  let partialWarnings: string[] = [];
  let partialImportedSources: string[] = [];
  let partialImportedCount = 0;
  let partialProfile: ImportedProfile | null = null;
  let partialClusters: Cluster[] = [];
  let partialProject: Partial<ProjectSpec> | null = null;
  let partialRecommendations: ProjectRecommendation[] = [];
  let partialWriteup = '';
  let selectedTier: ProjectRecommendation['tier'] = 'medium';
  let analysisTrace: Array<{
    stage: AnalysisStageName;
    status: 'success' | 'partial' | 'error';
    message: string;
    warnings: string[];
  }> = [];

  let llmProvider: LlmProvider = data.serverLlmConfig.provider;
  let llmModel = data.serverLlmConfig.model;
  let llmBaseUrl = data.serverLlmConfig.baseUrl ?? '';
  let llmApiToken = '';
  let llmApiTokenInput: HTMLInputElement | null = null;

  const fmtPercent = (value: number) => `${Math.round(value * 100)}% relevance`;
  const activityLabels: Record<string, string> = {
    bookmark: 'Bookmark',
    feed: 'Feed',
    history: 'History',
    stack: 'Stack',
    profile: 'Profile',
    discussion: 'Discussion',
    experiences: 'Experience',
    'tag-follow': 'Tag Follow',
    trending: 'Trending'
  };

  const openAiModels = ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'];
  const ollamaModels = ['llama3.1:8b', 'qwen2.5-coder:7b', 'mistral:7b'];
  const stageOrder: AnalysisStageName[] = [
    'clusters',
    'project',
    'architecture',
    'roadmap',
    'variants',
    'writeup'
  ];
  const stageTitles: Record<AnalysisStageName, string> = {
    clusters: 'Cluster Read',
    project: 'Project Frame',
    architecture: 'Architecture',
    roadmap: 'Roadmap',
    variants: 'Effort Variants',
    writeup: 'Implementation Brief'
  };
  const tierTitles: Record<ProjectRecommendation['tier'], string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High'
  };
  const fallbackInteractiveProvider: LlmProvider =
    data.serverLlmConfig.provider === 'none' ? 'ollama' : data.serverLlmConfig.provider;

  const CACHE_VERSION = 'v3';

  function applyTheme(mode: ThemeMode, persist = true) {
    themeMode = mode;
    document.documentElement.dataset.theme = mode;
    if (persist) {
      localStorage.setItem('theme-mode', mode);
    }
  }

  function toggleTheme() {
    applyTheme(themeMode === 'dark' ? 'light' : 'dark');
  }

  function buildCompileCacheKey(mode: 'manual' | 'demo'): string {
    const payload = {
      version: CACHE_VERSION,
      mode,
      token: mode === 'manual' ? token.trim() : '',
      steeringNote: steeringNote.trim(),
      overrideLlm,
      llm: overrideLlm
        ? {
            provider: llmProvider,
            model: llmModel.trim(),
            baseUrl: llmBaseUrl.trim()
          }
        : {
            provider: data.serverLlmConfig.provider,
            model: data.serverLlmConfig.model,
            baseUrl: data.serverLlmConfig.baseUrl ?? ''
          }
    };

    return `compile-cache:${encodeURIComponent(JSON.stringify(payload))}`;
  }

  function applyCompilationSnapshot(result: CompilationResult) {
    compilation = result;
    partialActivity = result.activity;
    partialImportedCount = result.importSummary.importedCount;
    partialImportedSources = result.importSummary.importedSources;
    partialWarnings = result.importSummary.warnings;
    partialProfile = result.importSummary.profile ?? null;
    partialClusters = result.clusters;
    partialProject = result.project;
    partialRecommendations = result.recommendations;
    partialWriteup = result.projectWriteup;
  }

  function readCachedCompilation(mode: 'manual' | 'demo'): CompilationResult | null {
    const raw = localStorage.getItem(buildCompileCacheKey(mode));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as { result?: CompilationResult };
      return parsed.result ?? null;
    } catch {
      return null;
    }
  }

  function persistCachedCompilation(mode: 'manual' | 'demo', result: CompilationResult) {
    const payload = {
      savedAt: Date.now(),
      result
    };
    localStorage.setItem(buildCompileCacheKey(mode), JSON.stringify(payload));
  }

  $: visibleActivity = compilation?.activity ?? partialActivity;
  $: visibleImportedCount = compilation?.importSummary.importedCount ?? partialImportedCount;
  $: visibleImportedSources = compilation?.importSummary.importedSources ?? partialImportedSources;
  $: visibleProfile = compilation?.importSummary.profile ?? partialProfile;
  $: importWarnings = compilation?.importSummary.warnings ?? partialWarnings;
  $: rawGenerationWarnings = compilation?.generation.warnings ?? [];
  $: visibleClusters = compilation?.clusters ?? partialClusters;
  $: visibleProject = compilation?.project ?? partialProject;
  $: visibleWriteup = compilation?.projectWriteup ?? partialWriteup;
  $: stageScopedWarnings = analysisTrace.flatMap((stage) => stage.warnings);
  $: generationWarnings = rawGenerationWarnings.filter((warning) => !stageScopedWarnings.includes(warning));
  $: orderedAnalysisTrace = [...analysisTrace].sort(
    (a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage)
  );
  $: recommendations = compilation?.recommendations ?? partialRecommendations;
  $: selectedRecommendation =
    recommendations.find((recommendation) => recommendation.tier === selectedTier) ??
    recommendations.find((recommendation) => recommendation.tier === 'medium') ??
    recommendations[0] ??
    null;
  $: if (overrideLlm && llmProvider === 'none') {
    llmProvider = fallbackInteractiveProvider;
  }

  async function compile(mode: 'manual' | 'demo') {
    llmApiToken = llmApiTokenInput?.value?.trim() ?? llmApiToken.trim();

    if (overrideLlm && llmProvider === 'openai' && !llmApiToken.trim()) {
      error = 'OpenAI override requires your own API token.';
      return;
    }

    isLoading = true;
    error = '';
    streamPhase = 'starting';
    streamMessage = mode === 'demo' ? 'Preparing demo data.' : 'Preparing live import.';
    partialActivity = [];
    partialWarnings = [];
    partialImportedSources = [];
    partialImportedCount = 0;
    partialProfile = null;
    partialClusters = [];
    partialProject = null;
    partialRecommendations = [];
    partialWriteup = '';
    analysisTrace = [];
    selectedTier = 'medium';
    compilation = null;

    try {
      const response = await fetch('/api/compile/stream', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          token: mode === 'manual' ? token.trim() : '',
          forceDemo: mode === 'demo',
          steeringNote: steeringNote.trim(),
          llm: overrideLlm
            ? {
                provider: llmProvider,
                model: llmModel.trim(),
                baseUrl: llmBaseUrl.trim(),
                apiToken: llmApiToken.trim()
              }
            : undefined
        })
      });

      if (!response.ok) {
        throw new Error(`Compile request failed with ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Compile stream returned no body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          const event = JSON.parse(trimmed) as CompilationStreamEvent;

          if (event.type === 'status') {
            streamPhase = event.phase;
            streamMessage = event.message;
            continue;
          }

          if (event.type === 'source') {
            partialActivity = event.activity;
            partialImportedCount = event.importedCount;
            partialImportedSources = event.importedSources;
            partialWarnings = event.warnings;
            partialProfile = event.profile;
            streamPhase = 'importing';
            streamMessage = `${event.source[0].toUpperCase()}${event.source.slice(1)} ${event.status}.`;
            continue;
          }

          if (event.type === 'analysis') {
            if (event.clusters) {
              partialClusters = event.clusters;
            }
            if (event.project) {
              partialProject = {
                ...(partialProject ?? {}),
                ...event.project
              };
            }
            if (event.recommendations) {
              partialRecommendations = event.recommendations;
            }

            analysisTrace = [
              ...analysisTrace.filter((entry) => entry.stage !== event.stage),
              {
                stage: event.stage,
                status: event.status,
                message: event.message,
                warnings: event.warnings
              }
            ];
            streamPhase = 'refining';
            streamMessage = event.message;
            continue;
          }

          if (event.type === 'writeup') {
            partialWriteup = event.content;
            streamPhase = 'refining';
            streamMessage = event.done
              ? 'Implementation brief complete.'
              : 'Streaming implementation brief.';
            continue;
          }

          if (event.type === 'result') {
            applyCompilationSnapshot(event.result);
            persistCachedCompilation(mode, event.result);
            streamPhase = 'complete';
            streamMessage = 'Compilation complete.';
            continue;
          }

          if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }

      const finalLine = buffer.trim();
      if (finalLine) {
        const event = JSON.parse(finalLine) as CompilationStreamEvent;
        if (event.type === 'result') {
          applyCompilationSnapshot(event.result);
          persistCachedCompilation(mode, event.result);
          streamPhase = 'complete';
          streamMessage = 'Compilation complete.';
        } else if (event.type === 'error') {
          throw new Error(event.message);
        } else if (event.type === 'status') {
          streamPhase = event.phase;
          streamMessage = event.message;
        } else if (event.type === 'analysis') {
          if (event.clusters) {
            partialClusters = event.clusters;
          }
          if (event.project) {
            partialProject = {
              ...(partialProject ?? {}),
              ...event.project
            };
          }
          if (event.recommendations) {
            partialRecommendations = event.recommendations;
          }
          analysisTrace = [
            ...analysisTrace.filter((entry) => entry.stage !== event.stage),
            {
              stage: event.stage,
              status: event.status,
              message: event.message,
              warnings: event.warnings
            }
          ];
          streamPhase = 'refining';
          streamMessage = event.message;
        } else if (event.type === 'writeup') {
          partialWriteup = event.content;
          streamPhase = 'refining';
          streamMessage = event.done
            ? 'Implementation brief complete.'
            : 'Streaming implementation brief.';
        } else if (event.type === 'source') {
          partialActivity = event.activity;
          partialImportedCount = event.importedCount;
          partialImportedSources = event.importedSources;
          partialWarnings = event.warnings;
          partialProfile = event.profile;
        }
      }
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

  function persistSteeringNote(value: string) {
    steeringNote = value;
    localStorage.setItem('project-steering-note', value);
  }

  function persistLlmApiToken(value: string) {
    llmApiToken = value;
    localStorage.setItem('llm-api-token', value);
  }

  onMount(async () => {
    const savedTheme = localStorage.getItem('theme-mode');
    const preferredTheme =
      savedTheme === 'light' || savedTheme === 'dark'
        ? savedTheme
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    applyTheme(preferredTheme, false);
    token = localStorage.getItem('dailydev-token') ?? '';
    steeringNote = localStorage.getItem('project-steering-note') ?? '';
    llmApiToken = localStorage.getItem('llm-api-token') ?? '';
    streamPhase = 'idle';
    streamMessage = token.trim()
      ? 'Saved inputs restored. Start a run when ready.'
      : 'Add a token or steer the build, then start a run.';
  });
</script>

<svelte:head>
  <title>Content to Project Compiler</title>
</svelte:head>

<div class="theme-root mx-auto min-h-screen w-[min(1500px,calc(100%-28px))] py-5 md:py-8" data-theme={themeMode}>
  <div class="dashboard-shell rounded-[32px] px-5 py-5 md:px-8 md:py-8">
    <div class="mb-4 flex justify-end">
      <button class="theme-toggle" type="button" onclick={toggleTheme} aria-label="Toggle light and dark theme">
        <span class="theme-toggle__icon">{themeMode === 'dark' ? 'Moon' : 'Light'}</span>
        <span class="theme-toggle__label">{themeMode === 'dark' ? 'Dark Nord' : 'Light Nord'}</span>
      </button>
    </div>
    <header class="grid gap-5 xl:grid-cols-[1.2fr_0.88fr]">
      <section class="hero-panel rounded-[30px] p-6 md:p-8 lg:p-10">
        <div class="flex flex-wrap items-center gap-3">
          <span class="rounded-full border border-moss-500/18 bg-moss-500/10 px-3 py-2 font-mono text-[11px] uppercase mono-kicker text-moss-600">
            daily.dev Hackathon MVP
          </span>
          <span class="rounded-full border border-black/8 bg-white/70 px-3 py-2 text-sm text-black/55">
            Reading signals into buildable software
          </span>
        </div>

        <div class="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <h1 class="max-w-[9ch] text-5xl leading-[0.88] font-bold text-ink-900 md:text-7xl xl:text-8xl">
              Content to Project Compiler
            </h1>
            <p class="mt-5 max-w-2xl text-lg leading-8 text-black/62">
              Import what you actually read, save, and build around, then turn that signal into a sharper project direction, system shape, and execution plan.
            </p>
          </div>

          <div class="feature-strip rounded-[26px] p-5">
            <p class="font-mono text-[11px] uppercase mono-kicker text-black/55">Pipeline</p>
            <div class="mt-4 grid gap-3">
              <article class="signal-card rounded-2xl p-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-moss-600">01 Import</p>
                <p class="mt-2 text-sm leading-6 text-black/62">Profile, bookmarks, feed, and stack stream in immediately.</p>
              </article>
              <article class="signal-card rounded-2xl p-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-moss-600">02 Analyze</p>
                <p class="mt-2 text-sm leading-6 text-black/62">Clusters, project framing, and planning run as smaller debuggable LLM stages.</p>
              </article>
              <article class="signal-card rounded-2xl p-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-moss-600">03 Ship</p>
                <p class="mt-2 text-sm leading-6 text-black/62">The output should feel close enough to start building, not just interesting enough to read.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <aside class="grid gap-4">
        <section class="console-panel rounded-[28px] p-5 md:p-6">
          <p class="font-mono text-[11px] uppercase mono-kicker text-moss-600">Connect your daily.dev account</p>
          <h2 class="mt-3 text-3xl leading-tight font-semibold text-ink-900">Bring your own profile signal.</h2>
          <p class="mt-3 text-sm leading-7 text-black/62">
            The best results come from your own bookmarks, feed, and stack. Without a token, the app stays in demo mode.
            No data will be persisted on the server, and the default inference is local ollama - if you bring a new provider it will process your info though.
          </p>

          <label class="mt-5 grid gap-2">
            <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">Personal access token</span>
            <input
              class="rounded-2xl border border-moss-500/16 bg-white px-4 py-3 text-sm outline-none transition focus:border-moss-500"
              type="password"
              bind:value={token}
              oninput={(event) => persistToken((event.currentTarget as HTMLInputElement).value)}
              placeholder="Paste a token from daily.dev settings"
            />
          </label>

          <label class="mt-4 grid gap-2">
            <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/50">Optional build steer</span>
            <textarea
              class="min-h-[110px] rounded-2xl border border-moss-500/16 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-moss-500"
              bind:value={steeringNote}
              oninput={(event) => persistSteeringNote((event.currentTarget as HTMLTextAreaElement).value)}
              placeholder="Examples: I want to work on my DSA. I was thinking about a Pokedex app. I want something backend-heavy with queues."
            ></textarea>
            <p class="text-sm leading-6 text-black/54">
              This nudges the recommendation. Imported profile activity still supplies the main signal.
            </p>
          </label>

          <div class="mt-5 flex flex-wrap gap-3">
            <button class="cursor-pointer rounded-full bg-linear-to-br from-moss-500 to-emerald-500 px-6 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(12,124,89,0.25)] transition hover:-translate-y-px hover:shadow-[0_18px_36px_rgba(12,124,89,0.32)] disabled:cursor-not-allowed disabled:opacity-60" type="button" disabled={isLoading || !token.trim()} onclick={() => compile('manual')}>
              {isLoading ? 'Compiling...' : 'Import My daily.dev Data'}
            </button>
            <button class="cursor-pointer rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/70 transition hover:bg-black/3" type="button" disabled={isLoading} onclick={() => compile('demo')}>
              Use Demo Data
            </button>
          </div>
        </section>

        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <article class="console-panel rounded-[26px] p-5">
            <p class="font-mono text-[11px] uppercase mono-kicker text-black/48">Default model route</p>
            <div class="mt-4 grid gap-2 text-sm leading-6 text-black/66">
              <p><span class="text-black/45">Provider:</span> {data.serverLlmConfig.provider}</p>
              <p><span class="text-black/45">Model:</span> {data.serverLlmConfig.model || 'none'}</p>
              <p><span class="text-black/45">Base URL:</span> {data.serverLlmConfig.baseUrl || 'default'}</p>
              <p><span class="text-black/45">Auth:</span> {data.serverLlmConfig.hasApiToken ? 'configured' : 'not configured'}</p>
            </div>
            <p class="mt-4 text-sm leading-6 text-black/58">
              Server-side Ollama is the default cost-control path. Bring your own model route when you want speed or stronger outputs.
            </p>
          </article>

          <details class="console-panel rounded-[26px] p-5">
            <summary class="cursor-pointer font-mono text-[11px] uppercase mono-kicker text-black/48">
              Choose a different model route
            </summary>
            <div class="mt-4 grid gap-3">
              <label class="flex items-center gap-3 text-sm text-black/65">
                <input type="checkbox" bind:checked={overrideLlm} />
                Use request-level model access instead of the default route
              </label>

              {#if overrideLlm}
                <label class="grid gap-2">
                  <span class="text-sm text-black/60">Provider</span>
                  <select bind:value={llmProvider} class="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm">
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama</option>
                    <option value="compatible">Compatible API</option>
                  </select>
                </label>

                {#if llmProvider === 'openai'}
                  <label class="grid gap-2">
                    <span class="text-sm text-black/60">API token</span>
                    <input
                      bind:this={llmApiTokenInput}
                      bind:value={llmApiToken}
                      type="password"
                      oninput={(event) => persistLlmApiToken((event.currentTarget as HTMLInputElement).value)}
                      onchange={(event) => persistLlmApiToken((event.currentTarget as HTMLInputElement).value)}
                      autocomplete="new-password"
                      spellcheck="false"
                      placeholder="sk-..."
                      class="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                    />
                  </label>
                  <label class="grid gap-2">
                    <span class="text-sm text-black/60">Model</span>
                    <select bind:value={llmModel} class="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm">
                      {#each openAiModels as model}
                        <option value={model}>{model}</option>
                      {/each}
                    </select>
                  </label>
                  <p class="text-sm leading-6 text-black/56">
                    OpenAI override runs only with your own API token and does not reuse the server default key.
                  </p>
                {/if}

                {#if llmProvider === 'ollama'}
                  <label class="grid gap-2">
                    <span class="text-sm text-black/60">Model</span>
                    <input bind:value={llmModel} list="ollama-models" class="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm" />
                    <datalist id="ollama-models">
                      {#each ollamaModels as model}
                        <option value={model}></option>
                      {/each}
                    </datalist>
                  </label>
                  <label class="grid gap-2">
                    <span class="text-sm text-black/60">Base URL</span>
                    <input bind:value={llmBaseUrl} placeholder="http://127.0.0.1:11434/api" class="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm" />
                  </label>
                {/if}

                {#if llmProvider === 'compatible'}
                  <label class="grid gap-2">
                    <span class="text-sm text-black/60">Model</span>
                    <input bind:value={llmModel} placeholder="gpt-4.1-mini" class="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm" />
                  </label>
                  <label class="grid gap-2">
                    <span class="text-sm text-black/60">Base URL</span>
                    <input bind:value={llmBaseUrl} placeholder="https://example.com/v1" class="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm" />
                  </label>
                  <label class="grid gap-2">
                    <span class="text-sm text-black/60">API token</span>
                    <input bind:value={llmApiToken} type="password" placeholder="Bearer token" class="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm" />
                  </label>
                {/if}
              {/if}
            </div>
          </details>

        </section>
      </aside>
    </header>

    <main class="mt-5 grid items-start gap-5 xl:grid-cols-[1.12fr_0.88fr]">
      <div class="grid self-start gap-5">
        <section class="project-panel rounded-[28px] p-5 md:p-6">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p class="font-mono text-xs uppercase mono-kicker text-moss-600">Generated Projects</p>
              <h2 class="mt-3 text-2xl font-semibold text-ink-900 md:text-3xl">Build Direction</h2>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="status-pill rounded-full px-3 py-2 text-sm text-black/60">
                {compilation?.generation.strategy ?? (analysisTrace.length > 0 ? 'llm staged' : 'waiting')}
              </span>
              <span class="status-pill rounded-full px-3 py-2 text-sm text-black/60">
                {compilation?.generation.provider ?? (overrideLlm ? llmProvider : data.serverLlmConfig.provider)}
              </span>
            </div>
          </div>

          {#if compilation}
            <article class="mt-6">
              <div class="project-composer gap-6">
                <div class="project-composer__lead">
                  <div>
                    <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-moss-600">Recommended Build</p>
                    <h3 class="mt-3 max-w-[14ch] text-4xl leading-tight font-bold text-ink-900 md:text-6xl">{selectedRecommendation?.title ?? compilation.project.title}</h3>
                    <span class="status-pill mt-4 inline-flex w-fit rounded-full px-4 py-2 text-sm text-black/65">
                      {selectedRecommendation?.difficulty ?? compilation.project.difficulty}
                    </span>
                  </div>

                  <p class="mt-6 max-w-4xl text-base leading-8 text-black/64">{selectedRecommendation?.summary ?? compilation.project.summary}</p>

                  <div class="mt-6 flex flex-wrap gap-2">
                    {#each (selectedRecommendation?.stack ?? compilation.project.stack) as item}
                      <span class="rounded-full bg-moss-500/12 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-moss-500">{item}</span>
                    {/each}
                  </div>
                </div>

                <aside class="project-composer__rail">
                  <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-moss-600">Recommended Build</p>
                  <div class="mt-3 tier-selector p-2">
                    {#each recommendations as recommendation}
                      <button
                        class={`tier-selector__tab cursor-pointer ${selectedRecommendation?.tier === recommendation.tier ? 'tier-selector__tab--active' : ''}`}
                        type="button"
                        onclick={() => (selectedTier = recommendation.tier)}
                      >
                        <span>{tierTitles[recommendation.tier]}</span>
                      </button>
                    {/each}
                  </div>

                  {#if selectedRecommendation}
                    <div class="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                      <section class="signal-card rounded-2xl p-4">
                        <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">Effort band</span>
                        <p class="mt-3 text-base font-semibold text-ink-900">{selectedRecommendation.effortLabel}</p>
                      </section>
                      <section class="signal-card rounded-2xl p-4">
                        <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">Estimated timeline</span>
                        <p class="mt-3 text-base font-semibold text-ink-900">{selectedRecommendation.timeline}</p>
                      </section>
                      <section class="signal-card rounded-2xl p-4">
                        <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">Primary direction</span>
                        <p class="mt-3 text-base font-semibold text-ink-900">{compilation.clusters[0]?.name ?? 'systems'}</p>
                      </section>
                    </div>

                    <div class="mt-4 rounded-[24px] border border-black/8 bg-black/[0.025] p-5">
                      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">Why this build</p>
                      <ul class="mt-3 grid gap-2">
                        {#each selectedRecommendation.rationale as reason}
                          <li class="text-sm leading-6 text-black/64">{reason}</li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                </aside>
              </div>
            </article>
          {:else if isLoading}
            <article class="mt-6">
              <p class="font-mono text-xs uppercase mono-kicker text-moss-600">In Progress</p>
              <h3 class="mt-3 text-3xl font-bold text-ink-900">{visibleProject?.title ?? 'Building project direction'}</h3>
              <p class="mt-4 max-w-3xl text-base leading-8 text-black/62">
                {visibleProject?.summary ?? 'Imports stream first. Then the LLM walks through clusters, project framing, and execution planning as separate stages.'}
              </p>
              {#if visibleClusters.length > 0}
                <div class="mt-5 flex flex-wrap gap-2">
                  {#each visibleClusters.slice(0, 4) as cluster}
                    <span class="rounded-full bg-moss-500/12 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-moss-500">{cluster.name}</span>
                  {/each}
                </div>
              {/if}
              {#if visibleProject?.stack && visibleProject.stack.length > 0}
                <div class="mt-4 flex flex-wrap gap-2">
                  {#each visibleProject.stack as item}
                    <span class="rounded-full bg-black/[0.05] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-black/58">{item}</span>
                  {/each}
                </div>
              {/if}
            </article>
          {:else}
            <article class="mt-6">
              <p class="font-mono text-xs uppercase mono-kicker text-moss-600">Ready</p>
              <h3 class="mt-3 text-3xl font-bold text-ink-900">Import a signal set to generate a project.</h3>
              <p class="mt-4 max-w-3xl text-base leading-8 text-black/62">
                Use your own daily.dev token for a personalized build direction, or stay in demo mode to inspect the product flow.
              </p>
            </article>
          {/if}
        </section>

        <section class="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <section class="timeline-panel rounded-[28px] p-5 md:p-6">
            <p class="font-mono text-xs uppercase mono-kicker text-moss-600">Execution</p>
            <h2 class="mt-3 text-2xl font-semibold text-ink-900">Roadmap</h2>
            <ol class="mt-5 grid gap-4">
              {#if compilation}
                {#each (selectedRecommendation?.milestones ?? compilation.project.milestones) as [title, description], index}
                  <li class="signal-card rounded-2xl p-4">
                    <p class="font-mono text-xs uppercase tracking-[0.16em] text-moss-500">{String(index + 1).padStart(2, '0')}</p>
                    <h3 class="mt-3 text-base font-semibold text-ink-900">{title}</h3>
                    <p class="mt-2 text-sm leading-6 text-black/62">{description}</p>
                  </li>
                {/each}
              {/if}
            </ol>
          </section>

          <section class="timeline-panel rounded-[28px] p-5 md:p-6">
            <p class="font-mono text-xs uppercase mono-kicker text-moss-600">Architecture</p>
            <h2 class="mt-3 text-2xl font-semibold text-ink-900">System Shape</h2>
            <div class="mt-5 grid gap-4">
              {#if compilation}
                {#each (selectedRecommendation?.architecture ?? compilation.project.architecture) as [title, description]}
                  <article class="signal-card rounded-2xl p-4">
                    <h3 class="text-base font-semibold text-ink-900">{title}</h3>
                    <p class="mt-2 text-sm leading-6 text-black/62">{description}</p>
                  </article>
                {/each}
              {/if}
            </div>
          </section>
        </section>

        <section class="timeline-panel rounded-[28px] p-5 md:p-6">
          <p class="font-mono text-xs uppercase mono-kicker text-moss-600">Growth</p>
          <h2 class="mt-3 text-2xl font-semibold text-ink-900">Learning Goals</h2>
          <ul class="mt-5 grid gap-4">
            {#if compilation}
              {#each (selectedRecommendation?.learningGoals ?? compilation.project.learningGoals) as goal}
                <li class="signal-card rounded-2xl p-4 text-sm leading-6 text-black/64">{goal}</li>
              {/each}
            {/if}
          </ul>
        </section>

        <section class="timeline-panel rounded-[28px] p-5 md:p-6">
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p class="font-mono text-xs uppercase mono-kicker text-moss-600">Narrative</p>
              <h2 class="mt-3 text-2xl font-semibold text-ink-900">Implementation Brief</h2>
            </div>
            {#if isLoading && partialWriteup}
              <span class="status-pill w-fit rounded-full px-3 py-2 text-sm text-moss-600">Streaming writeup</span>
            {/if}
          </div>

          {#if visibleWriteup}
            <div class="writeup-panel mt-5 rounded-[24px] p-5">
              {#each visibleWriteup.split('\n\n').filter(Boolean) as block}
                <p class="writeup-block text-sm leading-7 text-black/68">{block}</p>
              {/each}
            </div>
          {:else if isLoading}
            <div class="writeup-panel mt-5 rounded-[24px] p-5">
              <p class="text-sm leading-7 text-black/56">
                The final implementation brief will stream in here after the roadmap and architecture stages finish.
              </p>
            </div>
          {/if}
        </section>
      </div>

      <div class="grid gap-5">
        <section class="glass-panel rounded-[28px] p-5 md:p-6">
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p class="font-mono text-xs uppercase mono-kicker text-moss-600">Compiler Trace</p>
              <h2 class="mt-3 text-2xl font-semibold text-ink-900">Import Status</h2>
            </div>
            {#if compilation}
              <span class="status-pill w-fit rounded-full px-3 py-2 text-sm text-black/65">
                {compilation.importSummary.mode === 'live' ? 'Live daily.dev import' : 'Demo fallback'}
              </span>
            {:else if isLoading}
              <span class="status-pill w-fit rounded-full px-3 py-2 text-sm text-moss-600">
                {streamPhase === 'refining' ? 'Refining output' : 'Streaming import'}
              </span>
            {/if}
          </div>

          {#if error}
            <p class="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          {/if}

          {#if isLoading && streamMessage}
            <p class="mt-5 rounded-2xl border border-moss-200 bg-moss-500/8 px-4 py-3 text-sm text-moss-700">{streamMessage}</p>
          {/if}

          {#if compilation || isLoading}
            <div class="mt-5 grid gap-3 md:grid-cols-2">
              <article class="stat-block rounded-2xl p-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">Token source</p>
                <p class="mt-3 text-lg font-semibold text-ink-900">{compilation?.importSummary.tokenSource ?? (token.trim() ? 'manual' : 'none')}</p>
              </article>
              <article class="stat-block rounded-2xl p-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">Imported items</p>
                <p class="mt-3 text-3xl font-bold text-ink-900">{visibleImportedCount}</p>
              </article>
              <article class="stat-block rounded-2xl p-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">Sources</p>
                <p class="mt-3 text-sm leading-6 text-black/62">{visibleImportedSources.join(', ') || (compilation ? 'demo dataset' : 'Waiting for imports')}</p>
              </article>
              <article class="stat-block rounded-2xl p-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">Model route</p>
                <p class="mt-3 text-sm leading-6 text-black/62">{compilation?.generation.provider ?? (overrideLlm ? llmProvider : data.serverLlmConfig.provider)} · {compilation?.generation.model ?? (overrideLlm ? llmModel || 'n/a' : data.serverLlmConfig.model || 'n/a')}</p>
              </article>
            </div>

            {#if visibleProfile}
              <article class="stat-block mt-4 rounded-2xl p-4">
                <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">Imported profile</p>
                <h3 class="mt-3 text-xl font-semibold text-ink-900">{visibleProfile.name}</h3>
                <p class="mt-1 text-sm text-black/58">{visibleProfile.username ? `@${visibleProfile.username}` : 'No public handle returned'}</p>
              </article>
            {/if}

            {#if importWarnings.length > 0 || generationWarnings.length > 0}
              <div class="mt-4 grid gap-2">
                {#each [...importWarnings, ...generationWarnings] as warning}
                  <p class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</p>
                {/each}
              </div>
            {/if}

            {#if orderedAnalysisTrace.length > 0}
              <div class="mt-4 grid gap-3">
                {#each orderedAnalysisTrace as stage}
                  <article class="signal-card rounded-2xl p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-black/45">{stageTitles[stage.stage]}</p>
                        <p class="mt-2 text-sm font-medium text-ink-900">{stage.message}</p>
                      </div>
                      <span class="status-pill rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-black/55">{stage.status}</span>
                    </div>
                    {#if stage.warnings.length > 0}
                      <div class="mt-3 grid gap-2">
                        {#each stage.warnings as warning}
                          <p class="text-sm leading-6 text-black/55">{warning}</p>
                        {/each}
                      </div>
                    {/if}
                  </article>
                {/each}
              </div>
            {/if}
          {/if}
        </section>

        <section class="glass-panel rounded-[28px] p-5 md:p-6">
          <p class="font-mono text-xs uppercase mono-kicker text-moss-600">Inference</p>
          <h2 class="mt-3 text-2xl font-semibold text-ink-900">Interest Clusters</h2>
          <div class="mt-5 grid gap-4">
            {#if compilation || visibleClusters.length > 0}
              {#each (compilation?.clusters ?? visibleClusters) as cluster, index}
                <article class="signal-card rounded-2xl p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-mono text-xs uppercase tracking-[0.16em] text-moss-500">Cluster {index + 1}</p>
                      <h3 class="mt-2 text-base font-semibold text-ink-900">{cluster.name}</h3>
                    </div>
                    <span class="text-xs text-black/45">{fmtPercent(cluster.score)}</span>
                  </div>
                  <div class="mt-4 h-2 rounded-full bg-black/[0.08]">
                    <div class="h-2 rounded-full bg-linear-to-r from-moss-500 to-coral-500" style={`width:${(cluster.score / ((compilation?.clusters ?? visibleClusters)[0]?.score || 1)) * 100}%`}></div>
                  </div>
                  <div class="mt-4 flex flex-wrap gap-2">
                    {#each cluster.relatedTags as tag}
                      <span class={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] ${index === 0 ? 'bg-coral-500/12 text-coral-500' : 'bg-moss-500/12 text-moss-500'}`}>{tag}</span>
                    {/each}
                  </div>
                </article>
              {/each}
            {/if}
          </div>
        </section>

        <section class="glass-panel rounded-[28px] p-5 md:p-6">
          <p class="font-mono text-xs uppercase mono-kicker text-moss-600">Input</p>
          <h2 class="mt-3 text-2xl font-semibold text-ink-900">Developer Activity</h2>
          <div class="mt-5 grid gap-4">
            {#if visibleActivity.length > 0}
              {#each visibleActivity as item}
                <article class="signal-card rounded-2xl p-4">
                  <div class="flex items-start justify-between gap-3">
                    <span class="font-mono text-xs uppercase tracking-[0.16em] text-moss-500">{activityLabels[item.type]}</span>
                    <span class="text-xs text-black/45">{fmtPercent(item.weight)}</span>
                  </div>
                  <h3 class="mt-3 text-base font-semibold text-ink-900">{item.title}</h3>
                  <div class="mt-4 flex flex-wrap gap-2">
                    {#each item.tags as tag}
                      <span class="rounded-full bg-moss-500/12 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-moss-500">{tag}</span>
                    {/each}
                  </div>
                </article>
              {/each}
            {:else if isLoading}
              <article class="signal-card rounded-2xl p-4">
                <p class="text-sm leading-6 text-black/60">Waiting for imported activity items to arrive.</p>
              </article>
            {/if}
          </div>
        </section>
      </div>
    </main>
  </div>
</div>
