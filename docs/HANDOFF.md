# Instructor dashboard handoff

## Context

This project lives at `/Users/bollox/Projects/mediasite/dashboard`, beside the existing
`../apiTest` Mediasite API Tester. The user requested a separate instructor-focused
course dashboard and suggested reusing the original app's assets.

The original app is working and deployed as a sample-data demo at
https://mtmangum.github.io/mediasite/. It has grid/list views, real illustrative lecture
screenshots, analytics, previews, and a concise README. Git remotes there are `origin`
(UT GitHub mirror) and `github` (public GitHub/Pages); prior user instruction was to
commit and push completed changes. This dashboard has its own repository with the same
two-remote layout: `origin` (UT GitHub) at
https://github.austin.utexas.edu/bollox/mediasite-dashboard.git and `github` (public, hosts
the Pages demo) at https://github.com/mtmangum/mediasite-dashboard.git.
Do not push it to the old app's remotes or change the old app unless requested.

## Product decisions

- Local, read-only instructor workspace for a course and semester.
- Single-instructor workspace with semester/course selection, chronological lecture list, course comparisons,
  sessions, median watch time, and coverage-based completion.
- Reporting windows: all time, first seven days after release, last thirty days.
- Selected lecture opens detailed all-time charts using the existing chart renderer.
- Anonymous sessions are not student identities, attendance, or proof of learning.
- Name/course/section parsing suggests grouping; it must not determine permissions.
- Live mode should load full history through API pagination, beyond the old 100-item limit.
- Start in sample-data mode, without copying the original app's credentials.
- User prefers concise documentation and readable interfaces.
- No instructor selector: each dashboard is an instructor workspace. Display a name
  when the library metadata is consistent, otherwise "Your workspace". Browse the
  account-accessible library without filtering access by inferred instructor names.

## Current implementation status

The initial instructor dashboard is implemented. It includes:

- Instructor profile display, semester/course selection, and chronological lecture lists.
- Course comparisons, pooled median watch time, coverage-based completion, and
  all-time/first-seven-days/last-thirty-days reporting windows.
- Search, course CSV export, report retries, refresh, and light/dark themes.
- Detailed all-time interactive lecture charts in a keyboard-dismissable dialog. Choosing a
  moment on the engagement chart shows it in a recording pane; the live player loads only on
  request, since playing it registers a session in that lecture's analytics.
- Two fictional courses and 24 sample lectures with illustrative screenshots.
- A read-only loopback server, server-side credential configuration, full library
  pagination, and explicit unavailable metrics when reports cannot be loaded.
- A standalone Git repository, README, and CHANGELOG for version 0.1.0.

Reused local copies of the API helpers, analytics normalization, title parser,
viewing statistics, chart renderer, typography, UT branding, Inter font/license,
and 36 illustrative screenshot assets. No API credentials were copied.

Validation: build/typecheck, all 35 tests, and format checks pass. Safari checks
confirmed sample loading, course selection, search, first-week comparisons,
incomplete-window labels, and detailed charts. Reviewed dashboard/report layout;
fixed hidden tooltip display and positioned report tooltips inside their container.
The Texas wordmark now has an explicit SVG viewBox and scales by height with auto
width, preserving its original proportions in desktop and compact headers.

Remaining validation: confirm the live recording pane (it embeds the Mediasite Play page and
seeks with `?playFrom=<ms>&autoStart=true`; the embed and parameters are unverified, and a
link to open the player in a new tab is the fallback); exercise live data with an authorized Mediasite account and
verify small-screen behavior on a mobile device. No live credentials are configured.
This remains a local prototype, not a multi-user instructor portal. The original
`../apiTest` project and repository were preserved.

## Public demo

A static sample-data build (`npm run build:demo`, `vite.demo.config.mjs`) and
`.github/workflows/pages.yml` are ready for a public repo named `mtmangum/mediasite-dashboard`
(site: https://mtmangum.github.io/mediasite-dashboard/). The public repo and `github` remote exist but nothing is pushed yet. Remaining: push after
confirming with the user, then enable Pages with the GitHub Actions source. The demo omits the UT wordmark, as the original app's demo does.

## Run

`npm ci`, then `npm run dev`; open http://localhost:3100.
`npm run build`, `npm test`, and `npm run format:check` are required validation.
For live data, copy `.env.example` to `.env`, set DATA_MODE=live, and enter API
credentials. No secrets have been copied into this project.

## Resume prompt

Read docs/HANDOFF.md and README.md, inspect the current files, and continue the instructor
course dashboard. Preserve the original apiTest project. Follow the product decisions
above, run relevant checks, and keep this handoff current.
