import * as THREE from "three";
import { odomToWorld, type DrawOp } from "../api";
import type { SpawnPose } from "./vehicle";

/**
 * Student drawings, placed with the spawn transform.
 * The points arrive in the odometry frame the program estimates in.
 * This group never reads the true pose, and nothing it builds is sent back
 * to the worker.
 */
export class DebugDraw {
  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.group.name = "debug-draw";
    // Children sit at world coordinates, often far from the origin. A culled
    // parent would drop the whole cloud even when the points themselves opt out.
    this.group.frustumCulled = false;
    scene.add(this.group);
  }

  clear(): void {
    for (const child of [...this.group.children]) {
      child.removeFromParent();
      disposeObject(child);
    }
  }

  set(ops: readonly DrawOp[], spawn: SpawnPose): void {
    this.clear();
    for (const op of ops) {
      if (op.kind === "text") {
        const at = place(spawn, op.x, op.y, 0.46);
        this.group.add(textSprite(op.text, op.color, at));
        continue;
      }
      if (op.kind === "path" && op.points.length >= 2) {
        this.group.add(ribbon(op.points.map((point) => place(spawn, point.x, point.y, 0.46)), op.color));
      }
      if (op.kind === "points" && op.points.length > 0) this.group.add(markers(spawn, op.points, op.color));
    }
  }
}

function place(spawn: SpawnPose, x: number, y: number, height: number): THREE.Vector3 {
  const world = odomToWorld(spawn, { x, y });
  return new THREE.Vector3(world.x, height, world.z);
}

function ribbon(points: THREE.Vector3[], color: string): THREE.Mesh {
  const half = 0.08;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const point = points[i]!;
    positions.push(point.x + nx, point.y, point.z + nz, point.x - nx, point.y, point.z - nz);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, basic(color, 0.92));
}

/** A few centimetres off the floor. Pixel size, so a cloud stays a cloud. */
const DOT_Y = 0.035;
const TICK_Y = 0.05;
const TICK_LENGTH = 0.12;

function particleColor(base: THREE.Color, hot: THREE.Color, weight: number, target: THREE.Color): THREE.Color {
  // Weight only tints toward white. Darkening by weight hid the low-weight
  // majority of a spread cloud against the ground.
  target.copy(base).lerp(hot, weight * 0.45);
  return target;
}

function markers(spawn: SpawnPose, points: { x: number; y: number; yaw?: number; w?: number }[], color: string): THREE.Group {
  const group = new THREE.Group();
  group.frustumCulled = false;
  const count = points.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color);
  const hot = new THREE.Color("#f7fbff");
  let maxWeight = 0;
  for (const point of points) if (point.w !== undefined) maxWeight = Math.max(maxWeight, point.w);
  const weighted = maxWeight > 0;
  const scratch = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const point = points[i]!;
    const at = place(spawn, point.x, point.y, DOT_Y);
    positions[i * 3] = at.x;
    positions[i * 3 + 1] = at.y;
    positions[i * 3 + 2] = at.z;
    const weight = weighted ? Math.min(1, Math.max(0, (point.w ?? 0) / maxWeight)) : 1;
    particleColor(base, hot, weight, scratch);
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const dots = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: count >= 24 ? 5 : 7,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  );
  dots.frustumCulled = false;
  dots.renderOrder = 8;
  group.add(dots);

  const ticks: number[] = [];
  const tickColors: number[] = [];
  for (let i = 0; i < count; i++) {
    const point = points[i]!;
    if (point.yaw === undefined || !Number.isFinite(point.yaw)) continue;
    const at = place(spawn, point.x, point.y, TICK_Y);
    const weight = weighted ? Math.min(1, Math.max(0, (point.w ?? 0) / maxWeight)) : 1;
    particleColor(base, hot, weight, scratch);
    const dx = Math.cos(point.yaw) * TICK_LENGTH;
    const dy = Math.sin(point.yaw) * TICK_LENGTH;
    const tip = place(spawn, point.x + dx, point.y + dy, TICK_Y);
    ticks.push(at.x, at.y, at.z, tip.x, tip.y, tip.z);
    tickColors.push(scratch.r, scratch.g, scratch.b, scratch.r, scratch.g, scratch.b);
  }
  if (ticks.length >= 6) {
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ticks), 3));
    lines.setAttribute("color", new THREE.BufferAttribute(new Float32Array(tickColors), 3));
    const mesh = new THREE.LineSegments(
      lines,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    group.add(mesh);
  }
  return group;
}

function textSprite(text: string, color: string, at: THREE.Vector3): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Debug text canvas is unavailable.");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 28px IBM Plex Mono, ui-monospace, monospace";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 24), canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(at);
  sprite.position.y += 0.7;
  sprite.scale.set(1.8, 0.45, 1);
  return sprite;
}

function basic(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function disposeObject(object: THREE.Object3D): void {
  for (const child of [...object.children]) disposeObject(child);
  const mesh = object as THREE.Mesh;
  mesh.geometry?.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) {
    for (const item of material) disposeMaterial(item);
  } else if (material) {
    disposeMaterial(material);
  }
}

function disposeMaterial(material: THREE.Material): void {
  const mapped = material as THREE.SpriteMaterial;
  mapped.map?.dispose();
  material.dispose();
}
