import { parseCourseTitle } from "./course-title.ts";
import { median, sessionStats } from "./viewing-stats.ts";
import type { Presentation, SessionRecord, ViewingCharts } from "./shared";

export type ReportingWindow = "all" | "first7" | "last30";
const DAY = 86400000;
export function recordingDate(item: Presentation) {
  for (const value of [item.recorded, item.created]) {
    const time = Date.parse(value || "");
    if (Number.isFinite(time)) return time;
  }
  return null;
}
export function semester(item: Presentation) {
  const time = recordingDate(item);
  if (time === null) return "Undated";
  const date = new Date(time);
  return `${date.getFullYear()} ${date.getMonth() < 5 ? "Spring" : date.getMonth() < 7 ? "Summer" : "Fall"}`;
}
export interface Course {
  key: string;
  code: string;
  title: string;
  section: string;
  instructor: string;
  semester: string;
  items: Presentation[];
}
export function groupCourses(items: Presentation[]): Course[] {
  const groups = new Map<string, Course>();
  for (const item of items) {
    const parsed = parseCourseTitle(item.title);
    const instructor =
      parsed.instructor || item.presenter || item.owner || "Unknown instructor";
    const code = parsed.course || item.folder || "Other recordings";
    const section = parsed.sections || "";
    const term = semester(item);
    const key = JSON.stringify([instructor, term, code, section]);
    if (!groups.has(key))
      groups.set(key, {
        key,
        code,
        title: parsed.course ? parsed.title : code,
        section,
        instructor,
        semester: term,
        items: [],
      });
    groups.get(key)!.items.push(item);
  }
  for (const group of groups.values())
    group.items.sort(
      (a, b) =>
        (recordingDate(a) ?? Infinity) - (recordingDate(b) ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
}
export function windowSessions(
  item: Presentation,
  sessions: SessionRecord[],
  window: ReportingWindow,
  now: number,
) {
  const release = Date.parse(item.created || "");
  if (window === "first7" && !Number.isFinite(release)) return null;
  const start =
    window === "last30"
      ? now - 30 * DAY
      : window === "first7"
        ? release
        : -Infinity;
  const end = window === "first7" ? release + 7 * DAY : Infinity;
  return sessions.filter((s) => {
    const at = Date.parse(s.opened);
    return at >= start && at <= now && at < end;
  });
}
export function firstWeekIncomplete(item: Presentation, now: number) {
  const release = Date.parse(item.created || "");
  return Number.isFinite(release) && now < release + 7 * DAY;
}
export function lectureMetrics(
  item: Presentation,
  report: ViewingCharts | undefined,
  window: ReportingWindow,
  now: number,
) {
  if (!report?.sessions) return null;
  const sessions = windowSessions(item, report.sessions, window, now);
  if (!sessions) return null;
  const stats = sessionStats(sessions, (item.durationMs || 0) / 1000);
  // Completion cannot be inferred when recording length is missing.
  if (!(item.durationMs && item.durationMs > 0)) {
    stats.completionBase = 0;
    stats.completionRate = null;
    stats.completed = 0;
  }
  return { ...stats, sessions };
}
export function courseMetrics(
  course: Course,
  reports: Map<string, ViewingCharts>,
  window: ReportingWindow,
  now: number,
) {
  const metrics = course.items
    .map((item) => lectureMetrics(item, reports.get(item.id), window, now))
    .filter((m) => m !== null);
  const base = metrics.reduce((sum, m) => sum + m.completionBase, 0);
  return {
    available: metrics.length,
    sessions: metrics.length
      ? metrics.reduce((sum, m) => sum + m.total, 0)
      : null,
    median: median(
      metrics.flatMap((m) =>
        m.sessions
          .map((s) => s.watched)
          .filter((n): n is number => n !== null && n > 0),
      ),
    ),
    completion: base
      ? metrics.reduce((sum, m) => sum + m.completed, 0) / base
      : null,
  };
}
