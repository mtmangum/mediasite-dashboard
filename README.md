# Mediasite Instructor Dashboard

A local, read-only course workspace for instructors. Compare lectures, inspect viewing
patterns, and open detailed reports. Reuses the Mediasite API Tester's branding, font,
real screenshot assets, title parser, and analytics/chart code.

## Quick start

Requires Node.js 22.18+ (the tests use native TypeScript type stripping).

```sh
npm ci
npm run dev
```

Open **http://localhost:3100**. Sample data is the default: two courses, one fictional
instructor, and 24 lectures with real illustrative screenshots. No credentials needed.
Stop with **Ctrl+C**. Use `npm start` to build and serve production assets.

## Connect to Mediasite

```sh
cp .env.example .env
```

Set `DATA_MODE=live` and fill in the API URL (https; there is no default server), key, username, and password. Restart.
The account needs API Access and permission to read presentation analytics. Obtain a
key at `https://YOUR-SERVER/Mediasite/Api/Docs/ApiKeyRegistration.aspx` or ask your admin.
Credentials stay in `.env` and on the Node server. They are not copied from the original app.

## Use the dashboard

- Select a **course** in your workspace (and a **semester**, when there is more than one). Lectures appear in chronological order.
- Choose **All time**, **First 7 days**, or **Last 30 days** in the page header. Totals show
  each figure beside the semester's other courses, and **Sessions by lecture** shows where
  interest rises and falls across the semester.
- Select a lecture for its full **all-time** engagement, retention, and audience charts.
- In a lecture report, click the engagement chart (or a most-replayed moment) to see that
  point in the recording. Live data opens the Mediasite player there on request; the sample
  demo shows the nearest sample frame.
- Use **Refresh** to reload the library and reports; **Retry reports** retries unavailable analytics.
- Sort the lecture list by any column. Lectures are numbered by recording date.
- Switch the lecture library between a **List** and a month **Calendar**; hover a day for each
  lecture's sessions, typical watch time, and share who watched nearly all.
- Search lecture titles or descriptions, or export the selected course's metrics as CSV.

Course grouping uses the parsed course/section/instructor in recording titles and
record dates for the semester (Jan–May spring, Jun–Jul summer, Aug–Dec fall). Folder,
presenter, and owner are fallbacks. These are suggestions based on metadata, not
verified enrollment or identity. Multiple name spellings may appear separately.

Live mode follows API pagination rather than stopping at the latest 100 recordings.
Repeated, foreign, or excessively large pagination fails explicitly rather than
presenting an incomplete library as complete. Report failures show unavailable values,
not zero activity. Newer lectures show when their first seven days are incomplete.

Session counts are not student counts, and viewing is not evidence of learning or
attendance. "Watched nearly all" means at least 85% recorded coverage among watched sessions
with known coverage. Course totals exclude reports whose session data is unavailable.
The comparison window applies to overview metrics; detailed charts are labeled all-time.

## Development

```sh
npm run build
npm test
npm run format:check
npm run build:demo   # static sample-data site in dist-demo/
```

Frontend files are in `frontend/`; `server.js`, `library.js`, and `analytics.js` serve
live data. This is a local prototype bound to loopback, not a multi-user instructor
portal. The workspace uses the library accessible to the configured Mediasite account;
account permissions control actual access. The instructor name is a display label
inferred from recording metadata when consistent, not a verified login identity. No API explorer or write operations are included.

## Repository

The public sample-data demo is built by `.github/workflows/pages.yml` for
`mtmangum/mediasite-dashboard` and served at https://mtmangum.github.io/mediasite-dashboard/.

This dashboard has its own [Git repository](https://github.austin.utexas.edu/bollox/mediasite-dashboard).
See [CHANGELOG.md](CHANGELOG.md) for releases and [HANDOFF.md](docs/HANDOFF.md) for project status.
The adjacent API Tester is a separate project and is not modified by this dashboard.
