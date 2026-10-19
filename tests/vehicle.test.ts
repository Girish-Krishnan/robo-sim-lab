import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";
import { placeChaseCamera } from "../src/sim/camera";
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

function projectX(camera: THREE.PerspectiveCamera, point: THREE.Vector3): number {
  return point.clone().project(camera).x;
}

function chassisOf(scene: THREE.Scene): THREE.Group {
  const chassis = scene.children.find((child) => child instanceof THREE.Group);
  if (!(chassis instanceof THREE.Group)) throw new Error("missing chassis");
  return chassis;
}

/** Horizontal direction the front tires are pointing, in the chassis frame. +X is the driver's left. */
function frontWheelAimX(scene: THREE.Scene): number {
  const wheels = chassisOf(scene).children.filter((child) => child instanceof THREE.Group);
  let aim = 0;
  let count = 0;
  for (const wheel of wheels) {
    if (wheel.position.z < 0.2) continue;
    const axle = new THREE.Vector3(1, 0, 0).applyQuaternion(wheel.quaternion);
    const forward = new THREE.Vector3().crossVectors(axle, new THREE.Vector3(0, 1, 0));
    if (forward.z < 0) forward.negate();
    aim += forward.x;
    count += 1;
  }
  if (count === 0) throw new Error("missing front wheels");
  return aim / count;
}

describe("ackermann buggy", () => {
  it("turns to the driver's left, on the left of the chase camera", async () => {
    const { world, scene, robot } = await makeRobot();
    const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 600);
    const start = robot.focus();
    placeChaseCamera(camera, start);

    const origin = new THREE.Vector3(start.x, start.y, start.z);
    const worldLeft = origin.clone().add(new THREE.Vector3(2, 0, 0));
    // Camera behind the car, looking along +Z: world +X is screen left (NDC x decreases).
    expect(projectX(camera, worldLeft)).toBeLessThan(projectX(camera, origin) - 0.05);

    robot.setCommand({ steering: 0.45, throttle: 0.85 }, 0);
    step(world, robot, 100);
    const mid = robot.focus();
    const midPoint = new THREE.Vector3(mid.x, mid.y, mid.z);
    expect(mid.x).toBeGreaterThan(start.x + 0.45);
    expect(projectX(camera, midPoint)).toBeLessThan(projectX(camera, origin) - 0.04);
    expect(frontWheelAimX(scene)).toBeGreaterThan(0.2);

    // Keep the left lock until the nose has come back toward the original camera.
    const chassis = chassisOf(scene);
    let noseZ = 1;
    for (let i = 0; i < 14 && noseZ > -0.35; i++) {
      step(world, robot, 30);
      noseZ = new THREE.Vector3(0, 0, 1).applyQuaternion(chassis.quaternion).z;
    }
    expect(noseZ).toBeLessThan(-0.35);
    const turned = robot.focus();
    placeChaseCamera(camera, turned);
    const center = new THREE.Vector3(turned.x, turned.y, turned.z);
    const driverLeft = new THREE.Vector3(1, 0, 0).applyQuaternion(chassis.quaternion).multiplyScalar(2).add(center);
    expect(projectX(camera, driverLeft)).toBeLessThan(projectX(camera, center) - 0.03);

    // Reversing toward the camera must not flip the tires. Positive steer stays a left steer.
    robot.setCommand({ steering: 0.45, throttle: -0.75 }, 0);
    step(world, robot, 50);
    expect(frontWheelAimX(scene)).toBeGreaterThan(0.2);
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
