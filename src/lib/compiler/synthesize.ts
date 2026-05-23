import { demoActivity } from '$lib/compiler/demo';
import type {
  ActivityItem,
  Cluster,
  CompilationResult,
  ImportSummary,
  ProjectRecommendation,
  ProjectSpec
} from '$lib/compiler/types';

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function extractSignals(item: ActivityItem): string[] {
  const stopwords = new Set([
    'a',
    'an',
    'and',
    'for',
    'from',
    'how',
    'in',
    'into',
    'is',
    'of',
    'on',
    'the',
    'to',
    'with'
  ]);

  const titleTokens = item.title
    .toLowerCase()
    .split(/[^a-z0-9.+-]+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));

  return [...item.tags.map(normalizeTag), ...titleTokens];
}

function humanizeSignal(signal: string): string {
  return signal
    .split(/[\s.+-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function buildDynamicClusterCandidates(item: ActivityItem): string[] {
  const normalizedTags = item.tags.map(normalizeTag).filter((tag) => tag.length >= 2);
  const signalSet = new Set<string>(normalizedTags);
  const titleSignals = extractSignals(item).filter((signal) => signal.length >= 4);

  for (const signal of titleSignals.slice(0, 4)) {
    signalSet.add(signal);
  }

  return [...signalSet];
}

export function clusterTopics(items: ActivityItem[]): Cluster[] {
  const scores = new Map<string, number>();
  const matchedTags = new Map<string, Set<string>>();

  for (const item of items) {
    const clusterCandidates = buildDynamicClusterCandidates(item);
    const relatedSignals = extractSignals(item).filter((signal) => signal.length >= 3);

    for (const candidate of clusterCandidates) {
      scores.set(candidate, (scores.get(candidate) ?? 0) + item.weight);
      const existing = matchedTags.get(candidate) ?? new Set<string>();
      for (const signal of relatedSignals) {
        if (signal !== candidate) {
          existing.add(signal);
        }
      }
      matchedTags.set(candidate, existing);
    }
  }

  return [...scores.entries()]
    .map(([name, score]) => ({
      name: humanizeSignal(name),
      score: Number(score.toFixed(2)),
      relatedTags: [...(matchedTags.get(name) ?? [])].slice(0, 4)
    }))
    .filter((cluster) => cluster.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function normalizeSteeringNote(steeringNote?: string): string {
  return steeringNote?.trim().replace(/\s+/g, ' ').slice(0, 180) || '';
}

function applySteeringTitle(baseTitle: string, steeringNote: string): string {
  const normalized = steeringNote.toLowerCase();

  if (normalized.includes('pokedex')) {
    return 'Pokedex Workbench';
  }

  if (normalized.includes('dsa') || normalized.includes('data structures') || normalized.includes('algorithms')) {
    return 'DSA Practice Workbench';
  }

  return baseTitle;
}

function inferProjectTitle(clusters: Cluster[], steering: string): string {
  const topCluster = clusters[0]?.name ?? 'Signal';
  const secondCluster = clusters[1]?.name ?? 'Workflow';
  const seededTitle = `${topCluster} ${secondCluster}`.trim();
  return applySteeringTitle(`${seededTitle} Workbench`, steering);
}

function inferProjectStack(activity: ActivityItem[]): string[] {
  const dominantTags = [...new Set(activity.flatMap((item) => item.tags))].slice(0, 5);
  return ['TypeScript', dominantTags[0] ?? 'APIs', dominantTags[1] ?? 'Data modeling', dominantTags[2] ?? 'Interface design', 'SvelteKit'];
}

export function synthesizeProject(clusters: Cluster[], activity: ActivityItem[], steeringNote?: string): ProjectSpec {
  const topCluster = clusters[0]?.name ?? 'Developer Workflow';
  const secondCluster = clusters[1]?.name ?? 'Implementation Systems';
  const topNames = clusters.slice(0, 3).map((cluster) => cluster.name);
  const topItems = activity.slice(0, 3).map((item) => item.title);
  const topTags = [...new Set(activity.flatMap((item) => item.tags))].slice(0, 5);
  const dominantTags = topTags.slice(0, 3).join(', ') || 'operational signals';
  const firstSignal = activity[0]?.title || 'recent technical activity';
  const steering = normalizeSteeringNote(steeringNote);
  const steeringSummary = steering
    ? ` It should explicitly honor the user steer toward ${steering} while staying grounded in the imported activity.`
    : '';
  const project: ProjectSpec = {
    title: inferProjectTitle(clusters, steering),
    difficulty: 'Intermediate',
    timeline: '2 to 3 weekends',
    summary: `Build a focused ${topCluster.toLowerCase()} workbench for developers who keep running into ${secondCluster.toLowerCase()} decisions during day-to-day work. The first release should ingest ${dominantTags}, turn them into one ranked operating view, and support one concrete workflow from raw signal to action. It should feel closer to a decision-support tool than a content browser, with enough backend shape to make ${firstSignal.toLowerCase()} actionable.${steeringSummary}`,
    stack: inferProjectStack(activity),
    architecture: [
      ['Input Layer', 'Imports articles, bookmarks, and stack signals into one normalized stream.'],
      ['Signal Analysis', 'Ranks repeated topics and extracts dominant build directions from user activity.'],
      ['Project Engine', 'Turns open-ended themes into a scoped concept, stack, and execution model.'],
      ['Execution Surface', 'Shows what to build next and why it matches the developer profile.']
    ],
    milestones: [
      ['Import signals', 'Aggregate technical activity into one developer profile snapshot.'],
      ['Rank live topics', 'Identify repeated themes without constraining them to a fixed taxonomy.'],
      ['Generate the plan', 'Produce milestones, stack recommendations, and architecture notes from the discovered signals.'],
      ['Tighten the loop', 'Refine outputs until the suggested project feels concrete enough to start.']
    ],
    learningGoals: [
      `Practice shipping within the ${topCluster} space instead of continuing passive research.`,
      'Turn content consumption into a repeatable build-selection workflow.',
      'Use implementation planning as part of your developer feedback loop.'
    ],
    rationale: [
      topNames.length > 0
        ? `Dominant clusters point toward a single tool surface: ${topNames.join(' + ')}.`
        : 'No dominant clusters were detected; using a general project template.',
      `Imported activity shows repeated pressure around ${topTags.slice(0, 4).join(', ') || 'n/a'}.`,
      steering
        ? `User steering asked to lean toward ${steering}.`
        : topItems.length > 0
          ? `Representative signals include ${topItems.join(' | ')}.`
          : `Input signal count: ${activity.length} imported items.`
    ]
  };

  return project;
}

function uniqueList(items: string[], limit: number): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function composeProjectWriteup(project: ProjectSpec, clusters: Cluster[]): string {
  const dominantClusters = clusters.slice(0, 3).map((cluster) => cluster.name).join(', ') || 'developer tooling';
  const stackLine = project.stack.join(', ');
  const firstMilestone = project.milestones[0];
  const secondMilestone = project.milestones[1];

  return [
    'Project framing',
    `${project.title} should be treated as a concrete build with visible system boundaries, not just a theme. The dominant clusters around ${dominantClusters} suggest a project that can show architectural judgment, implementation discipline, and a credible product loop using ${stackLine}.`,
    '',
    'Why this fits',
    `This direction fits because it converts repeated reading signals into a portfolio artifact with clear decisions to make. The project summary and rationale already point toward practical delivery pressure rather than open-ended research, which is where the strongest learning usually happens.`,
    '',
    'Implementation sequence',
    `${firstMilestone ? `${firstMilestone[0]} should define the first vertical slice: ${firstMilestone[1]}` : 'Start by proving the narrowest useful vertical slice.'} ${secondMilestone ? `${secondMilestone[0]} comes next: ${secondMilestone[1]}` : 'Then expand into the next major workflow boundary.'} Once those steps are stable, the remaining milestones should harden reliability, observability, and operator clarity instead of adding a second concept halfway through the build.`,
    '',
    'Risks and tradeoffs',
    'The main risk is scope drift. Projects in this category become vague when they try to solve every adjacent workflow at once. Keep the first release centered on one believable user path, and let the rest of the system prove its value through instrumentation, operations, and quality of execution.',
    '',
    'First build week',
    `During the first week, establish the repo shape, define the core data model, wire the first storage or messaging edge, and make one milestone executable end to end. The goal is to make the project real quickly enough that the architecture and roadmap can be refined against implementation pressure instead of guesswork.`
  ].join('\n');
}

function dedupeAdjacentWords(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words.filter((word, index) => word.toLowerCase() !== words[index - 1]?.toLowerCase()).join(' ');
}

function trimTierSuffixes(title: string): string {
  return title
    .replace(/\b(starter|platform|suite|studio|system|console)\s+\1\b/gi, '$1')
    .replace(/\b(workbench)\s+(starter)\b/gi, 'Workbench Starter')
    .trim();
}

function renameTitleByTier(baseTitle: string, tier: ProjectRecommendation['tier']): string {
  const cleanTitle = trimTierSuffixes(dedupeAdjacentWords(baseTitle));

  if (tier === 'medium') {
    return cleanTitle;
  }

  if (tier === 'low') {
    return cleanTitle;
  }

  return cleanTitle;
}

function scaleProject(
  base: ProjectSpec,
  tier: ProjectRecommendation['tier'],
  titleOverride?: string
): ProjectRecommendation {
  const tierTitle = titleOverride?.trim() || renameTitleByTier(base.title, tier);

  if (tier === 'low') {
    return {
      tier,
      effortLabel: 'Low effort',
      title: tierTitle,
      difficulty: 'Beginner to Intermediate',
      timeline: '1 to 2 weekends',
      summary: `Build a scoped starter version of ${base.title} that proves the core workflow quickly without the heavier platform concerns.`,
      stack: uniqueList(base.stack.slice(0, 4), 4),
      architecture: base.architecture.slice(0, 3),
      milestones: base.milestones.slice(0, 3),
      learningGoals: uniqueList(base.learningGoals.slice(0, 3), 3),
      rationale: [
        'Optimized for shipping a credible first version quickly.',
        ...base.rationale.slice(0, 2)
      ]
    };
  }

  if (tier === 'high') {
    return {
      tier,
      effortLabel: 'High effort',
      title: tierTitle,
      difficulty: 'Advanced',
      timeline: '4 to 6 weekends',
      summary: `Expand ${base.title} into a more ambitious platform with stronger reliability, observability, and extensibility constraints.`,
      stack: uniqueList([...base.stack, 'Queueing', 'Observability', 'Deployment Automation'], 8),
      architecture: uniqueList(
        [...base.architecture.map(([title, description]) => `${title}:::${description}`),
          'Reliability Layer:::Adds retries, operational safeguards, and failure recovery paths.',
          'Delivery Layer:::Packages deployment, configuration, and environment promotion for repeatable release flow.'
        ],
        6
      ).map((item) => {
        const [title, description] = item.split(':::');
        return [title, description] as [string, string];
      }),
      milestones: uniqueList(
        [...base.milestones.map(([title, description]) => `${title}:::${description}`),
          'Harden the platform:::Add reliability, failure recovery, and better operational visibility.',
          'Ship a production-style release:::Document rollout, instrumentation, and scaling constraints.'
        ],
        6
      ).map((item) => {
        const [title, description] = item.split(':::');
        return [title, description] as [string, string];
      }),
      learningGoals: uniqueList(
        [...base.learningGoals, 'Practice scoping a richer system without losing implementation clarity.'],
        5
      ),
      rationale: [
        'Designed as the most ambitious version of the same core direction.',
        ...base.rationale.slice(0, 2)
      ]
    };
  }

  return {
    ...base,
    tier,
    title: tierTitle,
    effortLabel: 'Medium effort'
  };
}

export function buildProjectRecommendations(
  base: ProjectSpec,
  titleOverrides?: Partial<Record<ProjectRecommendation['tier'], string>>
): ProjectRecommendation[] {
  return ['low', 'medium', 'high'].map((tier) =>
    scaleProject(
      base,
      tier as ProjectRecommendation['tier'],
      titleOverrides?.[tier as ProjectRecommendation['tier']]
    )
  );
}

export function compileActivity(
  activity: ActivityItem[],
  importSummary: ImportSummary,
  steeringNote?: string
): CompilationResult {
  const workingSet = shuffle(activity).slice(0, 8);
  const clusters = clusterTopics(workingSet);
  const project = synthesizeProject(clusters, workingSet, steeringNote);
  const recommendations = buildProjectRecommendations(project);

  return {
    activity: workingSet,
    clusters,
    project,
    recommendations,
    projectWriteup: composeProjectWriteup(project, clusters),
    importSummary,
    generation: {
      strategy: 'deterministic',
      provider: 'none',
      warnings: []
    }
  };
}

export function buildDemoCompilation(warnings: string[] = []): CompilationResult {
  return compileActivity(demoActivity, {
    mode: 'demo',
    usedFallback: false,
    importedSources: ['demo bookmarks', 'demo history', 'demo stack'],
    importedCount: demoActivity.length,
    warnings,
    tokenSource: 'none',
    profile: null
  });
}
