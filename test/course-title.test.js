const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../frontend/src/course-title.ts");

test("splits course code, title, sections, and instructor, dropping the record date", async () => {
  const { parseCourseTitle } = await load();
  assert.deepEqual(
    parseCourseTitle(
      "ECE 383P-Ultrafast and Nonlinear Optics-David Burghoff-19250_10/12/2026",
    ),
    {
      course: "ECE 383P",
      title: "Ultrafast and Nonlinear Optics",
      sections: "19250",
      instructor: "David Burghoff",
      schedule: undefined,
    },
  );
});

test("keeps multiple sections and spaced instructor separators", async () => {
  const { parseCourseTitle } = await load();
  const parsed = parseCourseTitle(
    "SSE 380 - INTRO TO SEMICONDUCTORS - AKINWANDE, D - 15560 _10/12/2026",
  );
  assert.equal(parsed.course, "SSE 380");
  assert.equal(parsed.title, "Intro to Semiconductors");
  assert.equal(parsed.instructor, "AKINWANDE, D");
  assert.equal(parsed.sections, "15560");

  const multi = parseCourseTitle(
    "ECE 385J-Brain-Computer Interaction-Jose Millan-19275, 16845_10/12/2026",
  );
  assert.equal(multi.sections, "19275, 16845");
});

test("captures a parenthesized schedule after the sections", async () => {
  const { parseCourseTitle } = await load();
  const parsed = parseCourseTitle(
    "CS 343H - Artificial Intelligence (HON) - Volkan Isler - 55340 (MW 5-6:30)",
  );
  assert.equal(parsed.schedule, "(MW 5-6:30)");
  assert.equal(parsed.sections, "55340");
});

test("titles that do not look like course recordings pass through unchanged", async () => {
  const { parseCourseTitle } = await load();
  assert.deepEqual(parseCourseTitle("Welcome Orientation"), {
    title: "Welcome Orientation",
  });
  assert.deepEqual(parseCourseTitle(undefined), { title: "Untitled" });
  assert.deepEqual(parseCourseTitle("   "), { title: "Untitled" });
});

test("readable casing keeps acronyms and lowercases small words", async () => {
  const { parseCourseTitle } = await load();
  const parsed = parseCourseTitle(
    "EE 360C - ALGORITHMS AND DSP OF THE FUTURE - Smith, J - 12345",
  );
  assert.equal(parsed.title, "Algorithms and DSP of the Future");
});

test("titles without a dash after the course code, and cross-listed courses, parse", async () => {
  const { parseCourseTitle } = await load();
  assert.deepEqual(
    parseCourseTitle(
      "MBS 344 Molecular Biology - De Waal, E - 60070, 60075, 60080, 60085 _10/1/2026",
    ),
    {
      course: "MBS 344",
      title: "Molecular Biology",
      sections: "60070, 60075, 60080, 60085",
      instructor: "De Waal, E",
      schedule: undefined,
    },
  );
  const cross = parseCourseTitle(
    "M E 337F/M E 389C - NUCLEAR ENVIRONMNTL PROTECTION - ZANNONI, E - 20215_10/1/2026",
  );
  assert.equal(cross.course, "M E 337F/M E 389C");
  assert.equal(cross.title, "Nuclear Environmntl Protection");
  assert.equal(cross.instructor, "ZANNONI, E");
  assert.equal(cross.sections, "20215");
});

test("compact codes, decimal sections, and lone surnames parse", async () => {
  const { parseCourseTitle } = await load();
  const compact = parseCourseTitle(
    "CS311-DISCRETE MATH FOR COMP SCI-Veena Ravishankar-54840_10/1/2026",
  );
  assert.equal(compact.course, "CS311");
  assert.equal(compact.title, "Discrete Math for Comp Sci");
  assert.equal(compact.instructor, "Veena Ravishankar");
  const decimal = parseCourseTitle(
    "ENM 382E.2-Strategic Decision & Risk Analysis-Bickel-19505_9/26/2026",
  );
  assert.equal(decimal.course, "ENM 382E.2");
  assert.equal(
    decimal.instructor,
    "Bickel",
    "a lone surname after a multi-word title",
  );
  const subsection = parseCourseTitle(
    "ECE 382N-11-Distributed Systems-Garg-19215_9/26/2026",
  );
  assert.equal(subsection.course, "ECE 382N-11");
  assert.equal(subsection.title, "Distributed Systems");
  assert.equal(subsection.instructor, "Garg");
  // A hyphenated title with no instructor must not invent one from its last word.
  assert.equal(
    parseCourseTitle("ECE 306-Real-Time-12345").instructor,
    undefined,
  );
  assert.equal(parseCourseTitle("ECE 306-Real-Time-12345").title, "Real-Time");
});

test("recording numbers, schedules, repeated titles, and non-course titles are handled", async () => {
  const { parseCourseTitle } = await load();
  const lab = parseCourseTitle(
    "ECE 438-FUNDMNTLS ELEC CIRCUITS I LAB-Alex Hanson-18755, 18760, 18765_013",
  );
  assert.equal(lab.sections, "18755, 18760, 18765");
  assert.equal(lab.instructor, "Alex Hanson");
  const scheduled = parseCourseTitle(
    "M E 330 Fluid Mechanics - Meier, M. - 19960 (T/TH 2PM - 3:15PM ETC 2.136)_10/1/2026",
  );
  assert.equal(scheduled.schedule, "(T/TH 2PM - 3:15PM ETC 2.136)");
  assert.equal(scheduled.instructor, "Meier, M.");
  const repeated = parseCourseTitle(
    "ECE 381J-PROBABIL/STOCHASTIC PROCS I-PROBABIL/STOCHASTIC PROCS I-19100_10/1/2026",
  );
  assert.equal(repeated.title, "Probabil/Stochastic Procs I");
  assert.equal(repeated.instructor, undefined);
  assert.deepEqual(
    parseCourseTitle("CII Best Practices - Fall 2026_10/2/2026"),
    {
      title: "CII Best Practices - Fall 2026",
    },
  );
  const noSections = parseCourseTitle("MBS 344 Molecular Biology");
  assert.equal(noSections.course, "MBS 344");
  assert.equal(noSections.title, "Molecular Biology");
});
