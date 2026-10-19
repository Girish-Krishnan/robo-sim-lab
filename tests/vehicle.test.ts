import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";
import { AckermannBuggy, STOP_BRAKE } from "../src/sim/vehicle";

const DT = 1 / 60;

async function makeRobot() {
  await RAPIER.init({});
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.5, 400).setFriction(1.1), ground);
  const scene = new THREE.Scene();
  const robot = new AckermannBuggy(RAPIER, world, scene);
  return { world, scene, robot };
}

function step(world: InstanceType<typeof RAPIER.World>, robot: AckermannBuggy, count: number): void {
  for (let i = 0; i < count; i++) {
    robot.preStep(DT);
    world.step();
  }
  robot.syncVisuals();
}

function upComponent(scene: THREE.Scene): number {
  const chassis = scene.children.find((child) => child instanceof THREE.Group);
  if (!chassis) throw new Error("missing chassis");
  return new THREE.Vector3(0, 1, 0).applyQuaternion(chassis.quaternion).y;
}

describe("ackermann buggy", () => {
  it("turns left when the steering command is positive", async () => {
    const { world, robot } = await makeRobot();
    const start = robot.focus().x;
    robot.setCommand({ steering: 0.4, throttle: 0.8 }, 0);
    step(world, robot, 120);
    const focus = robot.focus();
    expect(focus.yaw).toBeGreaterThan(0.25);
    expect(focus.x).toBeLessThan(start - 0.3);
  });

  it("stays upright when a circle is brought to a stop", async () => {
    const { world, scene, robot } = await makeRobot();
    robot.setCommand({ steering: 0.34, throttle: 0.7 }, 0);
    step(world, robot, 180);
    expect(upComponent(scene)).toBeGreaterThan(0.9);
    robot.setCommand({ steering: 0, throttle: 0 }, STOP_BRAKE);
    step(world, robot, 150);
    expect(upComponent(scene)).toBeGreaterThan(0.85);
    expect(Math.abs(robot.telemetry().trueSpeed)).toBeLessThan(1.5);
  });
});
