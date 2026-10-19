import * as THREE from "three";
import type { LidarDebugPoint } from "../robots/types";

const MAX_POINTS = 360;

/** World-space points for the latest scan. Toggleable, main thread only. */
export class LidarView {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(MAX_POINTS * 3);
  private readonly colors = new Float32Array(MAX_POINTS * 3);
  private readonly points: THREE.Points;
  private enabled = true;

  constructor(scene: THREE.Scene) {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(
      this.geometry,
      new THREE.PointsMaterial({
        size: 0.08,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.points.visible = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  update(scan: readonly LidarDebugPoint[]): void {
    if (!this.enabled) return;
    const count = Math.min(scan.length, MAX_POINTS);
    let written = 0;
    for (let i = 0; i < count; i++) {
      const point = scan[i];
      if (!point?.hit) continue;
      const t = Math.min(1, point.range / 25);
      this.positions[written * 3] = point.x;
      this.positions[written * 3 + 1] = point.y;
      this.positions[written * 3 + 2] = point.z;
      // Near returns are amber, far returns are teal.
      this.colors[written * 3] = 0.95 - t * 0.7;
      this.colors[written * 3 + 1] = 0.45 + t * 0.4;
      this.colors[written * 3 + 2] = 0.25 + t * 0.45;
      written += 1;
    }
    this.geometry.setDrawRange(0, written);
    const position = this.geometry.getAttribute("position");
    const color = this.geometry.getAttribute("color");
    position.needsUpdate = true;
    color.needsUpdate = true;
  }
}
