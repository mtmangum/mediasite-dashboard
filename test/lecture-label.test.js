const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../frontend/src/lecture-label.ts");

test("numbers lectures by their place in the course", async () => {
  const { lectureNumber } = await load();
  const course = { items: [{ id: "a" }, { id: "b" }, { id: "c" }] };
  assert.equal(lectureNumber(course, "b"), 2);
  assert.equal(lectureNumber(course, "zzz"), 0);
});

test("shows a title only when it adds to the course name", async () => {
  const { lectureDetail } = await load();
  assert.equal(
    lectureDetail({
      id: "a",
      title: "ECE 301 - SIGNALS AND SYSTEMS - Ada Lovelace - 11101 _8/24/2026",
    }),
    "",
  );
  assert.equal(
    lectureDetail({ id: "b", title: "Guest talk on robotics" }),
    "Guest talk on robotics",
  );
  assert.equal(lectureDetail({ id: "c" }), "");
});

test("sorts either way with missing values last and ties kept in order", async () => {
  const { sortItems } = await load();
  const items = [
    { id: "a", n: 5 },
    { id: "b", n: null },
    { id: "c", n: 9 },
    { id: "d", n: 5 },
  ];
  const ids = (dir) =>
    sortItems(items, dir, (i) => i.n)
      .map((i) => i.id)
      .join("");
  assert.equal(ids(1), "adcb");
  assert.equal(ids(-1), "cadb");
});
