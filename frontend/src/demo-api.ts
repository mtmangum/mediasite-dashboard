// A stand-in for the local server, used by the static GitHub Pages demo. Courses, people,
// and sessions are fictional and deterministic; screenshots are bundled real lecture frames.
// Counts and charts come from the same generated sessions. No live Mediasite calls are made.
// This file has no runtime imports so it can be unit-tested directly.
import type {
  Analytics,
  Presentation,
  RecordingHealth,
  RecordingWarning,
  SessionRecord,
  ViewingCharts,
} from "./shared";

export const DEMO_REPO = "https://github.com/mtmangum/mediasite";
const DAY = 86_400_000;
const SEGMENT = 30; // seconds per timeline segment, as Mediasite reports

// -- deterministic randomness ---------------------------------------------------------------
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function random(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Standard normal from two uniforms.
const gauss = (r: () => number) =>
  Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// -- the fictional catalogue ----------------------------------------------------------------
const COURSES = [
  {
    code: "ECE 301",
    title: "Signals and Systems",
    first: "Ada",
    last: "Lovelace",
    section: "11101",
  },
  {
    code: "ECE 312",
    title: "Digital Logic Design",
    first: "Ada",
    last: "Lovelace",
    section: "11120",
  },
];
const RECORDINGS_PER_COURSE = 12;

export interface DemoRecord {
  item: Presentation;
  duration: number; // seconds
  sessions: SessionRecord[];
  viewers: { distinct: number; returning: number };
  timeline: NonNullable<ViewingCharts["timeline"]>;
  courseIndex: number;
  staticReview: boolean;
}

// Static assets work both at the site root and under the GitHub Pages sub-path.
const BASE: string = import.meta.env?.BASE_URL ?? "/";
function frameImage(courseIndex: number, variant: number) {
  const lecture = String(courseIndex + 1).padStart(2, "0");
  return `${BASE}demo-thumbnails/lecture-${lecture}-${variant + 1}.jpg`;
}

function makeRecord(courseIndex: number, k: number, now: number): DemoRecord {
  const course = COURSES[courseIndex];
  const seed = `${course.code}#${k}`;
  const r = random(seed);
  const id = Array.from(
    { length: 34 },
    () => "0123456789abcdef"[Math.floor(r() * 16)],
  ).join("");
  const rand = random(id);

  // Dates: newer recordings for earlier courses, a few days apart.
  const ageDays = 0.4 + courseIndex * 0.55 + k * 3.8 + rand() * 0.4;
  const created = now - ageDays * DAY;
  const recorded = new Date(created - (0.5 + rand() * 0.5) * DAY);
  recorded.setHours(9 + Math.floor(rand() * 8), rand() < 0.5 ? 0 : 30, 0, 0);
  const short = (courseIndex * 3 + k) % 11 === 7; // a couple of short clips
  const duration = short
    ? 900 + Math.floor(rand() * 240)
    : 2700 + Math.floor(rand() * 3300);

  // Sessions: most viewing soon after upload, in the afternoon and evening, some returning.
  const popularity = 0.12 + 0.88 * rand();
  const count = Math.round(popularity * 46 * Math.min(1, ageDays / 6));
  const pool = Math.max(1, Math.round(count * 0.55));
  const visits = new Map<number, number>();
  const sessions: SessionRecord[] = [];
  const timeline = Array.from(
    { length: Math.ceil(duration / SEGMENT) },
    (_, i) => ({
      startSeconds: i * SEGMENT,
      durationSeconds: SEGMENT,
      views: 0,
    }),
  );
  const hot = Math.floor(timeline.length * (0.3 + rand() * 0.5));
  for (let i = 0; i < count; i++) {
    const delay = Math.min(ageDays - 0.05, -Math.log(1 - rand()) * 1.6);
    const opened = new Date(created + delay * DAY);
    const hours = [10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    opened.setHours(
      hours[Math.floor(rand() * hours.length)],
      Math.floor(rand() * 60),
      Math.floor(rand() * 60),
    );
    if (opened.getTime() > now)
      opened.setTime(now - Math.floor(rand() * 3_600_000));
    if (opened.getTime() < created)
      opened.setTime(created + Math.floor(rand() * 3_600_000));
    let watched = 0,
      coverage = 0;
    if (rand() > 0.28) {
      // About one watched session in six sits through (nearly) the whole recording.
      const finisher = rand() < 0.17;
      watched = finisher
        ? duration * (0.9 + rand() * 0.25)
        : Math.min(
            duration * 1.1,
            Math.exp(Math.log(420) + 0.95 * gauss(rand)),
          );
      watched = Math.max(8, Math.round(watched));
      coverage = Math.min(
        duration,
        Math.round(
          watched * (finisher ? 0.92 + rand() * 0.08 : 0.6 + rand() * 0.4),
        ),
      );
      // Many viewers jump ahead instead of starting at the beginning.
      const from =
        finisher || rand() < 0.4
          ? 0
          : Math.floor(rand() * Math.max(1, duration - coverage));
      const to = Math.min(duration, from + coverage);
      for (let s = Math.floor(from / SEGMENT); s < Math.ceil(to / SEGMENT); s++)
        timeline[s].views++;
      // A tricky stretch gets replayed, sometimes more than once.
      if (rand() < 0.65)
        for (let pass = 0; pass < 1 + Math.floor(rand() * 3); pass++)
          for (
            let s = hot;
            s < Math.min(timeline.length, hot + 4 + Math.floor(rand() * 6));
            s++
          )
            timeline[s].views++;
    }
    const u = rand();
    const viewer = Math.floor(rand() * pool);
    visits.set(viewer, (visits.get(viewer) || 0) + 1);
    sessions.push({
      opened: opened.toISOString(),
      watched,
      coverage,
      device: u < 0.8 ? "desktop" : u < 0.97 ? "mobile" : "other",
    });
  }
  sessions.sort((a, b) => a.opened.localeCompare(b.opened));

  const stamp = `${recorded.getMonth() + 1}/${recorded.getDate()}/${recorded.getFullYear()}`;
  const instructor = `${course.first} ${course.last}`;
  const title =
    courseIndex % 2
      ? `${course.code}-${course.title}-${course.first} ${course.last}-${course.section}_${stamp}`
      : `${course.code} - ${course.title.toUpperCase()} - ${instructor} - ${course.section} _${stamp}`;
  const warnings: RecordingWarning[] = short
    ? [
        {
          code: "short",
          label: "Under 20 min",
          detail:
            "This recording is shorter than the 20-minute review threshold. A short recording may be intentional.",
          severity: "warning",
        },
      ]
    : [];
  return {
    item: {
      id,
      title,
      status: "Viewable",
      created: new Date(created).toISOString(),
      recorded: recorded.toISOString(),
      durationMs: duration * 1000,
      recordingWarnings: warnings,
      owner: "demo.owner",
      presenter: "Default Presenter",
      views: sessions.length,
      folder: `${course.code} ${course.title}`,
      isLive: false,
      thumbnail: frameImage((courseIndex * 6 + k) % 12, 0),
      watchUrl: `${DEMO_REPO}#demo`,
    },
    duration,
    sessions,
    viewers: {
      distinct: visits.size,
      returning: [...visits.values()].filter((n) => n > 1).length,
    },
    timeline,
    courseIndex: (courseIndex * 6 + k) % 12,
    staticReview: rand() < 0.1,
  };
}

let catalogue: DemoRecord[] | null = null;
let catalogueClock = 0;
// The whole fictional library, newest first. Built once with the clock fixed for the page's
// life; pass `now` (tests) to rebuild it against a specific time.
export function demoLibrary(now?: number) {
  if (!catalogue || (now !== undefined && now !== catalogueClock)) {
    catalogueClock = now ?? Date.now();
    catalogue = COURSES.flatMap((_, c) =>
      Array.from({ length: RECORDINGS_PER_COURSE }, (_, k) =>
        makeRecord(c, k, catalogueClock),
      ),
    ).sort((a, b) => b.item.created!.localeCompare(a.item.created!));
  }
  return catalogue;
}
const find = (id: string) =>
  demoLibrary().find((record) => record.item.id === id);

// -- endpoint payloads ----------------------------------------------------------------------
function histogram(
  sessions: SessionRecord[],
): NonNullable<ViewingCharts["histogram"]> {
  const watched = sessions
    .map((s) => s.watched)
    .filter((n): n is number => n !== null && n > 0);
  const longest = watched.reduce((max, s) => Math.max(max, s), 0);
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
    totalSessions: sessions.length,
    watchedSessions: watched.length,
    zeroSeconds: sessions.filter((s) => s.watched === 0).length,
    unknownSeconds: 0,
  };
}

// Split `total` into whole parts by weight, so the parts add back up exactly.
function split(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  parts[0] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

function analyticsFor(record: DemoRecord): Analytics {
  const { sessions } = record;
  const counts = { desktop: 0, mobile: 0, other: 0 };
  for (const s of sessions) counts[s.device]++;
  const [chrome, safari, edge] = split(counts.desktop, [7, 2, 1]);
  const [mac, win] = split(counts.desktop, [6, 4]);
  const [mobileChrome, mobileSafari] = split(counts.mobile, [4, 6]);
  const [iphone, android] = split(counts.mobile, [6, 4]);
  const rows = (list: [string, number][]) =>
    list
      .filter(([, views]) => views > 0)
      .map(([name, views]) => ({ name, views }));
  return {
    totalViews: sessions.length,
    liveViews: 0,
    onDemandViews: sessions.length,
    uniqueUsers: sessions.length ? 1 : 0, // viewing is anonymous, as on the real site
    peakConnections: 0,
    watchSeconds: sessions.reduce((sum, s) => sum + (s.watched || 0), 0),
    firstWatched: sessions[0]?.opened ?? null,
    lastWatched: sessions.at(-1)?.opened ?? null,
    browsers: rows([
      ["Chrome", chrome],
      ["Safari", safari],
      ["Edge", edge],
      ["Chrome Mobile", mobileChrome],
      ["Mobile Safari", mobileSafari],
      ["Firefox", counts.other],
    ]),
    systems: rows([
      ["Mac OS X", mac],
      ["Windows 10", win],
      ["iPhone", iphone],
      ["Android", android],
      ["Linux", counts.other],
    ]),
    warnings: [],
    requests: [
      {
        endpoint: `(demo) /PresentationAnalytics('${record.item.id}')`,
        status: 200,
        ms: 120,
      },
    ],
    fetchedAt: new Date().toISOString(),
  };
}

function previewFor(record: DemoRecord) {
  const at = [0.5, 0.7, 0.35]; // most detailed frame first, as the real server ranks them
  const frames = at.map((fraction, variant) => ({
    seconds: Math.round(record.duration * fraction),
    url: frameImage(record.courseIndex, record.staticReview ? 0 : variant),
  }));
  return {
    review: record.staticReview
      ? {
          kind: "static",
          label: "Little visual change",
          detail:
            "Three frames sampled across the recording are essentially identical, with no new writing, slide changes, or movement anywhere in the frame, such as an idle screen over an empty room. Review the recording to confirm.",
          seconds: [...frames.map((f) => f.seconds)].sort((a, b) => a - b),
        }
      : null,
    frames,
  };
}

// -- routing --------------------------------------------------------------------------------
const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;
export interface DemoReply {
  status: number;
  body: unknown;
}

// Answers a request the way the local server would; null means "not an API path".
export function demoResponse(
  method: string,
  pathname: string,
  params: URLSearchParams,
  body?: string,
): DemoReply | null {
  const ok = (json: unknown): DemoReply => ({ status: 200, body: json });
  const fail = (status: number, error: string): DemoReply => ({
    status,
    body: { error },
  });
  const withRecord = (make: (record: DemoRecord) => unknown) => {
    const id = params.get("id") || "";
    if (!VALID_ID.test(id)) return fail(400, "Invalid presentation ID");
    const record = find(id);
    return record ? ok(make(record)) : fail(404, "Presentation not found");
  };
  switch (pathname) {
    case "/recent.json":
      return ok({ items: demoLibrary().map(({ item }) => item) });
    case "/presentation.json":
      return withRecord((record) => ({ item: record.item }));
    case "/views.json": {
      const ids = [
        ...new Set((params.get("ids") || "").split(",").filter(Boolean)),
      ];
      if (
        !ids.length ||
        ids.length > 100 ||
        !ids.every((id) => VALID_ID.test(id))
      )
        return fail(400, "Provide 1–100 valid presentation IDs");
      return ok({
        views: Object.fromEntries(
          ids.map((id) => {
            const record = find(id);
            return [
              id,
              record
                ? {
                    views: record.sessions.length,
                    users: record.sessions.length ? 1 : 0,
                    lastWatched: record.sessions.at(-1)?.opened ?? null,
                  }
                : null,
            ];
          }),
        ),
      });
    }
    case "/analytics.json":
      return withRecord(analyticsFor);
    case "/viewing.json":
      return withRecord((record): ViewingCharts => ({
        timeline: record.timeline,
        timelineError: null,
        histogram: histogram(record.sessions),
        histogramError: null,
        sessions: record.sessions,
        viewers: record.viewers,
        requests: [
          {
            endpoint: `(demo) /PresentationAnalytics('${record.item.id}')/ViewingTrends`,
            status: 200,
            ms: 90,
          },
        ],
        fetchedAt: new Date().toISOString(),
      }));
    case "/health.json":
      return withRecord((record): RecordingHealth => ({
        warnings: record.item.recordingWarnings || [],
        media: "Source video available (demo)",
        audio: "Audio waveform present (demo)",
        fetchedAt: new Date().toISOString(),
      }));
    case "/preview.json":
      return withRecord(previewFor);
    default:
      return null;
  }
}
