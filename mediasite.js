// Shared Mediasite helpers: connection config, auth headers, and request calls.

// There is deliberately no default server: credentials are only ever sent where you point them.
function getConfig(overrides = {}) {
  return {
    baseUrl: (
      overrides.baseUrl ||
      process.env.MEDIASITE_BASE_URL ||
      ""
    ).replace(/\/+$/, ""),
    username: overrides.username ?? process.env.MEDIASITE_USERNAME ?? "",
    password: overrides.password ?? process.env.MEDIASITE_PASSWORD ?? "",
    apiKey: overrides.apiKey ?? process.env.MEDIASITE_API_KEY ?? "",
  };
}

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

// Live mode sends your login and API key to the base URL, so it must be set, use https (http
// only for this machine), and not embed credentials. Returns a message, or null when usable.
function configProblem(cfg) {
  if (!cfg.baseUrl)
    return "Set MEDIASITE_BASE_URL (for example https://YOUR-SERVER/Mediasite/Api/v1).";
  try {
    const url = new URL(cfg.baseUrl);
    const secure =
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOOPBACK.test(url.hostname));
    if (!secure)
      return "MEDIASITE_BASE_URL must be an https:// address (http:// only for localhost).";
    if (url.username || url.password)
      return "MEDIASITE_BASE_URL must not contain a username or password.";
  } catch {
    return "MEDIASITE_BASE_URL is not a valid URL.";
  }
  return null;
}

// Basic auth (when a username is set) plus the sfapikey header (when a key is set).
function authHeaders(cfg) {
  const headers = {};
  if (cfg.username)
    headers.Authorization =
      "Basic " +
      Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
  if (cfg.apiKey) headers.sfapikey = cfg.apiKey;
  return headers;
}

async function callApi(
  cfg,
  { method = "GET", path = "/Home", body, contentType },
) {
  const headers = { Accept: "application/json", ...authHeaders(cfg) };
  if (body) headers["Content-Type"] = contentType || "application/json";

  const url = cfg.baseUrl + (path.startsWith("/") ? path : "/" + path);
  const started = performance.now();
  const res = await fetch(url, {
    method,
    headers,
    body: body || undefined,
    // A redirect would carry the API key header to wherever it points.
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  return {
    url,
    status: res.status,
    statusText: res.statusText,
    ms: Math.round(performance.now() - started),
    contentType: res.headers.get("content-type") || "",
    body: text,
  };
}

module.exports = { getConfig, configProblem, authHeaders, callApi };
