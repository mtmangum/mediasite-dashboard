import "./styles/base.css";
import "./styles/charts.css";
import "./styles/dashboard.css";
import "./theme";
import { element, errorMessage } from "./shared";
import type { Presentation, ViewingCharts } from "./shared";
import { fetchJson } from "./http";
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
  options(
    term,
    [...new Set(courses.map((c) => c.semester))].sort(
      (a, b) => termOrder(b) - termOrder(a),
    ),
  );
}
function filteredItems() {
  return (current()?.items || []).filter((i) =>
    `${i.title || ""} ${i.description || ""}`
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  );
}
function render() {
  const list = visible();
  if (!list.some((c) => c.key === selected)) selected = list[0]?.key || "";
  const course = current();
  element("courseCount").textContent = String(list.length);
  element("semesterLabel").textContent = term.value.toUpperCase();
  element("courses").innerHTML = list
    .map(
      (c) =>
        `<button data-course="${esc(c.key)}" class="course-link ${c.key === selected ? "active" : ""}" ${c.key === selected ? 'aria-current="true"' : ""}><strong>${esc(c.code)}</strong><span>${esc(c.title)}</span><small>${c.items.length} lectures${c.section ? ` · ${esc(c.section)}` : ""}</small></button>`,
    )
    .join("");
  element("overview").innerHTML = course
    ? (() => {
        const m = courseMetrics(course, reports, windowValue(), now);
        return `<div class="course-heading"><div><span class="eyebrow">${esc(course.code)}${course.section ? ` · SECTION ${esc(course.section)}` : ""}</span><h2>${esc(course.title)}</h2><p class="muted"><span class="person">${esc(course.instructor)}</span> · ${esc(course.semester)}</p></div><span class="badge">${course.items.length} recordings</span></div><div class="metrics">${[
          ["Sessions", number(m.sessions), "Anonymous viewing visits"],
          [
            "Median watch time",
            span(m.median),
            "Among sessions with watch time",
          ],
          ["Completion", percent(m.completion), "85% coverage of a recording"],
          [
            "Reports available",
            `${m.available} / ${course.items.length}`,
            "Included in these metrics",
          ],
        ]
          .map(
            ([label, value, note]) =>
              `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`,
          )
          .join("")}</div>`;
      })()
    : '<p class="empty">No courses available for this selection.</p>';
  element("comparison").innerHTML =
    `<div class="table-scroll"><table><thead><tr><th scope="col">Course</th><th scope="col">Sessions</th><th scope="col">Median watch</th><th scope="col">Completion</th><th scope="col">Reports</th></tr></thead><tbody>${list
      .map((c) => {
        const m = courseMetrics(c, reports, windowValue(), now);
        return `<tr><th scope="row"><button class="table-course" data-course="${esc(c.key)}">${esc(c.code)}${c.section ? ` · ${esc(c.section)}` : ""}</button></th><td>${number(m.sessions)}</td><td>${span(m.median)}</td><td>${percent(m.completion)}</td><td>${m.available}/${c.items.length}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><p class="table-note">${windowValue() === "first7" ? "Seven days from each release date; newer lectures have an incomplete window. Missing release dates are excluded." : windowValue() === "last30" ? "Sessions opened in the rolling 30 days through this refresh." : "All recorded session history through this refresh."} Unavailable reports are excluded from course totals.</p>`;
  const items = filteredItems();
  element("lectureCount").textContent =
    `${items.length} of ${course?.items.length || 0} recordings · earliest first`;
  element("lectures").innerHTML = items.length
    ? `<div class="table-scroll"><table class="lecture-table"><thead><tr><th scope="col">Lecture</th><th scope="col">Length</th><th scope="col">Sessions</th><th scope="col">Median watch</th><th scope="col">Completion</th></tr></thead><tbody>${items
        .map((item) => {
          const m = lectureMetrics(
            item,
            reports.get(item.id),
            windowValue(),
            now,
          );
          const note = failures.has(item.id)
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
          return `<tr><th scope="row"><button class="lecture-link" data-lecture="${esc(item.id)}">${item.thumbnail ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy">` : '<span class="thumbnail-placeholder">▶</span>'}<span><strong>${esc(date(item))}</strong><span>${esc(item.title || "Untitled")}</span>${note ? `<small class="${failures.has(item.id) ? "bad" : "muted"}">${esc(note)}</small>` : ""}</span></button></th><td>${fmtDuration(item.durationMs)}</td><td>${number(m?.total ?? null)}</td><td>${span(m?.medianWatched ?? null)}</td><td>${percent(m?.completionRate ?? null)}</td></tr>`;
        })
        .join("")}</tbody></table></div>`
    : '<p class="empty">No lectures match your selection.</p>';
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
    element("instructorInitials").textContent =
      name === "Your workspace"
        ? "M"
        : name
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
    updateTerms();
    render();
    element("mode").textContent = mode === "demo" ? "Sample data" : "Live data";
    element("modeNote").textContent =
      mode === "demo"
        ? "Fictional courses and sessions. Real illustrative lecture frames."
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
    "[data-course],[data-lecture]",
  );
  if (target?.dataset.course) {
    selected = target.dataset.course;
    search.value = "";
    render();
  }
  if (target?.dataset.lecture) openDetail(target.dataset.lecture);
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
