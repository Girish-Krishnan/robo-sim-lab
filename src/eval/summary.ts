import { LESSONS, resolveSpawn, resolveSpawnIn } from "../course/catalog";
import { worldSpawn } from "../sim/spawns";
import type { WorldId } from "../sim/worlds";
import type { RunMetrics } from "./simulate";
import { spawnFor, type EvalWorld } from "./scenarios";

export interface Compared {
  after: RunMetrics;
  before?: RunMetrics;
}

export function renderSummary(rows: Compared[]): string {
  const header = [
    "| World | Example | Distance m | Mean m/s | Contacts | Predicted | Contact s | Min lidar m | Stuck s | Flip | OOB | Laps | Lap times | Odom drift m | Drift % | XT mean/max |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | ---: | ---: |",
  ];
  const lines = [...header];
  for (const row of rows) {
    lines.push(`| ${cells(row.after)} |`);
    if (row.before) lines.push(`| ${cells(row.before, "before")} |`);
  }
  return [
    "# Evaluation summary",
    "",
    "Each run is 60 s of simulated time unless noted in the metrics file. Physics is 60 Hz, control is 20 Hz, noise seed is 1.",
    "The true path is evaluation-only. Odometry drift is the gap between the true position and the dead-reckoned pose at the end.",
    "Contacts count manifolds that contain at least one point. Predicted is a reported pair whose manifold was empty. A `before` row has no predicted column because that revision counted every pair.",
    "A row tagged `before` is commit c119ca7: the same worlds with that revision's examples and its bicycle-model odometry.",
    "",
    ...lines,
    "",
    "The path plot legend labels the speed color bar in m/s, the true path, the odometry trail, and contacts. Pure pursuit also draws the planned path. A scale bar is in meters. Roads, curbs, the oval asphalt, and the forest trail are drawn under the path.",
    "Pure pursuit cross-track is the distance from the true pose to the reference polyline. It grows when odometry heading drifts. That is the point of the lesson.",
    "PF pursuit (mcl) is the same law driven by a particle-filter mean. The path plot adds that estimate in red, beside truth and odometry. Pose error is the estimate against the true pose in the odometry frame. Control time is the Python tick in this runtime.",
    ...pursuitNotes(rows),
    ...localizationNotes(rows),
    "",
  ].join("\n");
}

function cells(row: RunMetrics, tag?: string): string {
  const example = tag ? `${row.example} (${tag})` : row.example;
  const tracks = row.example === "pursuit" || row.example === "mcl" || row.example === "mcl-global";
  const laps = row.world === "track" || tracks ? String(row.laps) : "—";
  const lapTimes = row.lapTimes.length ? row.lapTimes.join(", ") : "—";
  const cross =
    tracks && row.crossTrackMean !== undefined
      ? `${row.crossTrackMean.toFixed(2)} / ${row.crossTrackMax.toFixed(2)}`
      : "—";
  return [
    row.world,
    example,
    row.distance.toFixed(1),
    row.meanSpeed.toFixed(2),
    String(row.collisionCount),
    row.predictedCount === undefined ? "—" : String(row.predictedCount),
    row.contactTime.toFixed(2),
    row.minLidar.toFixed(2),
    row.stuckTime.toFixed(2),
    row.flipped ? "yes" : "no",
    row.outOfBounds ? "yes" : "no",
    laps,
    lapTimes,
    row.odomDrift.toFixed(2),
    driftPercent(row).toFixed(1),
    cross,
  ].join(" | ");
}

function localizationNotes(rows: Compared[]): string[] {
  const notes: string[] = [];
  for (const row of rows) {
    const metrics = row.after;
    if ((metrics.example !== "mcl" && metrics.example !== "mcl-global") || metrics.poseErrorMean === undefined) continue;
    const heading = ((metrics.headingErrorMean ?? 0) * 180) / Math.PI;
    const cloud =
      metrics.finalCloudRadius !== undefined && metrics.finalCloudRadius >= 0
        ? ` Cloud 2σ ${metrics.finalCloudRadius.toFixed(2)} m, heading σ ${(((metrics.finalHeadingSigma ?? 0) * 180) / Math.PI).toFixed(1)} deg.`
        : "";
    const settled = ` Converge ${metrics.convergeTime < 0 ? "never" : `${metrics.convergeTime.toFixed(1)} s`} (2σ under 0.5 m, heading σ under 10 deg, estimate under 0.5 m, held 1 s), final ${metrics.finalPoseError.toFixed(2)} m.${cloud}`;
    notes.push(
      `${metrics.world} ${metrics.example} pose error mean ${metrics.poseErrorMean.toFixed(2)} m max ${metrics.poseErrorMax.toFixed(2)} m, heading mean ${heading.toFixed(1)} deg, control ${metrics.controlMsMean.toFixed(1)} / ${metrics.controlMsMax.toFixed(1)} ms.${settled}`,
    );
  }
  return notes;
}

