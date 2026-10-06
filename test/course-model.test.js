const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../frontend/src/course-model.ts");
const now = Date.parse("2026-10-06T12:00:00Z");
const item = {
  id: "a",
  title: "ECE 301-Signals and Systems-Ada Lovelace-11101_9/1/2026",
  recorded: "2026-09-01T12:00:00Z",
  created: "2026-09-02T12:00:00Z",
  durationMs: 1000000,
  watchUrl: "",
};
const session = (opened, watched = 500, coverage = watched) => ({
  opened,
  watched,
  coverage,
  device: "desktop",
});

test("grouping separates instructor, section, and semester and sorts recordings chronologically", async () => {
  const { groupCourses } = await load();
  const groups = groupCourses([
    { ...item, id: "b", recorded: "2026-09-03T12:00:00Z" },
    item,
    { ...item, id: "section", title: item.title.replace("11101", "11102") },
    {
      ...item,
      id: "instructor",
      title: item.title.replace("Ada Lovelace", "Grace Hopper"),
    },
    { ...item, id: "spring", recorded: "2026-05-01T12:00:00Z" },
  ]);
  assert.equal(groups.length, 4);
  assert.deepEqual(
    groups.find((g) => g.items.length === 2).items.map((i) => i.id),
    ["a", "b"],
  );
  assert.equal(
    groups.find((g) => g.items.some((i) => i.id === "spring")).semester,
    "2026 Spring",
  );
});
test("fallback metadata and invalid record dates remain usable without invented dates", async () => {
  const { groupCourses, semester } = await load();
  const groups = groupCourses([
    {
      id: "x",
      title: "Orientation",
      recorded: "invalid",
      created: "2026-07-01T12:00:00Z",
      folder: "Welcome",
      owner: "owner",
      watchUrl: "",
    },
  ]);
  assert.equal(groups[0].code, "Welcome");
  assert.equal(groups[0].instructor, "owner");
  assert.equal(groups[0].semester, "2026 Summer");
  assert.equal(semester({ id: "x", watchUrl: "" }), "Undated");
});
test("report windows use release date and exclude the seventh-day boundary and future sessions", async () => {
  const { windowSessions, firstWeekIncomplete } = await load();
  const sessions = [
    session("2026-09-02T11:59:59Z"),
    session(item.created),
    session("2026-09-09T11:59:59Z"),
    session("2026-09-09T12:00:00Z"),
    session("2026-10-07T12:00:00Z"),
  ];
  assert.equal(windowSessions(item, sessions, "first7", now).length, 2);
  assert.equal(
    windowSessions(item, sessions, "first7", Date.parse("2026-09-09T12:00:00Z"))
      .length,
    2,
  );
  assert.equal(windowSessions(item, sessions, "all", now).length, 4);
  assert.equal(windowSessions(item, sessions, "last30", now).length, 2);
  assert.equal(
    windowSessions({ ...item, created: undefined }, sessions, "first7", now),
    null,
  );
  assert.equal(
    firstWeekIncomplete({ ...item, created: "2026-10-05T12:00:00Z" }, now),
    true,
  );
});
test("course totals pool watch times and weight completion by known coverage; missing reports are excluded", async () => {
  const { groupCourses, courseMetrics, lectureMetrics } = await load();
  const second = { ...item, id: "b" };
  const third = { ...item, id: "c" };
  const course = groupCourses([item, second, third])[0];
  const reports = new Map([
    [
      "a",
      {
        sessions: [
          session(item.created, 100, 900),
          session(item.created, 300, 100),
          session(item.created, 500, null),
          session(item.created, 0, 0),
        ],
      },
    ],
    ["b", { sessions: [session(item.created, 900, 900)] }],
    ["c", { sessions: null }],
  ]);
  const m = courseMetrics(course, reports, "all", now);
  assert.equal(m.available, 2);
  assert.equal(m.sessions, 5);
  assert.equal(m.median, 400);
  assert.equal(m.completion, 2 / 3);
  assert.equal(
    lectureMetrics(
      { ...item, durationMs: undefined },
      reports.get("a"),
      "all",
      now,
    ).completionRate,
    null,
  );
  assert.equal(courseMetrics(course, new Map(), "all", now).sessions, null);
  assert.equal(
    courseMetrics(course, new Map([["a", { sessions: [] }]]), "all", now)
      .sessions,
    0,
  );
});
