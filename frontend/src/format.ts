const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c] || c);

export const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function fmtDuration(ms?: number) {
  if (!ms) return "—";
  const t = Math.round(ms / 1000),
    h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  return (
    (h ? h + ":" + String(m).padStart(2, "0") : m) +
    ":" +
    String(s).padStart(2, "0")
  );
}

// "45s", "12m 4s", "1h 5m": a length of time in seconds, in words.
export function fmtSpan(seconds: number) {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return s ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

// "5:30": a position in a recording, as minutes and seconds.
export function fmtClock(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
