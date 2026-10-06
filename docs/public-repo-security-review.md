# Public repo security review

Date: 2026-10-06

Scope: the Mediasite Instructor Dashboard (this repository) and, read-only, the original
Mediasite API Tester in `../apiTest`. Both have a public remote on github.com, so everything
tracked in them is public, including history.

## Summary

Neither project exposes credentials. No secret has ever been committed, credentials stay on
the local Node server, and both servers accept only loopback, same-origin requests.

The public repositories do, however, publish things that are not secrets but deserve a
decision: real instructor names with course sections and view counts (API Tester screenshot),
a real institutional server address, UT trademark artwork, and real lecture imagery. The
dashboard's server-address issue and a redirect hardening gap are fixed in this pass; the
rest need the owner's decision and are listed under "Open items".

## Dashboard

### Verified

- A scan of the full git history found no credentials, tokens, or keys. No `.env`, `.pem`,
  `.key`, or certificate file is or was tracked. `.env` is ignored.
- Credentials are read from the environment by `mediasite.js` and used only in outbound
  requests from the Node server (`Authorization: Basic` and `sfapikey`). The browser never
  receives them, and the demo build contains none.
- The server binds to `127.0.0.1`. Each request must carry a loopback `Host` on the app's
  port and, when present, a same-origin `Origin` and `Sec-Fetch-Site`. Every response sets
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
  The API is read-only (non-GET requests are refused).
- The thumbnail proxy fetches only from the configured Mediasite origin and refuses redirects.
- There is no `eval`, `new Function`, `document.write`, or `insertAdjacentHTML`. The nine
  `innerHTML` sites build markup from values passed through an escape helper; this was
  spot-checked, not audited line by line.
- The Pages workflow builds sample data only, runs only for `mtmangum/mediasite-dashboard`,
  and has no secrets. Deployed output omits the UT wordmark files.

### Fixed in this pass

- **No default server.** `.env.example` and `mediasite.js` pointed at a real institutional
  Mediasite host, so live mode with a forgotten base URL would send credentials there. There
  is now no default. Live mode refuses to start unless `MEDIASITE_BASE_URL` is set, uses
  `https` (or loopback `http`), and has no embedded credentials.
- **No redirects on API calls.** Server-side API requests now use `redirect: "error"`. A
  redirect would otherwise forward the `sfapikey` header (fetch strips only `Authorization`
  and cookies across origins).
- **Guard test.** `test/public-repo.test.js` fails if an env or key file is tracked, if
  tracked text contains a real Mediasite host, private key, or common token, or if
  `.env.example` holds anything but placeholders.

### Open items (owner decision)

1. **UT wordmark in source.** `frontend/public/brand/ut-wordmark*.svg` are tracked. The Pages
   build strips them from the site, but they are in the public source. UT's trademark
   licensing rules govern use of protected marks; confirm they allow this or move the files
   out of the public repository.
2. **Real lecture frames.** The 36 images in `frontend/public/demo-thumbnails/` are real
   lecture frames showing classrooms, people, and slides. Confirm permission to publish them,
   or replace them with generic or synthetic images.
3. **Commit identity.** All commits are authored as `Matt Mangum <mtmangum@utexas.edu>`, which
   the public repository shows. Changing it requires rewriting history and force-pushing, so
   it should only be done deliberately.
4. **Internal address in docs.** `README.md` and `docs/HANDOFF.md` link to the UT GitHub
   Enterprise repository. This is low risk but unnecessary in a public repository.

### Hardening to consider

- Pin GitHub Actions to commit hashes instead of `@v4` tags.
- Enable secret scanning and push protection on the public repository.
- The live recording pane embeds a Mediasite page without a `sandbox` attribute (the player
  needs scripts). It only accepts `http(s)` links from the configured server.

## API Tester (`../apiTest`, reviewed read-only; nothing was changed)

### Verified

- History scan: no credentials; the only matches are README placeholders. No env, key, or
  certificate file has been committed. The repository has no runtime dependencies (dev tools
  only).
- Same controls as the dashboard, plus: JSON-only bodies for writes, a base-URL override that
  must be `https` without embedded credentials, secrets never echoed back to the page, an
  explorer that is read-only unless "Allow changes" is on, ID validation on every route, a
  static server that rejects paths outside `dist/`, and pagination that only follows links on
  the same origin and path.
- Frame previews pass credentials to `ffmpeg` through a local in-process proxy, so they never
  appear in the process list.
- A test already checks that the demo bundle contains no UT hostnames.

### Findings

1. **`screenshot.png` publishes real data (highest priority).** The README image shows real
   instructor names, real course codes and section numbers, real view counts, and real lecture
   content including a person on camera. It is tracked and present on the public remote
   (`github/main`, commit `0bc98da`). Replace it with a screenshot of the sample-data demo. The
   image stays in history unless history is rewritten.
2. **Real default server.** `mediasite.js`, `.env.example`, and the README name a real
   institutional Mediasite host as the default. Remove the default and require the variable, as
   the dashboard now does.
3. **Redirects forward the API key.** `callApi` and the `/thumb` proxy follow redirects, so a
   redirect from the Mediasite host would forward the `sfapikey` header. Set `redirect: "error"`.
   The frame-fetching code already does.
4. **Same open items as the dashboard:** UT wordmark files and 36 real lecture frames in the
   public source, and the author email on all 25 commits.

## Guardrails

- Never commit a real `.env`; check `git status` before committing.
- Never run live mode on a public host, and never add Mediasite credentials to GitHub Actions
  or Pages.
- Keep the public demos on sample data only.
- Review any change that touches environment variables, auth headers, redirects, or outbound
  fetches before it is published.
