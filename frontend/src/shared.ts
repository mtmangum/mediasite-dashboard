export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing UI element: ${id}`);
  return value as T;
}
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
// State of an on-demand fetch: pending, failed, or loaded.
export interface Loadable<T> {
  data?: T;
  error?: string;
  loading: boolean;
}
export interface ApiResponse {
  url: string;
  status: number;
  statusText: string;
  ms: number;
  contentType: string;
  body: string;
}
export interface Connection {
  baseUrl: string;
  username: string;
  hasPassword: boolean;
  hasApiKey: boolean;
}
export interface Presentation {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  created?: string;
  recorded?: string;
  durationMs?: number;
  owner?: string;
  presenter?: string;
  views?: number;
  viewsReady?: boolean;
  viewsStale?: boolean; // the live total was unavailable, so the list's lagging count is shown
  folder?: string;
  isLive?: boolean;
  thumbnail?: string;
  watchUrl: string;
  recordingWarnings?: RecordingWarning[];
}

export interface Analytics {
  totalViews: number | null;
  liveViews: number | null;
  onDemandViews: number | null;
  uniqueUsers: number | null;
  peakConnections: number | null;
  watchSeconds: number | null;
  firstWatched: string | null;
  lastWatched: string | null;
  browsers: { name: string; views: number | null }[] | null;
  systems: { name: string; views: number | null }[] | null;
  warnings: string[];
  requests: { endpoint: string; status: number; ms: number }[];
  fetchedAt: string;
}

// One anonymous viewing session; no viewer identity is included.
export interface SessionRecord {
  opened: string;
  watched: number | null;
  coverage: number | null;
  device: "mobile" | "desktop" | "other";
}

export interface ViewingCharts {
  timeline:
    | {
        startSeconds: number;
        durationSeconds: number;
        views: number;
      }[]
    | null;
  timelineError: string | null;
  histogram: {
    bins: { startSeconds: number; endSeconds: number; sessions: number }[];
    binSeconds: number;
    totalSessions: number;
    watchedSessions: number;
    zeroSeconds: number;
    unknownSeconds: number;
  } | null;
  histogramError: string | null;
  sessions: SessionRecord[] | null;
  viewers: { distinct: number; returning: number } | null;
  requests: { endpoint: string; status: number; ms: number }[];
  fetchedAt: string;
}

export interface RecordingWarning {
  code: string;
  label: string;
  detail: string;
  severity: "warning" | "notice";
}
export interface RecordingHealth {
  warnings: RecordingWarning[];
  media: string;
  audio: string;
  fetchedAt: string;
}
