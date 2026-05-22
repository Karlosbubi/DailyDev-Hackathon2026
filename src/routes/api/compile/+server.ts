import { json } from '@sveltejs/kit';
import { buildDemoCompilation, compileActivity } from '$lib/compiler/synthesize';
import { DailyDevApiError, importDailyDevActivity } from '$lib/server/dailydev';

export async function POST({ request, fetch }) {
  const { token, forceDemo } = (await request
    .json()
    .catch(() => ({ token: '', forceDemo: false }))) as {
    token?: string;
    forceDemo?: boolean;
  };

  if (forceDemo) {
    return json(buildDemoCompilation());
  }

  if (!token?.trim()) {
    return json(buildDemoCompilation(['No API token provided. Running in demo mode.']));
  }

  try {
    const imported = await importDailyDevActivity(fetch, token);

    if (imported.activity.length === 0) {
      const fallback = buildDemoCompilation([
          ...imported.warnings,
          'Live import returned no usable content. Falling back to demo mode.'
        ]);
      fallback.importSummary.usedFallback = true;
      return json(fallback);
    }

    return json(
      compileActivity(imported.activity, {
        mode: 'live',
        usedFallback: false,
        importedSources: imported.importedSources,
        importedCount: imported.activity.length,
        warnings: imported.warnings
      })
    );
  } catch (error) {
    const warnings =
      error instanceof DailyDevApiError
        ? [`Live import failed (${error.status}). Falling back to demo mode.`]
        : ['Live import failed unexpectedly. Falling back to demo mode.'];

    const fallback = buildDemoCompilation(warnings);
    fallback.importSummary.usedFallback = true;
    return json(fallback);
  }
}
