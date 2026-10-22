import * as THREE from "three";
import { clamp } from "../api";
import type { ChassisFocus } from "../robots/types";

/** Default orbit: behind the car and a little to its right, looking forward. */
export const CHASE_ORBIT_YAW = 0.55;
export const CHASE_ORBIT_PITCH = 0.42;
export const CHASE_DISTANCE = 9.2;

/**
 * Place a camera on the chase rig, fully caught up (no smoothing).
 * `orbitYaw` 0 sits directly behind the nose. The rig rotates with the car,
 * so the driver's left stays on the left of the screen.
 */
export function placeChaseCamera(
  camera: THREE.PerspectiveCamera,
  target: ChassisFocus,
  orbitYaw = CHASE_ORBIT_YAW,
  orbitPitch = CHASE_ORBIT_PITCH,
  distance = CHASE_DISTANCE,
): void {
  const horiz = distance * Math.cos(orbitPitch);
  const offset = new THREE.Vector3(
    Math.sin(orbitYaw) * horiz,
    distance * Math.sin(orbitPitch) + 0.4,
    -Math.cos(orbitYaw) * horiz,
  );
  // focus().yaw is the opposite of Three.js rotation.y. See yawFromQuaternion.
  offset.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -target.yaw));
  const focus = new THREE.Vector3(target.x, target.y + 0.7, target.z);
  camera.up.set(0, 1, 0);
  camera.position.copy(focus).add(offset);
  camera.lookAt(focus);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
}

/**
 * Fraction of a chase frame's lower half whose view ray hits the ground
 * plane. A camera pitched into the sky, or sitting under the ground plane,
 * scores near zero. The eval treats that as a failed screenshot.
 */
export function chaseGroundFraction(
  camera: THREE.PerspectiveCamera,
  width = 96,
  height = 54,
): number {
  const origin = new THREE.Vector3();
  const sample = new THREE.Vector3();
  let lower = 0;
  let hits = 0;
  for (let y = Math.floor(height / 2); y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      lower += 1;
      const ndcX = ((x + 0.5) / width) * 2 - 1;
      const ndcY = 1 - ((y + 0.5) / height) * 2;
      sample.set(ndcX, ndcY, 0.5).unproject(camera);
      origin.copy(camera.position);
      sample.sub(origin);
      if (sample.y >= -1e-4) continue;
      const t = -origin.y / sample.y;
      const hitX = origin.x + sample.x * t;
      const hitZ = origin.z + sample.z * t;
      if (t > 0.3 && t < 80 && Math.abs(hitX) < 80 && Math.abs(hitZ) < 90) hits += 1;
    }
  }
  return lower === 0 ? 0 : hits / lower;
}

/** Chase camera. Drag orbits around the car; the car stays in frame. */
export class ChaseCamera {
  private orbitYaw = CHASE_ORBIT_YAW;
  private orbitPitch = CHASE_ORBIT_PITCH;
  private distance = CHASE_DISTANCE;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly desired = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly held = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly viewport: HTMLElement,
  ) {
    viewport.addEventListener("pointerdown", this.onDown);
    viewport.addEventListener("pointermove", this.onMove);
    viewport.addEventListener("pointerup", this.onUp);
    viewport.addEventListener("pointercancel", this.onUp);
    viewport.addEventListener("wheel", this.onWheel, { passive: false });
  }

  reset(): void {
    this.orbitYaw = CHASE_ORBIT_YAW;
    this.orbitPitch = CHASE_ORBIT_PITCH;
    this.distance = CHASE_DISTANCE;
  }

  /** Pull the chase rig back. Used to see a cloud that is wider than the car. */
  frame(distance: number, pitch: number, yaw = CHASE_ORBIT_YAW): void {
    this.distance = clamp(distance, 4.5, 210);
    this.orbitPitch = clamp(pitch, 0.12, 1.45);
    this.orbitYaw = yaw;
  }

  /** Nearly overhead, yaw loosened so a map-sized cloud is not behind the bumper. */
  overhead(distance: number): void {
    this.distance = clamp(distance, 4.5, 210);
    this.orbitPitch = 1.42;
    this.orbitYaw = 0.2;
  }

  /** Jump the rig onto the car. Used after a reset or a world switch. */
  snap(target: ChassisFocus): void {
    this.focus.set(target.x, target.y + 0.7, target.z);
    this.look.copy(this.focus);
    placeChaseCamera(this.camera, target, this.orbitYaw, this.orbitPitch, this.distance);
  }

  update(dt: number, target: ChassisFocus): void {
    this.held.copy(this.camera.position);
    placeChaseCamera(this.camera, target, this.orbitYaw, this.orbitPitch, this.distance);
    this.desired.copy(this.camera.position);
    this.focus.set(target.x, target.y + 0.7, target.z);
    const gap = this.held.distanceTo(this.desired);
    // A backwards timestamp used to extrapolate the rig under the ground and
    // aim it at the sky. A dt of 1 is an explicit snap (teleport). Anything
    // in between eases, and only while the rig is already near the car.
    const tame = dt > 0 && dt < 1 && Number.isFinite(dt) && gap < 25 && this.held.y > 0.3;
    if (!tame) {
      this.look.copy(this.focus);
      return;
    }
    const blend = 1 - Math.exp(-Math.min(dt, 0.05) * 5);
    this.camera.position.copy(this.held).lerp(this.desired, blend);
    this.look.lerp(this.focus, blend);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }

  dispose(): void {
    this.viewport.removeEventListener("pointerdown", this.onDown);
    this.viewport.removeEventListener("pointermove", this.onMove);
    this.viewport.removeEventListener("pointerup", this.onUp);
    this.viewport.removeEventListener("pointercancel", this.onUp);
    this.viewport.removeEventListener("wheel", this.onWheel);
  }

  private onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, select")) return;
    if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true });
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.viewport.setPointerCapture(event.pointerId);
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.orbitYaw -= dx * 0.005;
    this.orbitPitch = clamp(this.orbitPitch + dy * 0.0035, 0.12, 1.45);
  };

  private onUp = (event: PointerEvent): void => {
    this.dragging = false;
    if (this.viewport.hasPointerCapture(event.pointerId)) {
      this.viewport.releasePointerCapture(event.pointerId);
    }
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.distance = clamp(this.distance + event.deltaY * 0.008, 4.5, 130);
  };
}
