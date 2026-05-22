import { demoActivity } from '$lib/compiler/demo';
import type { ActivityItem, Cluster, CompilationResult, ImportSummary, ProjectSpec } from '$lib/compiler/types';

const topicFamilies: Record<string, string[]> = {
  'distributed systems': [
    'kafka',
    'microservices',
    'distributed systems',
    'cqrs',
    'reliability',
    'event-driven',
    'streaming',
    'serverless',
    'kubernetes'
  ],
  'backend systems': [
    'typescript',
    'backend',
    'workers',
    'queues',
    'postgresql',
    'postgres',
    'system design',
    'node.js',
    'rust',
    '.net',
    'elixir',
    'erlang',
    'linux',
    'performance'
  ],
  observability: ['opentelemetry', 'tracing', 'metrics', 'monitoring', 'analytics', 'logging', 'mlops'],
  'developer tooling': [
    'sveltekit',
    'next.js',
    'dashboards',
    'dx',
    'architecture',
    'cloud',
    'devops',
    'frontend',
    'testing',
    'code-review',
    'technical-debt',
    'productivity',
    'dependency-injection'
  ],
  ai: [
    'llm',
    'ai',
    'agents',
    'prompting',
    'embeddings',
    'rag',
    'vector',
    'machine-learning',
    'ai-agents',
    'ai-inference',
    'gpu',
    'python',
    'jupyter'
  ],
  frontend: ['frontend', 'ui', 'ux', 'component', 'design system', 'realtime']
};

const projectBlueprints: Array<Omit<ProjectSpec, 'rationale'>> = [
  {
    title: 'SignalForge Event Journal',
    difficulty: 'Advanced',
    timeline: '3 to 4 weekends',
    summary:
      'Build a developer-facing event journal that ingests product events, stores them in an append-only log, replays state projections, and exposes an operational dashboard for failures, lag, and traceability.',
    stack: ['TypeScript', 'SvelteKit', 'Node.js', 'PostgreSQL', 'Kafka-compatible queue', 'OpenTelemetry'],
    architecture: [
      ['Ingestion API', 'Accepts events from services, validates schemas, and writes to the durable log.'],
      ['Projection Workers', 'Consumes events asynchronously, materializes read models, and handles retries.'],
      ['Ops Dashboard', 'Shows replay controls, lag metrics, failure traces, and throughput trends.'],
      ['Trace Pipeline', 'Connects API requests, queue jobs, and projection runs with telemetry spans.']
    ],
    milestones: [
      ['Define the event contract', 'Model event envelopes, schema versioning rules, and an append-only persistence strategy.'],
      ['Implement replayable projections', 'Build workers that reconstruct read models from the log and recover from partial failure.'],
      ['Add operational controls', 'Ship dead-letter handling, retry inspection, and replay commands for a single stream.'],
      ['Instrument the system', 'Publish traces and service metrics so a developer can debug end-to-end event flow quickly.'],
      ['Polish the dashboard', 'Expose stream health, projection lag, and runbooks in a clean operator view.']
    ],
    learningGoals: [
      'Design event-first data models without coupling write and read paths.',
      'Reason about queues, retries, idempotency, and delivery guarantees.',
      'Use telemetry as part of the architecture instead of afterthought monitoring.',
      'Translate system-design reading into a portfolio project with credible complexity.'
    ]
  },
  {
    title: 'TraceDeck Dev Observatory',
    difficulty: 'Intermediate',
    timeline: '2 to 3 weekends',
    summary:
      'Create a local-first observability console for side projects that turns logs, spans, and custom metrics into a single developer cockpit with guided debugging flows.',
    stack: ['SvelteKit', 'TypeScript', 'SQLite', 'OpenTelemetry', 'Tailwind CSS'],
    architecture: [
      ['Collector', 'Accepts local spans and metrics with a simple ingestion endpoint.'],
      ['Storage Layer', 'Persists recent traces and aggregates metric windows for lightweight querying.'],
      ['Insight Engine', 'Flags hot paths, repeated failures, and suspicious latency spikes.'],
      ['Visualization UI', 'Renders timeline charts, trace trees, and issue summaries.']
    ],
    milestones: [
      ['Wire up ingestion', 'Capture spans and metrics from a demo service.'],
      ['Store and query telemetry', 'Build basic trace lookup and metric aggregation.'],
      ['Generate insights', 'Highlight errors and regressions from recent activity.'],
      ['Design the cockpit', 'Package the data into a dashboard a solo developer will actually use.']
    ],
    learningGoals: [
      'Understand practical telemetry data flows.',
      'Turn infrastructure concerns into productized internal tooling.',
      'Build richer frontend visualizations around technical datasets.'
    ]
  },
  {
    title: 'PromptRail Research Workbench',
    difficulty: 'Intermediate',
    timeline: '2 to 4 weekends',
    summary:
      'Create a developer research workbench that collects technical sources, clusters them into themes, and turns them into prompt-ready implementation briefs with comparison views and build checklists.',
    stack: ['SvelteKit', 'TypeScript', 'SQLite', 'Embeddings API', 'Tailwind CSS'],
    architecture: [
      ['Source Importer', 'Collects saved posts and normalizes technical topics into a searchable corpus.'],
      ['Clustering Engine', 'Groups related content and scores themes by recency and frequency.'],
      ['Brief Generator', 'Produces implementation-ready briefs, constraints, and extension paths.'],
      ['Workspace UI', 'Lets the developer review clusters, briefs, and build-next recommendations.']
    ],
    milestones: [
      ['Import the corpus', 'Normalize saved content into reusable research snapshots.'],
      ['Score clusters', 'Identify high-signal themes across tags, sources, and engagement.'],
      ['Generate briefs', 'Produce repeatable implementation plans from clustered topics.'],
      ['Refine the workflow', 'Package the process into a tool that feels faster than note-taking.']
    ],
    learningGoals: [
      'Translate AI-assisted research into deterministic product behavior.',
      'Model topic extraction and clustering without overfitting to one content source.',
      'Turn reading behavior into reusable developer workflow tooling.'
    ]
  }
];

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