function pursuitNotes(rows: Compared[]): string[] {
  const notes: string[] = [];
  for (const row of rows) {
    const metrics = row.after;
    if (metrics.example !== "pursuit" || metrics.crossTrackEarly === undefined) continue;
    notes.push(
      `${metrics.world} pursuit cross-track mean ${metrics.crossTrackEarly.toFixed(2)} m in the first 15 s and ${metrics.crossTrackLate.toFixed(2)} m after 45 s.`,
    );
  }
  return notes;
}

function driftPercent(row: RunMetrics): number {
  if (row.distance < 1) return 0;
  return (100 * row.odomDrift) / row.distance;
}

/**
 * 60 s gates. A flip or a yard exit always fails. Drift stays under 5% of
 * distance. Thresholds match measured seed-1 runs: wall follow is clean and
 * the oval completes a lap; lidar avoid keeps moving, with a real-contact cap
 * per world. Pure pursuit has to make progress along the reference path with
 * no real contacts.
 */
const AVOID_CONTACTS: Record<string, number> = { city: 1, track: 0, forest: 0, warehouse: 2 };
const AVOID_DISTANCE: Record<string, number> = { city: 110, track: 110, forest: 80, warehouse: 90 };
const PURSUIT_CONTACTS: Record<string, number> = { city: 0, track: 0, forest: 0, warehouse: 0 };
const PURSUIT_DISTANCE: Record<string, number> = { city: 120, track: 160, forest: 100, warehouse: 140 };
const MCL_DISTANCE: Record<string, number> = { city: 120, track: 160, forest: 140, warehouse: 140 };
const MCL_CROSS: Record<string, number> = { city: 1.2, track: 0.6, forest: 0.9, warehouse: 1.5 };
const MCL_POSE: Record<string, number> = { city: 1.6, track: 0.8, forest: 1.0, warehouse: 2.0 };
/**
 * Late cross-track has to stay under the odometry result where the filter
 * has a wall to correct against. The warehouse bay is the exception: parallel
 * walls leave along-track pose weakly observed, and late cross-track stays
 * near the odometry figure.
 */
const MCL_LATE: Record<string, number> = { city: 0.7, track: 1.0, forest: 0.9, warehouse: 1.6 };
/**
 * Seed-1 kidnapped runs. Converge is the start of a 1 s window where the
 * weighted cloud's 2-sigma position radius is under 0.5 m, heading sigma is
 * under 10 degrees, and the estimate itself is under 0.5 m. It is not the
 * best particle. Final error is the last sample. The oval ends under 0.5 m.
 * The forest is lower than the unpinned corridor but still above 0.5 m at
 * the minute, and the warehouse aisle is improved and still above 1 m.
 * Margins sit above those measured finals.
 */
const GLOBAL_FINAL: Record<string, number> = { city: 0.85, track: 0.5, forest: 0.85, warehouse: 1.5 };
const GLOBAL_CONV: Record<string, number> = { city: 2, track: 2, forest: 2, warehouse: 6 };
const GLOBAL_DISTANCE: Record<string, number> = { city: 120, track: 180, forest: 150, warehouse: 120 };

