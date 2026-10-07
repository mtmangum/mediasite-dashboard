import "./styles/base.css";
import "./styles/charts.css";
import "./styles/dashboard.css";
import "./theme";
import { element, errorMessage } from "./shared";
import type { Presentation, ViewingCharts } from "./shared";
import { fetchJson } from "./http";
import { dayKeyFor, monthKey, monthsFor, renderCalendar } from "./calendar";
import {
  lectureDay,
  lectureDetail,
  lectureNumber,
  sortItems,
  type SortKey,
} from "./lecture-label";
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
let sortKey: SortKey = "date";
let sortDir: 1 | -1 = 1;
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
const metricsOf = (item: Presentation) =>
  lectureMetrics(item, reports.get(item.id), windowValue(), now);
const courseOf = (id: string) =>
  courses.find((c) => c.items.some((i) => i.id === id));
// "Lecture 3", plus the recording's own title when it says something the course does not.
function lectureName(course: Course, item: Presentation) {
  const detail = lectureDetail(item);
  return `Lecture ${lectureNumber(course, item.id)}${detail ? ` · ${detail}` : ""}`;
}
const sortValue = (item: Presentation, key: SortKey, m = metricsOf(item)) =>
  key === "date"
    ? recordingDate(item)
    : key === "length"
      ? (item.durationMs ?? null)
      : key === "sessions"
        ? (m?.total ?? null)
        : key === "median"
          ? (m?.medianWatched ?? null)
          : (m?.completionRate ?? null);
