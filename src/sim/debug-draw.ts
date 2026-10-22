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
      if (op.kind === "ellipse") this.group.add(ellipseRing(spawn, op));
      if (op.kind === "points" && op.points.length > 0) this.group.add(markers(spawn, op.points, op.color));
    }
  }
}

function place(spawn: SpawnPose, x: number, y: number, height: number): THREE.Vector3 {
  const world = odomToWorld(spawn, { x, y });
  return new THREE.Vector3(world.x, height, world.z);
}

function ribbon(points: THREE.Vector3[], color: string, half = 0.08): THREE.Mesh {
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
const DOT_Y = 0.04;
const TICK_Y = 0.06;
const TICK_LENGTH = 0.28;

function particleColor(base: THREE.Color, hot: THREE.Color, weight: number, target: THREE.Color): THREE.Color {
  // Stay in the magenta. Lightening toward white is what disappeared into dirt.
  target.copy(base).lerp(hot, 0.12 * weight);
  return target;
}

function pointCloud(
  positions: Float32Array,
  material: THREE.PointsMaterial,
  order: number,
): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dots = new THREE.Points(geometry, material);
  dots.frustumCulled = false;
  dots.renderOrder = order;
  return dots;
}

/** 2-sigma radius of the cloud, in metres. Under a metre the filter has pulled in. */
function cloudSpread(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  let mx = 0;
  let my = 0;
  for (const point of points) {
    mx += point.x;
    my += point.y;
  }
  mx /= points.length;
  my /= points.length;
  let variance = 0;
  for (const point of points) variance += (point.x - mx) ** 2 + (point.y - my) ** 2;
  return 2 * Math.sqrt(variance / points.length);
}

/** Even stride, so a tight cloud stays a sample of the filter rather than a disc. */
function thinCloud<T>(points: T[], limit: number): T[] {
  if (points.length <= limit) return points;
  const out: T[] = [];
  const step = points.length / limit;
  for (let i = 0; i < limit; i += 1) out.push(points[Math.floor(i * step)]!);
  return out;
}

function markers(spawn: SpawnPose, points: { x: number; y: number; yaw?: number; w?: number }[], color: string): THREE.Group {
  const group = new THREE.Group();
  group.frustumCulled = false;
  const converged = cloudSpread(points) < 1;
  const shown = converged ? thinCloud(points, 150) : points;
  const count = shown.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color);
  const hot = new THREE.Color("#ff7ae8");
  let maxWeight = 0;
  for (const point of shown) if (point.w !== undefined) maxWeight = Math.max(maxWeight, point.w);
  const weighted = maxWeight > 0;
  const scratch = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const point = shown[i]!;
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
  if (!converged) {
    const halo = pointCloud(
      positions,
      new THREE.PointsMaterial({
        size: count >= 24 ? 6 : 8,
        sizeAttenuation: false,
        color: "#140014",
        transparent: true,
        opacity: 0.18,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
      4,
    );
    group.add(halo);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const dots = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: converged ? 2 : count >= 24 ? 3.5 : 5,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: converged ? 0.9 : 0.45,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  );
  dots.frustumCulled = false;
  dots.renderOrder = 6;
  group.add(dots);

  if (!converged) {
    const tick = headingTicks(spawn, thinCloud(shown, 80), base, hot, weighted, maxWeight);
    if (tick) group.add(tick);
  }
  return group;
}

/** 28 cm heading marks. A few centimetres wide so the tick survives a far camera. */
function headingTicks(
  spawn: SpawnPose,
  points: { x: number; y: number; yaw?: number; w?: number }[],
  base: THREE.Color,
  hot: THREE.Color,
  weighted: boolean,
  maxWeight: number,
): THREE.Mesh | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const half = 0.045;
  const scratch = new THREE.Color();
  for (const point of points) {
    if (point.yaw === undefined || !Number.isFinite(point.yaw)) continue;
    const weight = weighted ? Math.min(1, Math.max(0, (point.w ?? 0) / maxWeight)) : 1;
    particleColor(base, hot, weight, scratch);
    const dx = Math.cos(point.yaw) * TICK_LENGTH;
    const dy = Math.sin(point.yaw) * TICK_LENGTH;
    const at = place(spawn, point.x, point.y, TICK_Y);
    const tip = place(spawn, point.x + dx, point.y + dy, TICK_Y);
    const len = Math.hypot(tip.x - at.x, tip.z - at.z) || 1;
    const nx = (-(tip.z - at.z) / len) * half;
    const nz = ((tip.x - at.x) / len) * half;
    const quad = [
      at.x + nx, at.y, at.z + nz,
      at.x - nx, at.y, at.z - nz,
      tip.x + nx, tip.y, tip.z + nz,
      at.x - nx, at.y, at.z - nz,
      tip.x - nx, tip.y, tip.z - nz,
      tip.x + nx, tip.y, tip.z + nz,
    ];
    positions.push(...quad);
    for (let i = 0; i < 6; i++) colors.push(scratch.r, scratch.g, scratch.b);
  }
  if (positions.length < 9) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

/** 2-sigma ring. A wide band when the cloud is large, a tight ring when it has collapsed. */
function ellipseRing(
  spawn: SpawnPose,
  op: { x: number; y: number; yaw: number; rx: number; ry: number; color: string },
): THREE.Group {
  const group = new THREE.Group();
  group.frustumCulled = false;
  const steps = 56;
  const upper: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const localX = Math.cos(t) * op.rx;
    const localY = Math.sin(t) * op.ry;
    const cos = Math.cos(op.yaw);
    const sin = Math.sin(op.yaw);
    upper.push(place(spawn, op.x + cos * localX - sin * localY, op.y + sin * localX + cos * localY, 0.09));
  }
  const minor = Math.min(op.rx, op.ry);
  // A yard-sized ring needs a wide band. A collapsed ring must stay a ring,
  // not a disc that covers the swarm.
  const half = minor > 4 ? Math.min(1.6, Math.max(0.45, minor * 0.04)) : Math.min(0.12, Math.max(0.055, minor * 0.1));
  const shade = ribbon(upper, "#1a1200", half + (minor > 4 ? 0.55 : 0.06));
  const ring = ribbon(upper, op.color, half);
  for (const [mesh, order] of [
    [shade, 8],
    [ring, 9],
  ] as const) {
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.depthTest = false;
    material.toneMapped = false;
    material.fog = false;
    material.opacity = 1;
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
