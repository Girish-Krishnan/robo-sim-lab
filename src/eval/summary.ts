import type { RunMetrics } from "./simulate";

export interface Compared {
  after: RunMetrics;
  before?: RunMetrics;
}

export function renderSummary(rows: Compared[]): string {
  const header = [
    "| World | Example | Distance m | Mean m/s | Collisions | Contact s | Min lidar m | Stuck s | Flip | OOB | Laps | Lap times | Odom drift m |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | ---: |",
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
    "A row tagged `before` is the same sensors and worlds with the previous example code and the world's default spawn.",
    "",
    ...lines,
    "",
    "Speed colour on the path plot runs from blue (slow) to amber to red (fast). The amber line is odometry. Red dots are contacts. The teal dot is the start.",
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
  ].join(" | ");
}

/** Short-run gates. A flip always fails. Circle must stay clear. Avoid stays nearly clear and moving. */
export function regressionErrors(row: RunMetrics): string[] {
  const errors: string[] = [];
  if (row.flipped) errors.push(`${row.world}/${row.example} flipped`);
  if (row.outOfBounds) errors.push(`${row.world}/${row.example} left the yard`);
  if (row.example === "circle" && row.collisionCount > 0) {
    errors.push(`${row.world}/circle collisions ${row.collisionCount}`);
  }
  if (row.example === "avoid") {
    if (row.collisionCount > 2) errors.push(`${row.world}/avoid collisions ${row.collisionCount}`);
    if (row.distance < 15) errors.push(`${row.world}/avoid travelled ${row.distance.toFixed(1)} m`);
    if (row.stuckTime > 2) errors.push(`${row.world}/avoid stuck ${row.stuckTime.toFixed(1)} s`);
  }
  if (row.example === "wall" && row.collisionCount > 3) {
    errors.push(`${row.world}/wall collisions ${row.collisionCount}`);
  }
  if (row.example === "wall" && row.distance < 8) {
    errors.push(`${row.world}/wall travelled ${row.distance.toFixed(1)} m`);
  }
  if (row.example === "wall" && row.stuckTime > 2) {
    errors.push(`${row.world}/wall stuck ${row.stuckTime.toFixed(1)} s`);
  }
  return errors;
}
