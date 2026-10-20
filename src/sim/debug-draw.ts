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
        const at = place(spawn, op.x, op.y);
        this.group.add(textSprite(op.text, op.color, at));
        continue;
      }
      const points = op.points.map((point) => place(spawn, point.x, point.y));
      if (op.kind === "path" && points.length >= 2) this.group.add(ribbon(points, op.color));
      if (op.kind === "points") {
        for (const point of points) this.group.add(marker(point, op.color));
      }
    }
  }
}

function place(spawn: SpawnPose, x: number, y: number): THREE.Vector3 {
  const world = odomToWorld(spawn, { x, y });
  return new THREE.Vector3(world.x, 0.46, world.z);
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

function marker(point: THREE.Vector3, color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), basic(color, 1));
  mesh.position.copy(point);
  mesh.position.y += 0.12;
  return mesh;
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
