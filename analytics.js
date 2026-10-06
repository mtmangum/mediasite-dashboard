const { callApi } = require("./mediasite");

function validateId(id) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id || "")) {
    const error = new Error("Invalid presentation ID");
    error.status = 400;
    throw error;
  }
}
// Aggregate analytics only; individual viewer identities are not needed by the cards.
async function getAnalytics(cfg, id, request = callApi) {
  validateId(id);
  const endpoint = `/PresentationAnalytics('${id}')`;
  const summary = await request(cfg, { path: endpoint });
  if (summary.status !== 200) {
    const error = new Error(
      [401, 403].includes(summary.status)
        ? "Analytics access requires a login with permission to view this presentation’s reports."
        : `Mediasite returned ${summary.status} ${summary.statusText}`,
    );
    error.status = summary.status;
    throw error;
  }
  const raw = JSON.parse(summary.body);
  const number = (value) =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : null;
  const requests = [{ endpoint, status: summary.status, ms: summary.ms }];
  const warnings = [];
  const [browsers, systems] = await Promise.all(
    ["BrowserTotals", "SystemTotals"].map(async (name) => {
      const path = `${endpoint}/${name}`;
      try {
        const result = await request(cfg, { path });
        requests.push({ endpoint: path, status: result.status, ms: result.ms });
        if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
        const data = JSON.parse(result.body);
        if (!Array.isArray(data.value)) throw new Error("Invalid response");
        return data.value
          .map((p) => ({
            name: String(p.Platform || "Unknown"),
            views: number(p.Total),
          }))
          .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
      } catch (error) {
        warnings.push(`${name} unavailable: ${error.message}`);
        return null;
      }
    }),
  );
  return {
    totalViews: number(raw.TotalViews),
    liveViews: number(raw.LiveViews),
    onDemandViews: number(raw.OnDemandViews),
    uniqueUsers: number(raw.TotalUsers),
    peakConnections: number(raw.PeakConnections),
    watchSeconds: number(raw.TotalTimeWatchedSeconds),
    firstWatched: raw.FirstWatched || null,
    lastWatched: raw.LastWatched || null,
    browsers,
    systems,
    warnings,
    requests,
    fetchedAt: new Date().toISOString(),
  };
}
const nonnegative = (value) => {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function durationHistogram(rows) {
  const seconds = rows.map((row) => nonnegative(row.TimeWatchedSeconds));
  const watched = seconds.filter((s) => s !== null && s > 0);
  const longest = watched.reduce((max, s) => Math.max(max, s), 0);
  // Equal-width bins, with at most twelve bars, including exact boundaries.
  const binSeconds =
    [60, 300, 600, 900, 1800, 3600].find(
      (width) => Math.floor(longest / width) < 12,
    ) || Math.ceil((longest + 1) / 12 / 3600) * 3600;
  const bins = watched.length
    ? Array.from({ length: Math.floor(longest / binSeconds) + 1 }, (_, i) => ({
        startSeconds: i * binSeconds,
        endSeconds: (i + 1) * binSeconds,
        sessions: 0,
      }))
    : [];
  for (const s of watched) bins[Math.floor(s / binSeconds)].sessions++;
  return {
    bins,
    binSeconds,
    totalSessions: rows.length,
    watchedSessions: watched.length,
    zeroSeconds: seconds.filter((s) => s === 0).length,
    unknownSeconds: seconds.filter((s) => s === null).length,
  };
}

// "mobile" / "desktop" / "other", from the session's operating system and browser names.
function deviceClass(row) {
  const text = `${row.System || ""} ${row.Browser || ""}`;
  if (/iphone|ipad|ipod|android|mobile|tablet/i.test(text)) return "mobile";
  if (/windows|mac|linux|chrome ?os|cros|ubuntu|desktop/i.test(text))
    return "desktop";
  return "other";
}

// Anonymous per-session records plus viewer counts. IP addresses, user names, and
// playback tickets are used only to count distinct and returning viewers; they never leave.
function sessionSummary(rows) {
  const sessions = [];
  const visits = new Map();
  for (const row of rows) {
    const opened = new Date(row.Opened);
    if (Number.isNaN(opened.getTime())) continue;
    sessions.push({
      opened: opened.toISOString(),
      watched: nonnegative(row.TimeWatchedSeconds),
      coverage: nonnegative(row.CoverageWatchedSeconds),
      device: deviceClass(row),
    });
    const who = row.IPAddress || row.HostName;
    if (who) visits.set(who, (visits.get(who) || 0) + 1);
  }
  sessions.sort((a, b) => a.opened.localeCompare(b.opened));
  return {
    sessions,
    viewers: {
      distinct: visits.size,
      returning: [...visits.values()].filter((n) => n > 1).length,
    },
  };
}

async function getViewingCharts(cfg, id, request = callApi) {
  validateId(id);
  const endpoint = `/PresentationAnalytics('${id}')`;
  const requests = [];
  async function collection(path) {
    const rows = [];
    const visited = new Set();
    while (path) {
      if (visited.has(path) || visited.size >= 20)
        throw new Error("The report is too large to load completely.");
      visited.add(path);
      const result = await request(cfg, { path });
      requests.push({ endpoint: path, status: result.status, ms: result.ms });
      if (result.status !== 200)
        throw new Error(
          [401, 403].includes(result.status)
            ? "Your login does not have permission to view this report."
            : `Mediasite returned HTTP ${result.status}.`,
        );
      const data = JSON.parse(result.body);
      if (!Array.isArray(data.value)) throw new Error("Invalid report data.");
      rows.push(...data.value);
      const next = data["@odata.nextLink"] || data["odata.nextLink"];
      const pageUrl = cfg.baseUrl + path;
      path = null;
      if (next) {
        const root = new URL(cfg.baseUrl);
        const url = new URL(next, pageUrl);
        if (
          url.origin !== root.origin ||
          !url.pathname.startsWith(root.pathname + "/")
        )
          throw new Error("Invalid report pagination link.");
        path = url.pathname.slice(root.pathname.length) + url.search;
      }
    }
    return rows;
  }
  const [timelineResult, sessionsResult] = await Promise.allSettled([
    collection(`${endpoint}/ViewingTrends?$top=1000`).then((rows) =>
      rows
        .map((row) => {
          const startSeconds = nonnegative(row.StartTime);
          const durationSeconds = nonnegative(row.Duration);
          const views = nonnegative(row.Views);
          if (startSeconds === null || !durationSeconds || views === null)
            throw new Error("Invalid viewing timeline data.");
          return { startSeconds, durationSeconds, views };
        })
        .sort((a, b) => a.startSeconds - b.startSeconds),
    ),
    collection(
      `${endpoint}/ViewingSessions?$select=Opened,TimeWatchedSeconds,CoverageWatchedSeconds,System,Browser,IPAddress&$top=1000`,
    ).then((rows) => ({
      histogram: durationHistogram(rows),
      ...sessionSummary(rows),
    })),
  ]);
  return {
    timeline:
      timelineResult.status === "fulfilled" ? timelineResult.value : null,
    timelineError:
      timelineResult.status === "rejected"
        ? timelineResult.reason.message
        : null,
    histogram:
      sessionsResult.status === "fulfilled"
        ? sessionsResult.value.histogram
        : null,
    histogramError:
      sessionsResult.status === "rejected"
        ? sessionsResult.reason.message
        : null,
    sessions:
      sessionsResult.status === "fulfilled"
        ? sessionsResult.value.sessions
        : null,
    viewers:
      sessionsResult.status === "fulfilled"
        ? sessionsResult.value.viewers
        : null,
    requests,
    fetchedAt: new Date().toISOString(),
  };
}
module.exports = { getAnalytics, getViewingCharts };
