import { describe, expect, it } from "vitest";
import { LESSONS, MODULES, lessonById, resolveSpawnIn } from "../src/course/catalog";
import { progressCard } from "../src/course/shell";
import { renderMarkdown } from "../src/course/markdown";
import { chunkAtLine, readChunks } from "../src/editor/chunks";
import { formatStudentError } from "../src/editor/errors";
import { EXAMPLES } from "../src/editor/examples";
import { spawnFor, worldSpawn } from "../src/sim/spawns";
import type { WorldId } from "../src/sim/worlds";

describe("course catalog", () => {
  it("lists modules 0-4 as real lessons and the later modules as coming soon", () => {
    expect(MODULES.map((module) => module.id)).toEqual([
      "getting-started",
      "models",
      "reactive",
      "tracking",
      "localization",
      "mapping",
      "planning",
      "advanced",
    ]);
    const ready = LESSONS.filter((lesson) => lesson.status === "ready");
    expect(ready.length).toBeGreaterThan(12);
    for (const lesson of ready) {
      expect(lesson.markdown).toContain("## Try it");
      expect(lesson.markdown.match(/^\d+\. /gm)?.length ?? 0).toBeGreaterThanOrEqual(2);
      if (lesson.starter) expect(EXAMPLES.some((example) => example.id === lesson.starter)).toBe(true);
    }
    for (const id of ["mapping", "planning", "advanced"]) {
      const lessons = LESSONS.filter((lesson) => lesson.moduleId === id);
      expect(lessons.length).toBeGreaterThan(0);
      expect(lessons.every((lesson) => lesson.status === "soon")).toBe(true);
    }
  });

  it("saves the course-complete card for a finished set of ready lessons", () => {
    const last = LESSONS.filter((lesson) => lesson.status === "ready").at(-1);
    expect(last?.id).toBe("localization/kidnapped");
    const none = progressCard(last!, []);
    expect(none).toContain("19 lessons still open");
    expect(none).not.toContain("Course complete");
    expect(none).toContain('href="#/lesson/localization/particles"');
    const finished = progressCard(
      last!,
      LESSONS.filter((lesson) => lesson.status === "ready").map((lesson) => lesson.id),
    );
    expect(finished).toContain("Course complete");
    expect(finished).not.toContain("still open");
    const earlier = lessonById("localization/particles");
    expect(progressCard(earlier!, [])).toBe("");
    const soon = lessonById("mapping/slam");
    expect(progressCard(soon!, [])).toBe("");
  });

  it("puts the kidnapped expert note behind a collapsed Going further", () => {
    const lesson = lessonById("localization/kidnapped");
    expect(lesson?.markdown).not.toContain("10% of the weight");
    expect(lesson?.markdown).not.toContain("sprinkle fresh guesses.");
    const html = renderMarkdown(lesson?.markdown ?? "");
    expect(html).toContain("<details");
    expect(html).toContain("Going further");
    expect(html).toContain("modest favourite");
    expect(html).not.toContain("&lt;details");
  });

  it("renders KaTeX and leaves an inline diagram in the page", () => {
    const html = renderMarkdown("A curvature $$\\kappa = 2\\sin\\alpha / L_d$$ and a line.\n\n<svg><path d=\"M0 0 L1 1\"></path></svg>");
    expect(html).toContain("katex");
    expect(html).toContain("<svg>");
    expect(html).not.toContain("$$");
    const bicycle = LESSONS.find((lesson) => lesson.id === "models/bicycle");
    expect(bicycle).toBeTruthy();
    const rendered = renderMarkdown(bicycle?.markdown ?? "");
    expect(rendered).toContain("katex-display");
    expect(rendered).toContain("<svg");
    expect(rendered).toContain('class="code-slot"');
    expect(rendered).toContain('data-chunk="drive"');
  });

  it("keeps every ready lesson's kind of start in every world", () => {
    const worlds: WorldId[] = ["city", "track", "forest", "warehouse"];
    for (const lesson of LESSONS) {
      if (lesson.status !== "ready") continue;
      for (const world of worlds) {
        const pose = resolveSpawnIn(lesson, world);
        const expected = lesson.spawn === "default" ? worldSpawn(world) : spawnFor(world, lesson.spawn, "scenario");
        expect(Math.hypot(pose.x - expected.x, pose.z - expected.z), `${lesson.id} ${world}`).toBeLessThan(0.05);
      }
    }
  });

  it("keeps a lesson's kind of start when the world changes", () => {
    const bicycle = lessonById("models/bicycle");
    expect(bicycle?.spawn).toBe("circle");
    const onTrack = resolveSpawnIn(bicycle!, "track");
    const onCity = resolveSpawnIn(bicycle!, "city");
    expect(onCity.z).not.toBe(onTrack.z);
    expect(Math.hypot(onCity.x - 5.5, onCity.z + 30)).toBeLessThan(8);
  });

  it("points every lesson code slot at a slice of that lesson's starter", () => {
    for (const lesson of LESSONS) {
      const ids = [...lesson.markdown.matchAll(/\{\{code:([A-Za-z0-9_-]+)\}\}/g)].map((match) => match[1] ?? "");
      if (!lesson.starter) {
        expect(ids, lesson.id).toEqual([]);
        continue;
      }
      const source = EXAMPLES.find((example) => example.id === lesson.starter)?.source ?? "";
      const chunks = readChunks(source);
      expect(ids.length, lesson.id).toBeGreaterThan(0);
      for (const id of ids) expect(chunks.has(id), `${lesson.id} missing ${id}`).toBe(true);
    }
  });

  it("maps a student traceback onto the slice that contains the line", () => {
    const source = ["# @@chunk tunables", "N = 40", "# @@end", "def control(sensors):", "    return sensors.missing", "# @@chunk drive", "    return 0.34, 0.5", "# @@end"].join("\n");
    expect(chunkAtLine(source, 2)).toEqual({ id: "tunables", local: 1 });
    expect(chunkAtLine(source, 7)).toEqual({ id: "drive", local: 1 });
    const formatted = formatStudentError(
      'Traceback (most recent call last):\n  File "/lib/python3.13/_pyodide/_base.py", line 1, in eval\n  File "student.py", line 5, in _robo_step\nAttributeError: missing',
      source,
    );
    expect(formatted.text.startsWith("AttributeError: missing")).toBe(true);
    expect(formatted.text).toContain("line 5 of the program");
    expect(formatted.text).toContain("sensors has time");
    expect(formatted.text).not.toContain("_pyodide");
    expect(formatted.text).not.toContain("_robo_step");
    const inSlice = formatStudentError('File "student.py", line 2\nSyntaxError: bad', source);
    expect(inSlice.chunk).toBe("tunables");
    expect(inSlice.local).toBe(1);
    expect(inSlice.text.startsWith("SyntaxError: bad")).toBe(true);
    expect(inSlice.text).toContain("line 1 of tunables");
  });
});