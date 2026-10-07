import { esc, fmtClock } from "./format.ts";
import type { Presentation } from "./shared";

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  topic?: string;
}
export interface Transcript {
  cues: CaptionCue[];
  source: string;
}
// Imports stay in this browser session, scoped to the recording. No uploads or storage.
const imported = new Map<string, Transcript>();

export function captionTime(value: string): number {
  const time = value.trim().replace(",", ".");
  if (/^\d+(?:\.\d+)?(?:ms|s|m|h)$/.test(time)) {
    const unit = time.match(/ms|s|m|h$/)![0];
    return parseFloat(time) * { ms: 0.001, s: 1, m: 60, h: 3600 }[unit]!;
  }
  if (
    !/^\d+:\d{2}(?::\d{2})?\.\d{1,3}$/.test(time) &&
    !/^\d+:\d{2}(?::\d{2})?$/.test(time)
  )
    throw new Error("Unsupported caption timestamp.");
  const parts = time.split(":").map(Number);
  if (parts.slice(1).some((n) => n >= 60))
    throw new Error("Invalid caption timestamp.");
  return parts.reduce((seconds, n) => seconds * 60 + n, 0);
}

function cleanText(text: string) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (entity) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&nbsp;": " ",
        })[entity]!,
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function validateCues(
  cues: CaptionCue[],
  duration: number,
): CaptionCue[] {
  const valid = cues.filter((cue) => cue.text.trim());
  if (!valid.length)
    throw new Error(
      "No timed captions found. Import VTT, SRT, or DFXP/TTML captions; a plain text transcript has no timestamps.",
    );
  if (
    valid.some(
      (cue) =>
        !Number.isFinite(cue.start) ||
        !Number.isFinite(cue.end) ||
        cue.start < 0 ||
        cue.end <= cue.start ||
        cue.start >= duration ||
        cue.end > duration + 2,
    )
  )
    throw new Error(
      "Caption timing is invalid or exceeds this recording. Check that this file belongs to this lecture.",
    );
  return valid.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function parseCaptions(text: string, duration: number): CaptionCue[] {
  const input = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  let cues: CaptionCue[] = [];
  if (input.startsWith("<")) {
    const xml = new DOMParser().parseFromString(input, "application/xml");
    if (xml.querySelector("parsererror"))
      throw new Error("The caption XML could not be read.");
    const root = xml.documentElement;
    // Resolve only the common absolute-time subset, never silently misalign other TTML timing.
    if (
      Array.from(xml.getElementsByTagName("*"))
        .filter((node) => node.localName !== "p")
        .some(
          (node) =>
            node &&
            ["begin", "end", "dur", "timeContainer"].some((attr) =>
              node.hasAttribute(attr),
            ),
        ) ||
      root.getAttributeNS("http://www.w3.org/ns/ttml#parameter", "timeBase") ===
        "smpte"
    )
      throw new Error(
        "This TTML uses unsupported relative or frame timing. Export VTT or SRT instead.",
      );
    cues = Array.from(xml.getElementsByTagNameNS("*", "p")).map((p) => {
      const start = captionTime(p.getAttribute("begin") || "");
      const end = p.hasAttribute("end")
        ? captionTime(p.getAttribute("end")!)
        : start + captionTime(p.getAttribute("dur") || "");
      p.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
      return {
        start,
        end,
        text: (p.textContent || "").replace(/\s+/g, " ").trim(),
      };
    });
  } else {
    for (const block of input.split(/\n\s*\n/)) {
      if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(block)) continue;
      const lines = block.split("\n");
      const index = lines.findIndex((line) => line.includes("-->"));
      if (index < 0) continue;
      const match = lines[index].match(/^(\S+)\s+-->\s+(\S+)(?:\s.*)?$/);
      if (!match) throw new Error("A caption timestamp could not be read.");
      cues.push({
        start: captionTime(match[1]),
        end: captionTime(match[2]),
        text: cleanText(lines.slice(index + 1).join(" ")),
      });
    }
  }
  return validateCues(cues, duration);
}

export function captionExcerpt(cues: CaptionCue[], start: number, end: number) {
  return cues
    .filter((cue) => cue.start < end && cue.end > start)
    .map((cue) => cue.text)
    .join(" ");
}

function sampleTranscript(p: Presentation, duration: number): Transcript {
  const topics = p.title?.includes("312")
    ? [
        "Boolean expressions",
        "Truth tables",
        "Logic gates",
        "Simplifying a circuit",
        "Worked example",
        "Design review",
      ]
    : [
        "Signals and systems",
        "Time shifts",
        "Scaling a signal",
        "Superposition",
        "Worked example",
        "Checking the result",
      ];
  return {
    source:
      "Fictional sample transcript · not a transcription of the illustrative frames",
    cues: topics.map((topic, index) => ({
      start: (duration * index) / topics.length,
      end: (duration * (index + 1)) / topics.length,
      topic,
      text: `We are discussing ${topic.toLowerCase()}. Let's work through the steps and compare the result with our starting assumptions.`,
    })),
  };
}

