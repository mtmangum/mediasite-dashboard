import { parseCourseTitle } from "./course-title.ts";
import { recordingDate, type Course } from "./course-model.ts";
import type { Presentation } from "./shared";

// Lectures are numbered by recording date within their course (1-based; 0 if not found).
export function lectureNumber(course: Course, id: string) {
  return course.items.findIndex((item) => item.id === id) + 1;
}

// A recording title that follows the course pattern only repeats what the course already says,
// so only titles that do not are worth showing.
export function lectureDetail(item: Presentation) {
  return parseCourseTitle(item.title).course ? "" : (item.title || "").trim();
}

export function lectureDay(item: Presentation, long = false) {
  const at = recordingDate(item);
  if (at === null) return "Undated";
  return new Date(at).toLocaleDateString(
    [],
    long
      ? { weekday: "long", month: "long", day: "numeric" }
      : { weekday: "short", month: "short", day: "numeric", year: "numeric" },
  );
}

export type SortKey = "date" | "length" | "sessions" | "median" | "completion";

// Sorts by a numeric value, keeping missing values last whichever way it runs.
export function sortItems<T>(
  items: T[],
  direction: 1 | -1,
  value: (item: T) => number | null,
) {
  const keyed = items.map((item, index) => ({
    item,
    index,
    value: value(item),
  }));
  keyed.sort((a, b) =>
    a.value === null || b.value === null
      ? Number(a.value === null) - Number(b.value === null) || a.index - b.index
      : (a.value - b.value) * direction || a.index - b.index,
  );
  return keyed.map((k) => k.item);
}
