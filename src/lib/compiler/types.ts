export type ActivityType =
  | 'bookmark'
  | 'feed'
  | 'stack'
  | 'profile'
  | 'discussion'
  | 'trending'
  | 'history'
  | 'tag-follow';

export interface ActivityItem {
  type: ActivityType;
  title: string;
  tags: string[];
  weight: number;
  source: 'daily.dev' | 'demo';
}

export interface Cluster {
  name: string;
  score: number;
  relatedTags: string[];
}

export interface ProjectSpec {
  title: string;
  difficulty: string;
  timeline: string;
  summary: string;
  stack: string[];
  architecture: [string, string][];
  milestones: [string, string][];
  learningGoals: string[];
  rationale: string[];
}

export type LlmProvider = 'none' | 'openai' | 'ollama' | 'compatible';

export interface LlmSettings {
  provider: LlmProvider;
  model: string;
  baseUrl?: string;
  apiToken?: string;
}

export interface LlmServerConfigSummary {
  provider: LlmProvider;
  model: string;
  baseUrl?: string;
  hasApiToken: boolean;
}

export interface GenerationSummary {
  strategy: 'deterministic' | 'llm';
  provider: LlmProvider;
  model?: string;
  warnings: string[];
}

export interface ImportSummary {
  mode: 'live' | 'demo';
  usedFallback: boolean;
  importedSources: string[];
  importedCount: number;
  warnings: string[];
  tokenSource?: 'manual' | 'server' | 'none';
  profile?: {
    name: string;
    username?: string;
    bio?: string;
    reputation?: number;
    experienceLevel?: string;
  } | null;
}

export interface CompilationResult {
  activity: ActivityItem[];
  clusters: Cluster[];
  project: ProjectSpec;
  importSummary: ImportSummary;
  generation: GenerationSummary;
}

export interface ImportedProfile {
  name: string;
  username?: string;
  bio?: string;
  reputation?: number;
  experienceLevel?: string;
}

export type ImportSourceName = 'profile' | 'bookmarks' | 'feed' | 'stack';

export interface CompilationStatusEvent {
  type: 'status';
  phase: 'starting' | 'importing' | 'synthesizing' | 'refining' | 'complete';
  message: string;
}

export interface CompilationSourceEvent {
  type: 'source';
  source: ImportSourceName;
  status: 'success' | 'empty' | 'error';
  activity: ActivityItem[];
  importedCount: number;
  importedSources: string[];
  warnings: string[];
  profile: ImportedProfile | null;
}

export interface CompilationResultEvent {
  type: 'result';
  result: CompilationResult;
}

export interface CompilationErrorEvent {
  type: 'error';
  message: string;
}

export type CompilationStreamEvent =
  | CompilationStatusEvent
  | CompilationSourceEvent
  | CompilationResultEvent
  | CompilationErrorEvent;
