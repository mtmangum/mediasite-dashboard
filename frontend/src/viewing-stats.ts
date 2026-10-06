import type { SessionRecord, ViewingCharts } from "./shared";

type Timeline = NonNullable<ViewingCharts["timeline"]>;
type Segment = Timeline[number];

// A watched session "finished most" of a recording when it covered at least this share of it.
export const COMPLETE_SHARE = 0.85;

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values: number[]) {
  return values.length
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : null;
}

export interface SessionStats {
  total: number;
  watched: number; // sessions with any watch time
  zeroOpens: number; // opened but never watched
  medianWatched: number | null; // seconds, over watched sessions
  meanWatched: number | null;
  completed: number; // watched sessions that covered most of the recording
  completionBase: number; // watched sessions with a known coverage
  completionRate: number | null;
}

export function sessionStats(
  sessions: SessionRecord[],
  recordingSeconds: number,
): SessionStats {
  const times = sessions
    .map((s) => s.watched)
    .filter((n): n is number => n !== null && n > 0);
  const known = sessions.filter(
    (s) => recordingSeconds > 0 && (s.watched ?? 0) > 0 && s.coverage !== null,
  );
  const completed = known.filter(
    (s) =>
      recordingSeconds > 0 && s.coverage! >= recordingSeconds * COMPLETE_SHARE,
  ).length;
  return {
    total: sessions.length,
    watched: times.length,
    zeroOpens: sessions.filter((s) => s.watched === 0).length,
    medianWatched: median(times),
    meanWatched: mean(times),
    completed,
    completionBase: known.length,
    completionRate: known.length ? completed / known.length : null,
  };
}

export interface DayCount {
  key: string; // local YYYY-MM-DD
  date: Date;
  count: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Sessions per local calendar day from the first to the last view, including empty days.
// Only the most recent `maxDays` are returned for long-lived recordings.
export function viewsByDay(sessions: SessionRecord[], maxDays = 120) {
  const counts = new Map<string, number>();
  let first: Date | null = null,
    last: Date | null = null;
  for (const s of sessions) {
    const d = new Date(s.opened);
    if (Number.isNaN(d.getTime())) continue;
    counts.set(dayKey(d), (counts.get(dayKey(d)) || 0) + 1);
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  if (!first || !last) return { days: [] as DayCount[], truncated: false };
  const days: DayCount[] = [];
  // Noon avoids daylight-saving edges when stepping a day at a time.
  const cursor = new Date(
    first.getFullYear(),
    first.getMonth(),
    first.getDate(),
    12,
  );
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 12);
  while (cursor <= end) {
    days.push({
      key: dayKey(cursor),
      date: new Date(cursor),
      count: counts.get(dayKey(cursor)) || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return {
    days: days.slice(-maxDays),
    truncated: days.length > maxDays,
  };
}

export interface Heatmap {
  cells: number[][]; // [weekday Mon..Sun][hour 0..23]
  max: number;
  total: number;
  peak: { day: number; hour: number; count: number } | null;
}

export function weekHourHeatmap(sessions: SessionRecord[]): Heatmap {
  const cells = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let total = 0;
  for (const s of sessions) {
    const d = new Date(s.opened);
    if (Number.isNaN(d.getTime())) continue;
    cells[(d.getDay() + 6) % 7][d.getHours()]++;
    total++;
  }
  let peak: Heatmap["peak"] = null;
  cells.forEach((row, day) =>
    row.forEach((count, hour) => {
      if (count > 0 && (!peak || count > peak.count))
        peak = { day, hour, count };
    }),
  );
  return {
    cells,
    max: peak ? (peak as { count: number }).count : 0,
    total,
    peak,
  };
}

// The segment viewed most often (the first, on ties); null when nothing was watched.
export function replayPeak(timeline: Timeline): Segment | null {
  let best: Segment | null = null;
  for (const segment of timeline)
    if (!best || segment.views > best.views) best = segment;
  return best && best.views > 0 ? best : null;
}

// Share of the reported recording time (up to `endSeconds`) that has no views at all.
export function unwatchedShare(timeline: Timeline, endSeconds: number) {
  let total = 0,
    unwatched = 0;
  for (const s of timeline) {
    const length = Math.max(
      0,
      Math.min(s.durationSeconds, endSeconds - s.startSeconds),
    );
    total += length;
    if (s.views === 0) unwatched += length;
  }
  return total > 0 ? unwatched / total : null;
}

export function deviceCounts(sessions: SessionRecord[]) {
  const counts = { desktop: 0, mobile: 0, other: 0 };
  for (const s of sessions) counts[s.device]++;
  return counts;
}

// Share of watched sessions that ended within `seconds` of watch time.
export function shortWatchShare(sessions: SessionRecord[], seconds: number) {
  const watched = sessions.filter((s) => (s.watched ?? 0) > 0);
  return watched.length
    ? watched.filter((s) => s.watched! <= seconds).length / watched.length
    : null;
}

// Share of all sessions that happened in the first `n` calendar days of viewing.
export function earlyShare(days: DayCount[], n: number) {
  const total = days.reduce((sum, d) => sum + d.count, 0);
  return total
    ? days.slice(0, n).reduce((sum, d) => sum + d.count, 0) / total
    : null;
}

// Watch times (seconds, ascending) of sessions that watched anything.
export function retentionTimes(sessions: SessionRecord[]) {
  return sessions
    .map((s) => s.watched)
    .filter((n): n is number => n !== null && n > 0)
    .sort((a, b) => a - b);
}

// Share of the given watch times that last at least `seconds`.
export function stillWatching(times: number[], seconds: number) {
  return times.length
    ? times.filter((v) => v >= seconds).length / times.length
    : 0;
}

// The busiest weekday and the busiest hour of day, each from its own totals, so a single
// busy cell can't misstate both. Returns null until there are enough sessions to say.
export function heatmapPeaks(heatmap: Heatmap, minSessions = 8) {
  if (heatmap.total < minSessions) return null;
  const dayTotals = heatmap.cells.map((row) => row.reduce((a, b) => a + b, 0));
  const hourTotals = Array.from({ length: 24 }, (_, h) =>
    heatmap.cells.reduce((sum, row) => sum + row[h], 0),
  );
  return {
    day: dayTotals.indexOf(Math.max(...dayTotals)),
    hour: hourTotals.indexOf(Math.max(...hourTotals)),
  };
}