export function regressionErrors(row: RunMetrics): string[] {
  const errors: string[] = [];
  const name = `${row.world}/${row.example}`;
  if (row.flipped) errors.push(`${name} flipped`);
  if (row.outOfBounds) errors.push(`${name} left the world`);
  if (row.example !== "mcl-global" && driftPercent(row) > 5) {
    errors.push(`${name} drift ${driftPercent(row).toFixed(1)}%`);
  }
  if (row.chaseGround === false) errors.push(`${name} chase frame has no ground in the lower half`);
  if (row.example === "circle" && row.collisionCount > 0) {
    errors.push(`${name} collisions ${row.collisionCount}`);
  }
  if (row.example === "circle" && row.stuckTime > 1) {
    errors.push(`${name} stuck ${row.stuckTime.toFixed(1)} s`);
  }
  if (row.example === "wall") {
    if (row.collisionCount > 0) errors.push(`${name} collisions ${row.collisionCount}`);
    if (row.stuckTime > 1) errors.push(`${name} stuck ${row.stuckTime.toFixed(1)} s`);
    if (row.distance < 100) errors.push(`${name} traveled ${row.distance.toFixed(1)} m`);
    if (row.world === "track" && row.laps < 1) errors.push(`${name} laps ${row.laps}`);
  }
  if (row.example === "avoid") {
    const contacts = AVOID_CONTACTS[row.world] ?? 1;
    const distance = AVOID_DISTANCE[row.world] ?? 80;
    if (row.collisionCount > contacts) errors.push(`${name} collisions ${row.collisionCount}`);
    if (row.stuckTime > 1) errors.push(`${name} stuck ${row.stuckTime.toFixed(1)} s`);
    if (row.distance < distance) errors.push(`${name} traveled ${row.distance.toFixed(1)} m`);
  }
  if (row.world === "forest" && row.example === "avoid") {
    const inside = Math.abs(row.final.x) < 22 && row.final.z > -22 && row.final.z < 42;
    if (!inside) errors.push(`${name} left the trees at ${row.final.x.toFixed(1)}, ${row.final.z.toFixed(1)}`);
  }
  if (row.example === "pursuit") {
    const contacts = PURSUIT_CONTACTS[row.world] ?? 4;
    const distance = PURSUIT_DISTANCE[row.world] ?? 80;
    if (row.collisionCount > contacts) errors.push(`${name} collisions ${row.collisionCount}`);
    if (row.stuckTime > 2) errors.push(`${name} stuck ${row.stuckTime.toFixed(1)} s`);
    if (row.distance < distance) errors.push(`${name} traveled ${row.distance.toFixed(1)} m`);
    if (row.crossTrackMean > 3) errors.push(`${name} cross-track mean ${row.crossTrackMean.toFixed(2)} m`);
    if (row.laps < 1) errors.push(`${name} laps ${row.laps}`);
  }
  if (row.example === "mcl") {
    if (row.collisionCount > 0) errors.push(`${name} collisions ${row.collisionCount}`);
    if (row.stuckTime > 2) errors.push(`${name} stuck ${row.stuckTime.toFixed(1)} s`);
    if (row.distance < (MCL_DISTANCE[row.world] ?? 100)) errors.push(`${name} traveled ${row.distance.toFixed(1)} m`);
    if (row.crossTrackMean > (MCL_CROSS[row.world] ?? 1.5)) {
      errors.push(`${name} cross-track mean ${row.crossTrackMean.toFixed(2)} m`);
    }
    if (row.laps < 1) errors.push(`${name} laps ${row.laps}`);
    if ((row.poseErrorMean ?? 0) > (MCL_POSE[row.world] ?? 2)) {
      errors.push(`${name} pose error ${row.poseErrorMean.toFixed(2)} m`);
    }
    if ((row.controlMsMean ?? 0) > 20) errors.push(`${name} control ${row.controlMsMean.toFixed(1)} ms`);
    if (row.crossTrackLate > (MCL_LATE[row.world] ?? 1.2)) {
      errors.push(`${name} late cross-track ${row.crossTrackLate.toFixed(2)} m`);
    }
  }
  if (row.example === "mcl-global") {
    if (row.collisionCount > 0) errors.push(`${name} collisions ${row.collisionCount}`);
    if (row.stuckTime > 2) errors.push(`${name} stuck ${row.stuckTime.toFixed(1)} s`);
    if ((row.controlMsMean ?? 0) > 20) errors.push(`${name} control ${row.controlMsMean.toFixed(1)} ms`);
    if (row.convergeTime < 0 || row.convergeTime > (GLOBAL_CONV[row.world] ?? 8)) {
      errors.push(`${name} converge ${row.convergeTime.toFixed(1)} s`);
    }
    if (row.finalPoseError > (GLOBAL_FINAL[row.world] ?? 2)) {
      errors.push(`${name} final pose ${row.finalPoseError.toFixed(2)} m`);
    }
    if (row.distance < (GLOBAL_DISTANCE[row.world] ?? 100)) {
      errors.push(`${name} traveled ${row.distance.toFixed(1)} m`);
    }
    if (row.laps < 1) errors.push(`${name} laps ${row.laps}`);
    if (row.world === "track" && row.seed === 1) {
      const at4 = row.poseErrorAt4 ?? -1;
      if (!(at4 >= 0 && at4 <= 1)) {
        errors.push(`${name} pose at 4 s ${at4 < 0 ? "missing" : `${at4.toFixed(2)} m`}`);
      }
    }
  }
  if ((row.controlMsMax ?? 0) > 45) errors.push(`${name} control max ${row.controlMsMax.toFixed(1)} ms`);
  return errors;
}

const DEMO_DISTANCE = 15;

/**
 * Scripted lessons share the 60 s seed-1 matrix. A ready lesson with a
 * starter has to finish that minute with no real contact and no stuck time.
 */
