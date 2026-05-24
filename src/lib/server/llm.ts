import { env } from '$env/dynamic/private';
import type {
  ActivityItem,
  Cluster,
  ImportedProfile,
  LlmProvider,
  LlmServerConfigSummary,
  LlmSettings,
  RecommendationTier,
  ProjectSpec
} from '$lib/compiler/types';

interface LlmResult {
  project?: ProjectSpec;
  warnings: string[];
  provider: LlmProvider;
  model?: string;
  used: boolean;
}

interface LlmAnalysisPayload {
  clusters?: unknown;
  project?: unknown;
  recommendation?: unknown;
  projectRecommendation?: unknown;
}

interface LlmStageResult<T> {
  data?: T;
  warnings: string[];
  provider: LlmProvider;
  model?: string;
  used: boolean;
}

type VariantTitleMap = Partial<Record<RecommendationTier, string>>;

function readTimeoutMs(value: string | undefined, fallbackMs: number): number {
  const parsed = Number(value?.trim() || '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

const DEFAULT_LLM_TIMEOUT_MS = readTimeoutMs(env.LLM_TIMEOUT_MS, 60000);
const OPENAI_TIMEOUT_MS = readTimeoutMs(env.OPENAI_TIMEOUT_MS, 120000);
const COMPATIBLE_TIMEOUT_MS = readTimeoutMs(env.COMPATIBLE_TIMEOUT_MS, 120000);
const OLLAMA_TIMEOUT_MS = readTimeoutMs(env.OLLAMA_TIMEOUT_MS, 180000);
const WRITEUP_TIMEOUT_MS = readTimeoutMs(env.LLM_WRITEUP_TIMEOUT_MS, 300000);

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = DEFAULT_LLM_TIMEOUT_MS
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs)
  });
}

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

function trimList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean).slice(0, 8)
    : [];
}

function trimPairList(value: unknown): [string, string][] {
  if (!Array.isArray(value)) {
    return [];
  }

  const placeholderValues = new Set(['name', 'description', 'desc', 'step', 'title']);

  return value
    .map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const titleCandidate = [
          record.title,
          record.name,
          record.label,
          record.step,
          record.heading
        ].find((entry) => typeof entry === 'string' && entry.trim());
        const descriptionCandidate = [
          record.description,
          record.summary,
          record.detail,
          record.details,
          record.reason,
          record.value
        ].find((entry) => typeof entry === 'string' && entry.trim());

        if (typeof titleCandidate === 'string' && typeof descriptionCandidate === 'string') {
          return [titleCandidate.trim(), descriptionCandidate.trim()] as [string, string];
        }

        const entries = Object.entries(record).filter(([, val]) => typeof val === 'string' && val.trim());
        if (entries.length >= 2) {
          const [first, second] = entries;
          return [String(first[1]).trim(), String(second[1]).trim()] as [string, string];
        }
      }

      if (!Array.isArray(item) || item.length < 2) {
        return null;
      }

      const a = typeof item[0] === 'string' ? item[0].trim() : '';
      const b = typeof item[1] === 'string' ? item[1].trim() : '';
      return a && b ? ([a, b] as [string, string]) : null;
    })
    .filter((item): item is [string, string] => {
      if (!item) {
        return false;
      }

      const [a, b] = item;
      return !placeholderValues.has(a.toLowerCase()) && !placeholderValues.has(b.toLowerCase());
    })
    .slice(0, 6);
}

