import type { ActivityItem } from '$lib/compiler/types';

export const demoActivity: ActivityItem[] = [
  {
    type: 'bookmark',
    title: 'Event-driven architecture with Kafka and outbox patterns',
    tags: ['Kafka', 'microservices', 'PostgreSQL', 'reliability'],
    weight: 0.96,
    source: 'demo'
  },
  {
    type: 'history',
    title: 'Scaling TypeScript workers with queues and retries',
    tags: ['TypeScript', 'queues', 'workers', 'observability'],
    weight: 0.82,
    source: 'demo'
  },
  {
    type: 'discussion',
    title: 'CQRS vs CRUD for product analytics pipelines',
    tags: ['CQRS', 'analytics', 'system design', 'backend'],
    weight: 0.88,
    source: 'demo'
  },
  {
    type: 'tag-follow',
    title: 'Following distributed systems, devops, and architecture',
    tags: ['distributed systems', 'devops', 'architecture', 'cloud'],
    weight: 0.9,
    source: 'demo'
  },
  {
    type: 'trending',
    title: 'OpenTelemetry setup guides are trending in your orbit',
    tags: ['OpenTelemetry', 'tracing', 'metrics', 'monitoring'],
    weight: 0.72,
    source: 'demo'
  },
  {
    type: 'bookmark',
    title: 'Building dashboards in SvelteKit for operational tooling',
    tags: ['SvelteKit', 'dashboards', 'frontend', 'DX'],
    weight: 0.68,
    source: 'demo'
  }
];
