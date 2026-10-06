import "./styles/base.css";
import "./styles/charts.css";
import "./styles/dashboard.css";
import "./theme";
import { element, errorMessage } from "./shared";
import type { Presentation, ViewingCharts } from "./shared";
import { fetchJson } from "./http";
import { dayKeyFor, monthKey, monthsFor, renderCalendar } from "./calendar";
import { demoLibrary, demoResponse } from "./demo-api";
import { esc, fmtDuration, fmtSpan } from "./format";
import {
  groupCourses,
  courseMetrics,
  lectureMetrics,
  recordingDate,
  firstWeekIncomplete,
  type Course,
  type ReportingWindow,
} from "./course-model";
import type { Frame } from "./recording-pane";
import { renderViewingCharts } from "./viewing-charts";

type LibraryView = "list" | "calendar";
const viewKey = "mediasite-library-view";
let view: LibraryView = "list";
try {
  if (localStorage.getItem(viewKey) === "calendar") view = "calendar";
} catch {
  // The view still switches when browser storage is unavailable.
}
let calMonth = "";
const calendarTips = new Map<string, string>();
let calendarFoot = "";
let multiInstructor = false;
let courses: Course[] = [],
  selected = "",
  mode = "demo",
  busy = false;
let now = Date.now();
const reports = new Map<string, ViewingCharts>();
const failures = new Map<string, string>();
const term = element<HTMLSelectElement>("semester");
const windowSelect = element<HTMLSelectElement>("window");
const search = element<HTMLInputElement>("search");
const dialog = element<HTMLDialogElement>("detail");
const windowValue = () => windowSelect.value as ReportingWindow;
const visible = () => courses.filter((c) => c.semester === term.value);
const current = () => visible().find((c) => c.key === selected);
const number = (n: number | null) => (n === null ? "—" : n.toLocaleString());
const percent = (n: number | null) =>
  n === null ? "—" : `${Math.round(n * 100)}%`;
const span = (n: number | null) => (n === null ? "—" : fmtSpan(n));
const date = (item: Presentation) => {
  const at = recordingDate(item);
  return at === null
    ? "Undated"
    : new Date(at).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};
