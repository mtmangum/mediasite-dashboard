// Guards for publishing this repository: nothing private should be tracked or hardcoded.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const tracked = () => {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: root })
      .toString()
      .split("\0")
      .filter(Boolean);
  } catch {
    return null; // not a git checkout (for example an exported archive)
  }
};
const TEXT =
  /\.(js|mjs|ts|json|md|html|css|yml|svg|txt|example)$|^\.env\.example$/;

test("no environment, key, or certificate files are tracked", (t) => {
  const files = tracked();
  if (!files) return t.skip("not a git checkout");
  const bad = files.filter((f) => /(^|\/)\.env$|\.(pem|key|p12|pfx)$/i.test(f));
  assert.deepEqual(bad, []);
});

test("tracked text has no real server, private key, or credential", (t) => {
  const files = tracked();
  if (!files) return t.skip("not a git checkout");
  const rules = [
    // A real institutional Mediasite host; use a placeholder such as YOUR-SERVER.
    [/[a-z0-9-]+\.mediasite\.com/i, "a real Mediasite host"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
    [/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/, "a GitHub token"],
    [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
  ];
  const found = [];
  for (const file of files) {
    if (file === "test/public-repo.test.js" || !TEXT.test(file)) continue;
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const [pattern, label] of rules)
      if (pattern.test(text)) found.push(`${file}: ${label}`);
  }
  assert.deepEqual(found, []);
});

test(".env.example holds placeholders only", () => {
  const text = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  for (const key of ["USERNAME", "PASSWORD", "API_KEY"])
    assert.match(text, new RegExp(`^MEDIASITE_${key}=$`, "m"));
  assert.match(text, /^MEDIASITE_BASE_URL=https:\/\/YOUR-SERVER\//m);
});
