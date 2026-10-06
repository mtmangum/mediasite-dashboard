const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getLibrary } = require("../library");
const cfg = { baseUrl: "https://example.test/Mediasite/Api/v1" };
const reply = (value, next) => ({
  status: 200,
  body: JSON.stringify({ value, "@odata.nextLink": next }),
});
const rows = (start, count) =>
  Array.from({ length: count }, (_, i) => ({
    Id: String(start + i),
    Title: "Lecture",
  }));
test("library loads beyond 100 presentations with skip fallback", async () => {
  const paths = [];
  const items = await getLibrary(cfg, async (_, request) => {
    paths.push(request.path);
    return paths.length === 1 ? reply(rows(0, 200)) : reply(rows(200, 35));
  });
  assert.equal(items.length, 235);
  assert.match(paths[1], /\$skip=200/);
});
test("library follows relative and absolute next links, deduplicating overlapping items", async () => {
  let page = 0;
  const items = await getLibrary(cfg, async (_, request) => {
    page++;
    if (page === 1) return reply(rows(0, 2), "Presentations?$skip=2");
    if (page === 2) {
      assert.equal(request.path, "/Presentations?$skip=2");
      return reply(rows(1, 2), cfg.baseUrl + "/Presentations?$skip=3");
    }
    assert.equal(request.path, "/Presentations?$skip=3");
    return reply(rows(3, 1));
  });
  assert.equal(items.length, 4);
});
test("foreign hosts, API path escapes, repeated links and repeated pages fail rather than truncate", async () => {
  for (const next of [
    "https://evil.test/Mediasite/Api/v1/Presentations",
    "https://example.test/other/Presentations",
  ])
    await assert.rejects(
      getLibrary(cfg, async () => reply(rows(0, 1), next)),
      /pagination/,
    );
  await assert.rejects(
    getLibrary(cfg, async () => reply(rows(0, 1), "Presentations?$skip=1")),
    /repeated/,
  );
  let page = 0;
  await assert.rejects(
    getLibrary(cfg, async () =>
      ++page === 1 ? reply(rows(0, 200)) : reply(rows(0, 200)),
    ),
    /repeated/,
  );
});
test("invalid payloads and HTTP failures are explicit", async () => {
  await assert.rejects(
    getLibrary(cfg, async () => ({ status: 403, statusText: "Forbidden" })),
    /403/,
  );
  await assert.rejects(
    getLibrary(cfg, async () => ({ status: 200, body: "{}" })),
    /Invalid/,
  );
});
