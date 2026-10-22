import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RAPIER from "@dimforge/rapier3d-compat";
import { EXAMPLES } from "../editor/examples";
import { paintPathPlot, rasterToPng, renderContactSheet } from "./plot";
import { loadStudentPolicy, loadStudentRuntime } from "./python";
import { LESSONS } from "../course/catalog";
import { referenceRoute } from "../sim/routes";
import { EVAL_EXAMPLES, EVAL_WORLDS, solidsFor, spawnFor, type EvalExample, type EvalWorld } from "./scenarios";
import { runEpisode, type RunMetrics } from "./simulate";
import { lessonDemoReport, regressionErrors, renderSummary, type Compared } from "./summary";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const ci = has("ci");
  const seconds = Number(arg("seconds") ?? 60);
  const seed = Number(arg("seed") ?? 1);
  const outDir = path.resolve(root, arg("out") ?? (ci ? "eval/ci" : "eval/out"));
  const spawnMode = arg("spawns") === "default" ? "default" : "scenario";
  const only = arg("only");
  const pairs = pairsFrom(only);

  process.stdout.write(`Eval ${pairs.length} runs, ${seconds}s, seed ${seed}, spawns ${spawnMode}\n`);
  await RAPIER.init();
  const pyodide = await loadStudentRuntime(root);

  const rows: RunMetrics[] = [];
  const rasters: { world: (typeof pairs)[number][0]; example: string; rgba: Uint8Array }[] = [];
  for (const [world, example] of pairs) {
    const started = Date.now();
    const source = EXAMPLES.find((item) => item.id === example)?.source;
    if (!source) throw new Error(`Missing example ${example}`);
    const policy = loadStudentPolicy(pyodide, source);
    const solids = solidsFor(world);
    const spawn = spawnFor(world, example, spawnMode);
    const episode = runEpisode(RAPIER, solids, { world, example, spawn, seconds, seed, policy });
    const dir = path.join(outDir, world, example);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "metrics.json"), JSON.stringify(episode.metrics, null, 2));
    const planned = example === "pursuit" || example === "mcl" || example === "mcl-global" ? referenceRoute(world) : [];
    const raster = paintPathPlot(episode.solids, episode.trail, `${world} / ${example}`, world, planned);
    writeFileSync(path.join(dir, "path.png"), rasterToPng(raster));
    rasters.push({ world, example, rgba: raster.rgba });
    rows.push(episode.metrics);
    const m = episode.metrics;
    const driftPct = m.distance > 1 ? (100 * m.odomDrift) / m.distance : 0;
    process.stdout.write(
      `${world}/${example}  dist ${m.distance.toFixed(1)}  real ${m.collisionCount}  pred ${m.predictedCount}  stuck ${m.stuckTime.toFixed(1)}  drift ${m.odomDrift.toFixed(2)} (${driftPct.toFixed(1)}%)  laps ${m.laps}  xt ${m.crossTrackMean.toFixed(2)}/${m.crossTrackMax.toFixed(2)} early ${m.crossTrackEarly.toFixed(2)} late ${m.crossTrackLate.toFixed(2)}  pose ${m.poseErrorMean.toFixed(2)}/${m.poseErrorMax.toFixed(2)}  head ${m.headingErrorMean.toFixed(3)}  conv ${m.convergeTime.toFixed(1)}  final ${m.finalPoseError.toFixed(2)}  t4 ${m.poseErrorAt4.toFixed(2)}  cloud ${m.finalCloudRadius.toFixed(2)}  hsig ${(m.finalHeadingSigma * 180 / Math.PI).toFixed(1)}  ctrl ${m.controlMsMean.toFixed(1)}/${m.controlMsMax.toFixed(1)} ms  ground ${m.chaseGround ? "yes" : "NO"}  ${(Date.now() - started) / 1000}s\n`,
    );
  }
  if (rasters.length === EVAL_WORLDS.length * EVAL_EXAMPLES.length) {
    writeFileSync(path.join(outDir, "contact-sheet.png"), renderContactSheet(rasters));
  }

  const beforeDir = path.resolve(root, "eval/before");
  const compared: Compared[] = rows.map((after) => {
    const file = path.join(beforeDir, after.world, after.example, "metrics.json");
    const before = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as RunMetrics) : undefined;
    return { after, before };
  });
  writeFileSync(path.join(outDir, "summary.md"), renderSummary(compared));

  const fullMatrix = !only && rows.length === EVAL_WORLDS.length * EVAL_EXAMPLES.length && seed === 1;
  const extras: RunMetrics[] = [];
  if (ci && fullMatrix) {
    const starters = new Set<EvalExample>();
    for (const lesson of LESSONS) {
      if (lesson.status === "ready" && lesson.starter) starters.add(lesson.starter as EvalExample);
    }
    for (const example of starters) {
      for (const world of EVAL_WORLDS) {
        for (const extraSeed of [2, 3]) {
          const started = Date.now();
          const source = EXAMPLES.find((item) => item.id === example)?.source;
          if (!source) throw new Error(`Missing example ${example}`);
          const policy = loadStudentPolicy(pyodide, source);
          const solids = solidsFor(world);
          const spawn = spawnFor(world, example, "scenario");
          const episode = runEpisode(RAPIER, solids, {
            world,
            example,
            spawn,
            seconds,
            seed: extraSeed,
            policy,
          });
          extras.push(episode.metrics);
          const m = episode.metrics;
          process.stdout.write(
            `${world}/${example} seed ${extraSeed}  dist ${m.distance.toFixed(1)}  real ${m.collisionCount}  stuck ${m.stuckTime.toFixed(1)}  ${(Date.now() - started) / 1000}s\n`,
          );
        }
      }
    }
  }
  if (fullMatrix) {
    const demos = lessonDemoReport(rows, extras);
    writeFileSync(path.join(outDir, "lesson-demos.md"), demos.markdown);
    process.stdout.write(`\n${demos.markdown}\n`);
    if (ci && demos.errors.length) {
      process.stderr.write(demos.errors.join("\n") + "\n");
      process.exitCode = 1;
    }
  }

  if (ci) {
    const errors = rows.flatMap(regressionErrors);
    if (errors.length) {
      process.stderr.write(errors.join("\n") + "\n");
      process.exitCode = 1;
    }
  }
}

function pairsFrom(only: string | undefined): [EvalWorld, EvalExample][] {
  if (!only) return EVAL_WORLDS.flatMap((world) => EVAL_EXAMPLES.map((example) => [world, example] as [EvalWorld, EvalExample]));
  const pairs: [EvalWorld, EvalExample][] = [];
  for (const item of only.split(",")) {
    const [world, example] = item.split("/");
    if (!EVAL_WORLDS.includes(world as EvalWorld) || !EVAL_EXAMPLES.includes(example as EvalExample)) {
      throw new Error(`--only expects world/example, got ${item}`);
    }
    pairs.push([world as EvalWorld, example as EvalExample]);
  }
  return pairs;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
