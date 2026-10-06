// Pure viewing-analytics maths, imported directly (Node strips the TypeScript types).
const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../frontend/src/viewing-stats.ts");
const format = () => import("../frontend/src/format.ts");

// Local-time dates, so the tests hold in any time zone.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const session = (opened, watched, coverage = watched, device = "desktop") => ({
  opened,
  watched,
  coverage,
  device,
});

test("median and mean ignore nothing and handle empty input", async () => {
  const { median, mean } = await load();
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([1, 2, 3, 10]), 2.5);
  assert.equal(mean([]), null);
  assert.equal(mean([2, 4, 9]), 5);
});

test("session stats separate watched sessions, zero opens, and completion", async () => {
  const { sessionStats } = await load();
  const sessions = [
    session(at(2026, 10, 1), 0, 0),
    session(at(2026, 10, 1), 0, 0),
    session(at(2026, 10, 1), 100, 90),
    session(at(2026, 10, 1), 400, 950), // covered 95% of a 1000s recording
    session(at(2026, 10, 1), 900, 850), // exactly 85%
    session(at(2026, 10, 1), 600, null), // coverage unknown: excluded from completion
    session(at(2026, 10, 1), null, null),
  ];
  const stats = sessionStats(sessions, 1000);
  assert.equal(stats.total, 7);
  assert.equal(stats.watched, 4);
  assert.equal(stats.zeroOpens, 2);
  assert.equal(stats.medianWatched, 500);
  assert.equal(stats.meanWatched, 500);
  assert.equal(stats.completionBase, 3);
  assert.equal(stats.completed, 2);
  assert.ok(Math.abs(stats.completionRate - 2 / 3) < 1e-9);
  assert.equal(sessionStats([], 1000).completionRate, null);
});

test("views by day fills empty days and keeps only the latest days when long", async () => {
  const { viewsByDay } = await load();
  const sessions = [
    session(at(2026, 10, 1, 9), 10),
    session(at(2026, 10, 1, 21), 10),
    session(at(2026, 10, 4, 9), 10),
  ];
  const { days, truncated } = viewsByDay(sessions);
  assert.deepEqual(
    days.map((d) => [d.key, d.count]),
    [
      ["2026-10-01", 2],
      ["2026-10-02", 0],
      ["2026-10-03", 0],
      ["2026-10-04", 1],
    ],
  );
  assert.equal(truncated, false);
  const long = viewsByDay(
    [session(at(2026, 1, 1), 1), session(at(2026, 10, 1), 1)],
    30,
  );
  assert.equal(long.days.length, 30);
  assert.equal(long.truncated, true);
  assert.equal(long.days.at(-1).key, "2026-10-01");
  assert.deepEqual(viewsByDay([]), { days: [], truncated: false });
});

test("the weekday-by-hour heatmap counts local times, Monday first", async () => {
  const { weekHourHeatmap, heatmapPeaks } = await load();
  // 2026-10-05 is a Monday, 2026-10-10 a Saturday.
  const sessions = [
    ...Array.from({ length: 5 }, () => session(at(2026, 10, 10, 16), 1)),
    session(at(2026, 10, 10, 17), 1),
    session(at(2026, 10, 5, 9), 1),
    session(at(2026, 10, 5, 16), 1),
    session(at(2026, 10, 5, 16), 1),
  ];
  const heatmap = weekHourHeatmap(sessions);
  assert.equal(heatmap.cells[0][9], 1, "Monday 9am");
  assert.equal(heatmap.cells[0][16], 2, "Monday 4pm");
  assert.equal(heatmap.cells[5][16], 5, "Saturday 4pm");
  assert.equal(heatmap.total, 9);
  assert.deepEqual(heatmap.peak, { day: 5, hour: 16, count: 5 });
  assert.deepEqual(heatmapPeaks(heatmap), { day: 5, hour: 16 });
  assert.equal(heatmapPeaks(heatmap, 20), null, "too few sessions to say");
});

