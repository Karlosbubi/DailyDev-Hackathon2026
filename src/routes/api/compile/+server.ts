import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { buildDemoCompilation, compileActivity } from '$lib/compiler/synthesize';
import type { LlmSettings } from '$lib/compiler/types';
import { DailyDevApiError, importDailyDevActivity } from '$lib/server/dailydev';
import { resolveEffectiveLlmSettings, refineProjectWithLlm } from '$lib/server/llm';

export async function POST({ request, fetch }) {
  const { token, forceDemo, llm } = (await request
    .json()
    .catch(() => ({ token: '', forceDemo: false, llm: undefined }))) as {
    token?: string;
    forceDemo?: boolean;
    llm?: Partial<LlmSettings>;
  };

  if (forceDemo) {
    const demo = buildDemoCompilation();
    demo.generation = {
      strategy: 'deterministic',
      provider: 'none',
      warnings: []
    };
    return json(demo);
  }

  const effectiveToken = token?.trim() || env.DAILY_DEV_API_TOKEN?.trim() || '';
  const tokenSource = token?.trim() ? 'manual' : env.DAILY_DEV_API_TOKEN?.trim() ? 'server' : 'none';

  if (!effectiveToken) {
    const demo = buildDemoCompilation(['No API token provided. Running in demo mode.']);
    demo.importSummary.tokenSource = 'none';
    return json(demo);
  }

  try {
    const imported = await importDailyDevActivity(fetch, effectiveToken);

    if (imported.activity.length === 0) {
      const fallback = buildDemoCompilation([
          ...imported.warnings,
          'Live import returned no usable content. Falling back to demo mode.'
        ]);
      fallback.importSummary.usedFallback = true;
      return json(fallback);
    }

    const compilation = compileActivity(imported.activity, {
      mode: 'live',
      usedFallback: false,
      importedSources: imported.importedSources,
      importedCount: imported.activity.length,
      warnings: imported.warnings,
      tokenSource,
      profile: imported.profile
    });

    const llmSettings: LlmSettings = resolveEffectiveLlmSettings(llm);

    const llmResult = await refineProjectWithLlm({
      settings: llmSettings,
      profile: imported.profile,
      activity: compilation.activity,
      clusters: compilation.clusters,
      project: compilation.project
    });

    if (llmResult.project) {
      compilation.project = {
        ...compilation.project,
        ...llmResult.project,
        rationale: llmResult.project.rationale ?? compilation.project.rationale
      };
      compilation.generation = {
        strategy: 'llm',
        provider: llmResult.provider,
        model: llmResult.model,
        warnings: llmResult.warnings
      };
    } else {
      compilation.generation = {
        strategy: 'deterministic',
        provider: llmResult.provider,
        model: llmResult.model,
        warnings: llmResult.warnings
      };
    }

    return json(compilation);
  } catch (error) {
    const warnings =
      error instanceof DailyDevApiError
        ? [`Live import failed (${error.status}). Falling back to demo mode.`]
        : ['Live import failed unexpectedly. Falling back to demo mode.'];

    const fallback = buildDemoCompilation(warnings);
    fallback.importSummary.usedFallback = true;
    fallback.importSummary.tokenSource = tokenSource;
    return json(fallback);
  }
}
