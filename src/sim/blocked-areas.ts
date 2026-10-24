import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";

type Rapier = typeof RAPIER;
type World = InstanceType<Rapier["World"]>;
type Collider = InstanceType<Rapier["Collider"]>;

/**
 * Ground footprint of every static collider. The slab is short on purpose:
 * a full-height copy of a trunk read as a red column through the canopy,
 * and a ball read as a floating blob. The shape is the collider's own
 * world pose, so the shade cannot drift from the body the car hits.
 */
export const BLOCKED_SLAB = { y: 0.04, height: 0.82 };

export interface BlockedFootprint {
  x: number;
  z: number;
  y: number;
  height: number;
  /** World-space XZ hull of the collider. */
  points: { x: number; z: number }[];
}

const scratch = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();

export class BlockedAreas {
  private readonly group = new THREE.Group();
  private readonly material: THREE.MeshBasicMaterial;
  readonly root: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.group.name = "blocked-areas";
    this.material = new THREE.MeshBasicMaterial({
      color: 0xff4d3a,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.root = this.group;
    scene.add(this.group);
    this.group.visible = false;
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  rebuild(RAPIER: Rapier, world: World): void {
    this.clear();
    world.forEachCollider((collider) => {
      const parent = collider.parent();
      if (parent && parent.bodyType() === RAPIER.RigidBodyType.Dynamic) return;
      const footprint = colliderFootprint(RAPIER, collider);
      if (!footprint) return;
      const mesh = new THREE.Mesh(slabGeometry(footprint), this.material);
      mesh.name = "blocked-footprint";
      mesh.position.set(footprint.x, footprint.y, footprint.z);
      mesh.renderOrder = 2;
      mesh.userData.footprint = footprint;
      this.group.add(mesh);
    });
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.group.removeFromParent();
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
      child.removeFromParent();
    }
  }
}

/** World XZ hull of one collider, or null for the ground slab and unknown shapes. */
export function colliderFootprint(RAPIER: Rapier, collider: Collider): BlockedFootprint | null {
  const local = localSamples(RAPIER, collider);
  if (!local) return null;
  const translation = collider.translation();
  const rotation = collider.rotation();
  scratchQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
  const flat: { x: number; z: number }[] = [];
  for (const point of local) {
    scratch.copy(point).applyQuaternion(scratchQuat);
    flat.push({ x: translation.x + scratch.x, z: translation.z + scratch.z });
  }
  const hull = convexHull(flat);
  if (hull.length < 3) return null;
  return { x: translation.x, z: translation.z, y: BLOCKED_SLAB.y, height: BLOCKED_SLAB.height, points: hull };
}

function localSamples(RAPIER: Rapier, collider: Collider): THREE.Vector3[] | null {
  const kind = collider.shapeType();
  if (kind === RAPIER.ShapeType.Cuboid) {
    const half = collider.halfExtents();
    if (half.x > 40 || half.y > 40 || half.z > 40) return null;
    const samples: THREE.Vector3[] = [];
    for (const x of [-half.x, half.x]) {
      for (const y of [-half.y, half.y]) {
        for (const z of [-half.z, half.z]) samples.push(new THREE.Vector3(x, y, z));
      }
    }
    return samples;
  }
  if (kind === RAPIER.ShapeType.Ball) {
    const radius = collider.radius();
    if (radius > 40) return null;
    return ring(radius, 0, 20);
  }
  if (kind === RAPIER.ShapeType.Cylinder) {
    const radius = collider.radius();
    const halfHeight = collider.halfHeight();
    if (radius > 40 || halfHeight > 40) return null;
    return [...ring(radius, halfHeight, 20), ...ring(radius, -halfHeight, 20)];
  }
  if (kind === RAPIER.ShapeType.Cone) {
    const radius = collider.radius();
    const halfHeight = collider.halfHeight();
    if (radius > 40 || halfHeight > 40) return null;
    return [...ring(radius, -halfHeight, 20), new THREE.Vector3(0, halfHeight, 0)];
  }
  return null;
}

function ring(radius: number, y: number, segments: number): THREE.Vector3[] {
  const samples: THREE.Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    samples.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  return samples;
}

/** Monotone chain. Collinear points are dropped so a circle's hull stays the ring. */
function convexHull(points: readonly { x: number; z: number }[]): { x: number; z: number }[] {
  const unique = new Map<string, { x: number; z: number }>();
  for (const point of points) unique.set(`${point.x.toFixed(4)},${point.z.toFixed(4)}`, point);
  const sorted = [...unique.values()].sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length <= 2) return sorted;
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: { x: number; z: number }[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: { x: number; z: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function slabGeometry(footprint: BlockedFootprint): THREE.BufferGeometry {
  const points = footprint.points;
  const count = points.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < count; i++) positions.push(points[i]!.x - footprint.x, 0, points[i]!.z - footprint.z);
  for (let i = 0; i < count; i++) {
    positions.push(points[i]!.x - footprint.x, footprint.height, points[i]!.z - footprint.z);
  }
  for (let i = 1; i < count - 1; i++) {
    indices.push(0, i, i + 1);
    indices.push(count, count + i + 1, count + i);
  }
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    indices.push(i, next, count + next);
    indices.push(i, count + next, count + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
