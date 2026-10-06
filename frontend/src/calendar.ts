import { recordingDate } from "./course-model.ts";
import { esc } from "./format.ts";
import type { Presentation } from "./shared";

const pad = (n: number) => String(n).padStart(2, "0");
// Local-calendar keys: "2026-08" for a month and "2026-08-24" for a day.
export const monthKey = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const dayKey = (d: Date) => `${monthKey(d.getTime())}-${pad(d.getDate())}`;
export const dayKeyFor = (time: number) => dayKey(new Date(time));
const monthStart = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
};

// Every month from the first to the last dated item, including months with no lectures.
export function monthsFor(items: Presentation[]) {
  const times = items.map(recordingDate).filter((t): t is number => t !== null);
  if (!times.length) return [];
  const last = monthKey(Math.max(...times));
  const months: string[] = [];
  for (
    let d = monthStart(monthKey(Math.min(...times)));
    monthKey(d.getTime()) <= last;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  )
    months.push(monthKey(d.getTime()));
  return months;
}

// Weeks (Sunday first) covering the month, padded with the neighbouring months' days.
export function monthGrid(key: string) {
  const first = monthStart(key);
  const weeks: { key: string; day: number; inMonth: boolean }[][] = [];
  for (let offset = -first.getDay(); ; offset += 7) {
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(first.getFullYear(), first.getMonth(), 1 + offset + i);
      return {
        key: dayKey(d),
        day: d.getDate(),
        inMonth: d.getMonth() === first.getMonth(),
      };
    });
    weeks.push(week);
    if (
      week[6].key >=
      dayKey(new Date(first.getFullYear(), first.getMonth() + 1, 0))
    )
      return weeks;
  }
}

const weekdays = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 7 + i).toLocaleDateString([], { weekday: "short" }),
);
const clock = (time: number) =>
  new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export interface CalendarCell {
  value: string; // the headline figure, such as a session count
  note: string; // what the figure is, or why it is missing
  level: number | null; // 0–1 shading, null when there is no figure
}

// A month of lectures. `describe` supplies each lecture's figure so this stays free of report state.
export function renderCalendar(
  items: Presentation[],
  month: string,
  months: string[],
  describe: (item: Presentation) => CalendarCell,
) {
  const byDay = new Map<string, { item: Presentation; time: number }[]>();
  const undated: Presentation[] = [];
  for (const item of items) {
    const time = recordingDate(item);
    if (time === null) {
      undated.push(item);
      continue;
    }
    const key = dayKey(new Date(time));
    byDay.set(key, [...(byDay.get(key) || []), { item, time }]);
  }
  const index = months.indexOf(month);
  const label = monthStart(month).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });
  const lecture = ({ item, time }: { item: Presentation; time: number }) => {
    const cell = describe(item);
    return `<button type="button" class="cal-lecture${cell.level === null ? " none" : ""}" data-lecture="${esc(item.id)}" style="--level:${(cell.level ?? 0).toFixed(2)}" aria-label="${esc(`${label.split(" ")[0]} ${new Date(time).getDate()}, ${clock(time)}: ${cell.value} ${cell.note}`)}"><span class="cal-time">${esc(clock(time))}</span><strong>${esc(cell.value)}</strong><small>${esc(cell.note)}</small></button>`;
  };
  const rows = monthGrid(month)
    .map(
      (week) =>
        `<tr>${week
          .map((day) =>
            day.inMonth
              ? `<td${byDay.has(day.key) ? ` data-day="${day.key}"` : ""}><span class="cal-day">${day.day}</span>${(
                  byDay.get(day.key) || []
                )
                  .sort((a, b) => a.time - b.time)
                  .map(lecture)
                  .join("")}</td>`
              : '<td class="outside"><span class="cal-day">' +
                day.day +
                "</span></td>",
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="calendar"><div class="cal-nav"><button type="button" class="secondary" data-month="${esc(months[index - 1] ?? "")}" aria-label="Previous month"${index > 0 ? "" : " disabled"}>‹</button><h3 aria-live="polite">${esc(label)}</h3><button type="button" class="secondary" data-month="${esc(months[index + 1] ?? "")}" aria-label="Next month"${index < months.length - 1 ? "" : " disabled"}>›</button></div><table class="cal-grid"><thead><tr>${weekdays.map((d) => `<th scope="col">${esc(d)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>${
    undated.length
      ? `<p class="cal-undated muted">No recording date: ${undated.map((i) => `<button type="button" class="link" data-lecture="${esc(i.id)}">${esc(i.title || "Untitled")}</button>`).join(", ")}</p>`
      : ""
  }</div>`;
}