export function lessonDemoReport(rows: RunMetrics[], extras: RunMetrics[] = []): { errors: string[]; markdown: string } {
  const errors: string[] = [];
  const lines = [
    "| Lesson | World | Program | Contacts | Stuck s | Distance m |",
    "| --- | --- | --- | ---: | ---: | ---: |",
  ];
  for (const lesson of LESSONS) {
    if (lesson.status !== "ready") continue;
    if (!lesson.starter) {
      lines.push(`| ${lesson.title} | ${lesson.world} | hand drive | — | — | — |`);
      continue;
    }
    const wanted = resolveSpawn(lesson);
    const scenario = spawnFor(lesson.world as EvalWorld, lesson.starter, "scenario");
    const yawGap = Math.atan2(Math.sin(wanted.yaw - scenario.yaw), Math.cos(wanted.yaw - scenario.yaw));
    const same = Math.hypot(wanted.x - scenario.x, wanted.z - scenario.z) < 0.05 && Math.abs(yawGap) < 0.05;
    const row = rows.find((item) => item.world === lesson.world && item.example === lesson.starter);
    if (!same || !row) {
      errors.push(`${lesson.id} demo is not in the eval matrix`);
      lines.push(`| ${lesson.title} | ${lesson.world} | ${lesson.starter} | missing | missing | missing |`);
      continue;
    }
    if (row.collisionCount !== 0) errors.push(`${lesson.id} contacts ${row.collisionCount}`);
    if (row.stuckTime !== 0) errors.push(`${lesson.id} stuck ${row.stuckTime.toFixed(2)} s`);
    if (row.distance < DEMO_DISTANCE) errors.push(`${lesson.id} traveled ${row.distance.toFixed(1)} m`);
    lines.push(
      `| ${lesson.title} | ${row.world} | ${row.example} | ${row.collisionCount} | ${row.stuckTime.toFixed(2)} | ${row.distance.toFixed(1)} |`,
    );
  }
  const switchLines = [
    "| Lesson | World | Allowed | Spawn kind | Matches scenario |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const lesson of LESSONS) {
    if (lesson.status !== "ready") continue;
    for (const world of ["city", "track", "forest", "warehouse"] as WorldId[]) {
      const allowed = lesson.worlds.includes(world);
      const pose = resolveSpawnIn(lesson, world);
      const expected = lesson.spawn === "default" ? worldSpawn(world) : spawnFor(world, lesson.spawn, "scenario");
      const yawGap = Math.atan2(Math.sin(pose.yaw - expected.yaw), Math.cos(pose.yaw - expected.yaw));
      const same = Math.hypot(pose.x - expected.x, pose.z - expected.z) < 0.05 && Math.abs(yawGap) < 0.05;
      if (!same) errors.push(`${lesson.id} in ${world} left its ${lesson.spawn} start`);
      switchLines.push(`| ${lesson.title} | ${world} | ${allowed ? "yes" : "locked"} | ${lesson.spawn} | ${same ? "yes" : "NO"} |`);
    }
  }
  const seedLines = [
    "| World | Program | Seed | Contacts | Stuck s | Distance m |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
  ];
  for (const row of extras) {
    const cap = row.example === "avoid" ? (AVOID_CONTACTS[row.world] ?? 1) : row.example === "pursuit" ? (PURSUIT_CONTACTS[row.world] ?? 0) : 0;
    if (row.collisionCount > cap) errors.push(`${row.world}/${row.example} seed ${row.seed} contacts ${row.collisionCount}`);
    if (row.stuckTime !== 0) errors.push(`${row.world}/${row.example} seed ${row.seed} stuck ${row.stuckTime.toFixed(2)} s`);
    if (row.distance < DEMO_DISTANCE) errors.push(`${row.world}/${row.example} seed ${row.seed} traveled ${row.distance.toFixed(1)} m`);
    seedLines.push(
      `| ${row.world} | ${row.example} | ${row.seed} | ${row.collisionCount} | ${row.stuckTime.toFixed(2)} | ${row.distance.toFixed(1)} |`,
    );
  }
  return {
    errors,
    markdown: [
      "# Lesson demos",
      "",
      "Each scripted lesson is the matching 60 s seed-1 eval run in that lesson's world.",
      "",
      ...lines,
      "",
      "## World switches",
      "",
      "A locked world is not offered in that lesson. The menu keeps it disabled. The start kind still matches the scenario in every world, including the locked ones.",
      "",
      ...switchLines,
      "",
      "## Extra seeds",
      "",
      "Seeds 2 and 3 run each scripted starter in all four worlds.",
      "",
      ...seedLines,
      "",
    ].join("\n"),
  };
}