function options(select: HTMLSelectElement, values: string[]) {
  const previous = select.value;
  select.innerHTML = values
    .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
    .join("");
  if (values.includes(previous)) select.value = previous;
}
function termOrder(value: string) {
  const [year, season] = value.split(" ");
  return (
    (Number(year) || 0) * 10 + ({ Spring: 1, Summer: 2, Fall: 3 }[season] || 0)
  );
}
function updateTerms() {
  const terms = [...new Set(courses.map((c) => c.semester))].sort(
    (a, b) => termOrder(b) - termOrder(a),
  );
  options(term, terms);
  // One semester needs no control: the page heading already names it.
  element("semesterBlock").hidden = terms.length < 2;
}
function filteredItems() {
  return (current()?.items || []).filter((i) =>
    `${i.title || ""} ${i.description || ""}`
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  );
}
function courseSummary(c: Course) {
  const { sessions } = courseMetrics(c, reports, "all", now);
  return [
    `${c.items.length} lectures`,
    sessions !== null && `${number(sessions)} sessions`,
  ]
    .filter(Boolean)
    .join(" · ");
}
function dateRange(c: Course) {
  const times = c.items
    .map(recordingDate)
    .filter((t): t is number => t !== null);
  if (!times.length) return "";
  const first = new Date(Math.min(...times)),
    last = new Date(Math.max(...times));
  const day = { month: "short", day: "numeric" } as const;
  const text = (d: Date, year: boolean) =>
    d.toLocaleDateString([], year ? { ...day, year: "numeric" } : day);
  const sameYear = first.getFullYear() === last.getFullYear();
  return `${text(first, !sameYear)} – ${text(last, true)}`;
}
function lectureNote(item: Presentation, m: ReturnType<typeof lectureMetrics>) {
  return failures.has(item.id)
    ? "Report unavailable"
    : !reports.has(item.id)
      ? "Loading report…"
      : reports.get(item.id)?.sessions === null
        ? "Session data unavailable"
        : windowValue() === "first7" && !m
          ? "Release date unavailable"
          : windowValue() === "first7" && firstWeekIncomplete(item, now)
            ? "First week in progress"
            : "";
}
function listView(items: Presentation[]) {
  return `<div class="table-scroll"><table class="lecture-table"><thead><tr><th scope="col">Lecture</th><th scope="col">Length</th><th scope="col">Sessions</th><th scope="col">Median watch</th><th scope="col">Completion</th></tr></thead><tbody>${items
    .map((item) => {
      const m = lectureMetrics(item, reports.get(item.id), windowValue(), now);
      const note = lectureNote(item, m);
      return `<tr><th scope="row"><button class="lecture-link" data-lecture="${esc(item.id)}">${item.thumbnail ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy">` : '<span class="thumbnail-placeholder">▶</span>'}<span><strong>${esc(date(item))}</strong><span>${esc(item.title || "Untitled")}</span>${note ? `<small class="${failures.has(item.id) ? "bad" : "muted"}">${esc(note)}</small>` : ""}</span></button></th><td>${fmtDuration(item.durationMs)}</td><td>${number(m?.total ?? null)}</td><td>${span(m?.medianWatched ?? null)}</td><td>${percent(m?.completionRate ?? null)}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function calendarView(items: Presentation[]) {
  const months = monthsFor(items);
  if (!months.includes(calMonth)) {
    // Open on the latest month with a lecture so far, else the first.
    const thisMonth = monthKey(now);
    calMonth = months.filter((m) => m <= thisMonth).pop() ?? months[0] ?? "";
  }
  const metrics = new Map(
    items.map((i) => [
      i.id,
      lectureMetrics(i, reports.get(i.id), windowValue(), now),
    ]),
  );
  const most = Math.max(0, ...[...metrics.values()].map((m) => m?.total ?? 0));
  if (!months.length) return listView(items);
  calendarTips.clear();
  const windowName = windowSelect.selectedOptions[0]?.text ?? "";
  for (const item of items) {
    const at = recordingDate(item);
    if (at === null) continue;
    const m = metrics.get(item.id) ?? null;
    const note = lectureNote(item, m);
    const row = (label: string, value: string) =>
      `<dt>${label}</dt><dd>${esc(value)}</dd>`;
    const key = dayKeyFor(at);
    calendarTips.set(
      key,
      (calendarTips.get(key) ?? "") +
        `<div class="cal-tip-item"><strong>${esc(item.title || "Untitled")}</strong><span>${esc(new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))} · ${esc(fmtDuration(item.durationMs))}</span>${
          m
            ? `<dl>${row("Sessions", number(m.total))}${row("Median watch", span(m.medianWatched))}${row("Completion", percent(m.completionRate))}</dl>`
            : ""
        }${note ? `<em>${esc(note)}</em>` : ""}</div>`,
    );
  }
  calendarFoot = `${windowName} · Select a lecture to open its report`;
  return renderCalendar(items, calMonth, months, (item) => {
    const m = metrics.get(item.id) ?? null;
    if (!m)
      return {
        value: "—",
        note: lectureNote(item, m) || "unavailable",
        level: null,
      };
    return {
      value: number(m.total),
      note: lectureNote(item, m) ? "sessions · partial" : "sessions",
      level: most ? Math.sqrt(m.total / most) : 0,
    };
  });
}
function render() {
  hideCalTip();
  const list = visible();
  if (!list.some((c) => c.key === selected)) selected = list[0]?.key || "";
  const course = current();
  element("courseCount").textContent = String(list.length);
  element("semesterLabel").textContent = term.value.toUpperCase();
  element("courses").innerHTML = list
    .map(
      (c) =>
        `<button data-course="${esc(c.key)}" class="course-link ${c.key === selected ? "active" : ""}" ${c.key === selected ? 'aria-current="true"' : ""}><strong>${esc(c.code)}${c.section ? `<em>Section ${esc(c.section)}</em>` : ""}</strong><span>${esc(c.title)}</span><small>${courseSummary(c)}</small></button>`,
    )
    .join("");
  element("overview").innerHTML = course
    ? (() => {
        const m = courseMetrics(course, reports, windowValue(), now);
        return `<div class="course-heading"><div><span class="eyebrow">${esc(course.code)}${course.section ? ` · SECTION ${esc(course.section)}` : ""}</span><h2>${esc(course.title)}</h2><p class="muted">${[multiInstructor && `<span class="person">${esc(course.instructor)}</span>`, dateRange(course)].filter(Boolean).join(" · ")}</p></div></div><div class="metrics">${[
          ["Sessions", number(m.sessions), "Anonymous viewing visits"],
          [
            "Median watch time",
            span(m.median),
            "Among sessions with watch time",
          ],
          ["Completion", percent(m.completion), "85% coverage of a recording"],
        ]
          .map(
            ([label, value, note]) =>
              `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`,
          )
          .join("")}</div>${
          !busy && m.available < course.items.length
            ? `<p class="metrics-note muted">Totals exclude ${course.items.length - m.available} of ${course.items.length} recordings whose reports are unavailable.</p>`
            : ""
        }`;
      })()
    : '<p class="empty">No courses available for this selection.</p>';
  element("comparison").innerHTML =
    `<div class="table-scroll"><table><thead><tr><th scope="col">Course</th><th scope="col">Sessions</th><th scope="col">Median watch</th><th scope="col">Completion</th></tr></thead><tbody>${list
      .map((c) => {
        const m = courseMetrics(c, reports, windowValue(), now);
        return `<tr><th scope="row"><button class="table-course" data-course="${esc(c.key)}">${esc(c.code)}${c.section ? ` · ${esc(c.section)}` : ""}</button></th><td>${number(m.sessions)}</td><td>${span(m.median)}</td><td>${percent(m.completion)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><p class="table-note">${windowValue() === "first7" ? "Seven days from each release date; newer lectures have an incomplete window. Missing release dates are excluded." : windowValue() === "last30" ? "Sessions opened in the rolling 30 days through this refresh." : "All recorded session history through this refresh."} Unavailable reports are excluded from course totals.</p>`;
  const items = filteredItems();
  element("lectureCount").textContent =
    `${items.length} of ${course?.items.length || 0} recordings${view === "list" ? " · earliest first" : ""}`;
  document
    .querySelectorAll<HTMLElement>("[data-view]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.view === view)),
    );
  element("lectures").innerHTML = !items.length
    ? '<p class="empty">No lectures match your selection.</p>'
    : view === "calendar"
      ? calendarView(items)
      : listView(items);
  element<HTMLButtonElement>("retry").hidden =
    !failures.size && ![...reports.values()].some((r) => r.sessions === null);
  element<HTMLButtonElement>("export").disabled = !course || busy;
}
async function getReport(id: string, fresh: boolean) {
  if (mode === "demo")
    return demoResponse("GET", "/viewing.json", new URLSearchParams({ id }))!
      .body as ViewingCharts;
  return fetchJson<ViewingCharts>(
    `/api/viewing?id=${encodeURIComponent(id)}${fresh ? "&fresh=1" : ""}`,
  );
}
async function loadReports(items: Presentation[], fresh = false) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        try {
          const data = await getReport(item.id, fresh);
          reports.set(item.id, data);
          failures.delete(item.id);
          if (data.sessions === null)
            failures.set(
              item.id,
              data.histogramError || "Session data unavailable",
            );
        } catch (error) {
          failures.set(item.id, errorMessage(error));
        }
        render();
      }
    }),
  );
}
function setBusy(value: boolean) {
  busy = value;
  element<HTMLButtonElement>("refresh").disabled = value;
  element<HTMLButtonElement>("retry").disabled = value;
}
async function load(fresh = false) {
  if (busy) return;
  setBusy(true);
  element("status").textContent = "Loading library and reports…";
  try {
    mode = __DEMO__
      ? "demo"
      : (await fetchJson<{ mode: string }>("/api/config")).mode;
    const items =
      mode === "demo"
        ? demoLibrary().map((r) => r.item)
        : (
            await fetchJson<{ items: Presentation[] }>(
              `/api/library${fresh ? "?fresh=1" : ""}`,
            )
          ).items;
    now = Date.now();
    reports.clear();
    failures.clear();
    courses = groupCourses(items);
    // A display label from metadata, never an account identity or access filter.
    const names = [...new Set(courses.map((c) => c.instructor))];
    const name =
      names.length === 1 && names[0] !== "Unknown instructor"
        ? names[0]
        : "Your workspace";
    element("instructorName").textContent = name;
    element("instructorMeta").textContent =
      `${items.length} recording${items.length === 1 ? "" : "s"}`;
    multiInstructor = names.length > 1;
    updateTerms();
    render();
    element("mode").textContent = mode === "demo" ? "Sample data" : "Live data";
    element("mode").title =
      mode === "demo"
        ? "Fictional courses and sessions with real illustrative lecture frames."
        : "Read-only reports from your Mediasite account.";
    await loadReports(items, fresh);
    element("status").textContent =
      `${items.length} recordings loaded${failures.size ? ` · ${failures.size} reports unavailable` : ""} · Updated ${new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch (error) {
    element("status").textContent =
      `Unable to load the dashboard: ${errorMessage(error)}. Use Refresh to retry.`;
  } finally {
    setBusy(false);
    render();
  }
}
function openDetail(id: string) {
  const item = courses.flatMap((c) => c.items).find((i) => i.id === id);
  if (!item) return;
  element("detailTitle").textContent = date(item);
  element("detailMeta").textContent =
    `${item.title || "Untitled"} · ${fmtDuration(item.durationMs)}`;
  const data = reports.get(id);
  if (data)
    renderViewingCharts(
      element("detailBody"),
      data,
      item,
      mode === "demo"
        ? (
            demoResponse("GET", "/preview.json", new URLSearchParams({ id }))!
              .body as { frames: Frame[] }
          ).frames
        : null,
    );
  else
    element("detailBody").innerHTML =
      `<p class="empty">${esc(failures.get(id) || "Report is loading. Close and reopen when reports finish loading.")}</p>`;
  dialog.showModal();
}
document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-course],[data-lecture],[data-view],[data-month]",
  );
  if (target?.dataset.course) {
    selected = target.dataset.course;
    search.value = "";
    calMonth = "";
    render();
  }
  if (target?.dataset.view) {
    view = target.dataset.view === "calendar" ? "calendar" : "list";
    try {
      localStorage.setItem(viewKey, view);
    } catch {}
    render();
  }
  if (target?.dataset.month) {
    calMonth = target.dataset.month;
    render();
  }
  if (target?.dataset.lecture) openDetail(target.dataset.lecture);
});
// A tooltip for calendar days: every lecture that day with its figures, shown on hover or focus.
const calTip = document.createElement("div");
calTip.className = "cal-tip";
calTip.id = "calTip";
calTip.setAttribute("role", "tooltip");
calTip.hidden = true;
document.body.append(calTip);
function showCalTip(day: HTMLElement) {
  const html = calendarTips.get(day.dataset.day || "");
  if (!html) return hideCalTip();
  const [year, month, d] = (day.dataset.day || "").split("-").map(Number);
  const heading = new Date(year, month - 1, d).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  calTip.innerHTML = `<div class="cal-tip-head">${esc(heading)}</div>${html}<div class="cal-tip-foot">${esc(calendarFoot)}</div>`;
  calTip.hidden = false;
  const box = day.getBoundingClientRect();
  const width = calTip.offsetWidth,
    height = calTip.offsetHeight;
  const left = Math.max(
    8,
    Math.min(
      box.left + box.width / 2 - width / 2,
      document.documentElement.clientWidth - width - 8,
    ),
  );
  const top = box.top - height - 8 >= 8 ? box.top - height - 8 : box.bottom + 8;
  calTip.style.transform = `translate(${left}px, ${top}px)`;
  day
    .querySelectorAll(".cal-lecture")
    .forEach((b) => b.setAttribute("aria-describedby", "calTip"));
}
function hideCalTip() {
  calTip.hidden = true;
}
const calDay = (event: Event) =>
  (event.target as HTMLElement).closest<HTMLElement>("td[data-day]");