test("peaks use weekday and hour totals separately, not one busy cell", async () => {
  const { weekHourHeatmap, heatmapPeaks } = await load();
  // The single busiest cell is Monday 4pm (3), but Saturday has far more sessions overall.
  const sessions = [
    ...Array.from({ length: 3 }, () => session(at(2026, 10, 5, 16), 1)),
    ...[8, 9, 10, 11, 12, 13].flatMap((h) => [
      session(at(2026, 10, 10, h), 1),
      session(at(2026, 10, 10, h), 1),
    ]),
  ];
  const heatmap = weekHourHeatmap(sessions);
  assert.deepEqual(heatmap.peak, { day: 0, hour: 16, count: 3 });
  assert.equal(heatmapPeaks(heatmap).day, 5, "Saturday has the most sessions");
});

test("replay peak, unwatched share, devices, and retention", async () => {
  const {
    replayPeak,
    unwatchedShare,
    deviceCounts,
    retentionTimes,
    stillWatching,
    shortWatchShare,
    earlyShare,
  } = await load();
  const timeline = [
    { startSeconds: 0, durationSeconds: 30, views: 2 },
    { startSeconds: 30, durationSeconds: 30, views: 0 },
    { startSeconds: 60, durationSeconds: 30, views: 7 },
    { startSeconds: 90, durationSeconds: 30, views: 7 },
  ];
  assert.equal(replayPeak(timeline).startSeconds, 60, "first of equal peaks");
  assert.equal(
    replayPeak([{ startSeconds: 0, durationSeconds: 30, views: 0 }]),
    null,
  );
  assert.equal(unwatchedShare(timeline, 120), 0.25);
  assert.equal(
    unwatchedShare(timeline, 60),
    0.5,
    "limited to the recording length",
  );
  assert.equal(unwatchedShare([], 60), null);

  const sessions = [
    session(at(2026, 10, 1), 30, 30, "mobile"),
    session(at(2026, 10, 1), 0, 0, "mobile"),
    session(at(2026, 10, 2), 700, 700, "desktop"),
    session(at(2026, 10, 3), 90, 90, "other"),
  ];
  assert.deepEqual(deviceCounts(sessions), { desktop: 1, mobile: 2, other: 1 });
  assert.deepEqual(retentionTimes(sessions), [30, 90, 700]);
  assert.equal(stillWatching([30, 90, 700], 0), 1);
  assert.equal(stillWatching([30, 90, 700], 90), 2 / 3);
  assert.equal(stillWatching([30, 90, 700], 701), 0);
  assert.equal(stillWatching([], 0), 0);
  assert.ok(Math.abs(shortWatchShare(sessions, 600) - 2 / 3) < 1e-9);
  assert.equal(shortWatchShare([session(at(2026, 10, 1), 0)], 600), null);
  assert.equal(earlyShare([{ count: 6 }, { count: 2 }, { count: 2 }], 1), 0.6);
});

test("time formatters read naturally", async () => {
  const { fmtSpan, fmtClock } = await format();
  assert.equal(fmtSpan(45), "45s");
  assert.equal(fmtSpan(60), "1m");
  assert.equal(fmtSpan(457), "7m 37s");
  assert.equal(fmtSpan(3900), "1h 5m");
  assert.equal(fmtClock(0), "0:00");
  assert.equal(fmtClock(65.9), "1:05");
  assert.equal(fmtClock(5405), "90:05");
});

test("most-replayed moments skip neighbours of a stronger peak", async () => {
  const { distinctPeaks } = await load();
  const seg = (startSeconds, views) => ({
    startSeconds,
    durationSeconds: 30,
    views,
  });
  const timeline = [
    seg(0, 3),
    seg(2430, 12),
    seg(2460, 12),
    seg(2490, 11),
    seg(2520, 10),
    seg(600, 8),
    seg(660, 7),
    seg(1500, 0),
  ];
  assert.deepEqual(
    distinctPeaks(timeline, 120, 5).map((s) => s.startSeconds),
    [2430, 600, 0],
  );
  assert.deepEqual(
    distinctPeaks(timeline, 120, 1).map((s) => s.startSeconds),
    [2430],
  );
  assert.equal(distinctPeaks([], 120, 5).length, 0);
});