function keywordMatchesSignal(keyword: string, signal: string): boolean {
  if (signal === keyword) {
    return true;
  }

  const signalParts = signal.split(/[^a-z0-9]+/).filter(Boolean);
  if (signalParts.includes(keyword)) {
    return true;
  }

  if (keyword.length >= 4 && signal.includes(keyword)) {
    return true;
  }

  return false;
}

export function clusterTopics(items: ActivityItem[]): Cluster[] {
  const scores = Object.fromEntries(Object.keys(topicFamilies).map((family) => [family, 0]));
  const matchedTags = new Map<string, Set<string>>();

  for (const family of Object.keys(topicFamilies)) {
    matchedTags.set(family, new Set<string>());
  }

  for (const item of items) {
    const signals = extractSignals(item);

    for (const [family, keywords] of Object.entries(topicFamilies)) {
      const itemMatches = signals.filter((signal) =>
        keywords.some((keyword) => keywordMatchesSignal(keyword, signal))
      );
      if (itemMatches.length > 0) {
        scores[family] += item.weight * itemMatches.length;
        for (const tag of itemMatches) {
          matchedTags.get(family)?.add(tag);
        }
      }
    }
  }

  return Object.entries(scores)
    .map(([name, score]) => ({
      name,
      score: Number(score.toFixed(2)),
      relatedTags: [...(matchedTags.get(name) ?? [])].slice(0, 4)
    }))
    .filter((cluster) => cluster.score > 0)
    .sort((a, b) => b.score - a.score);
}

function buildFallbackProject(clusters: Cluster[], activity: ActivityItem[]): ProjectSpec {
  const topCluster = clusters[0]?.name ?? 'developer tooling';
  const topTags = [...new Set(activity.flatMap((item) => item.tags))].slice(0, 5);

  return {
    title: 'CompilerLab Build Sprint',
    difficulty: 'Intermediate',
    timeline: '2 to 3 weekends',
    summary:
      'Build a portfolio project that packages your strongest current interests into a single implementation sprint, with an emphasis on developer workflow and fast learning loops.',
    stack: ['SvelteKit', 'TypeScript', 'SQLite', topTags[0] ?? 'REST APIs', topTags[1] ?? 'Tailwind CSS'],
    architecture: [
      ['Input Layer', 'Imports articles, bookmarks, and stack signals into one normalized stream.'],
      ['Inference Layer', 'Scores clusters from repeated topics and recent engagement patterns.'],
      ['Planning Layer', 'Turns dominant themes into milestones, architecture notes, and next steps.'],
      ['Execution UI', 'Shows what to build next and why it matches the developer profile.']
    ],
    milestones: [
      ['Import signals', 'Aggregate technical activity into one developer profile snapshot.'],
      ['Rank interest clusters', 'Identify repeated themes and prioritize the strongest direction.'],
      ['Generate the plan', 'Produce milestones, stack recommendations, and architecture notes.'],
      ['Tighten the loop', 'Refine outputs until the suggested project feels concrete enough to start.']
    ],
    learningGoals: [
      `Practice shipping within the ${topCluster} space instead of continuing passive research.`,
      'Turn content consumption into a repeatable build-selection workflow.',
      'Use implementation planning as part of your developer feedback loop.'
    ],
    rationale: []
  };
}

export function synthesizeProject(clusters: Cluster[], activity: ActivityItem[]): ProjectSpec {
  const topNames = clusters.slice(0, 2).map((cluster) => cluster.name);
  let selected: Omit<ProjectSpec, 'rationale'> | undefined;

  if (topNames.includes('distributed systems') && topNames.includes('backend systems')) {
    selected = projectBlueprints[0];
  } else if (topNames.includes('observability') && topNames.includes('developer tooling')) {
    selected = projectBlueprints[1];
  } else if (topNames.includes('ai') || topNames.includes('developer tooling')) {
    selected = projectBlueprints[2];
  }

  const project = selected ?? buildFallbackProject(clusters, activity);
  const rationale = [
    topNames.length > 0
      ? `Dominant clusters: ${topNames.join(' + ')}.`
      : 'No dominant clusters were detected; using a general project template.',
    `Input signal count: ${activity.length} imported items.`,
    `Most repeated tags: ${[...new Set(activity.flatMap((item) => item.tags))].slice(0, 4).join(', ') || 'n/a'}.`
  ];

  return {
    ...project,
    rationale
  };
}

export function compileActivity(
  activity: ActivityItem[],
  importSummary: ImportSummary
): CompilationResult {
  const workingSet = shuffle(activity).slice(0, 8);
  const clusters = clusterTopics(workingSet);
  const project = synthesizeProject(clusters, workingSet);

  return {
    activity: workingSet,
    clusters,
    project,
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
