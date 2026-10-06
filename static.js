const fs = require("node:fs");
const path = require("node:path");
const { sendJson, SECURITY_HEADERS } = require("./http-utils");

const TYPES = {
  ".html": "text/html",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
// /recent and /recent/<presentation-id>/charts (a shareable link to one presentation's
// viewing charts) are both served by the presentations page, which reads the route itself.
const RECENT_ROUTE = /^\/recent(\/[A-Za-z0-9_-]{1,128}\/charts)?\/?$/;
const isRecent = (pathname) => RECENT_ROUTE.test(pathname);

// Serves the built front end (or Vite's middleware in development).
function serveStatic(req, res, { root, vite }) {
  const { pathname } = new URL(req.url, "http://localhost");
  if (vite) {
    if (isRecent(pathname)) req.url = "/recent.html";
    return vite.middlewares(req, res, () =>
      sendJson(res, 404, { error: "Not found" }),
    );
  }
  const file =
    pathname === "/"
      ? "index.html"
      : isRecent(pathname)
        ? "recent.html"
        : pathname.slice(1);
  const target = path.resolve(root, file);
  if (
    target.startsWith(root + path.sep) &&
    fs.existsSync(target) &&
    fs.statSync(target).isFile()
  ) {
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": TYPES[path.extname(target)] || "application/octet-stream",
    });
    return res.end(fs.readFileSync(target));
  }
  return sendJson(res, 404, { error: "Not found" });
}

module.exports = { serveStatic, isRecent };
