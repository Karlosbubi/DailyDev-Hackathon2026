import { env } from '$env/dynamic/private';
import type {
  ActivityItem,
  Cluster,
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

interface ImportedProfile {
  name: string;
  username?: string;
  bio?: string;
  reputation?: number;
  experienceLevel?: string;
}

const DEFAULT_LLM_TIMEOUT_MS = 15000;
const OLLAMA_TIMEOUT_MS = 45000;

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
      const aNorm = a.toLowerCase();
      const bNorm = b.toLowerCase();

      if (placeholderValues.has(aNorm) || placeholderValues.has(bNorm)) {
        return false;
      }

      return true;
    })
    .slice(0, 6);
}

function sanitizeProject(project: Partial<ProjectSpec>): Partial<ProjectSpec> | null {
  const next: Partial<ProjectSpec> = {};

  if (typeof project.title === 'string' && project.title.trim()) {
    next.title = project.title.trim();
  }

  if (typeof project.difficulty === 'string' && project.difficulty.trim()) {
    next.difficulty = project.difficulty.trim();
  }

  if (typeof project.timeline === 'string' && project.timeline.trim()) {
    next.timeline = project.timeline.trim();
  }

  if (typeof project.summary === 'string' && project.summary.trim()) {
    next.summary = project.summary.trim();
  }

  const stack = trimList(project.stack);
  if (stack.length > 0) {
    next.stack = stack;
  }

  const architecture = trimPairList(project.architecture);
  if (architecture.length > 0) {
    next.architecture = architecture;
  }

  const milestones = trimPairList(project.milestones);
  if (milestones.length > 0) {
    next.milestones = milestones;
  }

  const learningGoals = trimList(project.learningGoals);
  if (learningGoals.length > 0) {
    next.learningGoals = learningGoals;
  }

  const rationale = trimList(project.rationale);
  if (rationale.length > 0) {
    next.rationale = rationale;
  }

  return Object.keys(next).length > 0 ? next : null;
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
    provider === 'ollama' ? env.OLLAMA_MODEL?.trim() : provider === 'compatible' ? env.COMPATIBLE_API_MODEL?.trim() : undefined;
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

function buildPrompt(input: {
  profile: ImportedProfile | null | undefined;
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
}): string {
  const compact = {
    profile: input.profile,
    topActivity: input.activity.map((item) => ({
      title: item.title,
      tags: item.tags,
      type: item.type
    })),
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

function buildOllamaPrompt(input: {
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
    topActivity: input.activity.slice(0, 5).map((item) => ({
      title: item.title,
      tags: item.tags
    })),
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

async function callOpenAi(settings: LlmSettings, prompt: string): Promise<LlmResult> {
  const apiKey = resolveOpenAiKey(settings.apiToken);
  if (!apiKey) {
    return {
      warnings: ['OpenAI provider selected, but no API key was available.'],
      provider: 'openai',
      model: settings.model,
      used: false
    };
  }

  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
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
  });

  if (!response.ok) {
    return {
      warnings: [`OpenAI request failed with status ${response.status}.`],
      provider: 'openai',
      model: settings.model,
      used: false
    };
  }

  const payload = (await response.json()) as {
    output_text?: string;
  };

  const parsed = safeJsonParse<Partial<ProjectSpec>>(payload.output_text ?? '');
  const sanitized = parsed ? sanitizeProject(parsed) : null;

  return {
    project: sanitized ?? undefined,
    warnings: sanitized ? [] : ['OpenAI returned an unreadable project payload.'],
    provider: 'openai',
    model: settings.model,
    used: Boolean(sanitized)
  };
}

async function callCompatible(settings: LlmSettings, prompt: string): Promise<LlmResult> {
  const baseUrl = settings.baseUrl?.trim();
  const token = settings.apiToken?.trim();

  if (!baseUrl || !token) {
    return {
      warnings: ['Compatible API provider requires both base URL and token.'],
      provider: 'compatible',
      model: settings.model,
      used: false
    };
  }

  const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
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
  });

  if (!response.ok) {
    return {
      warnings: [`Compatible API request failed with status ${response.status}.`],
      provider: 'compatible',
      model: settings.model,
      used: false
    };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = payload.choices?.[0]?.message?.content ?? '';
  const parsed = safeJsonParse<Partial<ProjectSpec>>(text);
  const sanitized = parsed ? sanitizeProject(parsed) : null;

  return {
    project: sanitized ?? undefined,
    warnings: sanitized ? [] : ['Compatible API returned an unreadable project payload.'],
    provider: 'compatible',
    model: settings.model,
    used: Boolean(sanitized)
  };
}

async function callOllama(settings: LlmSettings, prompt: string): Promise<LlmResult> {
  const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);

  const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/chat`, {
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
  }, OLLAMA_TIMEOUT_MS);

  if (!response.ok) {
    return {
      warnings: [`Ollama request failed with status ${response.status}.`],
      provider: 'ollama',
      model: settings.model,
      used: false
    };
  }

  const payload = (await response.json()) as {
    message?: { content?: string };
  };

  const parsed = safeJsonParse<Partial<ProjectSpec>>(payload.message?.content ?? '');
  const sanitized = parsed ? sanitizeProject(parsed) : null;

  return {
    project: sanitized ?? undefined,
    warnings: sanitized ? [] : ['Ollama returned an unreadable project payload.'],
    provider: 'ollama',
    model: settings.model,
    used: Boolean(sanitized)
  };
}

export function getDefaultLlmSettings(): LlmSettings {
  return {
    provider: resolveServerProvider(),
    model: resolveServerModel(resolveServerProvider()),
    baseUrl: resolveServerBaseUrl(resolveServerProvider()),
    apiToken: resolveServerApiToken(resolveServerProvider())
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
      used: false
    };
  }

  if (input.settings.provider === 'openai') {
    const prompt = buildPrompt(input);
    try {
      return await callOpenAi(input.settings, prompt);
    } catch (error) {
      return {
        warnings: [
          error instanceof Error
            ? `OpenAI refinement failed: ${error.name === 'TimeoutError' ? 'request timed out' : error.message}.`
            : 'OpenAI refinement failed unexpectedly.'
        ],
        provider: 'openai',
        model: input.settings.model,
        used: false
      };
    }
  }

  if (input.settings.provider === 'compatible') {
    const prompt = buildPrompt(input);
    try {
      return await callCompatible(input.settings, prompt);
    } catch (error) {
      return {
        warnings: [
          error instanceof Error
            ? `Compatible API refinement failed: ${error.name === 'TimeoutError' ? 'request timed out' : error.message}.`
            : 'Compatible API refinement failed unexpectedly.'
        ],
        provider: 'compatible',
        model: input.settings.model,
        used: false
      };
    }
  }

  try {
    return await callOllama(input.settings, buildOllamaPrompt(input));
  } catch (error) {
    return {
      warnings: [
        error instanceof Error
          ? `Ollama refinement failed: ${error.name === 'TimeoutError' ? 'request timed out' : error.message}.`
          : 'Ollama refinement failed unexpectedly.'
      ],
      provider: 'ollama',
      model: input.settings.model,
      used: false
    };
  }
}