const COLUMNS: [SortKey, string][] = [
  ["date", "Lecture"],
  ["length", "Length"],
  ["sessions", "Sessions"],
  ["median", "Typical watch"],
  ["completion", "Watched nearly all"],
];
function listView(course: Course, items: Presentation[]) {
  const measured = new Map(items.map((i) => [i.id, metricsOf(i)]));
  const sorted = sortItems(items, sortDir, (i) =>
    sortValue(i, sortKey, measured.get(i.id)),
  );
  const most = Math.max(
    0,
    ...course.items.map((i) => metricsOf(i)?.total ?? 0),
  );
  return `<div class="table-scroll"><table class="lecture-table"><thead><tr>${COLUMNS.map(
    ([key, label]) =>
      `<th scope="col" aria-sort="${key === sortKey ? (sortDir === 1 ? "ascending" : "descending") : "none"}"><button type="button" class="sort" data-sort="${key}">${label}<span aria-hidden="true">${key === sortKey ? (sortDir === 1 ? "↑" : "↓") : "↕"}</span></button></th>`,
  ).join("")}</tr></thead><tbody>${sorted
    .map((item) => {
      const m = measured.get(item.id) ?? null;
      const note = lectureNote(item, m);
      const length = (item.durationMs || 0) / 1000;
      const share =
        m?.medianWatched != null && length > 0
          ? `<small class="muted">${percent(Math.min(1, m.medianWatched / length))} of length</small>`
          : "";
      return `<tr><th scope="row"><button class="lecture-link" data-lecture="${esc(item.id)}">${item.thumbnail ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy">` : '<span class="thumbnail-placeholder">▶</span>'}<span><strong>${esc(lectureName(course, item))}</strong><span>${esc(lectureDay(item))}</span>${note ? `<small class="${failures.has(item.id) ? "bad" : "muted"}">${esc(note)}</small>` : ""}</span></button></th><td>${fmtDuration(item.durationMs)}</td><td><span>${number(m?.total ?? null)}</span>${m && most ? `<i class="mini-bar" aria-hidden="true"><b style="width:${Math.round((m.total / most) * 100)}%"></b></i>` : ""}</td><td><span>${span(m?.medianWatched ?? null)}</span>${share}</td><td>${percent(m?.completionRate ?? null)}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
// One lecture's figures, for the tooltips on calendar days and strip bars.
function lectureTip(course: Course, item: Presentation) {
  const m = metricsOf(item);
  const note = lectureNote(item, m);
  const at = recordingDate(item);
  const row = (label: string, value: string) =>
    `<dt>${label}</dt><dd>${esc(value)}</dd>`;
  const time =
    at === null
      ? ""
      : `${new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · `;
  return `<div class="cal-tip-item"><strong>${esc(lectureName(course, item))}</strong><span>${esc(time + fmtDuration(item.durationMs))}</span>${
    m
      ? `<dl>${row("Sessions", number(m.total))}${row("Typical watch", span(m.medianWatched))}${row("Watched nearly all", percent(m.completionRate))}</dl>`
      : ""
  }${note ? `<em>${esc(note)}</em>` : ""}</div>`;
}
function calendarView(course: Course, items: Presentation[]) {
  const months = monthsFor(items);
  if (!months.length) return listView(course, items);
  if (!months.includes(calMonth)) {
    // Open on the latest month with a lecture so far, else the first.
    const thisMonth = monthKey(now);
    calMonth = months.filter((m) => m <= thisMonth).pop() ?? months[0] ?? "";
  }
  const metrics = new Map(items.map((i) => [i.id, metricsOf(i)]));
  const most = Math.max(0, ...[...metrics.values()].map((m) => m?.total ?? 0));
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
// Sessions for every lecture in order, so a drop in interest shows at a glance.
function lectureStrip(course: Course) {
  const rows = course.items.map((item) => ({ item, m: metricsOf(item) }));
  const totals = rows.flatMap((r) => (r.m ? [r.m.total] : []));
  if (rows.length < 3 || !totals.length) return "";
  const max = Math.max(...totals),
    min = Math.min(...totals);
  const spread = max !== min;
  const first = rows.find((r) => r.m?.total === max)!;
  const last = rows.find((r) => r.m?.total === min)!;
  const average = totals.reduce((a, b) => a + b, 0) / totals.length;
  const bars = rows
    .map(({ item, m }) => {
      const partial =
        m && windowValue() === "first7" && firstWeekIncomplete(item, now);
      const cls = !m
        ? " none"
        : spread && m.total === max
          ? " high"
          : spread && m.total === min
            ? " low"
            : "";
      const label = `${lectureName(course, item)}, ${lectureDay(item)}: ${m ? `${m.total.toLocaleString()} sessions${partial ? " (first week in progress)" : ""}` : "report unavailable"}`;
      return `<button type="button" class="strip-bar${cls}${partial ? " partial" : ""}" data-lecture="${esc(item.id)}" data-strip="${esc(item.id)}" style="--h:${m && max ? (m.total / max).toFixed(3) : 0}" aria-label="${esc(label)}"><i></i></button>`;
    })
    .join("");
  const name = (r: (typeof rows)[number]) =>
    `${lectureName(course, r.item).split(" · ")[0]} (${number(r.m!.total)})`;
  return `<section class="panel strip-panel"><div class="section-heading"><div><h2>Sessions by lecture</h2><p class="muted">One bar per lecture, in date order. Select a bar to open its report.</p></div></div><div class="strip" role="group" aria-label="Sessions by lecture">${bars}</div><div class="strip-axis" aria-hidden="true"><span>${esc(
    lectureDay(rows[0].item)
      .replace(/^\w+, /, "")
      .replace(/, \d{4}$/, ""),
  )}</span><span>${esc(
    lectureDay(rows[rows.length - 1].item)
      .replace(/^\w+, /, "")
      .replace(/, \d{4}$/, ""),
  )}</span></div><p class="strip-note muted">${spread ? `Most watched ${esc(name(first))} · Least watched ${esc(name(last))} · ` : ""}Average ${number(Math.round(average))} per lecture</p></section>`;
}
// Totals, each set beside the same figure for the semester's other courses.
function metricTiles(course: Course, list: Course[]) {
  const m = courseMetrics(course, reports, windowValue(), now);
  const others = list.filter((c) => c.key !== course.key);
  const pooled = others.length
    ? courseMetrics(
        { ...course, items: others.flatMap((c) => c.items) },
        reports,
        windowValue(),
        now,
      )
    : null;
  const label = others.length === 1 ? others[0].code : "Other courses";
  const perLecture = (x: { sessions: number | null; available: number }) =>
    x.sessions !== null && x.available
      ? Math.round(x.sessions / x.available)
      : null;
  const bench = (value: string | null) =>
    value === null
      ? ""
      : `<small class="bench">${esc(label)}: ${esc(value)}</small>`;
  const own = perLecture(m);
  const other = pooled ? perLecture(pooled) : null;
  const tiles: [string, string, string, string][] = [
    [
      "Sessions",
      number(m.sessions),
      `Anonymous visits${own === null ? "" : ` · ${number(own)} per lecture`}`,
      bench(other === null ? null : `${number(other)} per lecture`),
    ],
    [
      "Typical watch time",
      span(m.median),
      "Median among sessions with watch time",
      bench(pooled?.median == null ? null : span(pooled.median)),
    ],
    [
      "Watched nearly all",
      percent(m.completion),
      "Sessions covering 85%+ of the recording",
      bench(pooled?.completion == null ? null : percent(pooled.completion)),
    ],
  ];
  return `<div class="metrics">${tiles
    .map(
      ([name, value, note, extra]) =>
        `<div class="metric"><span>${name}</span><strong>${value}</strong><small>${note}</small>${extra}</div>`,
    )
    .join("")}</div>${
    !busy && m.available < course.items.length
      ? `<p class="metrics-note muted">Totals exclude ${course.items.length - m.available} of ${course.items.length} recordings whose reports are unavailable.</p>`
      : ""
  }`;
}
function render() {
  hideTip();
  const list = visible();
  if (!list.some((c) => c.key === selected)) selected = list[0]?.key || "";
  const course = current();
  element("courseCount").textContent = String(list.length);
  element("windowName").textContent = windowSelect.selectedOptions[0].text;
  element("courseHeading").innerHTML = course
    ? `<p class="eyebrow">${esc(term.value.toUpperCase())} · ${esc(course.code)}${course.section ? ` · SECTION ${esc(course.section)}` : ""}</p><h1>${esc(course.title)}</h1><p class="muted">${[multiInstructor && `<span class="person">${esc(course.instructor)}</span>`, dateRange(course)].filter(Boolean).join(" · ")}</p>`
    : "<h1>Your courses</h1>";
  element("courses").innerHTML = list
    .map(
      (c) =>
        `<button data-course="${esc(c.key)}" class="course-link ${c.key === selected ? "active" : ""}" ${c.key === selected ? 'aria-current="true"' : ""}><strong>${esc(c.code)}${c.section ? `<em>Section ${esc(c.section)}</em>` : ""}</strong><span>${esc(c.title)}</span><small>${courseSummary(c)}</small></button>`,
    )
    .join("");
  element("overview").innerHTML = course
    ? metricTiles(course, list) + lectureStrip(course)
    : '<p class="empty">No courses available for this selection.</p>';
  // A table of one course would only repeat the totals above.
  document.querySelector<HTMLElement>(".comparison")!.hidden = list.length < 2;
  element("comparison").innerHTML =
    `<div class="table-scroll"><table><thead><tr><th scope="col">Course</th><th scope="col">Sessions</th><th scope="col">Typical watch</th><th scope="col">Watched nearly all</th></tr></thead><tbody>${list
      .map((c) => {
        const m = courseMetrics(c, reports, windowValue(), now);
        return `<tr><th scope="row"><button class="table-course" data-course="${esc(c.key)}">${esc(c.code)}${c.section ? ` · ${esc(c.section)}` : ""}</button></th><td>${number(m.sessions)}</td><td>${span(m.median)}</td><td>${percent(m.completion)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><p class="table-note">${windowValue() === "first7" ? "Seven days from each release date; newer lectures have an incomplete window. Missing release dates are excluded." : windowValue() === "last30" ? "Sessions opened in the rolling 30 days through this refresh." : "All recorded session history through this refresh."} Unavailable reports are excluded from course totals.</p>`;
  const items = filteredItems();
  const sortName = COLUMNS.find(([k]) => k === sortKey)![1].toLowerCase();
  element("lectureCount").textContent =
    `${items.length} of ${course?.items.length || 0} recordings${
      view !== "list"
        ? ""
        : sortKey === "date" && sortDir === 1
          ? " · earliest first"
          : sortKey === "date"
            ? " · latest first"
            : ` · by ${sortName}, ${sortDir === 1 ? "low to high" : "high to low"}`
    }`;
  document
    .querySelectorAll<HTMLElement>("[data-view]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.view === view)),
    );
  element("lectures").innerHTML =
    !items.length || !course
      ? '<p class="empty">No lectures match your selection.</p>'
      : view === "calendar"
        ? calendarView(course, items)
        : listView(course, items);
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
      `Updated ${new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${failures.size ? ` · ${failures.size} reports unavailable` : ""}`;
  } catch (error) {
    element("status").textContent =
      `Unable to load the dashboard: ${errorMessage(error)}. Use Refresh to retry.`;
  } finally {
    setBusy(false);
    render();
  }
}
function openDetail(id: string) {
  const course = courseOf(id);
  const item = course?.items.find((i) => i.id === id);
  if (!course || !item) return;
  element("detailTitle").textContent =
    `${lectureName(course, item)} · ${lectureDay(item)}`;
  element("detailMeta").textContent =
    `${course.code}${course.section ? ` · Section ${course.section}` : ""} · ${course.title} · ${fmtDuration(item.durationMs)}`;
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
  dialog.scrollTop = 0;
}
document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-course],[data-lecture],[data-view],[data-month],[data-sort]",
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
  if (target?.dataset.sort) {
    const key = target.dataset.sort as SortKey;
    if (key === sortKey) sortDir = sortDir === 1 ? -1 : 1;
    else {
      sortKey = key;
      sortDir = key === "date" ? 1 : -1;
    }
    render();
  }
  if (target?.dataset.month) {
    calMonth = target.dataset.month;
    render();
  }
  if (target?.dataset.lecture) openDetail(target.dataset.lecture);
});
// One tooltip for calendar days and strip bars: the lectures' figures, on hover or focus.
const tip = document.createElement("div");
tip.className = "cal-tip";
tip.id = "calTip";
tip.setAttribute("role", "tooltip");
tip.hidden = true;
document.body.append(tip);
function tipContent(anchor: HTMLElement) {
  const course = current();
  if (!course) return null;
  const foot = `${windowSelect.selectedOptions[0].text} · Select to open the report`;
  if (anchor.dataset.strip) {
    const item = course.items.find((i) => i.id === anchor.dataset.strip);
    return item
      ? {
          heading: lectureDay(item, true),
          html: lectureTip(course, item),
          foot,
        }
      : null;
  }
  const key = anchor.dataset.day || "";
  const here = course.items.filter((i) => {
    const at = recordingDate(i);
    return at !== null && dayKeyFor(at) === key;
  });
  if (!here.length) return null;
  return {
    heading: lectureDay(here[0], true),
    html: here.map((i) => lectureTip(course, i)).join(""),
    foot,
  };
}
function showTip(anchor: HTMLElement) {
  const content = tipContent(anchor);
  if (!content) return hideTip();
  tip.innerHTML = `<div class="cal-tip-head">${esc(content.heading)}</div>${content.html}<div class="cal-tip-foot">${esc(content.foot)}</div>`;
  tip.hidden = false;
  const box = anchor.getBoundingClientRect();
  const width = tip.offsetWidth,
    height = tip.offsetHeight;
  const left = Math.max(
    8,
    Math.min(
      box.left + box.width / 2 - width / 2,
      document.documentElement.clientWidth - width - 8,
    ),
  );
  const top = box.top - height - 8 >= 8 ? box.top - height - 8 : box.bottom + 8;
  tip.style.transform = `translate(${left}px, ${top}px)`;
  (anchor.matches("button")
    ? [anchor]
    : [...anchor.querySelectorAll("button")]
  ).forEach((b) => b.setAttribute("aria-describedby", "calTip"));
}
function hideTip() {
  tip.hidden = true;
}
const tipAnchor = (event: Event) =>
  (event.target as HTMLElement).closest<HTMLElement>(
    "td[data-day], .strip-bar",
  );
for (const area of [element("lectures"), element("overview")]) {
  area.addEventListener("pointerover", (event) => {
    const anchor = tipAnchor(event);
    if (anchor) showTip(anchor);
    else hideTip();
  });
  area.addEventListener("pointerleave", hideTip);
  area.addEventListener("focusin", (event) => {
    const anchor = tipAnchor(event);
    if (anchor) showTip(anchor);
  });
  area.addEventListener("focusout", hideTip);
}
// An open info hint closes on a click elsewhere or Escape.
const closeHints = (except?: Element | null) =>
  document
    .querySelectorAll<HTMLDetailsElement>("details.hint[open]")
    .forEach((d) => d !== except && d.removeAttribute("open"));
document.addEventListener("click", (event) =>
  closeHints((event.target as Element).closest("details.hint")),
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeHints();
});
window.addEventListener("scroll", hideTip, true);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideTip();
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
      "Title",
      "Date",
      "Sessions",
      "Typical watch seconds",
      "Watched nearly all rate",
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
      lectureNumber(course, item.id),
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
