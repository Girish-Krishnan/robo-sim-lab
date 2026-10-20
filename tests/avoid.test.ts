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

/** Same rule as the Lidar avoid example: positive angle and positive steer are left. */
function avoidCommand(
  ranges: number[],
  angles: number[],
  state: { v: number; mode: string; reverse: number; left: boolean },
): { steering: number; throttle: number } {
  const wide = widen(ranges);
  const maxRange = Math.max(...ranges, 0);
  let best = -1;
  let gapAngle = 0;
  const left: number[] = [];
  const right: number[] = [];
  let front = maxRange;
  for (let i = 0; i < ranges.length; i++) {
    const angle = angles[i] ?? 0;
    const dist = ranges[i] ?? maxRange;
    const opened = wide[i] ?? dist;
    if (Math.abs(angle) < 0.4) front = Math.min(front, dist);
    if (Math.abs(angle) < 1.15) {
      const score = opened * (1 - 0.35 * Math.abs(angle));
      if (score > best) {
        best = score;
        gapAngle = angle;
      }
    }
    if (angle > 0.3 && angle < 1.35) left.push(opened);
    if (angle < -0.3 && angle > -1.35) right.push(opened);
  }
  state.v = 0.84 * state.v + 0.16 * gapAngle;
  state.left = percentile(left, 0.2) >= percentile(right, 0.2);
  const turn = state.left ? 0.4 : -0.4;
  let steering = clamp(state.v * 0.75, -0.38, 0.38);
  const forwardMin = wide.reduce((best, value, index) => {
    const angle = angles[index] ?? 0;
    return Math.abs(angle) < 1.15 ? Math.min(best, value ?? best) : best;
  }, Infinity);
  if (front > 10 && forwardMin > 9) steering = clamp(steering + 0.06, -0.4, 0.4);
  let throttle = 0.4;
  if (front < 7) {
    const blend = clamp((7 - front) / 4, 0, 1);
    steering = clamp((1 - blend) * steering + blend * turn, -0.46, 0.46);
    throttle = 0.26;
  }
  if (state.mode === "go" && front < 1.8) {
    state.mode = "reverse";
    state.reverse = 0;
  } else if (state.mode === "reverse") {
    state.reverse += 1;
    steering = state.left ? 0.46 : -0.46;
    throttle = -0.34;
    if (state.reverse === 14) state.left = !state.left;
    if (front > 3.6 || state.reverse > 30) state.mode = "go";
  }
  return { steering, throttle };
}

function widen(ranges: number[]): number[] {
  const wide = [...ranges];
  for (let shift = 1; shift < 7; shift++) {
    for (let i = 0; i < wide.length; i++) {
      const a = ranges[i + shift];
      const b = ranges[i - shift];
      if (a != null) wide[i] = Math.min(wide[i] ?? a, a);
      if (b != null) wide[i] = Math.min(wide[i] ?? b, b);
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
    const aim = { v: 0, mode: "go", reverse: 0, left: true };
    let sensorAccumulator = 0;
    const start = robot.focus();
    let minUp = 1;
    for (let i = 0; i < 60 * 12; i++) {
      sensorAccumulator += DT;
      if (sensorAccumulator >= 0.05 - 1e-4) {
        const sensors = robot.sampleSensors(sensorAccumulator);
        sensorAccumulator = 0;
        robot.setCommand(avoidCommand(sensors.lidar.ranges, sensors.lidar.angles, aim), 0);
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
    expect(travelled).toBeGreaterThan(24);
  }, 30000);
});
