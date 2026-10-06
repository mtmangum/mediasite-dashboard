const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../frontend/src/calendar.ts");
const at = (y, m, d) => new Date(y, m - 1, d, 12).toISOString();

test("lists every month from the first to the last lecture, including empty ones", async () => {
  const { monthsFor } = await load();
  assert.deepEqual(
    monthsFor([
      { id: "a", watchUrl: "", recorded: at(2026, 8, 24) },
      { id: "b", watchUrl: "", recorded: at(2026, 11, 3) },
      { id: "c", watchUrl: "" },
    ]),
    ["2026-08", "2026-09", "2026-10", "2026-11"],
  );
  assert.deepEqual(monthsFor([{ id: "c", watchUrl: "" }]), []);
});

test("builds whole Sunday-first weeks around a month", async () => {
  const { monthGrid } = await load();
  const weeks = monthGrid("2026-10"); // October 1, 2026 is a Thursday
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks.length, 5);
  assert.deepEqual(
    weeks[0].map((d) => [d.day, d.inMonth]),
    [
      [27, false],
      [28, false],
      [29, false],
      [30, false],
      [1, true],
      [2, true],
      [3, true],
    ],
  );
  const last = weeks[weeks.length - 1];
  assert.equal(last[last.length - 1].key, "2026-10-31");
  assert.equal(weeks.flat().filter((d) => d.inMonth).length, 31);
});

test("a month that fits exactly in four weeks has no padding row", async () => {
  const { monthGrid } = await load();
  const weeks = monthGrid("2026-02"); // starts on a Sunday, 28 days
  assert.equal(weeks.length, 4);
  assert.ok(weeks.flat().every((d) => d.inMonth));
});