function normalizeProjectFields(project: Partial<ProjectSpec>): Partial<ProjectSpec> {
  const title = typeof project.title === 'string' ? project.title.trim() : '';
  const difficulty = typeof project.difficulty === 'string' ? project.difficulty.trim() : '';
  const timeline = typeof project.timeline === 'string' ? project.timeline.trim() : '';
  const summary = typeof project.summary === 'string' ? project.summary.trim() : '';
  const stack = trimList(project.stack);
  const architecture = trimPairList(project.architecture);
  const milestones = trimPairList(project.milestones);
  const learningGoals = trimList(project.learningGoals);
  const rationale = trimList(project.rationale);

  return {
    ...(title ? { title } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(timeline ? { timeline } : {}),
    ...(summary ? { summary } : {}),
    ...(stack.length ? { stack } : {}),
    ...(architecture.length ? { architecture } : {}),
    ...(milestones.length ? { milestones } : {}),
    ...(learningGoals.length ? { learningGoals } : {}),
    ...(rationale.length ? { rationale } : {})
  };
}

function countSentences(value: string): number {
  return value
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function summaryLooksGeneric(summary: string): boolean {
  const lower = summary.toLowerCase();
  const genericMarkers = [
    'portfolio project',
    'strongest current interests',
    'credible technical core',
    'implementation sprint',
    'platform for',
    'broad exploratory concept',
    'close enough to start building'
  ];
  const genericHits = genericMarkers.filter((marker) => lower.includes(marker)).length;
  const hasReleaseCue = /\b(first release|version one|v1)\b/.test(lower);
  const hasUserCue = /\b(for |helps |lets |allows |target user)\b/.test(lower);
  const hasWorkflowCue = /\b(ingest|compare|rank|triage|review|diagnose|track|export|queue|report|evaluate|normalize)\b/.test(lower);

  return genericHits >= 2 || countSentences(summary) < 3 || !hasReleaseCue || !hasUserCue || !hasWorkflowCue;
}

function sanitizeProject(project: Partial<ProjectSpec>): ProjectSpec | null {
  const normalized = normalizeProjectFields(project);

  if (
    !normalized.title ||
    !normalized.difficulty ||
    !normalized.timeline ||
    !normalized.summary ||
    normalized.summary.length < 80 ||
    summaryLooksGeneric(normalized.summary) ||
    !normalized.stack ||
    normalized.stack.length < 3 ||
    !normalized.architecture ||
    normalized.architecture.length < 2 ||
    !normalized.milestones ||
    normalized.milestones.length < 2 ||
    !normalized.learningGoals ||
    normalized.learningGoals.length < 2 ||
    !normalized.rationale ||
    normalized.rationale.length < 1
  ) {
    return null;
  }

  return normalized as ProjectSpec;
}

function mergeProjectWithBaseline(candidate: Partial<ProjectSpec>, baseline: ProjectSpec): ProjectSpec | null {
  const normalized = normalizeProjectFields(candidate);
  const merged: ProjectSpec = {
    title: normalized.title || baseline.title,
    difficulty: normalized.difficulty || baseline.difficulty,
    timeline: normalized.timeline || baseline.timeline,
    summary: normalized.summary || baseline.summary,
    stack: normalized.stack && normalized.stack.length > 0 ? normalized.stack : baseline.stack,
    architecture:
      normalized.architecture && normalized.architecture.length > 0
        ? normalized.architecture
        : baseline.architecture,
    milestones:
      normalized.milestones && normalized.milestones.length > 0
        ? normalized.milestones
        : baseline.milestones,
    learningGoals:
      normalized.learningGoals && normalized.learningGoals.length > 0
        ? normalized.learningGoals
        : baseline.learningGoals,
    rationale:
      normalized.rationale && normalized.rationale.length > 0
        ? normalized.rationale
        : baseline.rationale
  };

  return sanitizeProject(merged);
}

function sanitizeProjectFrame(project: Partial<ProjectSpec>): Partial<ProjectSpec> | null {
  const normalized = normalizeProjectFields(project);

  if (!normalized.title && !normalized.summary && !normalized.stack && !normalized.rationale) {
    return null;
  }

  if (normalized.summary && summaryLooksGeneric(normalized.summary)) {
    return {
      ...(normalized.title ? { title: normalized.title } : {}),
      ...(normalized.stack ? { stack: normalized.stack } : {}),
      ...(normalized.rationale ? { rationale: normalized.rationale } : {})
    };
  }

  return normalized;
}

function sanitizeProjectPlan(project: Partial<ProjectSpec>): Partial<ProjectSpec> | null {
  const normalized = normalizeProjectFields(project);

  if (!normalized.architecture && !normalized.milestones && !normalized.learningGoals) {
    return null;
  }

  return normalized;
}

function sanitizeProjectArchitecture(project: Partial<ProjectSpec>): Partial<ProjectSpec> | null {
  const record = project as Record<string, unknown>;
  const architectureCandidate =
    record.architecture ?? record.components ?? record.modules ?? record.systemShape ?? record.services;
  const normalized = normalizeProjectFields({
    ...(project as Record<string, unknown>),
    architecture: architectureCandidate
  } as Partial<ProjectSpec>);

  if (!normalized.architecture) {
    return null;
  }

  return {
    architecture: normalized.architecture
  };
}

function sanitizeProjectRoadmap(project: Partial<ProjectSpec>): Partial<ProjectSpec> | null {
  const normalized = normalizeProjectFields(project);

  if (!normalized.milestones && !normalized.learningGoals) {
    return null;
  }

  return {
    ...(normalized.milestones ? { milestones: normalized.milestones } : {}),
    ...(normalized.learningGoals ? { learningGoals: normalized.learningGoals } : {})
  };
}

function extractProjectCandidate(payload: unknown): Partial<ProjectSpec> | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as LlmAnalysisPayload & Partial<ProjectSpec>;
  return ((record.project ??
    record.recommendation ??
  record.projectRecommendation ??
    record) as Partial<ProjectSpec>) || null;
}

function normalizeScoreValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Number(value.toFixed(2));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const percentMatch = trimmed.match(/^(\d+(?:\.\d+)?)%$/);
    if (percentMatch) {
      const percent = Number(percentMatch[1]);
      if (Number.isFinite(percent) && percent > 0) {
        return Number((percent / 100).toFixed(2));
      }
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Number((numeric > 1 ? numeric / 100 : numeric).toFixed(2));
    }
  }

  return fallback;
}

function extractClusterArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  const candidates = [
    record.clusters,
    record.themes,
    record.interests,
    record.topics,
    record.groups,
    record.items,
    record.results,
    record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>).clusters : null,
    record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>).themes : null
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function sanitizeClusters(value: unknown): Cluster[] {
  const items = extractClusterArray(value);
  if (items.length === 0) {
    return [];
  }

  const total = items.length || 1;

  return items
    .map((item, index) => {
      const fallbackScore = Number((Math.max(0.35, 1 - index * 0.12)).toFixed(2));

      if (typeof item === 'string') {
        const name = item.trim();
        return name
          ? ({
              name,
              score: fallbackScore,
              relatedTags: []
            } satisfies Cluster)
          : null;
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const nameCandidate = [
        record.name,
        record.title,
        record.topic,
        record.cluster,
        record.label,
        record.theme
      ].find((entry) => typeof entry === 'string' && entry.trim());
      const name = typeof nameCandidate === 'string' ? nameCandidate.trim() : '';
      const score = normalizeScoreValue(
        record.score ?? record.confidence ?? record.weight ?? record.relevance ?? record.priority,
        fallbackScore
      );
      const relatedTags = trimList(
        record.relatedTags ??
          record.related_tags ??
          record.tags ??
          record.keywords ??
          record.examples ??
          record.signals ??
          record.topics
      );

      if (!name || score <= 0) {
        return null;
      }

      return {
        name,
        score,
        relatedTags: relatedTags.slice(0, 4)
      } satisfies Cluster;
    })
    .filter((item): item is Cluster => Boolean(item))
    .slice(0, 5);
}

function resolveOpenAiKey(override?: string): string {
  return override?.trim() || env.OPENAI_API_KEY?.trim() || env.OPEN_AI_API_TOKEN?.trim() || '';
}

function resolveServerProvider(): LlmProvider {
  const provider = env.LLM_PROVIDER?.trim().toLowerCase();
  if (provider === 'openai' || provider === 'ollama' || provider === 'compatible' || provider === 'none') {
    return provider;
  }

  if (resolveOpenAiKey()) {
    return 'openai';
  }

  return 'none';
}

function resolveServerModel(provider: LlmProvider): string {
  const providerSpecific =
    provider === 'ollama'
      ? env.OLLAMA_MODEL?.trim()
      : provider === 'compatible'
        ? env.COMPATIBLE_API_MODEL?.trim()
        : undefined;
  if (providerSpecific) {
    return providerSpecific;
  }

  const configured = env.LLM_MODEL?.trim();
  if (configured) {
    return configured;
  }

  if (provider === 'openai') {
    return 'gpt-5-mini';
  }

  if (provider === 'ollama') {
    return 'llama3.2:latest';
  }

  if (provider === 'compatible') {
    return 'gpt-4.1-mini';
  }

  return '';
}

function resolveServerBaseUrl(provider: LlmProvider): string | undefined {
  if (provider === 'ollama') {
    return env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434/api';
  }

  if (provider === 'compatible') {
    return env.COMPATIBLE_API_BASE_URL?.trim() || env.OPENAI_COMPATIBLE_BASE_URL?.trim() || undefined;
  }

  return undefined;
}

function normalizeOllamaBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl || 'http://127.0.0.1:11434/api').trim().replace(/\/$/, '');
  const internalized = trimmed
    .replace('http://localhost:11434', 'http://ollama:11434')
    .replace('http://127.0.0.1:11434', 'http://ollama:11434');
  return internalized.endsWith('/api') ? internalized : `${internalized}/api`;
}

function resolveServerApiToken(provider: LlmProvider): string | undefined {
  if (provider === 'openai') {
    return resolveOpenAiKey() || undefined;
  }

  if (provider === 'compatible') {
    return env.COMPATIBLE_API_TOKEN?.trim() || env.OPENAI_COMPATIBLE_API_TOKEN?.trim() || undefined;
  }

  return undefined;
}

function summarizeActivity(activity: ActivityItem[]): Array<{ title: string; tags: string[]; type: string; weight: number }> {
  return activity.slice(0, 12).map((item) => ({
    title: item.title,
    tags: item.tags.slice(0, 6),
    type: item.type,
    weight: item.weight
  }));
}

function buildEvidenceScaffold(activity: ActivityItem[], clusters: Cluster[]) {
  const repeatedTags = [...new Set(activity.flatMap((item) => item.tags.map((tag) => tag.trim()).filter(Boolean)))].slice(0, 6);
  const representativeSignals = activity.slice(0, 5).map((item) => item.title);
  const importedArtifacts = [
    activity.some((item) => item.type === 'bookmark') ? 'saved posts' : '',
    activity.some((item) => item.type === 'discussion') ? 'comments and vote signals' : '',
    activity.some((item) => item.type === 'stack') ? 'stack metadata' : '',
    activity.some((item) => item.type === 'profile') ? 'profile and experience context' : ''
  ].filter(Boolean);

  return {
    repeatedTags,
    representativeSignals,
    importedArtifacts,
    topClusters: clusters.slice(0, 3).map((cluster) => ({
      name: cluster.name,
      relatedTags: cluster.relatedTags
    }))
  };
}

function buildClusterPrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
}): string {
  const compact = {
    profile: input.profile
      ? {
          username: input.profile.username,
          bio: input.profile.bio,
          reputation: input.profile.reputation,
          experienceLevel: input.profile.experienceLevel
        }
      : null,
    activity: summarizeActivity(input.activity)
  };

  return [
    'Return one JSON object only.',
    'Infer 3 to 5 technical interest clusters from the developer activity.',
    'Required top-level key: clusters.',
    'Each cluster must be an object with name, score, relatedTags.',
    'Use short specific names and positive scores between 0 and 1.',
    'relatedTags must be arrays of strings.',
    'Example: {"clusters":[{"name":"AI tooling","score":0.91,"relatedTags":["llm","rag","agents"]},{"name":"Observability","score":0.74,"relatedTags":["tracing","metrics","workers"]}]}',
    'Output valid JSON only.',
    JSON.stringify(compact)
  ].join('\n');
}

function buildProjectFramePrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  steeringNote?: string;
}): string {
  const compact = {
    profile: input.profile,
    activity: summarizeActivity(input.activity).slice(0, 8),
    clusters: input.clusters,
    evidence: buildEvidenceScaffold(input.activity, input.clusters),
    steeringNote: input.steeringNote?.trim() || undefined
  };

  return [
    'Return one JSON object only.',
    'Propose one concrete software product the developer could realistically build next based on the clusters and activity.',
    'Required top-level key: project.',
    'project must contain: title, difficulty, timeline, summary, stack, rationale.',
    'stack and rationale must be arrays of strings.',
    'The title must name an actual product, tool, or system, not a broad topic.',
    'The summary must be 3 to 5 sentences and explicitly answer all of these:',
    '1. who the tool is for,',
    '2. what painful workflow or decision it improves,',
    '3. what the first release actually does end to end,',
    '4. what technical shape makes it interesting to build.',
    'The summary must contain the literal phrase "The first release should".',
    'The summary must name at least two concrete capabilities or workflows.',
    'The rationale array must contain exactly 3 short evidence-based reasons tied to clusters, tags, or imported activity.',
    'Do not use generic filler like "portfolio project", "strongest interests", "credible technical core", "implementation sprint", or "platform for X".',
    'Prefer concrete nouns like dashboard, reviewer, agent, queue, parser, indexer, benchmark runner, triage console, compiler, or workbench.',
    'Example: {"project":{"title":"Rust Build Regression Workbench","difficulty":"Intermediate","timeline":"2 to 3 weekends","summary":"Build a local diagnostics tool for developers who bounce between Rust performance articles, Linux internals, and CI debugging. The first release ingests benchmark runs, compiler timings, and profiling traces, then correlates regressions to dependency changes and build configuration shifts. It should let a single developer compare two revisions, annotate likely causes, and export a concise regression report. The interesting part is the analysis pipeline, not just the UI, because it has to normalize heterogeneous signals and rank plausible root causes.","stack":["Rust","SQLite","Tracing","SvelteKit"],"rationale":["Repeated Rust and Linux signals suggest interest in systems-level developer tooling.","Performance and productivity tags point toward instrumentation instead of content publishing.","Discussion and bookmark activity indicate sustained attention on debugging workflows."]}}',
    'Output valid JSON only.',
    JSON.stringify(compact)
  ].join('\n');
}

function buildProjectPlanPrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
}): string {
  const compact = {
    profile: input.profile,
    topActivity: summarizeActivity(input.activity).slice(0, 6),
    clusters: input.clusters.slice(0, 4),
    evidence: buildEvidenceScaffold(input.activity, input.clusters),
    project: {
      title: input.project.title,
      difficulty: input.project.difficulty,
      timeline: input.project.timeline,
      summary: input.project.summary,
      stack: input.project.stack,
      rationale: input.project.rationale
    }
  };

  return [
    'Return one JSON object only.',
    'Extend the project with an execution plan.',
    'Required top-level key: project.',
    'project must contain: architecture, milestones, learningGoals.',
    'architecture and milestones may be arrays of [title, description] pairs or arrays of objects with title and description keys.',
    'learningGoals must be an array of strings.',
    'Output valid JSON only.',
    JSON.stringify(compact)
  ].join('\n');
}

function buildProjectArchitecturePrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
  steeringNote?: string;
}): string {
  const compact = {
    profile: input.profile,
    topActivity: summarizeActivity(input.activity).slice(0, 5),
    clusters: input.clusters.slice(0, 4),
    evidence: buildEvidenceScaffold(input.activity, input.clusters),
    project: {
      title: input.project.title,
      difficulty: input.project.difficulty,
      timeline: input.project.timeline,
      summary: input.project.summary,
      stack: input.project.stack
    },
    steeringNote: input.steeringNote?.trim() || undefined
  };

  return [
    'Return one JSON object only.',
    'Extend the project with architecture notes.',
    'Required top-level key: project.',
    'project must contain: architecture.',
    'architecture may be arrays of [title, description] pairs or arrays of objects with title and description keys.',
    'Example: {"project":{"architecture":[["Ingestion API","Accepts input and validates payloads."],["Worker Pipeline","Processes jobs and updates read models."]]}}',
    'Keep each component concrete and implementation-oriented.',
    'Output valid JSON only.',
    JSON.stringify(compact)
  ].join('\n');
}

function buildProjectRoadmapPrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
  steeringNote?: string;
}): string {
  const compact = {
    profile: input.profile,
    topActivity: summarizeActivity(input.activity).slice(0, 5),
    clusters: input.clusters.slice(0, 4),
    evidence: buildEvidenceScaffold(input.activity, input.clusters),
    project: {
      title: input.project.title,
      difficulty: input.project.difficulty,
      timeline: input.project.timeline,
      summary: input.project.summary,
      stack: input.project.stack,
      architecture: input.project.architecture
    },
    steeringNote: input.steeringNote?.trim() || undefined
  };

  return [
    'Return one JSON object only.',
    'Extend the project with a roadmap and learning goals.',
    'Required top-level key: project.',
    'project must contain: milestones, learningGoals.',
    'milestones may be arrays of [title, description] pairs or arrays of objects with title and description keys.',
    'learningGoals must be an array of strings.',
    'Output valid JSON only.',
    JSON.stringify(compact)
  ].join('\n');
}

