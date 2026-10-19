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
function avoidCommand(ranges: number[], angles: number[], aim: { v: number }): { steering: number; throttle: number } {
  let best = -1;
  let gapAngle = 0;
  let gapRange = 25;
  let leftSum = 0;
  let leftCount = 0;
  let rightSum = 0;
  let rightCount = 0;
  for (let i = 0; i < ranges.length; i++) {
    const angle = angles[i] ?? 0;
    const dist = ranges[i] ?? gapRange;
    if (Math.abs(angle) < 1.2) {
      const score = dist * (1 - 0.28 * Math.abs(angle));
      if (score > best) {
        best = score;
        gapAngle = angle;
        gapRange = dist;
      }
    }
    if (angle > 0.12 && angle < 1.5) {
      leftSum += dist;
      leftCount += 1;
    }
    if (angle < -0.12 && angle > -1.5) {
      rightSum += dist;
      rightCount += 1;
    }
  }
  aim.v = 0.72 * aim.v + 0.28 * gapAngle;
  let steering = clamp(aim.v * 0.95, -0.48, 0.48);
  if (gapRange < 7) {
    const leftClear = leftCount ? leftSum / leftCount : 0;
    const rightClear = rightCount ? rightSum / rightCount : 0;
    const prefer = leftClear >= rightClear ? 0.42 : -0.42;
    const blend = clamp((7 - gapRange) / 7, 0, 1);
    steering = clamp((1 - blend) * steering + blend * prefer, -0.5, 0.5);
  }
  let throttle = 0.52;
  if (gapRange < 9) throttle = 0.36;
  if (gapRange < 5) throttle = 0.2;
  if (gapRange < 2.4) throttle = 0;
  return { steering, throttle };
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
    const aim = { v: 0 };
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
