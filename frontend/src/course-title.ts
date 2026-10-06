export interface CourseTitle {
  course?: string;
  title: string;
  sections?: string;
  instructor?: string;
  schedule?: string;
}

function readableCase(value: string): string {
  // Preserve authored mixed case and recognizable short acronyms.
  if (value !== value.toUpperCase()) return value;
  const acronyms = new Set([
    "AI",
    "API",
    "CAD",
    "DSP",
    "EE",
    "GME",
    "ILSI",
    "I",
    "II",
    "III",
    "IV",
    "V",
  ]);
  const smallWords = new Set([
    "a",
    "an",
    "and",
    "at",
    "for",
    "in",
    "of",
    "on",
    "the",
    "to",
    "with",
  ]);
  return value
    .split(/(\s+|[-/])/)
    .map((word, index) => {
      if (!/[A-Z]/.test(word) || acronyms.has(word)) return word;
      const lower = word.toLowerCase();
      return index > 0 && smallWords.has(lower)
        ? lower
        : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

// One course code: department letters (optionally two groups, as in "M E"), a three-digit
// number with optional letters, a decimal part ("382E.2"), and a short sub-section ("-11", " 3").
const CODE = String.raw`[A-Z]{1,4}(?:\s[A-Z]{1,2})?\s?\d{3}[A-Z]{0,2}(?:\.\d+)?(?:[-\s]\d{1,2}(?!\d))?`;
// Cross-listed courses join several codes with a slash ("M E 336P/N E 336P").
const COURSE = new RegExp(
  String.raw`^(${CODE}(?:\s*/\s*${CODE})*)(?:\s*-\s*|\s+)(.+)$`,
);
// A person's name: one or more words, optionally "Surname, I".
const NAME = /^[\p{L}.'’-]+(?:\s[\p{L}.'’-]+)*(?:,\s*[\p{L}.]+)?$/u;

export function parseCourseTitle(raw?: string): CourseTitle {
  const original = raw?.trim() || "Untitled";
  const normalized = original.replace(/\s+/g, " ");
  // Drop the trailing record date ("_10/12/2026") and recording number ("_013").
  const withoutDate = normalized
    .replace(/\s*_\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/, "")
    .replace(/\s*_\s*\d{2,3}\s*$/, "")
    .trim();
  const course = withoutDate.match(COURSE);
  if (!course) return { title: withoutDate || original };
  const section = course[2].match(
    /^(.*)\s*-\s*(\d{4,6}(?:\s*,\s*\d{4,6})*)(?:\s+(\([^)]*\)))?$/,
  );
  // No section numbers: still show the course code with the rest as the title.
  if (!section) return { course: course[1], title: readableCase(course[2]) };
  // Some titles repeat themselves around a dash ("X-X"); show them once.
  const content = section[1].trim().replace(/^(.+)-\1$/, "$1");
  if (!content) return { title: withoutDate };
  // Spaced separators preserve hyphenated surnames; compact titles use the last dash.
  const spaced = content.match(/^(.*)\s+-\s+(.+)$/);
  const divider = content.lastIndexOf("-");
  let heading = content;
  let instructor: string | undefined;
  const candidate = spaced
    ? { heading: spaced[1].trim(), name: spaced[2].trim() }
    : divider > 0
      ? {
          heading: content.slice(0, divider).trim(),
          name: content.slice(divider + 1).trim(),
        }
      : null;
  // The suffix is an instructor only if it looks like a name (and is not just the title
  // again); a lone surname needs a multi-word title before it, so "Real-Time" stays whole.
  if (
    candidate?.heading &&
    NAME.test(candidate.name) &&
    candidate.name !== candidate.heading &&
    (/[\s,]/.test(candidate.name) || candidate.heading.includes(" "))
  ) {
    heading = candidate.heading;
    instructor = candidate.name;
  }
  return {
    course: course[1],
    title: readableCase(heading),
    sections: section[2]
      .split(",")
      .map((value) => value.trim())
      .join(", "),
    instructor,
    schedule: section[3],
  };
}