function buildVariantNamingPrompt(input: {
  profile: ImportedProfile | null | undefined;
  clusters: Cluster[];
  project: ProjectSpec;
  steeringNote?: string;
}): string {
  const compact = {
    profile: input.profile
      ? {
          username: input.profile.username,
          bio: input.profile.bio,
          experienceLevel: input.profile.experienceLevel
        }
      : null,
    clusters: input.clusters.slice(0, 4),
    evidence: buildEvidenceScaffold([], input.clusters),
    project: {
      title: input.project.title,
      difficulty: input.project.difficulty,
      timeline: input.project.timeline,
      summary: input.project.summary,
      stack: input.project.stack.slice(0, 6)
    },
    steeringNote: input.steeringNote?.trim() || undefined
  };

  return [
    'Return one JSON object only.',
    'Name three scoped variants of the same software project.',
    'Required top-level key: variants.',
    'variants must be an object with low, medium, and high keys.',
    'Each value must be a short project title string, not a sentence.',
    'Keep the names consistent with the same core product, but make them feel like distinct scopes.',
    'Avoid repeated trailing words like "Platform Platform".',
    'Do not force generic suffixes like Platform, Suite, or Starter unless they are clearly natural for the product.',
    'Prefer names that sound like believable tools a developer would actually build or use.',
    'Example: {"variants":{"low":"AI Ops Triage","medium":"AI Ops Control Plane","high":"AI Ops Deployment Orchestrator"}}',
    'Output valid JSON only.',
    JSON.stringify(compact)
  ].join('\n');
}

function buildProjectWriteupPrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
  steeringNote?: string;
}): string {
  const compact = {
    profile: input.profile
      ? {
          name: input.profile.name,
          username: input.profile.username,
          bio: input.profile.bio,
          experienceLevel: input.profile.experienceLevel
        }
      : null,
    topActivity: summarizeActivity(input.activity).slice(0, 8),
    clusters: input.clusters.slice(0, 4),
    evidence: buildEvidenceScaffold(input.activity, input.clusters),
    project: input.project,
    steeringNote: input.steeringNote?.trim() || undefined
  };

  return [
    'Write a detailed implementation brief for the proposed software project.',
    'Return plain text only. Do not return JSON or markdown code fences.',
    'Use 6 short sections with clear headings in sentence case.',
    'Cover: product framing, target user and workflow, system shape, implementation sequence, main risks and deliberate non-goals, and a concrete first build week.',
    'Be specific and practical. Reference the actual stack, milestones, architecture, and clusters.',
    'Name the core entities, one primary user path, and what the first release intentionally does not include.',
    'Avoid generic advice, motivational language, and phrases like "portfolio project" or "credible technical core".',
    'Keep the tone direct and technical, around 550 to 850 words.',
    JSON.stringify(compact)
  ].join('\n');
}

function buildRefinementPrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
}): string {
  const compact = {
    profile: input.profile,
    topActivity: summarizeActivity(input.activity),
    clusters: input.clusters,
    baselineProject: input.project
  };

  return [
    'Return one JSON object only.',
    'Refine the baseline software project so it better matches the developer profile and reading activity.',
    'Keep the output concrete, portfolio-worthy, and technically credible.',
    'Do not include markdown or commentary.',
    'Required keys: title, difficulty, timeline, summary, stack, architecture, milestones, learningGoals, rationale.',
    'architecture and milestones may be arrays of [title, description] pairs or arrays of objects with title and description keys.',
    'stack, learningGoals, and rationale must be arrays of strings.',
    JSON.stringify(compact)
  ].join('\n');
}

function buildOllamaRefinementPrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
}): string {
  const compact = {
    profile: input.profile
      ? {
          name: input.profile.name,
          username: input.profile.username,
          experienceLevel: input.profile.experienceLevel
        }
      : null,
    topActivity: summarizeActivity(input.activity).slice(0, 5),
    topClusters: input.clusters.slice(0, 3).map((cluster) => ({
      name: cluster.name,
      tags: cluster.relatedTags
    })),
    baselineProject: {
      title: input.project.title,
      summary: input.project.summary,
      stack: input.project.stack,
      rationale: input.project.rationale
    }
  };

  return [
    'Output JSON only.',
    'Refine the baseline project to better fit the developer profile and activity.',
    'Keep it concrete, technically credible, and portfolio-worthy.',
    'Required keys: title, difficulty, timeline, summary, stack, architecture, milestones, learningGoals, rationale.',
    'For architecture and milestones, return either [["Name","Description"]] arrays or [{"title":"Name","description":"Description"}] objects.',
    'Do not use placeholder values like "Name", "Description", "Step", or "Desc".',
    JSON.stringify(compact)
  ].join('\n');
}

function sanitizeVariantTitles(value: unknown): VariantTitleMap {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const record = value as Record<string, unknown>;
  const container =
    (record.variants && typeof record.variants === 'object' ? record.variants : null) ??
    (record.recommendations && typeof record.recommendations === 'object' ? record.recommendations : null) ??
    record;

  if (!container || typeof container !== 'object') {
    return {};
  }

  const output: VariantTitleMap = {};

  for (const tier of ['low', 'medium', 'high'] as RecommendationTier[]) {
    const candidate = (container as Record<string, unknown>)[tier];
    if (typeof candidate === 'string' && candidate.trim()) {
      output[tier] = candidate.trim().replace(/\s+/g, ' ');
      continue;
    }

    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      const titleCandidate = [nested.title, nested.name, nested.label].find(
        (entry) => typeof entry === 'string' && entry.trim()
      );
      if (typeof titleCandidate === 'string' && titleCandidate.trim()) {
        output[tier] = titleCandidate.trim().replace(/\s+/g, ' ');
      }
    }
  }

  return output;
}

