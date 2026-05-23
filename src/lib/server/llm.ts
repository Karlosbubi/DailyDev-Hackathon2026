import { env } from '$env/dynamic/private';
import type {
  ActivityItem,
  Cluster,
  ImportedProfile,
  LlmProvider,
  LlmServerConfigSummary,
  LlmSettings,
  ProjectSpec
} from '$lib/compiler/types';

interface LlmResult {
  project?: Partial<ProjectSpec>;
  warnings: string[];
  provider: LlmProvider;
  model?: string;
  used: boolean;
}

interface LlmAnalysisResult {
  clusters?: Cluster[];
  project?: ProjectSpec;
  warnings: string[];
  provider: LlmProvider;
  model?: string;
  used: boolean;
}

interface LlmAnalysisPayload {
  clusters?: unknown;
  project?: unknown;
}

function readTimeoutMs(value: string | undefined, fallbackMs: number): number {
  const parsed = Number(value?.trim() || '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

const DEFAULT_LLM_TIMEOUT_MS = readTimeoutMs(env.LLM_TIMEOUT_MS, 60000);
const OPENAI_TIMEOUT_MS = readTimeoutMs(env.OPENAI_TIMEOUT_MS, 120000);
const COMPATIBLE_TIMEOUT_MS = readTimeoutMs(env.COMPATIBLE_TIMEOUT_MS, 120000);
const OLLAMA_TIMEOUT_MS = readTimeoutMs(env.OLLAMA_TIMEOUT_MS, 180000);

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
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length > 0) {
          const [key, val] = entries[0];
          return typeof val === 'string' && key.trim() && val.trim()
            ? ([key.trim(), val.trim()] as [string, string])
            : null;
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

function sanitizeProject(project: Partial<ProjectSpec>): ProjectSpec | null {
  const title = typeof project.title === 'string' ? project.title.trim() : '';
  const difficulty = typeof project.difficulty === 'string' ? project.difficulty.trim() : '';
  const timeline = typeof project.timeline === 'string' ? project.timeline.trim() : '';
  const summary = typeof project.summary === 'string' ? project.summary.trim() : '';
  const stack = trimList(project.stack);
  const architecture = trimPairList(project.architecture);
  const milestones = trimPairList(project.milestones);
  const learningGoals = trimList(project.learningGoals);
  const rationale = trimList(project.rationale);

  if (
    !title ||
    !difficulty ||
    !timeline ||
    summary.length < 40 ||
    stack.length < 3 ||
    architecture.length < 3 ||
    milestones.length < 3 ||
    learningGoals.length < 2 ||
    rationale.length < 2
  ) {
    return null;
  }

  return {
    title,
    difficulty,
    timeline,
    summary,
    stack,
    architecture,
    milestones,
    learningGoals,
    rationale
  };
}

function sanitizeClusters(value: unknown): Cluster[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const rawScore = typeof record.score === 'number' ? record.score : Number(record.score ?? 0);
      const score = Number.isFinite(rawScore) && rawScore > 0 ? Number(rawScore.toFixed(2)) : 0;
      const relatedTags = trimList(record.relatedTags);

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

function sanitizeAnalysis(payload: LlmAnalysisPayload | null): { clusters?: Cluster[]; project?: ProjectSpec } | null {
  if (!payload) {
    return null;
  }

  const project = sanitizeProject((payload.project ?? {}) as Partial<ProjectSpec>);
  const clusters = sanitizeClusters(payload.clusters);

  if (!project || clusters.length === 0) {
    return null;
  }

  return {
    clusters,
    project
  };
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
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
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

function buildAnalysisPrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
}): string {
  const compact = {
    profile: input.profile,
    activity: summarizeActivity(input.activity)
  };

  return [
    'Return one JSON object only.',
    'Analyze the developer profile and activity, then propose a concrete portfolio-worthy software project.',
    'Use the activity to infer 3 to 5 technical interest clusters and one project that directly fits those interests.',
    'Do not include markdown or commentary.',
    'Required top-level keys: clusters, project.',
    'clusters must be an array of objects with keys: name, score, relatedTags.',
    'Use numeric positive scores. relatedTags must be an array of strings.',
    'project must contain keys: title, difficulty, timeline, summary, stack, architecture, milestones, learningGoals, rationale.',
    'architecture and milestones must be arrays of [title, description] pairs.',
    'stack, learningGoals, and rationale must be arrays of strings.',
    'Avoid generic placeholder titles or boilerplate milestone names.',
    JSON.stringify(compact)
  ].join('\n');
}

function buildOllamaAnalysisPrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
}): string {
  const compact = {
    profile: input.profile
      ? {
          name: input.profile.name,
          username: input.profile.username,
          experienceLevel: input.profile.experienceLevel
        }
      : null,
    activity: summarizeActivity(input.activity)
  };

  return [
    'Output JSON only.',
    'Analyze the developer profile and activity.',
    'Return 3 to 5 interest clusters and one concrete portfolio project.',
    'Required top-level keys: clusters, project.',
    'Each cluster must have: name, score, relatedTags.',
    'The project must have: title, difficulty, timeline, summary, stack, architecture, milestones, learningGoals, rationale.',
    'For architecture and milestones, return arrays of two-item arrays like [["Name","Description"]].',
    'Do not use placeholder values like "Name", "Description", "Step", or "Project Recommendation".',
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
    'architecture and milestones must be arrays of [title, description] pairs.',
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
    'For architecture and milestones, return arrays of two-item arrays like [["Name","Description"]].',
    'Do not use placeholder values like "Name", "Description", "Step", or "Desc".',
    JSON.stringify(compact)
  ].join('\n');
}

