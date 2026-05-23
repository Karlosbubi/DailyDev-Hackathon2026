import { demoActivity } from '$lib/compiler/demo';
import {
  buildProjectRecommendations,
  buildDemoCompilation,
  clusterTopics,
  compileActivity,
  synthesizeProject
} from '$lib/compiler/synthesize';
import type {
  CompilationAnalysisEvent,
  Cluster,
  CompilationResult,
  CompilationSourceEvent,
  CompilationStatusEvent,
  CompilationWriteupEvent,
  ImportSummary,
  ProjectSpec,
  LlmSettings
} from '$lib/compiler/types';
import { DailyDevApiError, importDailyDevActivity } from '$lib/server/dailydev';
import {
  draftProjectArchitectureWithLlm,
  draftProjectFrameWithLlm,
  draftProjectRoadmapWithLlm,
  draftProjectWriteupWithLlm,
  inferClustersWithLlm,
  mergeProjectDrafts,
  nameProjectVariantsWithLlm,
  resolveEffectiveLlmSettings
} from '$lib/server/llm';

type FetchLike = typeof fetch;

type ProgressEvent =
  | CompilationStatusEvent
  | CompilationSourceEvent
  | CompilationAnalysisEvent
  | CompilationWriteupEvent;

function buildProjectWriteup(project: ProjectSpec, clusters: Cluster[]): string {
  const clusterLine = clusters.slice(0, 3).map((cluster) => cluster.name).join(', ') || 'developer tooling';
  const stackLine = project.stack.join(', ');
  const firstMilestone = project.milestones[0];
  const secondMilestone = project.milestones[1];
  const primaryRisk = project.architecture[0];

  return [
    'Project framing',
    `${project.title} is strongest when treated as a focused build rather than a broad concept piece. The combination of ${clusterLine} points toward a system that should demonstrate credible technical depth quickly, using ${stackLine} as the visible implementation backbone.`,
    '',
    'Why this fits',
    `The recommendation aligns with the current signal set because it turns repeated topic interest into an artifact with operational edges. Instead of another reading loop, the project forces decisions around scope, interfaces, instrumentation, and delivery, which is where the learning value actually compounds.`,
    '',
    'Implementation sequence',
    `${firstMilestone ? `${firstMilestone[0]} should happen first: ${firstMilestone[1]}` : 'Start by defining the narrowest vertical slice.'} ${secondMilestone ? `${secondMilestone[0]} follows next: ${secondMilestone[1]}` : 'Then add the next major workflow boundary.'} After that, the remaining milestones should tighten observability, workflow quality, and operator usability instead of introducing a second product idea halfway through.`,
    '',
    'Risks and tradeoffs',
    `${primaryRisk ? `${primaryRisk[0]} is the first place complexity can sprawl, because ${primaryRisk[1].toLowerCase()}` : 'The largest risk is uncontrolled scope growth.'} The main tradeoff is between shipping a narrow but believable system and overreaching into platform-level ambitions before the core loop is proven.`,
    '',
    'First build week',
    `In the first week, establish the repo structure, stub the primary domain model, wire the first storage or transport boundary, and make one milestone executable end to end. The goal is not polish. The goal is to prove that the project summary, stack, and roadmap describe a system that can survive contact with real implementation work.`
  ].join('\n');
}

async function streamWriteup(
  writeup: string,
  emit: (event: ProgressEvent) => void | Promise<void>
): Promise<void> {
  const paragraphs = writeup
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  let content = '';

  for (const paragraph of paragraphs) {
    content = content ? `${content}\n\n${paragraph}` : paragraph;
    await emit({
      type: 'writeup',
      chunk: paragraph,
      content,
      done: false
    });
  }

  await emit({
    type: 'writeup',
    chunk: '',
    content,
    done: true
  });
}

