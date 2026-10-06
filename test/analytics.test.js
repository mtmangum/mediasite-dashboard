const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getAnalytics, getViewingCharts } = require("../analytics");
const id = "presentation-1";
const reply = (body, status = 200) => ({
  status,
  statusText: "Fixture",
  ms: 12,
  body: JSON.stringify(body),
});

test("retains zero totals and converts watch-time strings without inventing missing metrics", async () => {
  const paths = [];
  const data = await getAnalytics({}, id, async (_, req) => {
    paths.push(req.path);
    return req.path.endsWith("Totals")
      ? reply({ value: [{ Platform: "Safari", Total: 0 }] })
      : reply({ TotalViews: 0, TotalUsers: 0, TotalTimeWatchedSeconds: "120" });
  });
  assert.equal(data.totalViews, 0);
  assert.equal(data.uniqueUsers, 0);
  assert.equal(data.watchSeconds, 120);
  assert.equal(data.peakConnections, null);
  assert.equal(data.firstWatched, null);
  assert.deepEqual(data.browsers, [{ name: "Safari", views: 0 }]);
  assert.equal(data.requests.length, 3);
  assert.ok(
    paths.every((path) => path.startsWith(`/PresentationAnalytics('${id}')`)),
  );
});
test("keeps summary usable when platform requests fail", async () => {
  const data = await getAnalytics({}, id, async (_, req) =>
    req.path.endsWith("BrowserTotals")
      ? reply({}, 403)
      : req.path.endsWith("SystemTotals")
        ? Promise.reject(Error("Timeout"))
        : reply({ TotalViews: 4 }),
  );
  assert.equal(data.totalViews, 4);
  assert.equal(data.browsers, null);
  assert.equal(data.systems, null);
  assert.equal(data.warnings.length, 2);
});
test("rejects invalid IDs before calling the upstream API", async () => {
  for (const value of [null, "", "x')/Users", "../secret"])
    await assert.rejects(
      getAnalytics({}, value, () => {
        throw Error("must not be called");
      }),
      { status: 400 },
    );
});
test("reports denied analytics permissions as an error rather than zero activity", async () => {
  await assert.rejects(
    getAnalytics({}, id, async () => reply({}, 403)),
    { status: 403, message: /permission/ },
  );
});

const chartsConfig = { baseUrl: "https://example.test/Mediasite/Api/v1" };
test("charts follow pagination, preserve timeline zeros, and aggregate session durations without identities", async () => {
  const paths = [];
  const data = await getViewingCharts(chartsConfig, id, async (_, req) => {
    paths.push(req.path);
    if (req.path.includes("ViewingTrends"))
      return reply({
        value: [
          { StartTime: 30, Duration: 30, Views: 0 },
          { StartTime: 0, Duration: 30, Views: "3" },
        ],
      });
    if (req.path.includes("$skip=2"))
      return reply({
        value: [60, 300, 720].map((TimeWatchedSeconds) => ({
          TimeWatchedSeconds,
          UserName: "private-name",
          IPAddress: "private-address",
        })),
      });
    return reply({
      value: [
        { TimeWatchedSeconds: 0 },
        { TimeWatchedSeconds: "59" },
        { TimeWatchedSeconds: null },
        { TimeWatchedSeconds: -1 },
      ],
      "odata.nextLink":
        chartsConfig.baseUrl +
        `/PresentationAnalytics('${id}')/ViewingSessions?$skip=2`,
    });
  });
  assert.deepEqual(data.timeline, [
    { startSeconds: 0, durationSeconds: 30, views: 3 },
    { startSeconds: 30, durationSeconds: 30, views: 0 },
  ]);
  assert.equal(data.histogram.binSeconds, 300);
  assert.deepEqual(data.histogram.bins, [
    { startSeconds: 0, endSeconds: 300, sessions: 2 },
    { startSeconds: 300, endSeconds: 600, sessions: 1 },
    { startSeconds: 600, endSeconds: 900, sessions: 1 },
  ]);
  assert.equal(data.histogram.totalSessions, 7);
  assert.equal(data.histogram.zeroSeconds, 1);
  assert.equal(data.histogram.unknownSeconds, 2);
  assert.equal(data.histogram.watchedSessions, 4);
  assert.equal(data.requests.length, 3);
  assert.ok(
    paths.some((path) => /\$select=[^&]*TimeWatchedSeconds/.test(path)),
  );
  assert.doesNotMatch(
    JSON.stringify({ ...data, requests: undefined }),
    /private-name|private-address|UserName|IPAddress/,
  );
});

test("an unavailable histogram does not hide the timeline or invent zero activity", async () => {
  const data = await getViewingCharts(chartsConfig, id, async (_, req) =>
    req.path.includes("ViewingSessions")
      ? reply({}, 403)
      : reply({ value: [{ StartTime: 0, Duration: 30, Views: 5 }] }),
  );
  assert.equal(data.histogram, null);
  assert.match(data.histogramError, /permission/);
  assert.equal(data.timeline[0].views, 5);
});

