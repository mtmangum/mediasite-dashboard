import { esc, fmtClock, fmtSpan, fmtTime } from "./format";
import { bindRecording, recordingPane, type Frame } from "./recording-pane";
import type { Presentation, SessionRecord, ViewingCharts } from "./shared";
import {
  COMPLETE_SHARE,
  deviceCounts,
  earlyShare,
  heatmapPeaks,
  replayPeak,
  retentionTimes,
  sessionStats,
  shortWatchShare,
  stillWatching,
  unwatchedShare,
  viewsByDay,
  weekHourHeatmap,
  type Heatmap,
} from "./viewing-stats";

const count = (value: number) => value.toLocaleString();
const pct = (share: number) => `${Math.round(share * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${count(n)} ${n === 1 ? one : many}`;
const y = (value: number, max: number) => 176 - (value / max) * 168;
const niceMax = (peak: number) => Math.max(2, Math.ceil(peak / 2) * 2);

const weekdayShort = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString([], { weekday: "short" }),
);
const weekdayLong = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString([], { weekday: "long" }),
);
const hourName = (hour: number) =>
  new Date(2024, 0, 1, hour % 24).toLocaleTimeString([], { hour: "numeric" });
const dayName = (date: Date, long = false) =>
  date.toLocaleDateString([], {
    ...(long ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
  });

const state = (message: string, bad = false) =>
  `<p class="chart-state ${bad ? "bad" : "muted"}">${esc(message)}</p>`;
const tile = (label: string, value: string, note: string) =>
  `<div class="stat-tile"><span class="stat-label">${esc(label)}</span><strong>${esc(value)}</strong><span class="stat-note">${esc(note)}</span></div>`;
const panel = (
  title: string,
  description: string,
  body: string,
  wide = false,
) =>
  `<section class="chart-panel${wide ? " wide" : ""}"><div class="chart-heading"><h3>${esc(title)}</h3></div><p class="chart-description muted">${esc(description)}</p>${body}</section>`;
const dataTable = (
  caption: string,
  columns: [string, string],
  rows: [string, string][],
) =>
  `<details class="chart-data"><summary>View exact counts</summary><table><caption>${esc(caption)}</caption><thead><tr><th scope="col">${esc(columns[0])}</th><th scope="col">${esc(columns[1])}</th></tr></thead><tbody>${rows.map(([a, b]) => `<tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td></tr>`).join("")}</tbody></table></details>`;

// An axis-labelled SVG plot; `overlay` HTML is positioned over the plot area.
function plot(
  kind: string,
  title: string,
  description: string,
  max: number,
  marks: string,
  labels: { fraction: number; label: string }[],
  axis: string,
  options: { focusable?: boolean; overlay?: string; yLabels?: string[] } = {},
) {
  const yLabels = options.yLabels || [count(max), count(max / 2), "0"];
  return `<div class="chart-plot"><div class="chart-y-axis" aria-hidden="true">${yLabels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>
    <div class="plot-area"><svg data-plot="${kind}" viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="${esc(title)}" ${options.focusable ? 'tabindex="0"' : ""}><desc>${esc(description)}</desc><path class="chart-grid" d="M0 8H600 M0 92H600 M0 176H600"/>${marks}</svg>${options.overlay || ""}</div>
    </div><div class="chart-x-axis" aria-hidden="true">${labels.map(({ fraction, label }) => `<span style="left:${fraction * 100}%" class="${fraction === 0 ? "axis-start" : fraction === 1 ? "axis-end" : ""}">${esc(label)}</span>`).join("")}</div><div class="chart-axis-label muted">${esc(axis)}</div>`;
}

// A column with rounded top corners, sitting on the zero baseline.
function column(x: number, width: number, value: number, max: number) {
  const height = 176 - y(value, max);
  if (height <= 0) return "";
  const top = 176 - height;
  const radius = Math.min(7, height / 2, width / 2);
  return `<path class="chart-bar" d="M${x} 176 V${top + radius} Q${x} ${top} ${x + radius} ${top} H${x + width - radius} Q${x + width} ${top} ${x + width} ${top + radius} V176 Z"/>`;
}

// One hoverable slot: a full-height hit area (larger than the mark) around the column.
const slot = (
  index: number,
  slots: number,
  value: number,
  max: number,
  tip: [string, string],
) => {
  const width = 600 / slots,
    gap = Math.min(10, width * 0.24);
  return `<g class="chart-slot" data-tip-value="${esc(tip[0])}" data-tip-label="${esc(tip[1])}"><rect class="chart-hit" x="${width * index}" y="0" width="${width}" height="180"/>${column(width * index + gap / 2, width - gap, value, max)}</g>`;
};

const evenLabels = (
  slots: number,
  text: (index: number) => string,
  ticks = 4,
) => {
  // With only a handful of slots, label every one.
  if (slots <= 8)
    return Array.from({ length: slots }, (_, index) => ({
      fraction:
        index === 0 ? 0 : index === slots - 1 ? 1 : (index + 0.5) / slots,
      label: text(index),
    }));
  const indexes = [
    ...new Set(
      Array.from({ length: ticks + 1 }, (_, i) =>
        Math.min(slots - 1, Math.round(((slots - 1) * i) / ticks)),
      ),
    ),
  ];
  return indexes.map((index) => ({
    fraction: index === 0 ? 0 : index === slots - 1 ? 1 : (index + 0.5) / slots,
    label: text(index),
  }));
};

function timelinePanel(
  data: ViewingCharts,
  end: number,
  peakSegment: ReturnType<typeof replayPeak>,
  presentation: Presentation,
  frames: Frame[] | null,
) {
  const { timeline } = data;
  if (timeline === null)
    return panel(
      "Engagement across the recording",
      "Views at each point of the recording, including replays.",
      state(data.timelineError || "Viewing timeline unavailable.", true),
      true,
    );
  if (!timeline.length || !peakSegment)
    return panel(
      "Engagement across the recording",
      "Views at each point of the recording, including replays.",
      state("No segment viewing activity has been reported yet."),
      true,
    );
  const max = niceMax(peakSegment.views);
  // Stepped segments preserve the API's actual reporting intervals, including gaps.
  let line = "";
  let lastEnd = 0;
  timeline.forEach((segment) => {
    const start = Math.min(end, segment.startSeconds);
    const stop = Math.min(end, segment.startSeconds + segment.durationSeconds);
    if (stop <= start) return;
    const x1 = (start / end) * 600,
      x2 = (stop / end) * 600;
    if (!line) line = `M${x1} ${y(segment.views, max)}`;
    else if (start > lastEnd)
      line += ` L${(lastEnd / end) * 600} 176 L${x1} 176 L${x1} ${y(segment.views, max)}`;
    else line += ` L${x1} ${y(segment.views, max)}`;
    line += ` H${x2}`;
    lastEnd = stop;
  });
  const peakX =
    ((Math.min(end, peakSegment.startSeconds) +
      Math.min(peakSegment.durationSeconds, end - peakSegment.startSeconds) /
        2) /
      end) *
    100;
  const marks = `<defs><linearGradient id="timelineWash" x1="0" y1="0" x2="0" y2="1"><stop class="chart-wash-top" offset="0"/><stop class="chart-wash-bottom" offset="1"/></linearGradient></defs><path class="chart-area" d="${line} L${(lastEnd / end) * 600} 176 L${(Math.min(end, timeline[0].startSeconds) / end) * 600} 176 Z"/><path class="chart-line" d="${line}"/><path class="chart-marker" d="M0 0V180" hidden/><g class="chart-selection" hidden><path class="chart-crosshair" d="M0 0V180"/><circle class="chart-point" r="4" cy="0"/></g>`;
  const edge = peakX < 14 ? " start" : peakX > 86 ? " end" : "";
  const overlay = `<span class="peak-label${edge}" style="left:${peakX}%;top:${(y(peakSegment.views, max) / 180) * 100}%">Most replayed · ${esc(fmtClock(peakSegment.startSeconds))}</span>`;
  const top = [...timeline]
    .filter((s) => s.views > 0)
    .sort((a, b) => b.views - a.views || a.startSeconds - b.startSeconds)
    .slice(0, 10);
  const moments = top
    .slice(0, 5)
    .map(
      (s) =>
        `<li><button type="button" class="moment" data-seek="${s.startSeconds}"><strong>${esc(fmtClock(s.startSeconds))}</strong><span>${esc(plural(s.views, "view"))}</span></button></li>`,
    )
    .join("");
  return panel(
    "Engagement across the recording",
    "How many views each stretch of the recording received, including replays. Hover to read a moment; click, tap, or press Enter to see it in the recording.",
    `<div class="recording-sync">${recordingPane(presentation, frames)}<div class="moments"><h4>Most replayed moments</h4><ol>${moments}</ol></div></div>` +
      plot(
        "segment",
        "Segment views along the recording",
        `${timeline.length} segments. Peak ${count(peakSegment.views)} views at ${fmtClock(peakSegment.startSeconds)}.`,
        max,
        marks,
        [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
          fraction,
          label: fmtClock(end * fraction),
        })),
        "Position in the recording · min:sec",
        { focusable: true, overlay },
      ) +
      dataTable(
        "Most replayed moments",
        ["Moment", "Views"],
        top.map((s) => [
          `${fmtClock(s.startSeconds)}–${fmtClock(Math.min(end, s.startSeconds + s.durationSeconds))}`,
          count(s.views),
        ]),
      ),
    true,
  );
}

