import * as THREE from "three";

const CAP = 2400;

/**
 * Teaching overlay drawn on the main thread.
 * The true trail and the odometry trail stay in this object. They are never
 * copied into a sensor frame or posted to the worker.
 */
export class PathOverlay {
  readonly group = new THREE.Group();
  private readonly truth: { x: number; y: number; z: number; speed: number }[] = [];
  private readonly odom: { x: number; z: number }[] = [];
  private truthLine: THREE.Line | null = null;
  private odomLine: THREE.Line | null = null;
  private shown = false;

  constructor(scene: THREE.Scene) {
    this.group.name = "teaching-paths";
    this.group.visible = false;
    scene.add(this.group);
  }

  get visible(): boolean {
    return this.shown;
  }

  setVisible(shown: boolean): void {
    this.shown = shown;
    this.group.visible = shown;
    if (shown) this.rebuild();
  }

  clear(): void {
    this.truth.length = 0;
    this.odom.length = 0;
    this.rebuild();
  }

  push(truth: { x: number; y: number; z: number }, speed: number, odom: { x: number; z: number }): void {
    this.truth.push({ x: truth.x, y: truth.y + 0.4, z: truth.z, speed });
    this.odom.push(odom);
    if (this.truth.length > CAP) {
      this.truth.splice(0, this.truth.length - CAP);
      this.odom.splice(0, this.odom.length - CAP);
    }
    if (this.shown && this.truth.length % 2 === 0) this.rebuild();
  }

  private rebuild(): void {
    this.truthLine?.removeFromParent();
    this.odomLine?.removeFromParent();
    this.truthLine?.geometry.dispose();
    this.odomLine?.geometry.dispose();
    this.truthLine = null;
    this.odomLine = null;
    if (!this.shown || this.truth.length < 2) return;

    let maxSpeed = 0.5;
    for (const point of this.truth) maxSpeed = Math.max(maxSpeed, point.speed);
    const positions = new Float32Array(this.truth.length * 3);
    const colors = new Float32Array(this.truth.length * 3);
    this.truth.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
      const tint = speedTint(point.speed / maxSpeed);
      colors[index * 3] = tint[0];
      colors[index * 3 + 1] = tint[1];
      colors[index * 3 + 2] = tint[2];
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.truthLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.group.add(this.truthLine);

    const odomPositions = new Float32Array(this.odom.length * 3);
    this.odom.forEach((point, index) => {
      odomPositions[index * 3] = point.x;
      odomPositions[index * 3 + 1] = 0.28;
      odomPositions[index * 3 + 2] = point.z;
    });
    const odomGeometry = new THREE.BufferGeometry();
    odomGeometry.setAttribute("position", new THREE.BufferAttribute(odomPositions, 3));
    this.odomLine = new THREE.Line(
      odomGeometry,
      new THREE.LineBasicMaterial({ color: 0xe3a23a }),
    );
    this.group.add(this.odomLine);
  }
}

function speedTint(t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  if (u < 0.5) return [lerp(0.25, 0.94, u * 2), lerp(0.55, 0.78, u * 2), lerp(0.75, 0.28, u * 2)];
  return [lerp(0.94, 0.86, (u - 0.5) * 2), lerp(0.78, 0.3, (u - 0.5) * 2), lerp(0.28, 0.24, (u - 0.5) * 2)];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
