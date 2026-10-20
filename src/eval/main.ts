import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RAPIER from "@dimforge/rapier3d-compat";
import { EXAMPLES } from "../editor/examples";
import { renderPathPlot } from "./plot";
import { loadStudentPolicy, loadStudentRuntime } from "./python";
import { EVAL_EXAMPLES, EVAL_WORLDS, solidsFor, spawnFor, type EvalExample, type EvalWorld } from "./scenarios";
import { runEpisode, type RunMetrics } from "./simulate";
import { regressionErrors, renderSummary, type Compared } from "./summary";

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
  const seconds = Number(arg("seconds") ?? (ci ? 8 : 60));
  const seed = Number(arg("seed") ?? 1);
  const outDir = path.resolve(root, arg("out") ?? (ci ? "eval/ci" : "eval/out"));
  const spawnMode = arg("spawns") === "default" ? "default" : "scenario";
  const only = arg("only");
  const pairs = pairsFrom(only);

  process.stdout.write(`Eval ${pairs.length} runs, ${seconds}s, seed ${seed}, spawns ${spawnMode}\n`);
  await RAPIER.init();
  const pyodide = await loadStudentRuntime(root);

  const rows: RunMetrics[] = [];
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
    writeFileSync(path.join(dir, "path.png"), renderPathPlot(episode.solids, episode.trail, `${world} / ${example}`));
    rows.push(episode.metrics);
    const m = episode.metrics;
    process.stdout.write(
      `${world}/${example}  dist ${m.distance.toFixed(1)}  coll ${m.collisionCount}  stuck ${m.stuckTime.toFixed(1)}  up ${m.minUp.toFixed(2)}  laps ${m.laps}  ${(Date.now() - started) / 1000}s\n`,
    );
  }

  const beforeDir = path.resolve(root, "eval/before");
  const compared: Compared[] = rows.map((after) => {
    const file = path.join(beforeDir, after.world, after.example, "metrics.json");
    const before = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as RunMetrics) : undefined;
    return { after, before };
  });
  writeFileSync(path.join(outDir, "summary.md"), renderSummary(compared));

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
  const [world, example] = only.split("/");
  if (!EVAL_WORLDS.includes(world as EvalWorld) || !EVAL_EXAMPLES.includes(example as EvalExample)) {
    throw new Error(`--only expects world/example, got ${only}`);
  }
  return [[world as EvalWorld, example as EvalExample]];
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
