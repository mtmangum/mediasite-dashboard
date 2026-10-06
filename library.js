const { callApi } = require("./mediasite");

// Follow the server's pagination within the configured API; never return a partial library.
async function getLibrary(cfg, request = callApi) {
  const root = new URL(cfg.baseUrl.replace(/\/+$/, ""));
  const pageSize = 200;
  const initial = `/Presentations?$top=${pageSize}&$filter=Status eq 'Viewable'&$orderby=CreationDate desc&$select=full`;
  let path = initial;
  const seenPaths = new Set();
  const items = new Map();
  let skip = 0;
  while (path) {
    if (seenPaths.has(path) || seenPaths.size >= 100)
      throw new Error(
        "The library could not be loaded completely. Narrow the API account's content access.",
      );
    seenPaths.add(path);
    const result = await request(cfg, { path });
    if (result.status !== 200)
      throw Object.assign(
        new Error(
          `Mediasite returned ${result.status} ${result.statusText}. Check the API account and content permissions.`,
        ),
        { status: result.status },
      );
    const data = JSON.parse(result.body);
    if (!Array.isArray(data.value))
      throw new Error("Invalid presentation library response.");
    let added = 0;
    for (const p of data.value) {
      if (!p.Id || items.has(p.Id)) continue;
      added++;
      items.set(p.Id, {
        id: p.Id,
        title: p.Title,
        description: p.Description,
        status: p.Status,
        created: p.CreationDate,
        recorded: p.RecordDate,
        durationMs: p.Duration,
        owner: p.Owner,
        presenter: p.PrimaryPresenter,
        views: p.NumberOfViews,
        folder: p.ParentFolderName,
        isLive: p.IsLive,
        thumbnail: p.ThumbnailUrl
          ? `/thumb?u=${encodeURIComponent(p.ThumbnailUrl)}`
          : undefined,
        watchUrl: cfg.baseUrl.replace(/\/Api\/v1\/?$/i, "") + "/Play/" + p.Id,
      });
    }
    if (data.value.length && !added)
      throw new Error(
        "Mediasite repeated a library page; the complete course history is unavailable.",
      );
    const next = data["@odata.nextLink"] || data["odata.nextLink"];
    path = null;
    skip += data.value.length;
    if (next) {
      const url = new URL(next, root.href + [...seenPaths].at(-1));
      if (
        url.origin !== root.origin ||
        !url.pathname.startsWith(root.pathname + "/")
      )
        throw new Error("Invalid library pagination link.");
      path = url.pathname.slice(root.pathname.length) + url.search;
    } else if (data.value.length === pageSize) {
      path = `${initial}&$skip=${skip}`;
    }
  }
  return [...items.values()];
}
module.exports = { getLibrary };