function buildFallbackCompilation(
  activity: Parameters<typeof compileActivity>[0],
  importSummary: ImportSummary,
  warnings: string[]
): CompilationResult {
  const generationWarnings = [...new Set(warnings)];
  const fallback = compileActivity(activity, importSummary);
  fallback.projectWriteup = buildProjectWriteup(fallback.project, fallback.clusters);
  fallback.generation = {
    strategy: 'deterministic',
    provider: 'none',
    warnings: generationWarnings
  };
  return fallback;
}

function buildDeterministicDraft(activity: Parameters<typeof compileActivity>[0]): {
  clusters: Cluster[];
  project: ProjectSpec;
  recommendations: ReturnType<typeof buildProjectRecommendations>;
} {
  const clusters = clusterTopics(activity);
  const project = synthesizeProject(clusters, activity);
  const recommendations = buildProjectRecommendations(project);
  return { clusters, project, recommendations };
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
      message: `Running staged LLM analysis with ${input.llmSettings.provider}${input.llmSettings.model ? ` (${input.llmSettings.model})` : ''}.`
    });
  }

  const deterministicDraft = buildDeterministicDraft(input.activity);

  if (input.llmSettings.provider === 'none') {
    const fallback = buildFallbackCompilation(input.activity, input.importSummary, []);
    await streamWriteup(fallback.projectWriteup, input.emit);
    await input.emit({
      type: 'status',
      phase: 'complete',
      message: 'No LLM provider is available. Using fallback analysis.'
    });
    return fallback;
  }

  const allWarnings: string[] = [];

  const clusterStage = await inferClustersWithLlm({
    settings: input.llmSettings,
    profile: input.profile,
    activity: input.activity
  });
  allWarnings.push(...clusterStage.warnings);
  const resolvedClusters = clusterStage.data?.length ? clusterStage.data : deterministicDraft.clusters;

  await input.emit({
    type: 'analysis',
    stage: 'clusters',
    status: clusterStage.data?.length ? 'success' : clusterStage.warnings.length ? 'partial' : 'error',
    message: clusterStage.data?.length
      ? 'Cluster inference complete.'
      : 'Cluster inference was incomplete. Using draft clusters as scaffolding.',
    clusters: resolvedClusters,
    warnings: clusterStage.warnings
  });

  await input.emit({
    type: 'status',
    phase: 'refining',
    message: 'Framing a project direction from the inferred clusters.'
  });

  const frameStage = await draftProjectFrameWithLlm({
    settings: input.llmSettings,
    profile: input.profile,
    activity: input.activity,
    clusters: resolvedClusters
  });
  allWarnings.push(...frameStage.warnings);

  const framedProject =
    mergeProjectDrafts(deterministicDraft.project, frameStage.data) ?? deterministicDraft.project;

  await input.emit({
    type: 'analysis',
    stage: 'project',
    status: frameStage.data ? 'success' : frameStage.warnings.length ? 'partial' : 'error',
    message: frameStage.data
      ? 'Project framing complete.'
      : 'Project framing was incomplete. Filling gaps from the draft project.',
    clusters: resolvedClusters,
    project: framedProject,
    warnings: frameStage.warnings
  });

  await input.emit({
    type: 'status',
    phase: 'refining',
    message: 'Designing the system architecture.'
  });

  const architectureStage = await draftProjectArchitectureWithLlm({
    settings: input.llmSettings,
    profile: input.profile,
    activity: input.activity,
    clusters: resolvedClusters,
    project: framedProject
  });
  allWarnings.push(...architectureStage.warnings);
  const architectedProject =
    mergeProjectDrafts(framedProject, architectureStage.data) ?? framedProject;

  await input.emit({
    type: 'analysis',
    stage: 'architecture',
    status: architectureStage.data ? 'success' : architectureStage.warnings.length ? 'partial' : 'error',
    message: architectureStage.data
      ? 'Architecture design complete.'
      : 'Architecture stage was incomplete. Reusing draft system shape where needed.',
    clusters: resolvedClusters,
    project: architectedProject,
    warnings: architectureStage.warnings
  });

  await input.emit({
    type: 'status',
    phase: 'refining',
    message: 'Sequencing milestones and learning goals.'
  });

  const roadmapStage = await draftProjectRoadmapWithLlm({
    settings: input.llmSettings,
    profile: input.profile,
    activity: input.activity,
    clusters: resolvedClusters,
    project: architectedProject
  });
  allWarnings.push(...roadmapStage.warnings);

  const finalProject = mergeProjectDrafts(architectedProject, roadmapStage.data);

  await input.emit({
    type: 'analysis',
    stage: 'roadmap',
    status: roadmapStage.data ? 'success' : roadmapStage.warnings.length ? 'partial' : 'error',
    message: roadmapStage.data
      ? 'Execution roadmap complete.'
      : 'Roadmap stage was incomplete. Reusing draft execution details where needed.',
    clusters: resolvedClusters,
    project: finalProject ?? architectedProject,
    warnings: roadmapStage.warnings
  });

  if (finalProject) {
    const variantNamingStage = await nameProjectVariantsWithLlm({
      settings: input.llmSettings,
      profile: input.profile,
      clusters: resolvedClusters,
      project: finalProject
    });
    const recommendations = buildProjectRecommendations(finalProject, variantNamingStage.data);
    await input.emit({
      type: 'analysis',
      stage: 'variants',
      status: recommendations.length > 0 ? 'success' : variantNamingStage.warnings.length ? 'partial' : 'error',
      message: recommendations.length > 0
        ? 'Effort variants prepared.'
        : 'Variant naming was incomplete. Reusing draft effort bands.',
      project: finalProject,
      recommendations,
      warnings: variantNamingStage.warnings
    });
    await input.emit({
      type: 'status',
      phase: 'refining',
      message: 'Writing the final implementation brief.'
    });
    const writeupStage = await draftProjectWriteupWithLlm({
      settings: input.llmSettings,
      profile: input.profile,
      activity: input.activity,
      clusters: resolvedClusters,
      project: finalProject
    });
    allWarnings.push(...writeupStage.warnings);
    const projectWriteup = writeupStage.data ?? buildProjectWriteup(finalProject, resolvedClusters);
    await input.emit({
      type: 'analysis',
      stage: 'writeup',
      status: writeupStage.data ? 'success' : writeupStage.warnings.length ? 'partial' : 'error',
      message: writeupStage.data
        ? 'Implementation brief complete.'
        : 'Writeup stage was incomplete. Using generated draft brief.',
      project: finalProject,
      warnings: writeupStage.warnings
    });
    await streamWriteup(projectWriteup, input.emit);
    await input.emit({
      type: 'status',
      phase: 'complete',
      message: 'Compilation complete.'
    });

    return {
      activity: input.activity.slice(0, 12),
      clusters: resolvedClusters,
      project: finalProject,
      recommendations,
      projectWriteup,
      importSummary: input.importSummary,
      generation: {
        strategy: 'llm',
        provider:
          writeupStage.provider ||
          roadmapStage.provider ||
          architectureStage.provider ||
          frameStage.provider ||
          clusterStage.provider,
        model:
          writeupStage.model ||
          roadmapStage.model ||
          architectureStage.model ||
          frameStage.model ||
          clusterStage.model,
        warnings: [...new Set(allWarnings)]
      }
    };
  }

  const fallback = buildFallbackCompilation(input.activity, input.importSummary, [
    ...allWarnings,
    'Falling back to deterministic analysis because the staged LLM pipeline did not produce a complete project.'
  ]);

  await input.emit({
    type: 'status',
    phase: 'complete',
    message: 'The staged LLM pipeline was incomplete. Using deterministic fallback.'
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
  const effectiveToken = token?.trim() || '';
  const tokenSource = token?.trim() ? 'manual' : 'none';
  if (llm?.provider === 'openai' && !llm.apiToken?.trim()) {
    throw new Error('OpenAI override requires a user-provided API token.');
  }
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
