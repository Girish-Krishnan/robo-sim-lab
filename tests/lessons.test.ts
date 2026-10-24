import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LESSONS, MODULES, lessonById, resolveSpawnIn } from "../src/course/catalog";
import { progressCard } from "../src/course/shell";
import { renderMarkdown } from "../src/course/markdown";
import { displayedOdom, modeLabel, runBarLabel } from "../src/ui/hud";
import { chunkAtLine, readChunks } from "../src/editor/chunks";
import { formatStudentError } from "../src/editor/errors";
import { EXAMPLES } from "../src/editor/examples";
import { invalidPoseMessage, poseProblem, programPreamble, readProgramSeed, readStartPose } from "../src/editor/program-header";
import { solidsFor } from "../src/eval/scenarios";
import { spawnFor, worldSpawn } from "../src/sim/spawns";
import { DEFAULT_SPAWN } from "../src/sim/vehicle";
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

  it("says a scattered straight can look sure and still be off", () => {
    const particles = lessonById("localization/particles");
    expect(particles?.markdown).toContain("confident and wrong");
    expect(particles?.markdown).toContain("usually within 15 s");
    const kidnapped = lessonById("localization/kidnapped");
    expect(kidnapped?.markdown).toContain("lock onto the wrong straight for a while");
    expect(kidnapped?.markdown).toContain("a corner usually settles it");
    expect(kidnapped?.markdown).not.toContain("does not creep");
    expect(kidnapped?.markdown).not.toContain("not creeping");
    expect(kidnapped?.markdown).toContain("cruising at about 4 m/s by 4 s");
  });

  it("drops a stale odom readout once the car has halted", () => {
    expect(displayedOdom(3.88, 0, false)).toBe(0);
    expect(displayedOdom(3.88, 0.2, false)).toBe(3.88);
    expect(displayedOdom(3.88, 0, true)).toBe(3.88);
  });

  it("puts the kidnapped expert note behind a collapsed Going further", () => {
    const lesson = lessonById("localization/kidnapped");
    expect(lesson?.markdown).not.toContain("10% of the weight");
    expect(lesson?.markdown).not.toContain("sprinkle fresh guesses.");
    const html = renderMarkdown(lesson?.markdown ?? "");
    expect(html).toContain("<details");
    expect(html).toContain("Going further");
    expect(html).toContain("modest favorite");
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
    expect(rendered).toContain('data-chunk="control"');
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

  it("maps a student traceback onto the function that contains the line", () => {
    const source = ["def tunables():", "    N = 40", "", "def control(sensors):", "    return sensors.missing"].join("\n");
    expect(chunkAtLine(source, 2)).toEqual({ id: "tunables", local: 2 });
    expect(chunkAtLine(source, 5)).toEqual({ id: "control", local: 2 });
    const formatted = formatStudentError(
      'Traceback (most recent call last):\n  File "/lib/python3.13/_pyodide/_base.py", line 1, in eval\n  File "student.py", line 5, in _robo_step\nAttributeError: missing',
      source,
    );
    expect(formatted.text.startsWith("AttributeError: missing")).toBe(true);
    expect(formatted.text).toContain("line 2 of control");
    expect(formatted.text).toContain("sensors has time");
    expect(formatted.text).not.toContain("_pyodide");
    expect(formatted.text).not.toContain("_robo_step");
    const inSlice = formatStudentError('File "student.py", line 2\nSyntaxError: bad', source);
    expect(inSlice.chunk).toBe("tunables");
    expect(inSlice.local).toBe(2);
    expect(inSlice.text.startsWith("SyntaxError: bad")).toBe(true);
    expect(inSlice.text).toContain("line 2 of tunables");
  });

  it("reads SEED and a per-world start from the program", () => {
    const source = 'SEED = 4\nSTART_POSE = {\n    "track": (16, -20, 0),\n    "city": (1, 2, 90),\n}\n';
    expect(readProgramSeed(source)).toBe(4);
    expect(readProgramSeed("def control(sensors):\n    return 0, 0\n")).toBe(1);
    expect(readStartPose(source, "track")).toEqual({ x: 16, y: -20, heading: 0 });
    expect(readStartPose(source, "forest")).toBeNull();
    expect(readStartPose("START_POSE = (3, 4, 180)\n", "city")).toEqual({ x: 3, y: 4, heading: 180 });
    expect(poseProblem([], 200, 0)).toBe("off the map");
  });

  it("refuses a bad START_POSE with the lesson start, not a silent world default", () => {
    expect(invalidPoseMessage(200, 0, "off the map", "lesson")).toBe(
      "START_POSE (200, 0) is off the map. Using this lesson's start.",
    );
    expect(invalidPoseMessage(1.5, -4, "inside a wall", "example")).toBe(
      "START_POSE (1.5, -4) is inside a wall. Using this example's start.",
    );
    expect(invalidPoseMessage(0, 0, "inside a wall", "world")).toContain("this world's default start");
  });

  it("names hands-on driving as Driving, and keeps a halted lesson ready", () => {
    expect(modeLabel("lessons", "stopped", false, true, true)).toBe("Lesson · driving");
    expect(modeLabel("lessons", "stopped", false, true, false)).toBe("Lesson · ready");
    expect(modeLabel("lessons", "running", false, false, false)).toBe("Lesson · running");
    expect(modeLabel("lessons", "stopped", true, true, true)).toBe("paused");
    expect(runBarLabel("stopped", false, true, true)).toBe("Driving");
    expect(runBarLabel("stopped", false, true, false)).toBe("Ready");
    expect(runBarLabel("running", false, false, false)).toBe("Running");
    expect(runBarLabel("stopped", true, true, true)).toBe("Paused");
  });

  it("keeps tick memory on one Run object in every example", () => {
    for (const example of EXAMPLES) {
      expect(example.source, example.id).toContain("class Run:");
      expect(example.source, example.id).toContain("def init(sensors):");
      expect(example.source, example.id).toContain("run = Run()");
      expect(example.source, example.id).not.toMatch(/^aim = /m);
      expect(example.source, example.id).not.toMatch(/^ticks = /m);
      expect(example.source, example.id).not.toContain("class Memory");
      expect(example.source, example.id).not.toContain("def tunables(");
      expect(example.source, example.id).not.toMatch(/^[ \t]*global (?!run\s*$)/m);
    }
    const avoid = lessonById("reactive/avoid");
    expect(avoid?.worlds).toEqual(["forest", "track"]);
    expect(lessonById("models/lidar")?.worlds).toEqual(["track", "forest"]);
    const sensors = lessonById("getting-started/sensors");
    expect(sensors?.markdown).toContain("class Run");
    expect(sensors?.markdown).toContain("{{code:Run}}");
    expect(sensors?.markdown).toContain("That's it: one object, reset every run.");
    expect(sensors?.markdown).not.toContain("practice tick");
    expect(readChunks(EXAMPLES.find((example) => example.id === "avoid")?.source ?? "").has("settings")).toBe(true);
  });

  it("keeps American spelling in the lessons", () => {
    const british = /\b(recognised|neighbours|travelling|trolley|neighbouring|kerbs?|travelled|metres|rumour|colour|favourite|behaviour|centre)\b/i;
    for (const lesson of LESSONS) {
      expect(lesson.markdown, lesson.id).not.toMatch(british);
    }
  });

  it("keeps the lesson chrome from shrinking, and leads the quiet lessons with the car", () => {
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    const blocks = [...css.matchAll(/#app\.mode-lessons #lesson-chrome \{[^}]+\}/g)].map((match) => match[0]);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]).toContain("flex: none");
    for (const block of blocks) expect(block).not.toContain("0 1 auto");

    const openers: [string, string, string][] = [
      ["reactive/circle", "Watch the car lean into a left turn", "Open loop is the pleasure"],
      ["getting-started/sandbox", "That car is yours to drive, crash and program", "That car is your lab"],
      ["reactive/wall", "Watch the car hug the wall", "Stay with the wall"],
      ["tracking/pursuit", "Watch the car chase a point", "like a dog chasing"],
      ["tracking/drift", "Watch the car slide off the centerline", "Watch the oval"],
      ["localization/dead-reckoning", "Watch the blue trail peel away", "Watch the blue trail leave the car"],
      ["localization/bayes", "Watch the pink cloud swell", "One pose was never enough"],
      ["localization/particles", "Press **Scatter guesses** and watch pink dots", "A cloud of guesses"],
      ["localization/pf-pursuit", "This is the payoff: the car drives the oval", "Three poses are in the picture"],
    ];
    for (const [id, lead, gone] of openers) {
      const body = lessonById(id)?.markdown ?? "";
      const prose = body.replace(/^---[\s\S]*?---\n/, "");
      expect(prose.trimStart().startsWith(lead), id).toBe(true);
      expect(body, id).not.toContain(gone);
    }
    expect(lessonById("tracking/pursuit")?.markdown).toContain("like riding a bike toward a tree");
    const bicycle = lessonById("models/bicycle")?.markdown ?? "";
    expect(bicycle.match(/draw a circle/g)?.length ?? 0).toBe(1);
    const lidar = lessonById("models/lidar")?.markdown ?? "";
    expect(lidar.match(/270 beams/g)?.length ?? 0).toBe(1);
    expect(programPreamble("circle")).toContain("90 faces east (a left turn decreases the heading)");
    expect(lessonById("getting-started/sensors")?.markdown).toContain("90 faces east (a left turn decreases the heading)");
    const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(indexHtml).toContain("y</code> runs north, <code>x</code> runs west");
    expect(indexHtml).toContain("90 faces east (a left turn decreases the heading)");
    expect(indexHtml).not.toContain("faces west");
    expect(lessonById("reactive/circle")?.markdown).toContain("watch the car: it shows you which number is wrong");
    expect(lessonById("reactive/circle")?.markdown).not.toContain("the car itself is the story");
    expect(css).toContain("#app.mode-lessons.lesson-has-code.lab-open #lesson");
    expect(css).toMatch(/lab-open #lesson \{\s*flex: 1 1 0;/);
    expect(css).toMatch(/lab-open #lesson-chrome,[\s\S]*?display: none !important;/);
    expect(css).toMatch(/@media \(max-height: 600px\) \{[\s\S]*?#toc-panel \{ max-height: 80px; \}/);
    expect(DEFAULT_SPAWN.z).toBeCloseTo(-1);
    expect(spawnFor("city", "avoid", "scenario").z).toBeCloseTo(0);
  });

  it("accepts every example start, and keeps the filter free of placeholder functions", () => {
    for (const example of EXAMPLES) {
      expect(example.source).toContain("SEED = 1");
      expect(example.source).not.toContain("@@chunk");
      expect(example.source).not.toContain("def augment(");
      expect(example.source).not.toContain("def explore(");
      for (const world of ["city", "track", "forest", "warehouse"] as const) {
        const pose = readStartPose(example.source, world);
        expect(pose, `${example.id} ${world}`).toBeTruthy();
        expect(poseProblem(solidsFor(world), pose!.x, pose!.y), `${example.id} ${world}`).toBeNull();
      }
    }
  });
});