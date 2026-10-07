# Changelog

## Unreleased

- Fixed the info icons shifting the text below them when opened. An open hint now also closes
  on a click elsewhere or Escape.
- Lecture report: the title, course line, and close button now stay at the top while the report
  scrolls. Opening a report always starts at the top, and on phones the course line truncates
  to one line to keep the bar short.
- Header: "Mediasite Instructor Dashboard" is now one lockup beside the UT wordmark, with a bold
  "Mediasite" and a lighter "Instructor Dashboard" on one baseline. It scales down in steps so
  it never collides with the sample/live badge or the theme button (checked from 360 to
  1400px), and stacks into two lines on phones. The public demo shows the lockup without the
  wordmark.
- Security: removed the built-in default Mediasite server; live mode now requires an https
  `MEDIASITE_BASE_URL` and refuses to start otherwise. API requests no longer follow
  redirects. Added a public-repo guard test and `docs/public-repo-security-review.md`.
- Recording pane uses the documented `autostart` parameter and says where to scrub if the
  player ignores the start time.
- Chart area fades are now neutral Blue Gray rather than a tint of burnt orange.
- Mobile: removed the square tap-highlight flash, enlarged the info-hint target, and widened
  strip bars on narrow screens.
- Rebalanced color using the UT Brand Center palette: burnt orange now marks course identity
  and the main data lines; Dark Teal (Cyan in dark mode) carries data values, selections,
  and heatmap/calendar shading; Blue Gray is the neutral. Replaced the non-UT blue.
- Main page: the course is now the page heading; the reporting window moved to the header;
  a "Sessions by lecture" strip shows interest across the semester; totals sit beside the
  semester's other courses; the course comparison appears only with two or more courses;
  definitions moved behind an info hint. Wording is now "Typical watch time" and
  "Watched nearly all" everywhere.
- Lecture library: lectures are numbered ("Lecture 4") instead of repeating raw titles;
  every column sorts; sessions have inline bars and watch time shows its share of length.
- Lecture report: removed tiles and insights that repeated the charts; the Audience panel
  folds a single device into a sentence; smallest text raised to 11px.
- Added a calendar view to the lecture library, with month navigation and a hover/focus
  tooltip on each day showing the lectures' sessions, median watch time, and completion.
- Tooltips use dedicated light/dark colors instead of inverting the page, with orange values,
  blue times, and yellow notes.
- Most-replayed moments are now at least two minutes apart, and the list shows eight.
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