function daysPanel(sessions: SessionRecord[]) {
  const { days, truncated } = viewsByDay(sessions);
  if (!days.length)
    return panel(
      "Views by day",
      "Sessions started each day.",
      state("No sessions yet."),
    );
  const max = niceMax(Math.max(...days.map((d) => d.count)));
  const marks = days
    .map((d, i) =>
      slot(i, days.length, d.count, max, [
        plural(d.count, "session"),
        dayName(d.date, true),
      ]),
    )
    .join("");
  return panel(
    "Views by day",
    `Sessions started each day${truncated ? ` (latest ${days.length} days)` : ""}, in your time zone.`,
    plot(
      "days",
      "Sessions per day",
      `${days.length} days of viewing.`,
      max,
      marks,
      evenLabels(days.length, (i) => dayName(days[i].date)),
      "Day",
    ) +
      dataTable(
        "Sessions per day",
        ["Day", "Sessions"],
        days.map((d) => [dayName(d.date, true), count(d.count)]),
      ),
  );
}

function heatmapPanel(heatmap: Heatmap) {
  if (!heatmap.total)
    return panel(
      "When people watch",
      "Sessions by weekday and hour.",
      state("No sessions yet."),
    );
  const hours = [0, 6, 12, 18]
    .map(
      (h) =>
        `<span class="hm-hour" style="grid-column:${h + 1} / span 6">${esc(hourName(h))}</span>`,
    )
    .join("");
  const rows = heatmap.cells
    .map(
      (row, day) =>
        `<span class="hm-day">${esc(weekdayShort[day])}</span><div class="hm-row">${row
          .map((n, hour) =>
            n
              ? `<i class="hm-cell" style="--level:${(0.3 + 0.7 * Math.sqrt(n / heatmap.max)).toFixed(2)}" data-tip-value="${esc(plural(n, "session"))}" data-tip-label="${esc(`${weekdayShort[day]} ${hourName(hour)}–${hourName(hour + 1)}`)}"></i>`
              : '<i class="hm-cell none"></i>',
          )
          .join("")}</div>`,
    )
    .join("");
  const busiest = heatmap.cells
    .flatMap((row, day) => row.map((n, hour) => ({ day, hour, n })))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n || a.day - b.day || a.hour - b.hour)
    .slice(0, 12);
  return panel(
    "When people watch",
    "Sessions by weekday and hour of day, in your time zone. A stronger color means more.",
    `<div class="heatmap" role="img" aria-label="Sessions by weekday and hour; busiest ${esc(weekdayLong[heatmap.peak!.day])} ${esc(hourName(heatmap.peak!.hour))}"><span></span><div class="hm-hours">${hours}</div>${rows}</div><div class="hm-legend muted" aria-hidden="true"><span>Fewer</span><i></i><span>More</span></div>` +
      dataTable(
        "Busiest hours",
        ["Weekday and hour", "Sessions"],
        busiest.map((c) => [
          `${weekdayLong[c.day]} ${hourName(c.hour)}–${hourName(c.hour + 1)}`,
          count(c.n),
        ]),
      ),
  );
}