export function transcriptPanel() {
  return `<section class="chart-panel wide transcript-panel"><h3>Transcript</h3><p class="muted">Select a chart moment to read the captions at that point, or select a timestamp to see it in the recording.</p><div class="transcript-tools"><label>Import captions <input class="caption-file" type="file" accept=".vtt,.srt,.dfxp,.ttml,.xml" /></label><label>Search transcript <input class="transcript-search" type="search" placeholder="Find a word or phrase" /></label></div><p class="transcript-source muted"></p><p class="transcript-error" role="alert"></p><div class="transcript-context" role="status" aria-live="polite"></div><div class="transcript-list" aria-label="Timestamped transcript"></div></section>`;
}

export function bindTranscript(
  container: HTMLElement,
  p: Presentation,
  duration: number,
  sample: boolean,
  seek: (seconds: number) => void,
) {
  let transcript =
    imported.get(p.id) || (sample ? sampleTranscript(p, duration) : null);
  let selected: number | null = null;
  let selectedEnd = 0;
  const list = container.querySelector<HTMLElement>(".transcript-list")!;
  const context = container.querySelector<HTMLElement>(".transcript-context")!;
  const source = container.querySelector<HTMLElement>(".transcript-source")!;
  const search =
    container.querySelector<HTMLInputElement>(".transcript-search")!;
  const error = container.querySelector<HTMLElement>(".transcript-error")!;
  const updateContext = () => {
    if (selected === null) {
      context.textContent = "Select a moment to read its transcript excerpt.";
      return;
    }
    const segment = { start: selected, end: selectedEnd };
    context.textContent = `${fmtClock(selected)} · ${transcript ? captionExcerpt(transcript.cues, segment.start, segment.end) || "No captions cover this moment." : "Import captions to read this moment."}`;
    list
      .querySelectorAll<HTMLButtonElement>("[data-caption-start]")
      .forEach((button) => {
        const cue = transcript!.cues[Number(button.dataset.captionIndex)];
        const active = cue.start <= selected! && cue.end > selected!;
        button.classList.toggle("active", active);
        button.setAttribute("aria-current", String(active));
      });
  };
  const render = () => {
    source.textContent =
      transcript?.source ||
      "Live caption retrieval is not connected. Import this recording’s downloaded caption file; it stays in this browser session.";
    search.disabled = !transcript;
    const query = search.value.trim().toLocaleLowerCase();
    list.innerHTML = transcript
      ? transcript.cues
          .map((cue, index) => ({ cue, index }))
          .filter(({ cue }) =>
            `${cue.topic || ""} ${cue.text}`
              .toLocaleLowerCase()
              .includes(query),
          )
          .map(
            ({ cue, index }) =>
              `<button type="button" class="transcript-cue" data-caption-start="${cue.start}" data-caption-index="${index}"><strong>${esc(fmtClock(cue.start))}</strong><span>${cue.topic ? `<b>${esc(cue.topic)}</b> ` : ""}${esc(cue.text)}</span></button>`,
          )
          .join("") || '<p class="muted">No matching captions.</p>'
      : '<p class="muted">No transcript available.</p>';
    container.querySelectorAll<HTMLElement>(".moment").forEach((button) => {
      button.querySelector(".moment-caption")?.remove();
      if (!transcript) return;
      const start = Number(button.dataset.seek);
      const cue = transcript.cues.find(
        (cue) => cue.start <= start && cue.end > start,
      );
      const stop = Number(button.dataset.segmentEnd) || start + 30;
      const excerpt = captionExcerpt(transcript.cues, start, stop);
      const text = cue?.topic || excerpt || "No captions at this moment";
      const label = document.createElement("small");
      label.className = "moment-caption";
      label.textContent = text.length > 160 ? `${text.slice(0, 157)}…` : text;
      button.append(label);
    });
    updateContext();
  };
  list.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-caption-start]",
    );
    if (button) seek(Number(button.dataset.captionStart));
  });
  search.addEventListener("input", render);
  const fileInput = container.querySelector<HTMLInputElement>(".caption-file")!;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    error.textContent = "";
    try {
      if (file.size > 5_000_000)
        throw new Error("Choose a caption file smaller than 5 MB.");
      const cues = parseCaptions(await file.text(), duration);
      transcript = {
        cues,
        source: `Imported captions: ${file.name} · browser session only · verify this file matches the recording`,
      };
      imported.set(p.id, transcript);
      search.value = "";
      render();
    } catch (problem) {
      error.textContent =
        problem instanceof Error ? problem.message : String(problem);
    }
    fileInput.value = "";
  });
  render();
  return (seconds: number, end = seconds + 30) => {
    selected = seconds;
    selectedEnd = end;
    updateContext();
  };
}
