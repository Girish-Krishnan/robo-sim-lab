import * as THREE from "three";
import { clamp } from "../api";
import type { ChassisFocus } from "../robots/types";

/** Chase camera. Drag orbits around the car; the car stays in frame. */
export class ChaseCamera {
  private orbitYaw = 0.55;
  private orbitPitch = 0.42;
  private distance = 9.2;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly desired = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly yawQuat = new THREE.Quaternion();

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
    this.orbitYaw = 0.55;
    this.orbitPitch = 0.42;
    this.distance = 9.2;
  }

  update(dt: number, target: ChassisFocus): void {
    const horiz = this.distance * Math.cos(this.orbitPitch);
    this.offset.set(
      Math.sin(this.orbitYaw) * horiz,
      this.distance * Math.sin(this.orbitPitch) + 0.4,
      -Math.cos(this.orbitYaw) * horiz,
    );
    // Car yaw is CCW about world up; Three.js rotation.y is the opposite sign.
    this.yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -target.yaw);
    this.offset.applyQuaternion(this.yawQuat);
    this.focus.set(target.x, target.y + 0.7, target.z);
    this.desired.copy(this.focus).add(this.offset);
    const blend = 1 - Math.exp(-dt * 5);
    this.camera.position.lerp(this.desired, blend);
    this.look.lerp(this.focus, blend);
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
    this.orbitPitch = clamp(this.orbitPitch + dy * 0.0035, 0.12, 1.15);
  };

  private onUp = (event: PointerEvent): void => {
    this.dragging = false;
    if (this.viewport.hasPointerCapture(event.pointerId)) {
      this.viewport.releasePointerCapture(event.pointerId);
    }
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.distance = clamp(this.distance + event.deltaY * 0.008, 4.5, 22);
  };
}
