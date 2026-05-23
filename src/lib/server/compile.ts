import { env } from '$env/dynamic/private';
import { demoActivity } from '$lib/compiler/demo';
import { buildDemoCompilation, compileActivity } from '$lib/compiler/synthesize';
import type {
  CompilationResult,
  CompilationSourceEvent,
  CompilationStatusEvent,
  ImportSummary,
  LlmSettings
} from '$lib/compiler/types';
import { DailyDevApiError, importDailyDevActivity } from '$lib/server/dailydev';
import { analyzeActivityWithLlm, resolveEffectiveLlmSettings } from '$lib/server/llm';

type FetchLike = typeof fetch;

type ProgressEvent = CompilationStatusEvent | CompilationSourceEvent;

function buildFallbackCompilation(
  activity: Parameters<typeof compileActivity>[0],
  importSummary: ImportSummary,
  warnings: string[]
): CompilationResult {
  const fallback = compileActivity(activity, {
    ...importSummary,
    warnings: [...importSummary.warnings, ...warnings]
  });
  fallback.generation = {
    strategy: 'deterministic',
    provider: 'none',
    warnings: [...importSummary.warnings, ...warnings]
  };
  return fallback;
}

async function compileFromActivity(input: {
  activity: Parameters<typeof compileActivity>[0];
  importSummary: ImportSummary;
  llmSettings: LlmSettings;
  profile: ImportSummary['profile'];
  emit: (event: ProgressEvent) => void | Promise<void>;
}): Promise<CompilationResult> {
  await input.emit({
    type: 'status',
    phase: 'synthesizing',
    message: 'Analyzing imported activity.'
  });

  if (input.llmSettings.provider !== 'none') {
    await input.emit({
      type: 'status',
      phase: 'refining',
      message: `Generating clusters and project with ${input.llmSettings.provider}${input.llmSettings.model ? ` (${input.llmSettings.model})` : ''}.`
    });
  }

  const llmResult = await analyzeActivityWithLlm({
    settings: input.llmSettings,
    profile: input.profile,
    activity: input.activity
  });

  if (llmResult.project && llmResult.clusters) {
    await input.emit({
      type: 'status',
      phase: 'complete',
      message: 'Compilation complete.'
    });

    return {
      activity: input.activity.slice(0, 12),
      clusters: llmResult.clusters,
      project: llmResult.project,
      importSummary: input.importSummary,
      generation: {
        strategy: 'llm',
        provider: llmResult.provider,
        model: llmResult.model,
        warnings: llmResult.warnings
      }
    };
  }

  const fallback = buildFallbackCompilation(input.activity, input.importSummary, [
    ...llmResult.warnings,
    'Falling back to deterministic analysis because the LLM output was incomplete.'
  ]);

  await input.emit({
    type: 'status',
    phase: 'complete',
    message: 'LLM analysis failed. Using deterministic fallback.'
  });

  return fallback;
}

export async function compileProjectRequest(input: {
  fetchFn: FetchLike;
  token?: string;
  forceDemo?: boolean;
  llm?: Partial<LlmSettings>;
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
}): Promise<CompilationResult> {
  const { fetchFn, token, forceDemo, llm, onProgress } = input;
  const effectiveToken = token?.trim() || env.DAILY_DEV_API_TOKEN?.trim() || '';
  const tokenSource = token?.trim() ? 'manual' : env.DAILY_DEV_API_TOKEN?.trim() ? 'server' : 'none';
  const llmSettings: LlmSettings = resolveEffectiveLlmSettings(llm);

  async function emit(event: ProgressEvent) {
    if (!onProgress) {
      return;
    }

    await onProgress(event);
  }

  if (forceDemo) {
    await emit({
      type: 'status',
      phase: 'starting',
      message: 'Using demo data.'
    });
    return compileFromActivity({
      activity: demoActivity,
      importSummary: {
        mode: 'demo',
        usedFallback: false,
        importedSources: ['demo bookmarks', 'demo history', 'demo stack'],
        importedCount: demoActivity.length,
        warnings: [],
        tokenSource: 'none',
        profile: null
      },
      llmSettings,
      profile: null,
      emit
    });
  }

  if (!effectiveToken) {
    await emit({
      type: 'status',
      phase: 'starting',
      message: 'No token found. Using demo data.'
    });
    return compileFromActivity({
      activity: demoActivity,
      importSummary: {
        mode: 'demo',
        usedFallback: false,
        importedSources: ['demo bookmarks', 'demo history', 'demo stack'],
        importedCount: demoActivity.length,
        warnings: ['No API token provided. Running in demo mode.'],
        tokenSource: 'none',
        profile: null
      },
      llmSettings,
      profile: null,
      emit
    });
  }

  await emit({
    type: 'status',
    phase: 'starting',
    message: 'Connecting to daily.dev.'
  });
  await emit({
    type: 'status',
    phase: 'importing',
    message: 'Importing daily.dev sources.'
  });

  try {
    const imported = await importDailyDevActivity(fetchFn, effectiveToken, async (progress) => {
      await emit({
        type: 'source',
        source: progress.source,
        status: progress.status,
        activity: progress.activity,
        importedCount: progress.importedCount,
        importedSources: progress.importedSources,
        warnings: progress.warnings,
        profile: progress.profile
      });
    });

    if (imported.activity.length === 0) {
      const fallback = buildDemoCompilation([
        ...imported.warnings,
        'Live import returned no usable content. Falling back to demo mode.'
      ]);
      fallback.importSummary.usedFallback = true;
      fallback.importSummary.tokenSource = tokenSource;
      await emit({
        type: 'status',
        phase: 'complete',
        message: 'Live import returned no usable content. Using demo data.'
      });
      return fallback;
    }

    const importSummary: ImportSummary = {
      mode: 'live',
      usedFallback: false,
      importedSources: imported.importedSources,
      importedCount: imported.activity.length,
      warnings: imported.warnings,
      tokenSource,
      profile: imported.profile
    };

    return compileFromActivity({
      activity: imported.activity,
      importSummary,
      llmSettings,
      profile: imported.profile,
      emit
    });
  } catch (error) {
    const warnings =
      error instanceof DailyDevApiError
        ? [`Live import failed (${error.status}). Falling back to demo mode.`]
        : ['Live import failed unexpectedly. Falling back to demo mode.'];

    const fallback = buildDemoCompilation(warnings);
    fallback.importSummary.usedFallback = true;
    fallback.importSummary.tokenSource = tokenSource;
    await emit({
      type: 'status',
      phase: 'complete',
      message: 'Live import failed. Using demo data.'
    });
    return fallback;
  }
}