// "How long people stay": the share of watched sessions still going at each point in time.
function retentionPanel(
  data: ViewingCharts,
  sessions: SessionRecord[] | null,
  medianSeconds: number | null,
) {
  const title = "How long people stay";
  const description =
    "The share of watched sessions still watching after each point in time. Hover or tap the chart to read it.";
  const { histogram } = data;
  if (!sessions || !histogram)
    return panel(
      title,
      description,
      state(data.histogramError || "Session data unavailable.", true),
    );
  const notes = `<div class="session-notes"><span>${plural(histogram.totalSessions, "total session")}</span><span>${plural(histogram.zeroSeconds, "zero-second open")}</span>${histogram.unknownSeconds ? `<span>${count(histogram.unknownSeconds)} unavailable durations</span>` : ""}</div>`;
  const times = retentionTimes(sessions);
  if (!times.length)
    return panel(
      title,
      description,
      state("No watch time has been recorded yet.") + notes,
    );
  const longest = times[times.length - 1];
  const sy = (share: number) => 176 - share * 168;
  // A stepped line: it holds its level until sessions end, then drops by their share.
  let line = `M0 ${sy(1)}`;
  for (let i = 0; i < times.length;) {
    let j = i;
    while (j < times.length && times[j] === times[i]) j++;
    line += ` H${(times[i] / longest) * 600} V${sy((times.length - j) / times.length)}`;
    i = j;
  }
  const marks = `<defs><linearGradient id="timelineWash" x1="0" y1="0" x2="0" y2="1"><stop class="chart-wash-top" offset="0"/><stop class="chart-wash-bottom" offset="1"/></linearGradient></defs><path class="chart-area" d="${line} L0 176 Z"/><path class="chart-line" d="${line}"/><path class="chart-grid" d="M0 92H600"/><g class="chart-selection" hidden><path class="chart-crosshair" d="M0 0V180"/><circle class="chart-point" r="4" cy="0"/></g>`;
  const medianX =
    medianSeconds === null
      ? null
      : Math.min(100, (medianSeconds / longest) * 100);
  const median =
    medianX === null
      ? ""
      : `<span class="median-line" style="left:${medianX}%"></span><span class="median-label${medianX > 70 ? " flip" : ""}" style="left:${medianX}%">Median ${esc(fmtSpan(medianSeconds!))}</span>`;
  const checkpoints = [60, 300, 600, 1800, 3600].filter((t) => t < longest);
  return panel(
    title,
    description,
    plot(
      "retention",
      "Share of watched sessions still watching over time",
      `${count(times.length)} watched sessions; the longest lasted ${fmtSpan(longest)}.`,
      1,
      marks,
      [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
        fraction,
        label: fmtClock(longest * fraction),
      })),
      "Watch time · min:sec",
      { focusable: true, overlay: median, yLabels: ["100%", "50%", "0%"] },
    ) +
      dataTable(
        "Watched sessions still watching",
        ["After", "Share still watching"],
        [0, ...checkpoints].map((t) => [
          t === 0 ? "Start" : fmtSpan(t),
          `${pct(stillWatching(times, t))} (${count(times.filter((v) => v >= t).length)} of ${count(times.length)})`,
        ]),
      ) +
      notes,
  );
}

