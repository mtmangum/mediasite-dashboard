const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getConfig, configProblem } = require("../mediasite");

test("has no default server to send credentials to", () => {
  const saved = process.env.MEDIASITE_BASE_URL;
  delete process.env.MEDIASITE_BASE_URL;
  try {
    const cfg = getConfig();
    assert.equal(cfg.baseUrl, "");
    assert.match(configProblem(cfg), /MEDIASITE_BASE_URL/);
  } finally {
    if (saved !== undefined) process.env.MEDIASITE_BASE_URL = saved;
  }
});

test("accepts https and loopback http, rejects the rest", () => {
  const problem = (baseUrl) => configProblem({ baseUrl });
  assert.equal(problem("https://media.example.edu/Mediasite/Api/v1"), null);
  assert.equal(problem("http://localhost:8080/Api/v1"), null);
  assert.match(problem("http://media.example.edu/Api/v1"), /https/);
  assert.match(problem("https://user:pw@media.example.edu/Api/v1"), /username/);
  assert.match(problem("ftp://media.example.edu"), /https/);
  assert.match(problem("not a url"), /valid/);
});