test("empty reports and zero-duration opens remain distinct", async () => {
  const data = await getViewingCharts(chartsConfig, id, async (_, req) =>
    reply({
      value: req.path.includes("ViewingSessions")
        ? [{ TimeWatchedSeconds: 0 }]
        : [],
    }),
  );
  assert.deepEqual(data.timeline, []);
  assert.deepEqual(data.histogram.bins, []);
  assert.equal(data.histogram.zeroSeconds, 1);
  assert.equal(data.histogram.totalSessions, 1);
  assert.equal(data.histogramError, null);
});

test("histogram boundaries include exact minute values in the next bucket", async () => {
  const data = await getViewingCharts(chartsConfig, id, async (_, req) =>
    reply({
      value: req.path.includes("ViewingSessions")
        ? [1, 59, 60, 119, 120].map((TimeWatchedSeconds) => ({
            TimeWatchedSeconds,
          }))
        : [],
    }),
  );
  assert.equal(data.histogram.binSeconds, 60);
  assert.deepEqual(
    data.histogram.bins.map((bin) => bin.sessions),
    [2, 2, 1],
  );
});

test("blank or malformed durations are unavailable instead of zero-second opens", async () => {
  const data = await getViewingCharts(chartsConfig, id, async (_, req) =>
    reply({
      value: req.path.includes("ViewingSessions")
        ? ["", " ", false, {}, "invalid", Infinity].map(
            (TimeWatchedSeconds) => ({ TimeWatchedSeconds }),
          )
        : [],
    }),
  );
  assert.equal(data.histogram.zeroSeconds, 0);
  assert.equal(data.histogram.unknownSeconds, 6);
  assert.equal(data.histogram.watchedSessions, 0);
});

test("incomplete or foreign pagination is unavailable rather than a partial histogram", async () => {
  for (const nextLink of [
    "https://foreign.test/data",
    chartsConfig.baseUrl +
      `/PresentationAnalytics('${id}')/ViewingSessions?$select=Opened,TimeWatchedSeconds,CoverageWatchedSeconds,System,Browser,IPAddress&$top=1000`,
  ]) {
    const data = await getViewingCharts(chartsConfig, id, async (_, req) =>
      reply({
        value: [],
        ...(req.path.includes("ViewingSessions")
          ? { "@odata.nextLink": nextLink }
          : {}),
      }),
    );
    assert.equal(data.histogram, null);
    assert.ok(data.histogramError);
    assert.deepEqual(data.timeline, []);
  }
});

test("chart requests reject invalid IDs before contacting Mediasite", async () => {
  await assert.rejects(
    getViewingCharts(chartsConfig, "../secret", () => {
      throw Error("must not be called");
    }),
    { status: 400 },
  );
});

test("session summaries are anonymous, classify devices, and count returning viewers", async () => {
  const sessions = [
    {
      Opened: "2026-10-03T19:00:00Z",
      TimeWatchedSeconds: 600,
      CoverageWatchedSeconds: 500,
      System: "Mac OS X",
      Browser: "Chrome",
      IPAddress: "10.0.0.1",
      UserName: "ann",
    },
    {
      Opened: "2026-10-02T08:00:00Z",
      TimeWatchedSeconds: 0,
      CoverageWatchedSeconds: 0,
      System: "iPhone",
      Browser: "Chrome Mobile",
      IPAddress: "10.0.0.2",
      UserName: "bob",
    },
    {
      Opened: "2026-10-04T08:30:00Z",
      TimeWatchedSeconds: "90",
      CoverageWatchedSeconds: "90",
      System: "Windows 10",
      Browser: "Edge",
      IPAddress: "10.0.0.1",
      UserName: "ann",
    },
    {
      Opened: "2026-10-05T08:30:00Z",
      TimeWatchedSeconds: 30,
      System: "Plan 9",
      Browser: "Lynx",
      IPAddress: "10.0.0.3",
    },
    { Opened: "not a date", TimeWatchedSeconds: 5, IPAddress: "10.0.0.4" },
  ];
  const data = await getViewingCharts(chartsConfig, id, async (_, req) =>
    req.path.includes("ViewingTrends")
      ? reply({ value: [{ StartTime: 0, Duration: 30, Views: 1 }] })
      : reply({ value: sessions }),
  );
  assert.deepEqual(
    data.sessions.map((s) => [s.opened, s.watched, s.coverage, s.device]),
    [
      ["2026-10-02T08:00:00.000Z", 0, 0, "mobile"],
      ["2026-10-03T19:00:00.000Z", 600, 500, "desktop"],
      ["2026-10-04T08:30:00.000Z", 90, 90, "desktop"],
      ["2026-10-05T08:30:00.000Z", 30, null, "other"],
    ],
    "sorted by open time; unparseable dates skipped; devices classified",
  );
  assert.deepEqual(data.viewers, { distinct: 3, returning: 1 });
  assert.doesNotMatch(
    JSON.stringify({ ...data, requests: undefined }),
    /10\.0\.0|ann|bob|UserName|IPAddress|HostName|PlaybackTicket/,
  );
});
