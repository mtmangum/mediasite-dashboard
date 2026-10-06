const http = require("node:http");
const path = require("node:path");
const { getConfig, configProblem, authHeaders } = require("./mediasite");
const { getLibrary } = require("./library");
const { getViewingCharts } = require("./analytics");
const { sendJson, SECURITY_HEADERS } = require("./http-utils");
const { serveStatic } = require("./static");

const PORT = Number(process.env.PORT) || 3100;
const MODE = process.env.DATA_MODE || "demo";
const DEV = process.argv.includes("--dev");
const cfg = getConfig();
if (MODE === "live") {
  const problem = configProblem(cfg);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
}
const reports = new Map();
let library;
const TTL = 5 * 60 * 1000;

function allowed(req) {
  try {
    const host = new URL(`http://${req.headers.host}`);
    return (
      /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(host.hostname) &&
      host.port === String(PORT) &&
      (!req.headers.origin ||
        req.headers.origin === `http://${req.headers.host}`) &&
      (!req.headers["sec-fetch-site"] ||
        ["same-origin", "none"].includes(req.headers["sec-fetch-site"]))
    );
  } catch {
    return false;
  }
}
async function handle(req, res, vite) {
  try {
    if (!allowed(req))
      return sendJson(res, 403, { error: "Cross-site access is not allowed." });
    if (req.method !== "GET")
      return sendJson(res, 405, { error: "This dashboard is read-only." });
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/config")
      return sendJson(res, 200, { mode: MODE });
    if (url.pathname === "/api/library") {
      if (MODE !== "live")
        return sendJson(res, 400, {
          error: "Sample data is served in the browser.",
        });
      if (
        !library ||
        url.searchParams.has("fresh") ||
        Date.now() - library.time > TTL
      )
        library = { items: await getLibrary(cfg), time: Date.now() };
      return sendJson(res, 200, { items: library.items });
    }
    if (url.pathname === "/api/viewing") {
      if (MODE !== "live")
        return sendJson(res, 400, {
          error: "Sample data is served in the browser.",
        });
      const id = url.searchParams.get("id");
      const entry = reports.get(id);
      if (
        !entry ||
        url.searchParams.has("fresh") ||
        Date.now() - entry.time > TTL
      ) {
        const data = await getViewingCharts(cfg, id);
        // Retry unavailable session reports instead of caching their failure for five minutes.
        if (data.sessions !== null) reports.set(id, { data, time: Date.now() });
        return sendJson(res, 200, data);
      }
      return sendJson(res, 200, entry.data);
    }
    if (url.pathname === "/thumb") {
      const target = new URL(url.searchParams.get("u"), cfg.baseUrl);
      if (
        target.origin !== new URL(cfg.baseUrl).origin ||
        target.username ||
        target.password
      )
        return sendJson(res, 400, { error: "Invalid thumbnail host." });
      const up = await fetch(target, {
        headers: authHeaders(cfg),
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      res.writeHead(up.status, {
        ...SECURITY_HEADERS,
        "Content-Type": up.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "max-age=300",
      });
      return res.end(Buffer.from(await up.arrayBuffer()));
    }
    if (url.pathname.startsWith("/api/"))
      return sendJson(res, 404, { error: "Unknown API endpoint." });
    return serveStatic(req, res, { root: path.join(__dirname, "dist"), vite });
  } catch (error) {
    return sendJson(res, error.status || 502, {
      error:
        error.name === "TimeoutError" ? "Mediasite timed out." : error.message,
    });
  }
}
async function start() {
  if (!["demo", "live"].includes(MODE))
    throw new Error("DATA_MODE must be demo or live.");
  if (MODE === "live" && (!cfg.username || !cfg.password || !cfg.apiKey))
    throw new Error(
      "Live mode requires MEDIASITE_USERNAME, MEDIASITE_PASSWORD, and MEDIASITE_API_KEY in .env.",
    );
  let vite;
  const server = http.createServer((req, res) => void handle(req, res, vite));
  if (DEV)
    vite = await (
      await import("vite")
    ).createServer({ server: { host: "127.0.0.1", ws: { server } } });
  server.on("error", async (error) => {
    console.error(error.message);
    await vite?.close();
    process.exitCode = 1;
  });
  server.listen(PORT, "127.0.0.1", () =>
    console.log(`Instructor dashboard (${MODE}): http://localhost:${PORT}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await vite?.close();
      server.close(() => process.exit(0));
    });
}
start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