const DEVICE_LABELS = {
  desktop: "Desktop",
  mobile: "Phone or tablet",
  other: "Other",
};

function audiencePanel(
  sessions: SessionRecord[] | null,
  viewers: ViewingCharts["viewers"],
) {
  const title = "Audience";
  if (!sessions)
    return panel(
      title,
      "Devices and returning viewers.",
      state("Session data unavailable.", true),
    );
  if (!sessions.length)
    return panel(
      title,
      "Devices and returning viewers.",
      state("No sessions yet."),
    );
  const devices = deviceCounts(sessions);
  const keys = (["desktop", "mobile", "other"] as const).filter(
    (k) => devices[k] > 0,
  );
  const segments = keys
    .map(
      (k) =>
        `<span class="device-seg ${k}" style="flex:${devices[k]}" data-tip-value="${esc(plural(devices[k], "session"))}" data-tip-label="${esc(`${DEVICE_LABELS[k]} · ${pct(devices[k] / sessions.length)}`)}"></span>`,
    )
    .join("");
  const legend = keys
    .map(
      (k) =>
        `<li><i class="swatch ${k}" aria-hidden="true"></i><span>${esc(DEVICE_LABELS[k])}</span><strong>${count(devices[k])}</strong><span class="muted">${pct(devices[k] / sessions.length)}</span></li>`,
    )
    .join("");
  const returning =
    viewers && viewers.distinct
      ? `<div class="returning"><div class="returning-head"><strong>${pct(viewers.returning / viewers.distinct)}</strong><span>of ${plural(viewers.distinct, "viewer")} came back</span></div><div class="meter" role="img" aria-label="${viewers.returning} of ${viewers.distinct} viewers returned"><span style="width:${(viewers.returning / viewers.distinct) * 100}%"></span></div><p class="muted">Viewers are counted by network address, so a shared connection counts once.</p></div>`
      : "";
  return panel(
    title,
    "Where sessions came from, and how many viewers returned.",
    `<div class="device-bar" role="img" aria-label="Sessions by device">${segments}</div><ul class="device-legend">${legend}</ul>${returning}` +
      dataTable(
        "Sessions by device",
        ["Device", "Sessions"],
        keys.map((k) => [DEVICE_LABELS[k], count(devices[k])]),
      ),
  );
}

