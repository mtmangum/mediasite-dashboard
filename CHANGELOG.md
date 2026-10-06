# Changelog

## Unreleased

- Simplified the sidebar: removed the placeholder "M Instructor workspace" mark, the avatar,
  and repeated labels. The profile shows the name and recording count, the semester selector
  appears only with more than one semester, course cards show sessions, the grouping caveat
  is an info hint, and the sample/live badge moved to the header.
- Removed repeated instructor, semester, and recording-count text from the course heading,
  and replaced the "Reports available" tile and column with a note shown only when reports
  are missing.
- Fixed the stretched scrub marker on the engagement and retention charts.
- Paired the engagement chart with the recording: choosing a moment shows it in the
  recording (Mediasite player in live mode, nearest sample frame in the demo).
- Added a static sample-data build (`npm run build:demo`) and a GitHub Pages workflow
  for `mtmangum/mediasite-dashboard`. The demo omits the university wordmark.
- Replaced instructor selection with a profile display for a personal instructor
  workspace; semester and course selection remain.

- Fixed the Texas header wordmark scaling to preserve its original proportions.

## 0.1.0 — 2026-10-06

- Added the instructor dashboard with instructor, semester, and course selection.
- Added chronological lecture lists, search, course comparisons, and CSV exports.
- Added all-time, first-seven-days, and rolling-thirty-days reporting windows.
- Added session totals, pooled median watch time, and coverage-based completion.
- Reused detailed interactive all-time lecture charts, UT branding, Inter, and
  illustrative lecture screenshots from the separate Mediasite API Tester.
- Added a default sample library with two fictional courses and 24 lectures.
- Added loopback-only, read-only live API access with complete library pagination,
  server-side credentials, report retries, and explicit unavailable values.
- Added tests for grouping, reporting boundaries, missing reports, analytics,
  title parsing, and pagination beyond 100 recordings.

Live Mediasite integration still requires validation with an authorized account.