element("lectures").addEventListener("pointerover", (event) => {
  const day = calDay(event);
  if (day) showCalTip(day);
  else hideCalTip();
});
element("lectures").addEventListener("pointerleave", hideCalTip);
element("lectures").addEventListener("focusin", (event) => {
  const day = calDay(event);
  if (day) showCalTip(day);
});
element("lectures").addEventListener("focusout", hideCalTip);
window.addEventListener("scroll", hideCalTip, true);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideCalTip();
});
term.addEventListener("change", render);
windowSelect.addEventListener("change", render);
search.addEventListener("input", render);
element("refresh").addEventListener("click", () => void load(true));
element("retry").addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  await loadReports(
    courses.flatMap((c) => c.items).filter((i) => failures.has(i.id)),
    true,
  );
  setBusy(false);
  render();
  element("status").textContent = failures.size
    ? `${failures.size} reports remain unavailable.`
    : "All reports available.";
});
element("closeDetail").addEventListener("click", () => dialog.close());
element("export").addEventListener("click", () => {
  const course = current();
  if (!course) return;
  const rows: unknown[][] = [
    [
      "Course",
      "Section",
      "Instructor",
      "Semester",
      "Window",
      "Lecture",
      "Date",
      "Sessions",
      "Median watch seconds",
      "Completion rate",
      "Report status",
    ],
  ];
  for (const item of course.items) {
    const m = lectureMetrics(item, reports.get(item.id), windowValue(), now);
    rows.push([
      course.code,
      course.section,
      course.instructor,
      course.semester,
      windowSelect.selectedOptions[0].text,
      item.title,
      date(item),
      m?.total,
      m?.medianWatched,
      m?.completionRate,
      m ? "Available" : "Unavailable",
    ]);
  }
  const csv = rows
    .map((row) =>
      row
        .map((v) => {
          let cell = String(v ?? "");
          if (/^[=+@\-\t\r]/.test(cell)) cell = "'" + cell;
          return `"${cell.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "course-metrics.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
void load();
