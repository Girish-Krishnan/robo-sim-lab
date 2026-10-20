import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ChaseCamera, chaseGroundFraction, placeChaseCamera } from "../src/sim/camera";

function element(): HTMLElement {
  return {
    addEventListener() {},
    removeEventListener() {},
  } as unknown as HTMLElement;
}

describe("chase camera", () => {
  it("stays above the ground and looks down after a backwards timestamp", () => {
    const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 600);
    const chase = new ChaseCamera(camera, element());
    const target = { x: 16, y: 0.84, z: -34, yaw: 0 };
    chase.update(-0.23, target);
    chase.update(-5, target);
    expect(camera.position.y).toBeGreaterThan(2);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    expect(dir.y).toBeLessThan(-0.2);
    expect(chaseGroundFraction(camera)).toBeGreaterThan(0.25);
    chase.dispose();
  });

  it("eases back onto the car instead of pitching into the sky", () => {
    const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 600);
    camera.position.set(-21, -12, 15);
    const chase = new ChaseCamera(camera, element());
    const target = { x: 16, y: 0.84, z: -20, yaw: 0 };
    chase.update(0.05, target);
    expect(camera.position.y).toBeGreaterThan(2);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    expect(dir.y).toBeLessThan(-0.2);
    expect(chaseGroundFraction(camera)).toBeGreaterThan(0.25);
    chase.dispose();
  });

  it("sees ground on the oval, the roundabout, and the trail", () => {
    const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 600);
    const poses = [
      { x: 16, y: 0.84, z: -34, yaw: 0 },
      { x: 5.5, y: 0.84, z: 52.2, yaw: -1.53 },
      { x: -0.6, y: 0.84, z: -9.8, yaw: 0 },
      { x: -8, y: 0.84, z: -14, yaw: -Math.PI / 2 },
    ];
    for (const pose of poses) {
      placeChaseCamera(camera, pose);
      expect(chaseGroundFraction(camera), `${pose.x},${pose.z}`).toBeGreaterThan(0.25);
    }
  });
});