export function renderViewingCharts(
  container: HTMLElement,
  data: ViewingCharts,
  presentation: Presentation,
  frames: Frame[] | null = null,
) {
  const { timeline, sessions, viewers } = data;
  const end = presentation.durationMs
    ? presentation.durationMs / 1000
    : Math.max(
        1,
        ...(timeline || []).map((s) => s.startSeconds + s.durationSeconds),
      );
  const peakSegment = timeline ? replayPeak(timeline) : null;
  const all = sessions || [];
  const stats = sessionStats(all, end);
  const { days } = viewsByDay(all);
  const busiestDay = days.reduce<(typeof days)[number] | null>(
    (best, d) => (d.count > (best?.count ?? 0) ? d : best),
    null,
  );
  const heatmap = weekHourHeatmap(all);
  const devices = deviceCounts(all);

  const tiles = [
    tile(
      "Sessions",
      sessions ? count(stats.total) : "—",
      sessions
        ? `${count(stats.watched)} watched · ${count(stats.zeroOpens)} opened without watching`
        : "Session data unavailable",
    ),
    tile(
      "Typical watch time",
      stats.medianWatched === null ? "—" : fmtSpan(stats.medianWatched),
      stats.meanWatched === null
        ? "No watch time recorded yet"
        : `Median of watched sessions · average ${fmtSpan(stats.meanWatched)}`,
    ),
    tile(
      "Watched nearly all",
      stats.completionRate === null ? "—" : pct(stats.completionRate),
      stats.completionBase
        ? `${count(stats.completed)} of ${count(stats.completionBase)} watched sessions covered ${pct(COMPLETE_SHARE)}+ of the recording`
        : "Coverage not reported",
    ),
    tile(
      "Viewers",
      viewers ? count(viewers.distinct) : "—",
      viewers
        ? viewers.returning
          ? `${count(viewers.returning)} came back · by network address`
          : "By network address"
        : "Viewer counts unavailable",
    ),
    tile(
      "Busiest day",
      busiestDay ? dayName(busiestDay.date) : "—",
      busiestDay
        ? `${plural(busiestDay.count, "session")} · ${pct(busiestDay.count / stats.total)} of all`
        : "No sessions yet",
    ),
    tile(
      "Most replayed",
      peakSegment ? fmtClock(peakSegment.startSeconds) : "—",
      peakSegment
        ? `${plural(peakSegment.views, "view")} in ${peakSegment.durationSeconds}s`
        : "No segment activity yet",
    ),
  ].join("");

  // Plain-language observations, shown only when the data supports them.
  const notes: string[] = [];
  const unwatched = timeline ? unwatchedShare(timeline, end) : null;
  if (unwatched !== null && unwatched >= 0.05)
    notes.push(`${pct(unwatched)} of the recording was never watched.`);
  const shortShare = shortWatchShare(all, 600);
  if (shortShare !== null && stats.watched >= 5 && shortShare >= 0.5)
    notes.push(
      `${pct(shortShare)} of watched sessions ended within 10 minutes.`,
    );
  const early = earlyShare(days, 2);
  if (early !== null && days.length > 2 && early >= 0.5)
    notes.push(
      `${pct(early)} of sessions happened in the first two days of viewing.`,
    );
  const peaks = heatmapPeaks(heatmap);
  if (peaks)
    notes.push(
      `Viewing peaks on ${weekdayLong[peaks.day]}s, and sessions most often start around ${hourName(peaks.hour)}.`,
    );
  if (all.length && devices.mobile / all.length >= 0.1)
    notes.push(
      `${pct(devices.mobile / all.length)} of sessions were on phones or tablets.`,
    );
  if (all.length >= 5 && stats.zeroOpens / all.length >= 0.25)
    notes.push(
      `${pct(stats.zeroOpens / all.length)} of sessions opened the recording without watching any of it.`,
    );
  if (viewers && viewers.returning > 0)
    notes.push(
      `${count(viewers.returning)} of ${plural(viewers.distinct, "viewer")} returned for another session.`,
    );

  container.innerHTML = `<div class="stat-grid">${tiles}</div>${
    notes.length
      ? `<ul class="insights" aria-label="What stands out">${notes
          .slice(0, 5)
          .map((n) => `<li>${esc(n)}</li>`)
          .join("")}</ul>`
      : ""
  }<div class="viewing-grid">${timelinePanel(data, end, peakSegment, presentation, frames)}${
    sessions
      ? daysPanel(all) + heatmapPanel(heatmap)
      : panel(
          "Views by day",
          "Sessions started each day.",
          state(data.histogramError || "Session data unavailable.", true),
          false,
        ) +
        panel(
          "When people watch",
          "Sessions by weekday and hour.",
          state(data.histogramError || "Session data unavailable.", true),
          false,
        )
  }${retentionPanel(data, sessions, stats.medianWatched)}${audiencePanel(sessions, viewers)}</div><p class="chart-caption muted">Updated ${esc(fmtTime(data.fetchedAt))} · Sessions are not unique viewers; viewers are counted by network address and no identities are shown. Day and hour charts use your browser's time zone. Timeline counts can differ because of reporting thresholds.</p>`;

  bindInteractions(
    container,
    timeline,
    end,
    peakSegment,
    sessions,
    bindRecording(container, presentation, frames),
  );
}

