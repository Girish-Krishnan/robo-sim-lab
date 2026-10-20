import type { RunMetrics } from "./simulate";

export interface Compared {
  after: RunMetrics;
  before?: RunMetrics;
}

export function renderSummary(rows: Compared[]): string {
  const header = [
    "| World | Example | Distance m | Mean m/s | Collisions | Contact s | Min lidar m | Stuck s | Flip | OOB | Laps | Lap times | Odom drift m | Drift % |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | ---: |",
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
    "A row tagged `before` is commit c119ca7: the same worlds with that revision's examples and its bicycle-model odometry.",
    "",
    ...lines,
    "",
    "The path plot legend labels the speed colour bar in m/s, the true path, the odometry trail, and contacts. A scale bar is in metres. Roads, curbs, the oval asphalt, and the forest trail are drawn under the path.",
    "",
  ].join("\n");
}

function cells(row: RunMetrics, tag?: string): string {
  const example = tag ? `${row.example} (${tag})` : row.example;
  const laps = row.world === "track" ? String(row.laps) : "—";
  const lapTimes = row.lapTimes.length ? row.lapTimes.join(", ") : "—";
  return [
    row.world,
    example,
    row.distance.toFixed(1),
    row.meanSpeed.toFixed(2),
    String(row.collisionCount),
    row.contactTime.toFixed(2),
    row.minLidar.toFixed(2),
    row.stuckTime.toFixed(2),
    row.flipped ? "yes" : "no",
    row.outOfBounds ? "yes" : "no",
    laps,
    lapTimes,
    row.odomDrift.toFixed(2),
    driftPercent(row).toFixed(1),
  ].join(" | ");
}

function driftPercent(row: RunMetrics): number {
  if (row.distance < 1) return 0;
  return (100 * row.odomDrift) / row.distance;
}

/**
 * 60 s gates. A flip or a yard exit always fails. Drift stays under 5% of
 * distance. Wall follow and lidar avoid stay at 0–1 contacts and do not
 * sit still. The forest avoid run has to finish inside the tree corridor.
 */
export function regressionErrors(row: RunMetrics): string[] {
  const errors: string[] = [];
  const name = `${row.world}/${row.example}`;
  if (row.flipped) errors.push(`${name} flipped`);
  if (row.outOfBounds) errors.push(`${name} left the yard`);
  if (driftPercent(row) > 5) errors.push(`${name} drift ${driftPercent(row).toFixed(1)}%`);
  if (row.example === "circle" && row.collisionCount > 0) {
    errors.push(`${name} collisions ${row.collisionCount}`);
  }
  if (row.example === "circle" && row.stuckTime > 1) {
    errors.push(`${name} stuck ${row.stuckTime.toFixed(1)} s`);
  }
  if (row.example === "avoid" || row.example === "wall") {
    if (row.collisionCount > 1) errors.push(`${name} collisions ${row.collisionCount}`);
    if (row.stuckTime > 1) errors.push(`${name} stuck ${row.stuckTime.toFixed(1)} s`);
    if (row.distance < 40) errors.push(`${name} travelled ${row.distance.toFixed(1)} m`);
  }
  if (row.world === "forest" && row.example === "avoid") {
    const inside = Math.abs(row.final.x) < 22 && row.final.z > -22 && row.final.z < 42;
    if (!inside) errors.push(`${name} left the trees at ${row.final.x.toFixed(1)}, ${row.final.z.toFixed(1)}`);
  }
  return errors;
}
