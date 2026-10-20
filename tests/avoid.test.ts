import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";
import { clamp } from "../src/api";
import { buildCourseSolids, solidQuaternion, type Solid } from "../src/sim/course";
import { AckermannBuggy } from "../src/sim/vehicle";

const DT = 1 / 60;

function addSolid(RAPIER: typeof import("@dimforge/rapier3d-compat").default, world: InstanceType<typeof RAPIER.World>, solid: Solid): void {
  const q = solidQuaternion(solid.yaw, solid.pitch);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(solid.x, solid.y, solid.z).setRotation(q),
  );
  const desc =
    solid.shape === "cuboid"
      ? RAPIER.ColliderDesc.cuboid(solid.hx, solid.hy, solid.hz)
      : solid.shape === "cylinder"
        ? RAPIER.ColliderDesc.cylinder(solid.hy, solid.hx)
        : solid.shape === "cone"
          ? RAPIER.ColliderDesc.cone(solid.hy, solid.hx)
          : RAPIER.ColliderDesc.ball(solid.hx);
  world.createCollider(desc.setFriction(solid.friction), body);
}

interface AvoidState {
  v: number;
  reverse: number;
  phase: "run" | "back" | "spin" | "go";
  phaseTicks: number;
  cooldown: number;
  heldSign: number;
  anchorX: number;
  anchorY: number;
  anchorT: number;
  sawAnchor: boolean;
}

/** Same rule as the Lidar avoid example: positive angle and positive steer are left. */
function avoidCommand(
  ranges: number[],
  angles: number[],
  speed: number,
  state: AvoidState,
  time: number,
  pose: { x: number; y: number },
): { steering: number; throttle: number } {
  const wide = inflate(ranges, angles);
  const maxRange = Math.max(...ranges, 0);
  let best = -1;
  let gap = 0;
  let exitAngle = 0;
  let exitScore = -1;
  const left: number[] = [];
  const right: number[] = [];
  let front = maxRange;
  const fwd: number[] = [];
  let jumps = 0;
  let prevFwd = -1;
  for (let i = 0; i < ranges.length; i++) {
    const angle = angles[i] ?? 0;
    const range = ranges[i] ?? maxRange;
    if (Math.abs(angle) < 0.95) front = Math.min(front, range);
    if (Math.abs(angle) < 1.05) {
      if (prevFwd >= 0 && Math.abs(range - prevFwd) > 1.5) jumps += 1;
      prevFwd = range;
      fwd.push(range);
    }
    const opened = wide[i] ?? maxRange;
    if (opened > exitScore) {
      exitScore = opened;
      exitAngle = angle;
    }
  }
  const mean = fwd.length ? fwd.reduce((sum, value) => sum + value, 0) / fwd.length : maxRange;
  const weave = jumps > 8 && mean < 10;
  const desired = weave ? 0.35 * Math.sin(time * 0.09) : 0;
  const window = weave ? 1.25 : front < 6 ? 1.15 : 0.5;
  for (let i = 0; i < ranges.length; i++) {
    const angle = angles[i] ?? 0;
    const opened = wide[i] ?? maxRange;
    if (Math.abs(angle) < window) {
      const pref = weave ? Math.exp(-0.5 * ((angle - desired) / 0.75) ** 2) : Math.cos(angle * 0.9);
      const score = opened * pref;
      if (score > best) {
        best = score;
        gap = angle;
      }
    }
    if (angle > 0.15 && angle < 1.2) left.push(opened);
    if (angle < -0.15 && angle > -1.2) right.push(opened);
  }
  state.v = 0.6 * state.v + 0.4 * gap;
  const leftClear = percentile(left, 0.3);
  const rightClear = percentile(right, 0.3);
  const turn = leftClear >= rightClear ? 0.5 : -0.5;
  if (!state.sawAnchor) {
    state.anchorX = pose.x;
    state.anchorY = pose.y;
    state.anchorT = time;
    state.sawAnchor = true;
  }
  let stalled = false;
  if (time - state.anchorT > 2.5) {
    stalled = Math.hypot(pose.x - state.anchorX, pose.y - state.anchorY) < 1.2 && Math.abs(speed) < 0.55;
    state.anchorX = pose.x;
    state.anchorY = pose.y;
    state.anchorT = time;
  }
  if (state.cooldown > 0) state.cooldown -= 1;
  if (state.phase === "back") {
    state.phaseTicks += 1;
    let rear = maxRange;
    for (let i = 0; i < ranges.length; i++) {
      if (Math.abs(angles[i] ?? 0) > 2) rear = Math.min(rear, ranges[i] ?? maxRange);
    }
    if (state.phaseTicks > 40 || (state.phaseTicks > 14 && rear < 1.05 && speed < -0.2)) {
      state.phase = Math.abs(exitAngle) > 0.8 ? "spin" : "go";
      state.phaseTicks = 0;
    }
    return { steering: clamp(0.22 * state.heldSign, -0.3, 0.3), throttle: -0.4 };
  }
  if (state.phase === "spin") {
    state.phaseTicks += 1;
    if (Math.abs(exitAngle) < 0.6 || state.phaseTicks > 50) {
      state.phase = "go";
      state.phaseTicks = 0;
    } else {
      return { steering: clamp(-exitAngle, -0.52, 0.52), throttle: -0.4 };
    }
  }
  if (state.phase === "go") {
    state.phaseTicks += 1;
    if (state.phaseTicks > 50) {
      state.phase = "run";
      state.phaseTicks = 0;
      state.cooldown = 30;
    }
    return { steering: clamp(exitAngle * 0.9, -0.5, 0.5), throttle: 0.26 };
  }
  if ((stalled || (front < 2 && leftClear < 3 && rightClear < 3 && Math.abs(speed) < 1)) && state.cooldown === 0) {
    state.heldSign = leftClear < rightClear ? 1 : -1;
    state.phase = "back";
    state.phaseTicks = 0;
    return { steering: clamp(0.22 * state.heldSign, -0.3, 0.3), throttle: -0.36 };
  }
  if (state.reverse > 0) {
    state.reverse -= 1;
    return { steering: turn, throttle: -0.28 };
  }
  if (front < 1.55) {
    state.reverse = 8;
    return { steering: turn, throttle: -0.28 };
  }
  if (Math.abs(speed) < 0.35 && Math.max(leftClear, rightClear) > front + 0.8) {
    return { steering: turn, throttle: 0.2 };
  }
  let steering = clamp(state.v * 1.15, -0.5, 0.5);
  let throttle = clamp((front - 3) / 12, 0.08, 0.3);
  if (front < 8 && speed > 3) throttle = -0.55;
  else if (front < 5 && speed > 1.8) throttle = -0.35;
  if (front < 5) {
    const blend = clamp((5 - front) / 3, 0, 1);
    steering = clamp((1 - blend) * steering + blend * turn, -0.52, 0.52);
  }
  return { steering, throttle };
}

