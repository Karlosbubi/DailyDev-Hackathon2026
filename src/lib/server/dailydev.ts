import type { ActivityItem } from '$lib/compiler/types';

const DAILY_DEV_API_BASE = 'https://api.daily.dev/public/v1';

type FetchLike = typeof fetch;

interface DailyDevListResponse<T> {
  data?: T[];
}

interface GenericRecord {
  [key: string]: unknown;
}

export class DailyDevApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(fetchFn: FetchLike, path: string, token: string): Promise<T | null> {
  const response = await fetchFn(`${DAILY_DEV_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new DailyDevApiError(`daily.dev request failed for ${path}`, response.status);
  }

  return (await response.json()) as T;
}

function pickString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function collectTags(record: GenericRecord): string[] {
  const candidateArrays = [record.tags, record.keywords, record.topics, record.tagNames, record.readableTags];

  for (const candidate of candidateArrays) {
    if (Array.isArray(candidate)) {
      const tags = candidate
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (item && typeof item === 'object') {
            const maybeName = (item as GenericRecord).name ?? (item as GenericRecord).value;
            return typeof maybeName === 'string' ? maybeName : '';
          }

          return '';
        })
        .filter(Boolean);

      if (tags.length > 0) {
        return tags;
      }
    }
  }

  const sourceName =
    typeof record.source === 'object' && record.source
      ? pickString((record.source as GenericRecord).name)
      : pickString(record.source);

  return [sourceName].filter(Boolean);
}

function toActivityItem(record: GenericRecord, type: ActivityItem['type'], weight: number): ActivityItem | null {
  const title = pickString(record.title) || pickString(record.name) || pickString(record.summary);
  const tags = collectTags(record);

  if (!title) {
    return null;
  }

  return {
    type,
    title,
    tags,
    weight,
    source: 'daily.dev'
  };
}

function normalizeBookmarkPayload(payload: unknown): ActivityItem[] {
  const data = ((payload as DailyDevListResponse<GenericRecord>)?.data ?? []) as GenericRecord[];
  return data
    .map((item) => toActivityItem(item, 'bookmark', 0.95))
    .filter((item): item is ActivityItem => Boolean(item));
}

function normalizeFeedPayload(payload: unknown): ActivityItem[] {
  const data = ((payload as DailyDevListResponse<GenericRecord>)?.data ?? []) as GenericRecord[];
  return data
    .map((item) => toActivityItem(item, 'feed', 0.72))
    .filter((item): item is ActivityItem => Boolean(item));
}

function normalizeStackPayload(payload: unknown): ActivityItem[] {
  const data = Array.isArray((payload as GenericRecord)?.data)
    ? (((payload as GenericRecord).data as unknown[]) ?? [])
    : Array.isArray(payload)
      ? (payload as unknown[])
      : [];

  const tags = data
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (item && typeof item === 'object') {
        const record = item as GenericRecord;
        return pickString(record.name) || pickString(record.label);
      }

      return '';
    })
    .filter(Boolean)
    .slice(0, 8);

  if (tags.length === 0) {
    return [];
  }

  return [
    {
      type: 'stack',
      title: `Current stack focus: ${tags.slice(0, 4).join(', ')}`,
      tags,
      weight: 0.84,
      source: 'daily.dev'
    }
  ];
}

async function fetchStack(fetchFn: FetchLike, token: string): Promise<ActivityItem[]> {
  for (const path of ['/stack', '/profile/stack', '/tech-stack']) {
    const payload = await getJson<unknown>(fetchFn, path, token);
    if (payload) {
      const normalized = normalizeStackPayload(payload);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return [];
}

export async function importDailyDevActivity(fetchFn: FetchLike, token: string): Promise<{
  activity: ActivityItem[];
  warnings: string[];
  importedSources: string[];
}> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new DailyDevApiError('Missing token', 401);
  }

  const warnings: string[] = [];
  const importedSources: string[] = [];

  const [bookmarksPayload, feedPayload, stackActivity] = await Promise.all([
    getJson<unknown>(fetchFn, '/bookmarks?limit=10', trimmedToken),
    getJson<unknown>(fetchFn, '/feeds?limit=10', trimmedToken),
    fetchStack(fetchFn, trimmedToken)
  ]);

  const bookmarks = bookmarksPayload ? normalizeBookmarkPayload(bookmarksPayload) : [];
  const feed = feedPayload ? normalizeFeedPayload(feedPayload) : [];
  const stack = stackActivity;

  if (bookmarks.length > 0) {
    importedSources.push('bookmarks');
  } else {
    warnings.push('No bookmarks were returned from the public API.');
  }

  if (feed.length > 0) {
    importedSources.push('feed');
  } else {
    warnings.push('No feed items were returned from the public API.');
  }

  if (stack.length > 0) {
    importedSources.push('stack');
  } else {
    warnings.push('Tech stack data was unavailable from the public API.');
  }

  const activity = [...bookmarks, ...feed, ...stack];

  if (activity.length === 0) {
    warnings.push('Live import returned zero usable items.');
  }

  return {
    activity,
    warnings,
    importedSources
  };
}
