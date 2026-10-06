import { esc, fmtClock } from "./format.ts";
import type { Presentation } from "./shared";

// A frame sampled from the recording. Sample data has only these; live data has the real player.
export interface Frame {
  seconds: number;
  url: string;
}

// The Mediasite Play URL for this recording, opened at a moment. Null if the link is unusable.
export function playUrl(p: Presentation, seconds: number, autoStart = true) {
  try {
    const url = new URL(p.watchUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.searchParams.set("playFrom", String(Math.round(seconds * 1000)));
    url.searchParams.set("autostart", String(autoStart));
    return url.toString();
  } catch {
    return null;
  }
}

const nearest = (frames: Frame[], seconds: number) =>
  frames.reduce((a, b) =>
    Math.abs(b.seconds - seconds) < Math.abs(a.seconds - seconds) ? b : a,
  );

// The recording beside the engagement chart. Sample data shows the nearest sample frame; live data
// shows the poster until asked to play, because opening the player starts a viewing session that
// would be counted in the lecture's own analytics.
export function recordingPane(p: Presentation, frames: Frame[] | null) {
  const poster = frames?.length ? frames[0].url : p.thumbnail;
  const start = frames ? null : playUrl(p, 0);
  return `<div class="recording"><div class="recording-screen">${
    poster
      ? `<img class="recording-frame" src="${esc(poster)}" alt="" />`
      : '<span class="recording-empty" aria-hidden="true">▶</span>'
  }${
    start
      ? `<button type="button" class="recording-play">▶ Watch from the start</button>`
      : ""
  }${frames ? '<span class="recording-badge">Sample frame · the demo has no video</span>' : ""}</div><div class="recording-bar"><span class="recording-time" role="status" aria-live="polite">Select a moment on the chart</span>${start ? `<a class="recording-open" href="${esc(start)}" target="_blank" rel="noopener noreferrer">Open in Mediasite ↗</a>` : ""}</div></div>`;
}

// Returns a function that points the pane at a moment.
export function bindRecording(
  container: HTMLElement,
  p: Presentation,
  frames: Frame[] | null,
) {
  const screen = container.querySelector<HTMLElement>(".recording-screen");
  if (!screen) return () => {};
  const time = container.querySelector<HTMLElement>(".recording-time")!;
  const play = container.querySelector<HTMLButtonElement>(".recording-play");
  const open = container.querySelector<HTMLAnchorElement>(".recording-open");
  const image = screen.querySelector<HTMLImageElement>(".recording-frame");
  let at = 0;
  let player: HTMLIFrameElement | null = null;

  const load = (seconds: number) => {
    const src = playUrl(p, seconds);
    if (!src) return;
    if (!player) {
      player = document.createElement("iframe");
      player.title = "Recording player";
      player.allow = "autoplay; fullscreen";
      player.allowFullscreen = true;
      screen.replaceChildren(player);
    }
    player.src = src;
  };
  play?.addEventListener("click", () => load(at));

  return (seconds: number) => {
    at = seconds;
    time.textContent = frames?.length
      ? `Nearest sample frame to ${fmtClock(seconds)}`
      : `Selected ${fmtClock(seconds)}`;
    if (frames?.length && image) image.src = nearest(frames, seconds).url;
    if (play) {
      play.textContent = `▶ Watch from ${fmtClock(seconds)}`;
    }
    if (open) {
      const href = playUrl(p, seconds);
      if (href) open.href = href;
    }
    // Once the player is open the viewer has chosen to watch, so follow the chart. The start-time
    // parameter is not in Mediasite's public documentation, so say where to scrub if it is ignored.
    if (player) {
      load(seconds);
      time.textContent = `Selected ${fmtClock(seconds)} · if the player starts at the beginning, scrub to ${fmtClock(seconds)}`;
    }
  };
}
