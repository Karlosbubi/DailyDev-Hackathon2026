import type { ActivityItem, ImportedProfile, ImportSourceName } from '$lib/compiler/types';

const DAILY_DEV_API_BASE = 'https://api.daily.dev/public/v1';

type FetchLike = typeof fetch;

interface DailyDevListResponse<T> {
  data?: T[];
}

interface GenericRecord {
  [key: string]: unknown;
}

export interface ImportProgressPayload {
  source: ImportSourceName;
  status: 'success' | 'empty' | 'error';
  activity: ActivityItem[];
  importedCount: number;
  importedSources: string[];
  warnings: string[];
  profile: ImportedProfile | null;
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
        const tool = (record.tool && typeof record.tool === 'object'
          ? (record.tool as GenericRecord)
          : null);

        return (
          pickString(record.title) ||
          pickString(record.name) ||
          pickString(record.label) ||
          pickString(tool?.title) ||
          pickString(tool?.name)
        );
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
  for (const path of ['/profile/stack/?limit=20', '/profile/stack?limit=20', '/tech-stack']) {
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

async function fetchProfile(fetchFn: FetchLike, token: string): Promise<ImportedProfile | null> {
  for (const path of ['/profile/', '/profile']) {
    const payload = await getJson<GenericRecord>(fetchFn, path, token);
    if (payload) {
      return {
        name: pickString(payload.name) || pickString(payload.username) || 'daily.dev user',
        username: pickString(payload.username) || undefined,
        bio: pickString(payload.bio) || undefined,
        reputation: typeof payload.reputation === 'number' ? payload.reputation : undefined,
        experienceLevel: pickString(payload.experienceLevel) || undefined
      };
    }
  }

  return null;
}

async function loadOptionalSource<T>(
  load: () => Promise<T>,
  source: ImportSourceName
): Promise<{ data: T | null; errorWarning?: string }> {
  try {
    return { data: await load() };
  } catch (error) {
    if (error instanceof DailyDevApiError && [401, 403].includes(error.status)) {
      throw error;
    }

    if (error instanceof DailyDevApiError) {
      return {
        data: null,
        errorWarning: `${source[0].toUpperCase()}${source.slice(1)} import failed (${error.status}).`
      };
    }

    return {
      data: null,
      errorWarning: `${source[0].toUpperCase()}${source.slice(1)} import failed unexpectedly.`
    };
  }
}

export async function importDailyDevActivity(
  fetchFn: FetchLike,
  token: string,
  onProgress?: (payload: ImportProgressPayload) => void | Promise<void>
): Promise<{
  activity: ActivityItem[];
  warnings: string[];
  importedSources: string[];
  profile: ImportedProfile | null;
}> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new DailyDevApiError('Missing token', 401);
  }

  const warnings: string[] = [];
  const importedSources: string[] = [];
  const activity: ActivityItem[] = [];
  let profile: ImportedProfile | null = null;

  async function emitProgress(source: ImportSourceName, status: 'success' | 'empty' | 'error') {
    if (!onProgress) {
      return;
    }

    await onProgress({
      source,
      status,
      activity: [...activity],
      importedCount: activity.length,
      importedSources: [...importedSources],
      warnings: [...warnings],
      profile
    });
  }

  const profileResult = await loadOptionalSource(() => fetchProfile(fetchFn, trimmedToken), 'profile');
  profile = profileResult.data;

  if (profileResult.errorWarning) {
    warnings.push(profileResult.errorWarning);
    await emitProgress('profile', 'error');
  } else if (profile) {
    importedSources.push('profile');
    await emitProgress('profile', 'success');
  } else {
    warnings.push('Profile details were unavailable from the public API.');
    await emitProgress('profile', 'empty');
  }

  const bookmarkResult = await loadOptionalSource(
    () => getJson<unknown>(fetchFn, '/bookmarks/?limit=10', trimmedToken),
    'bookmarks'
  );
  const bookmarks = bookmarkResult.data ? normalizeBookmarkPayload(bookmarkResult.data) : [];

  if (bookmarkResult.errorWarning) {
    warnings.push(bookmarkResult.errorWarning);
    await emitProgress('bookmarks', 'error');
  } else if (bookmarks.length > 0) {
    importedSources.push('bookmarks');
    activity.push(...bookmarks);
    await emitProgress('bookmarks', 'success');
  } else {
    warnings.push('No bookmarks were returned from the public API.');
    await emitProgress('bookmarks', 'empty');
  }

  const feedResult = await loadOptionalSource(
    () => getJson<unknown>(fetchFn, '/feeds/foryou?limit=10', trimmedToken),
    'feed'
  );
  const feed = feedResult.data ? normalizeFeedPayload(feedResult.data) : [];

  if (feedResult.errorWarning) {
    warnings.push(feedResult.errorWarning);
    await emitProgress('feed', 'error');
  } else if (feed.length > 0) {
    importedSources.push('feed');
    activity.push(...feed);
    await emitProgress('feed', 'success');
  } else {
    warnings.push('No feed items were returned from the public API.');
    await emitProgress('feed', 'empty');
  }

  const stackResult = await loadOptionalSource(() => fetchStack(fetchFn, trimmedToken), 'stack');
  const stack = stackResult.data ?? [];

  if (stackResult.errorWarning) {
    warnings.push(stackResult.errorWarning);
    await emitProgress('stack', 'error');
  } else if (stack.length > 0) {
    importedSources.push('stack');
    activity.push(...stack);
    await emitProgress('stack', 'success');
  } else {
    warnings.push('No tech stack items were found on the profile.');
    await emitProgress('stack', 'empty');
  }

  if (activity.length === 0) {
    warnings.push('Live import returned zero usable items.');
  }

  return {
    activity,
    warnings,
    importedSources,
    profile
  };
}
