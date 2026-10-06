const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../frontend/src/recording-pane.ts");

test("opens the Mediasite player at a moment, in milliseconds", async () => {
  const { playUrl } = await load();
  const url = new URL(
    playUrl({ id: "a", watchUrl: "https://m.test/Mediasite/Play/a" }, 90.4),
  );
  assert.equal(url.origin + url.pathname, "https://m.test/Mediasite/Play/a");
  assert.equal(url.searchParams.get("playFrom"), "90400");
  assert.equal(url.searchParams.get("autostart"), "true");
});

test("refuses links that are not http(s)", async () => {
  const { playUrl } = await load();
  assert.equal(playUrl({ id: "a", watchUrl: "javascript:alert(1)" }, 0), null);
  assert.equal(playUrl({ id: "a", watchUrl: "not a url" }, 0), null);
});