function sanitizeWriteupText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return null;
  }

  const cleaned = normalized.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  const genericMarkers = [
    'build a portfolio project',
    'strongest current interests',
    'credible technical core',
    'implementation sprint',
    'another reading loop'
  ];
  const genericHitCount = genericMarkers.filter((marker) => cleaned.toLowerCase().includes(marker)).length;

  return cleaned.length >= 220 && genericHitCount < 3 ? cleaned : null;
}

async function requestOpenAiContent(
  settings: LlmSettings,
  prompt: string,
  options: {
    json: boolean;
    timeoutMs: number;
    maxOutputTokens: number;
    reasoningEffort: 'minimal' | 'low' | 'medium';
  }
): Promise<string | null> {
  const apiKey = resolveOpenAiKey(settings.apiToken);
  if (!apiKey) {
    return null;
  }

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        input: prompt,
        max_output_tokens: options.maxOutputTokens,
        reasoning: {
          effort: options.reasoningEffort
        },
        ...(options.json
          ? {
              text: {
                format: {
                  type: 'json_object'
                }
              }
            }
          : {})
      })
    },
    options.timeoutMs
  );

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        return content.text;
      }
    }
  }

  return null;
}

async function requestCompatibleContent(
  settings: LlmSettings,
  prompt: string,
  options: {
    json: boolean;
    timeoutMs: number;
    maxOutputTokens: number;
  }
): Promise<string | null> {
  const baseUrl = settings.baseUrl?.trim();
  const token = settings.apiToken?.trim();

  if (!baseUrl || !token) {
    return null;
  }

  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: 'system',
            content: options.json ? 'Return valid JSON only.' : 'Return plain text only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: options.maxOutputTokens,
        ...(options.json
          ? {
              response_format: {
                type: 'json_object'
              }
            }
          : {})
      })
    },
    options.timeoutMs
  );

  if (!response.ok) {
    throw new Error(`Compatible API request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content ?? null;
}

const ollamaModelPulls = new Map<string, Promise<void>>();

async function ensureOllamaModel(baseUrl: string, model: string, timeoutMs: number): Promise<void> {
  const key = `${baseUrl}::${model}`;
  const existing = ollamaModelPulls.get(key);

  if (existing) {
    await existing;
    return;
  }

  const pullPromise = (async () => {
    const tagsResponse = await fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/tags`,
      {
        method: 'GET'
      },
      timeoutMs
    );

    if (!tagsResponse.ok) {
      throw new Error(`Failed to query Ollama tags (${tagsResponse.status}).`);
    }

    const tagsPayload = (await tagsResponse.json()) as {
      models?: Array<{ name?: string }>;
    };
    const present = (tagsPayload.models ?? []).some((entry) => entry?.name === model);

    if (present) {
      return;
    }

    const pullResponse = await fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/pull`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          stream: false
        })
      },
      timeoutMs
    );

    if (!pullResponse.ok) {
      const body = await pullResponse.text().catch(() => '');
      throw new Error(`Failed to pull Ollama model ${model} (${pullResponse.status})${body ? `: ${body}` : '.'}`);
    }
  })();

  ollamaModelPulls.set(key, pullPromise);

  try {
    await pullPromise;
  } finally {
    ollamaModelPulls.delete(key);
  }
}

async function requestOllamaContent(
  settings: LlmSettings,
  prompt: string,
  options: {
    json: boolean;
    timeoutMs: number;
  }
): Promise<string | null> {
  const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
  const requestBody = {
    model: settings.model,
    stream: false,
    ...(options.json ? { format: 'json' } : {}),
    messages: [
      {
        role: 'system',
        content: options.json ? 'Return valid JSON only.' : 'Return plain text only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  const sendChat = () =>
    fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/chat`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      },
      options.timeoutMs
    );

  let response = await sendChat();

  if (response.status === 404) {
    await ensureOllamaModel(baseUrl, settings.model, options.timeoutMs);
    response = await sendChat();
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama request failed with status ${response.status}${body ? `: ${body}` : '.'}`);
  }

  const payload = (await response.json()) as {
    message?: { content?: string };
  };

  return payload.message?.content ?? null;
}

async function requestProviderText(
  settings: LlmSettings,
  prompt: string,
  options: {
    json?: boolean;
    timeoutMs?: number;
    maxOutputTokens?: number;
    reasoningEffort?: 'minimal' | 'low' | 'medium';
  } = {}
): Promise<{ text: string | null; provider: LlmProvider; model?: string; warnings: string[] }> {
  const useJson = options.json ?? true;
  const timeoutMs =
    options.timeoutMs ??
    (settings.provider === 'openai'
      ? OPENAI_TIMEOUT_MS
      : settings.provider === 'compatible'
        ? COMPATIBLE_TIMEOUT_MS
        : settings.provider === 'ollama'
          ? OLLAMA_TIMEOUT_MS
          : DEFAULT_LLM_TIMEOUT_MS);
  const maxOutputTokens = options.maxOutputTokens ?? (useJson ? 900 : 1600);
  const reasoningEffort = options.reasoningEffort ?? 'minimal';

  if (settings.provider === 'none') {
    return {
      text: null,
      provider: 'none',
      model: settings.model,
      warnings: []
    };
  }

  try {
    if (settings.provider === 'openai') {
      const text = await requestOpenAiContent(settings, prompt, {
        json: useJson,
        timeoutMs,
        maxOutputTokens,
        reasoningEffort
      });
      const hasApiKey = Boolean(resolveOpenAiKey(settings.apiToken));
      return {
        text,
        provider: 'openai',
        model: settings.model,
        warnings: text ? [] : hasApiKey ? [] : ['OpenAI provider selected, but no API key was available.']
      };
    }

    if (settings.provider === 'compatible') {
      const text = await requestCompatibleContent(settings, prompt, {
        json: useJson,
        timeoutMs,
        maxOutputTokens
      });
      return {
        text,
        provider: 'compatible',
        model: settings.model,
        warnings: text ? [] : ['Compatible API provider requires both base URL and token.']
      };
    }

    const text = await requestOllamaContent(settings, prompt, { json: useJson, timeoutMs });
    return {
      text,
      provider: 'ollama',
      model: settings.model,
      warnings: []
    };
  } catch (error) {
    return {
      text: null,
      provider: settings.provider,
      model: settings.model,
      warnings: [error instanceof Error ? error.message : 'LLM request failed.']
    };
  }
}

export function getDefaultLlmSettings(): LlmSettings {
  const provider = resolveServerProvider();
  return {
    provider,
    model: resolveServerModel(provider),
    baseUrl: resolveServerBaseUrl(provider),
    apiToken: resolveServerApiToken(provider)
  };
}

export function getServerLlmConfigSummary(): LlmServerConfigSummary {
  const settings = getDefaultLlmSettings();
  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    hasApiToken: Boolean(settings.apiToken)
  };
}

export function resolveEffectiveLlmSettings(override?: Partial<LlmSettings>): LlmSettings {
  const server = getDefaultLlmSettings();

  if (!override) {
    return server;
  }

  const provider = override.provider ?? server.provider;
  const shouldUseOverrideModel = Boolean(override.model?.trim());
  const shouldUseOverrideBaseUrl = Boolean(override.baseUrl?.trim());
  const shouldUseOverrideToken = Boolean(override.apiToken?.trim());

  return {
    provider,
    model: shouldUseOverrideModel ? override.model!.trim() : resolveServerModel(provider) || server.model,
    baseUrl: shouldUseOverrideBaseUrl ? override.baseUrl!.trim() : resolveServerBaseUrl(provider) || server.baseUrl,
    apiToken: shouldUseOverrideToken
      ? override.apiToken!.trim()
      : provider === server.provider
        ? server.apiToken
        : resolveServerApiToken(provider)
  };
}

export async function inferClustersWithLlm(input: {
  settings: LlmSettings;
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
}): Promise<LlmStageResult<Cluster[]>> {
  if (input.settings.provider === 'none') {
    return {
      warnings: [],
      provider: 'none',
      model: input.settings.model,
      used: false
    };
  }

  const prompt = buildClusterPrompt(input);
  const response = await requestProviderText(input.settings, prompt, {
    maxOutputTokens: 700,
    reasoningEffort: 'minimal'
  });
  const parsed = safeJsonParse<Record<string, unknown> | unknown[]>(response.text ?? '');
  const clusters = sanitizeClusters(parsed);

  return {
    data: clusters.length > 0 ? clusters : undefined,
    warnings:
      clusters.length > 0
        ? response.warnings.filter((warning) => !warning.includes('cluster stage returned unreadable output'))
        : [...response.warnings, ...(response.text ? ['LLM cluster stage returned unreadable output.'] : [])],
    provider: response.provider,
    model: response.model,
    used: clusters.length > 0
  };
}

export async function draftProjectFrameWithLlm(input: {
  settings: LlmSettings;
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  steeringNote?: string;
}): Promise<LlmStageResult<Partial<ProjectSpec>>> {
  if (input.settings.provider === 'none') {
    return {
      warnings: [],
      provider: 'none',
      model: input.settings.model,
      used: false
    };
  }

  const prompt = buildProjectFramePrompt(input);
  const response = await requestProviderText(input.settings, prompt, {
    maxOutputTokens: 1400,
    reasoningEffort: 'minimal'
  });
  const parsed = safeJsonParse<Record<string, unknown>>(response.text ?? '');
  const candidate = extractProjectCandidate(parsed);
  const project = candidate ? sanitizeProjectFrame(candidate) : null;

  return {
    data: project ?? undefined,
    warnings:
      project
        ? response.warnings
        : [...response.warnings, ...(response.text ? ['LLM project stage returned unreadable output.'] : [])],
    provider: response.provider,
    model: response.model,
    used: Boolean(project)
  };
}

export async function draftProjectPlanWithLlm(input: {
  settings: LlmSettings;
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
}): Promise<LlmStageResult<Partial<ProjectSpec>>> {
  if (input.settings.provider === 'none') {
    return {
      warnings: [],
      provider: 'none',
      model: input.settings.model,
      used: false
    };
  }

  const prompt = buildProjectPlanPrompt(input);
  const response = await requestProviderText(input.settings, prompt, {
    maxOutputTokens: 1400,
    reasoningEffort: 'minimal'
  });
  const parsed = safeJsonParse<Record<string, unknown>>(response.text ?? '');
  const candidate = extractProjectCandidate(parsed);
  const project = candidate ? sanitizeProjectPlan(candidate) : null;

  return {
    data: project ?? undefined,
    warnings:
      project
        ? response.warnings
        : [...response.warnings, ...(response.text ? ['LLM planning stage returned unreadable output.'] : [])],
    provider: response.provider,
    model: response.model,
    used: Boolean(project)
  };
}

export async function draftProjectArchitectureWithLlm(input: {
  settings: LlmSettings;
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
  steeringNote?: string;
}): Promise<LlmStageResult<Partial<ProjectSpec>>> {
  if (input.settings.provider === 'none') {
    return {
      warnings: [],
      provider: 'none',
      model: input.settings.model,
      used: false
    };
  }

  const prompt = buildProjectArchitecturePrompt(input);
  const response = await requestProviderText(input.settings, prompt, {
    maxOutputTokens: 1100,
    reasoningEffort: 'minimal'
  });
  const parsed = safeJsonParse<Record<string, unknown>>(response.text ?? '');
  const candidate = extractProjectCandidate(parsed);
  const project = candidate ? sanitizeProjectArchitecture(candidate) : null;

  return {
    data: project ?? undefined,
    warnings:
      project
        ? response.warnings
        : [...response.warnings, ...(response.text ? ['LLM architecture stage returned unreadable output.'] : [])],
    provider: response.provider,
    model: response.model,
    used: Boolean(project)
  };
}

export async function draftProjectRoadmapWithLlm(input: {
  settings: LlmSettings;
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
  steeringNote?: string;
}): Promise<LlmStageResult<Partial<ProjectSpec>>> {
  if (input.settings.provider === 'none') {
    return {
      warnings: [],
      provider: 'none',
      model: input.settings.model,
      used: false
    };
  }

  const prompt = buildProjectRoadmapPrompt(input);
  const response = await requestProviderText(input.settings, prompt, {
    maxOutputTokens: 1100,
    reasoningEffort: 'minimal'
  });
  const parsed = safeJsonParse<Record<string, unknown>>(response.text ?? '');
  const candidate = extractProjectCandidate(parsed);
  const project = candidate ? sanitizeProjectRoadmap(candidate) : null;

  return {
    data: project ?? undefined,
    warnings:
      project
        ? response.warnings
        : [...response.warnings, ...(response.text ? ['LLM roadmap stage returned unreadable output.'] : [])],
    provider: response.provider,
    model: response.model,
    used: Boolean(project)
  };
}

export async function nameProjectVariantsWithLlm(input: {
  settings: LlmSettings;
  profile: ImportedProfile | null | undefined;
  clusters: Cluster[];
  project: ProjectSpec;
  steeringNote?: string;
}): Promise<LlmStageResult<VariantTitleMap>> {
  if (input.settings.provider === 'none') {
    return {
      warnings: [],
      provider: 'none',
      model: input.settings.model,
      used: false
    };
  }

  const prompt = buildVariantNamingPrompt(input);
  const response = await requestProviderText(input.settings, prompt, {
    maxOutputTokens: 420,
    reasoningEffort: 'minimal'
  });
  const parsed = safeJsonParse<Record<string, unknown>>(response.text ?? '');
  const variants = sanitizeVariantTitles(parsed);

  return {
    data: Object.keys(variants).length > 0 ? variants : undefined,
    warnings: variants.low || variants.medium || variants.high ? response.warnings : [],
    provider: response.provider,
    model: response.model,
    used: Boolean(variants.low || variants.medium || variants.high)
  };
}

export async function draftProjectWriteupWithLlm(input: {
  settings: LlmSettings;
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
  steeringNote?: string;
}): Promise<LlmStageResult<string>> {
  if (input.settings.provider === 'none') {
    return {
      warnings: [],
      provider: 'none',
      model: input.settings.model,
      used: false
    };
  }

  const prompt = buildProjectWriteupPrompt(input);
  const response = await requestProviderText(input.settings, prompt, {
    json: false,
    timeoutMs: WRITEUP_TIMEOUT_MS,
    maxOutputTokens: 2200,
    reasoningEffort: 'minimal'
  });
  const writeup = sanitizeWriteupText(response.text);

  return {
    data: writeup ?? undefined,
    warnings:
      writeup
        ? response.warnings
        : [...response.warnings, ...(response.text ? ['LLM writeup stage returned unreadable output.'] : [])],
    provider: response.provider,
    model: response.model,
    used: Boolean(writeup)
  };
}

export function mergeProjectDrafts(baseline: ProjectSpec, ...partials: Array<Partial<ProjectSpec> | undefined>): ProjectSpec | null {
  let current: ProjectSpec = baseline;

  for (const partial of partials) {
    if (!partial) {
      continue;
    }

    const merged = mergeProjectWithBaseline(partial, current);
    if (merged) {
      current = merged;
    }
  }

  return sanitizeProject(current);
}

export async function refineProjectWithLlm(input: {
  settings: LlmSettings;
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
}): Promise<LlmResult> {
  if (input.settings.provider === 'none') {
    return {
      warnings: [],
      provider: 'none',
      model: input.settings.model,
      used: false
    };
  }

  const prompt =
    input.settings.provider === 'ollama'
      ? buildOllamaRefinementPrompt(input)
      : buildRefinementPrompt(input);
  const response = await requestProviderText(input.settings, prompt, {
    maxOutputTokens: 1600,
    reasoningEffort: 'minimal'
  });
  const parsed = safeJsonParse<Partial<ProjectSpec> & { project?: Partial<ProjectSpec> }>(response.text ?? '');
  const sanitized = parsed
    ? mergeProjectWithBaseline((parsed.project ?? parsed) as Partial<ProjectSpec>, input.project)
    : null;

  return {
    project: sanitized ?? undefined,
    warnings:
      sanitized
        ? response.warnings
        : [
            ...response.warnings,
            ...(response.text ? ['LLM refinement returned an unreadable project payload.'] : [])
          ],
    provider: response.provider,
    model: response.model,
    used: Boolean(sanitized)
  };
}