// A single floating readout, shared by every chart in the dialog. It is anchored to the mark
// being read (centered above it, or below when there is no room), not to the pointer, so it
// stays still while the pointer moves within one mark.
function createTip(container: HTMLElement) {
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  const value = document.createElement("strong");
  const label = document.createElement("span");
  tip.append(value, label);
  container.append(tip);
  return {
    show(
      anchorX: number,
      anchorTop: number,
      anchorBottom: number,
      valueText: string,
      labelText: string,
    ) {
      value.textContent = valueText;
      label.textContent = labelText;
      tip.hidden = false;
      const box = container.getBoundingClientRect();
      const width = tip.offsetWidth,
        height = tip.offsetHeight;
      const x = Math.max(
        0,
        Math.min(anchorX - box.left - width / 2, box.width - width),
      );
      let top = anchorTop - box.top - height - 8;
      if (top < 0) top = anchorBottom - box.top + 8;
      tip.style.transform = `translate(${x}px, ${top}px)`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

type Tip = ReturnType<typeof createTip>;

// A crosshair that snaps to the nearest step as the pointer moves; arrow keys work when focused.
function bindCrosshair(
  svg: SVGSVGElement,
  tip: Tip,
  config: {
    steps: number;
    start: number;
    locate: (fraction: number) => number;
    commit?: (index: number) => void;
    readout: (index: number) => {
      x: number;
      cy: number;
      value: string;
      label: string;
    };
  },
) {
  const selection = svg.querySelector<SVGGElement>(".chart-selection")!;
  const point = selection.querySelector("circle")!;
  let current = config.start;
  const select = (index: number) => {
    current = Math.max(0, Math.min(config.steps - 1, index));
    const r = config.readout(current);
    selection.removeAttribute("hidden");
    selection.setAttribute("transform", `translate(${r.x},0)`);
    point.setAttribute("cy", String(r.cy));
    const box = svg.getBoundingClientRect();
    const px = box.left + (r.x / 600) * box.width;
    const py = box.top + (r.cy / 180) * box.height;
    tip.show(px, py, py, r.value, r.label);
  };
  const clear = () => {
    selection.setAttribute("hidden", "");
    tip.hide();
  };
  const aim = (event: PointerEvent) => {
    const box = svg.getBoundingClientRect();
    select(
      config.locate(
        Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      ),
    );
  };
  svg.addEventListener("pointerdown", (event) => {
    if (event.button === 0) aim(event);
  });
  svg.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" || event.buttons) aim(event);
  });
  svg.addEventListener("click", () => config.commit?.(current));
  svg.addEventListener("pointerleave", clear);
  svg.addEventListener("focus", () => select(current));
  svg.addEventListener("blur", clear);
  svg.addEventListener("keydown", (event) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      PageDown: -10,
      PageUp: 10,
    };
    if (event.key in step) select(current + step[event.key]);
    else if (event.key === "Home") select(0);
    else if (event.key === "End") select(config.steps - 1);
    else if (config.commit && (event.key === "Enter" || event.key === " "))
      config.commit(current);
    else return;
    event.preventDefault();
  });
}