async function requestOpenAiText(settings: LlmSettings, prompt: string): Promise<string | null> {
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
        text: {
          format: {
            type: 'json_object'
          }
        }
      })
    },
    OPENAI_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { output_text?: string };
  return payload.output_text ?? null;
}

async function requestCompatibleText(settings: LlmSettings, prompt: string): Promise<string | null> {
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
            content: 'Return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: {
          type: 'json_object'
        }
      })
    },
    COMPATIBLE_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Compatible API request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content ?? null;
}

async function requestOllamaText(settings: LlmSettings, prompt: string): Promise<string | null> {
  const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);

  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/chat`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        format: 'json',
        messages: [
          {
            role: 'system',
            content: 'Return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    },
    OLLAMA_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    message?: { content?: string };
  };

  return payload.message?.content ?? null;
}

async function requestProviderText(
  settings: LlmSettings,
  prompt: string
): Promise<{ text: string | null; provider: LlmProvider; model?: string; warnings: string[] }> {
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
      const text = await requestOpenAiText(settings, prompt);
      return {
        text,
        provider: 'openai',
        model: settings.model,
        warnings: text ? [] : ['OpenAI provider selected, but no API key was available.']
      };
    }

    if (settings.provider === 'compatible') {
      const text = await requestCompatibleText(settings, prompt);
      return {
        text,
        provider: 'compatible',
        model: settings.model,
        warnings: text ? [] : ['Compatible API provider requires both base URL and token.']
      };
    }

    const text = await requestOllamaText(settings, prompt);
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

export async function analyzeActivityWithLlm(input: {
  settings: LlmSettings;
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
}): Promise<LlmAnalysisResult> {
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
      ? buildOllamaAnalysisPrompt(input)
      : buildAnalysisPrompt(input);
  const response = await requestProviderText(input.settings, prompt);
  const parsed = safeJsonParse<LlmAnalysisPayload>(response.text ?? '');
  const sanitized = sanitizeAnalysis(parsed);

  return {
    clusters: sanitized?.clusters,
    project: sanitized?.project,
    warnings:
      sanitized
        ? response.warnings
        : [
            ...response.warnings,
            ...(response.text ? ['LLM analysis returned an unreadable project payload.'] : [])
          ],
    provider: response.provider,
    model: response.model,
    used: Boolean(sanitized)
  };
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
  const response = await requestProviderText(input.settings, prompt);
  const parsed = safeJsonParse<Partial<ProjectSpec>>(response.text ?? '');
  const sanitized = parsed ? sanitizeProject(parsed) : null;

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
