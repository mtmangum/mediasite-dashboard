const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../frontend/src/transcript.ts");

test("reads VTT cue identifiers, settings, multiline text and skips metadata", async () => {
  const { parseCaptions } = await load();
  const cues = parseCaptions(
    "\uFEFFWEBVTT\r\n\r\nNOTE ignored\r\nmetadata\r\n\r\ncue-a\r\n00:00:03.000 --> 00:00:05.500 align:start\r\n<v Speaker>Signals &amp; systems</v>\r\nnext line\r\n\r\n00:06.000 --> 00:08.000\r\nScaling",
    60,
  );
  assert.deepEqual(cues, [
    { start: 3, end: 5.5, text: "Signals & systems next line" },
    { start: 6, end: 8, text: "Scaling" },
  ]);
});

test("reads SRT comma times and sorts cues chronologically", async () => {
  const { parseCaptions } = await load();
  assert.deepEqual(
    parseCaptions(
      "2\n00:00:08,500 --> 00:00:10,000\nLater\n\n1\n00:00:02,000 --> 00:00:04,000\nEarlier",
      60,
    ),
    [
      { start: 2, end: 4, text: "Earlier" },
      { start: 8.5, end: 10, text: "Later" },
    ],
  );
});

test("joins overlapping captions, preserves gaps, and excludes interval boundaries", async () => {
  const { captionExcerpt } = await load();
  const cues = [
    { start: 0, end: 5, text: "First" },
    { start: 4, end: 8, text: "Second" },
    { start: 12, end: 15, text: "Third" },
  ];
  assert.equal(captionExcerpt(cues, 3, 6), "First Second");
  assert.equal(captionExcerpt(cues, 8, 12), "");
  assert.equal(captionExcerpt(cues, 5, 8), "Second");
});

test("rejects untimed text, reversed times, and captions outside the recording", async () => {
  const { parseCaptions, captionTime } = await load();
  assert.throws(
    () => parseCaptions("A plain transcript", 60),
    /No timed captions/,
  );
  assert.throws(
    () => parseCaptions("00:05.000 --> 00:02.000\nBad", 60),
    /timing/,
  );
  assert.throws(
    () => parseCaptions("01:10.000 --> 01:15.000\nOther lecture", 60),
    /recording/,
  );
  assert.throws(() => captionTime("00:99.000"), /Invalid/);
  assert.throws(() => captionTime("00:00:10:15"), /Unsupported/);
  assert.equal(captionTime("1500ms"), 1.5);
  assert.equal(captionTime("1.5m"), 90);
});