function bindInteractions(
  container: HTMLElement,
  timeline: ViewingCharts["timeline"],
  end: number,
  peakSegment: ReturnType<typeof replayPeak>,
  sessions: SessionRecord[] | null,
  showInRecording: (seconds: number) => void,
) {
  const tip = createTip(container);

  // Bars, heatmap cells, and device segments: the mark itself is the hover target.
  let shown: Element | null = null;
  container.onpointermove = (event) => {
    const target = (event.target as Element).closest<HTMLElement | SVGElement>(
      "[data-tip-value]",
    );
    if (!target) {
      shown = null;
      if (!(event.target as Element).closest("svg[data-plot]")) tip.hide();
      return;
    }
    if (target === shown) return;
    shown = target;
    const mark = target.querySelector(".chart-bar") ?? target;
    const r = mark.getBoundingClientRect();
    tip.show(
      r.left + r.width / 2,
      r.top,
      r.bottom,
      target.dataset.tipValue || "",
      target.dataset.tipLabel || "",
    );
  };
  container.onpointerleave = () => {
    shown = null;
    tip.hide();
  };

  const timelineSvg = container.querySelector<SVGSVGElement>(
    'svg[data-plot="segment"]',
  );
  if (timelineSvg && timeline?.length && peakSegment) {
    const max = niceMax(peakSegment.views);
    const marker = timelineSvg.querySelector<SVGPathElement>(".chart-marker")!;
    const choose = (seconds: number) => {
      marker.setAttribute(
        "transform",
        `translate(${(Math.min(end, seconds) / end) * 600},0)`,
      );
      marker.removeAttribute("hidden");
      container.querySelectorAll<HTMLElement>("[data-seek]").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.seek) === seconds);
      });
      showInRecording(seconds);
    };
    container
      .querySelectorAll<HTMLElement>("[data-seek]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          choose(Number(button.dataset.seek)),
        ),
      );
    bindCrosshair(timelineSvg, tip, {
      steps: timeline.length,
      start: timeline.indexOf(peakSegment),
      commit: (index) => choose(timeline[index].startSeconds),
      locate: (fraction) => {
        const seconds = fraction * end;
        let closest = 0,
          distance = Infinity;
        timeline.forEach((s, index) => {
          const d =
            seconds < s.startSeconds
              ? s.startSeconds - seconds
              : seconds > s.startSeconds + s.durationSeconds
                ? seconds - s.startSeconds - s.durationSeconds
                : 0;
          if (d < distance) {
            closest = index;
            distance = d;
          }
        });
        return closest;
      },
      readout: (index) => {
        const s = timeline[index];
        const stop = Math.min(end, s.startSeconds + s.durationSeconds);
        return {
          x: Math.min(600, ((s.startSeconds + stop) / 2 / end) * 600),
          cy: y(s.views, max),
          value: plural(s.views, "view"),
          label: `${fmtClock(s.startSeconds)}–${fmtClock(stop)} · ${pct(s.views / peakSegment.views)} of the peak`,
        };
      },
    });
  }

  const retentionSvg = container.querySelector<SVGSVGElement>(
    'svg[data-plot="retention"]',
  );
  const times = sessions ? retentionTimes(sessions) : [];
  if (retentionSvg && times.length) {
    const longest = times[times.length - 1];
    const STEPS = 101; // one per percent of the longest session
    bindCrosshair(retentionSvg, tip, {
      steps: STEPS,
      start: 0,
      locate: (fraction) => Math.round(fraction * (STEPS - 1)),
      readout: (index) => {
        const t = (index / (STEPS - 1)) * longest;
        const share = stillWatching(times, t);
        return {
          x: (index / (STEPS - 1)) * 600,
          cy: 176 - share * 168,
          value: `${pct(share)} still watching`,
          label: `after ${fmtClock(t)} · ${count(times.filter((v) => v >= t).length)} of ${count(times.length)} watched sessions`,
        };
      },
    });
  }
}