function inflate(ranges: number[], angles: number[]): number[] {
  const wide = [...ranges];
  const span = ranges.map((range) => Math.atan(1.35 / Math.max(range ?? 0.45, 0.45)));
  for (let i = 0; i < ranges.length; i++) {
    const reach = span[i] ?? 0;
    const center = angles[i] ?? 0;
    const block = ranges[i] ?? 0;
    for (let j = 0; j < ranges.length; j++) {
      if (Math.abs((angles[j] ?? 0) - center) <= reach) wide[j] = Math.min(wide[j] ?? block, block);
    }
  }
  return wide;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

describe("yard", () => {
  it("keeps the spawn pad clear of props", () => {
    const solids = buildCourseSolids();
    expect(solids.length).toBeGreaterThan(40);
    const looks = new Set(solids.map((solid) => solid.look));
    for (const look of ["cone", "barrel", "car", "tree", "bench", "light", "fence", "rock", "building", "ramp"]) {
      expect(looks.has(look)).toBe(true);
    }
    for (const solid of solids) {
      const reach = Math.hypot(solid.hx, solid.hz);
      const clearance = Math.hypot(solid.x - 5.4, solid.z - 0) - reach;
      expect(clearance, `${solid.look} at ${solid.x}, ${solid.z}`).toBeGreaterThan(6);
    }
  });

  it("drives the lidar-avoid policy up the avenue without rolling", async () => {
    await RAPIER.init({});
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = DT;
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.5, 400).setFriction(1.05), ground);
    for (const solid of buildCourseSolids()) addSolid(RAPIER, world, solid);
    const scene = new THREE.Scene();
    const robot = new AckermannBuggy(RAPIER, world, scene);
    robot.setNoiseSeed(1);
    const aim: AvoidState = {
      v: 0,
      reverse: 0,
      phase: "run",
      phaseTicks: 0,
      cooldown: 0,
      heldSign: 1,
      anchorX: 0,
      anchorY: 0,
      anchorT: 0,
      sawAnchor: false,
    };
    let sensorAccumulator = 0;
    const start = robot.focus();
    let minUp = 1;
    for (let i = 0; i < 60 * 13; i++) {
      sensorAccumulator += DT;
      if (sensorAccumulator >= 0.05 - 1e-4) {
        const sensors = robot.sampleSensors(sensorAccumulator);
        sensorAccumulator = 0;
        robot.setCommand(
          avoidCommand(
            sensors.lidar.ranges,
            sensors.lidar.angles,
            sensors.odometry.speed,
            aim,
            sensors.time,
            sensors.odometry.pose,
          ),
          0,
        );
      }
      robot.preStep(DT);
      world.step();
      if (i % 15 === 0) {
        robot.syncVisuals();
        const chassis = scene.children.find((child) => child instanceof THREE.Group);
        if (chassis instanceof THREE.Group) {
          minUp = Math.min(minUp, new THREE.Vector3(0, 1, 0).applyQuaternion(chassis.quaternion).y);
        }
      }
    }
    const end = robot.focus();
    const travelled = Math.hypot(end.x - start.x, end.z - start.z);
    console.log(`avoid ended at x=${end.x.toFixed(1)} z=${end.z.toFixed(1)} travelled=${travelled.toFixed(1)} up=${minUp.toFixed(2)}`);
    expect(minUp).toBeGreaterThan(0.75);
    expect(end.z).toBeGreaterThan(22);
    expect(travelled).toBeGreaterThan(20);
  }, 30000);
});
