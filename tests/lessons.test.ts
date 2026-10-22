import { describe, expect, it } from "vitest";
import { LESSONS, MODULES, lessonById, resolveSpawnIn } from "../src/course/catalog";
import { renderMarkdown } from "../src/course/markdown";
import { readChunks } from "../src/editor/chunks";
import { EXAMPLES } from "../src/editor/examples";

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
});