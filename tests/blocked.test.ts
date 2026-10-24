import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";
import { buildCourseSolids, cityTrunkScale, solidQuaternion, type Solid } from "../src/sim/course";
import { BLOCKED_SLAB, BlockedAreas, type BlockedFootprint } from "../src/sim/blocked-areas";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import {
  SCANNED_TRUNK,
  anchoredInstance,
  bakeObject,
  hashYaw,
  solidFoot,
  worldAnchorShift,
  type PropInstance,
  type PropTemplate,
} from "../src/sim/props";
import { buildForestSolids, forestDressing, forestTreeDress } from "../src/sim/worlds/forest";
import { buildTrackSolids } from "../src/sim/worlds/track";
import { buildWarehouseSolids } from "../src/sim/worlds/warehouse";

function addSolid(world: InstanceType<typeof RAPIER.World>, solid: Solid): void {
  const q = solidQuaternion(solid.yaw, solid.pitch);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(solid.x, solid.y, solid.z).setRotation(q),
  );
  const desc =
    solid.shape === "cuboid"
      ? RAPIER.ColliderDesc.cuboid(solid.hx, solid.hy, solid.hz)
      : solid.shape === "cylinder"
        ? RAPIER.ColliderDesc.cylinder(solid.hy, solid.hx)
        : solid.shape === "cone"
          ? RAPIER.ColliderDesc.cone(solid.hy, solid.hx)
          : RAPIER.ColliderDesc.ball(solid.hx);
  world.createCollider(desc, body);
}

function footprintOf(mesh: THREE.Mesh): BlockedFootprint {
  return mesh.userData.footprint as BlockedFootprint;
}

function axisUp(collider: InstanceType<typeof RAPIER.Collider>): number {
  const rotation = collider.rotation();
  return new THREE.Vector3(0, 1, 0)
    .applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
    .y;
}

async function expectFootprints(name: string, solids: Solid[]): Promise<void> {
  await RAPIER.init({});
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(110, 0.5, 110), ground);
  for (const solid of solids) addSolid(world, solid);
  const scene = new THREE.Scene();
  const blocked = new BlockedAreas(scene);
  blocked.rebuild(RAPIER, world);
  const meshes = blocked.root.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  const colliders: InstanceType<typeof RAPIER.Collider>[] = [];
  world.forEachCollider((collider) => {
    const parent = collider.parent();
    if (parent && parent.bodyType() === RAPIER.RigidBodyType.Dynamic) return;
    const kind = collider.shapeType();
    if (kind === RAPIER.ShapeType.Cuboid) {
      const half = collider.halfExtents();
      if (half.x > 40 || half.y > 40 || half.z > 40) return;
    } else if (kind === RAPIER.ShapeType.Ball || kind === RAPIER.ShapeType.Cylinder || kind === RAPIER.ShapeType.Cone) {
      if (collider.radius() > 40) return;
      if (kind !== RAPIER.ShapeType.Ball && collider.halfHeight() > 40) return;
    } else {
      return;
    }
    colliders.push(collider);
  });
  expect(meshes.length, name).toBe(colliders.length);
  expect(meshes.length, name).toBeGreaterThan(8);

  colliders.forEach((collider, index) => {
    const mesh = meshes[index]!;
    const translation = collider.translation();
    const footprint = footprintOf(mesh);
    expect(mesh.position.x, name).toBeCloseTo(translation.x, 4);
    expect(mesh.position.z, name).toBeCloseTo(translation.z, 4);
    expect(mesh.position.y, name).toBeCloseTo(BLOCKED_SLAB.y, 4);
    expect(mesh.quaternion.w, name).toBeCloseTo(1, 5);
    expect(footprint.height, name).toBe(BLOCKED_SLAB.height);
    expect(footprint.height, name).toBeLessThan(1.2);
    if (translation.y > 1.2) expect(mesh.position.y, name).toBeLessThan(translation.y - 0.5);

    const position = mesh.geometry.getAttribute("position");
    expect(position.count, name).toBe(footprint.points.length * 2);
    for (let i = 0; i < footprint.points.length; i++) {
      const point = footprint.points[i]!;
      expect(position.getX(i) + mesh.position.x, name).toBeCloseTo(point.x, 4);
      expect(position.getZ(i) + mesh.position.z, name).toBeCloseTo(point.z, 4);
      expect(position.getY(i), name).toBeCloseTo(0, 5);
      expect(position.getY(i + footprint.points.length), name).toBeCloseTo(BLOCKED_SLAB.height, 5);
    }

    const kind = collider.shapeType();
    const up = axisUp(collider);
    if (kind === RAPIER.ShapeType.Ball || kind === RAPIER.ShapeType.Cone || (kind === RAPIER.ShapeType.Cylinder && up > 0.98)) {
      for (const point of footprint.points) {
        expect(Math.hypot(point.x - translation.x, point.z - translation.z), name).toBeCloseTo(collider.radius(), 3);
      }
    }
    if (kind === RAPIER.ShapeType.Cylinder && up < 0.5) {
      let span = 0;
      for (let a = 0; a < footprint.points.length; a++) {
        for (let b = a + 1; b < footprint.points.length; b++) {
          const left = footprint.points[a]!;
          const right = footprint.points[b]!;
          span = Math.max(span, Math.hypot(left.x - right.x, left.z - right.z));
        }
      }
      expect(span, name).toBeCloseTo(Math.hypot(collider.halfHeight() * 2, collider.radius() * 2), 2);
      expect(span, name).toBeGreaterThan(collider.radius() * 2 + 0.2);
    }
    if (kind === RAPIER.ShapeType.Cuboid) {
      const half = collider.halfExtents();
      const rotation = collider.rotation();
      const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      const corners: { x: number; z: number }[] = [];
      for (const x of [-half.x, half.x]) {
        for (const y of [-half.y, half.y]) {
          for (const z of [-half.z, half.z]) {
            const point = new THREE.Vector3(x, y, z).applyQuaternion(quaternion);
            corners.push({ x: translation.x + point.x, z: translation.z + point.z });
          }
        }
      }
      for (const corner of corners) {
        const inside = footprint.points.some((point) => Math.hypot(point.x - corner.x, point.z - corner.z) < 1e-3);
        expect(inside || pointInHull(footprint.points, corner), `${name} corner`).toBe(true);
      }
      for (const point of footprint.points) {
        const onCorner = corners.some((corner) => Math.hypot(point.x - corner.x, point.z - corner.z) < 1e-3);
        expect(onCorner, name).toBe(true);
      }
    }
  });
  blocked.dispose();
}

function pointInHull(hull: readonly { x: number; z: number }[], point: { x: number; z: number }): boolean {
  let sign = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const cross = (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
    if (Math.abs(cross) < 1e-4) continue;
    const next = Math.sign(cross);
    if (sign !== 0 && next !== sign) return false;
    sign = next;
  }
  return true;
}

(globalThis as { self?: typeof globalThis }).self ??= globalThis;

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
gltfLoader.setKTX2Loader({
  load(_url: string, onLoad: (texture: THREE.Texture) => void) {
    const texture = new THREE.DataTexture(new Uint8Array([180, 160, 120, 255]), 1, 1);
    texture.needsUpdate = true;
    onLoad(texture);
  },
} as unknown as THREE.Loader);

async function loadBaked(file: string): Promise<PropTemplate> {
  const buf = readFileSync(`public/assets/models/${file}`);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await gltfLoader.parseAsync(bytes, "");
  return bakeObject(gltf.scene);
}

interface MeshCandidate {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  radius: number;
  /** Surface area over the disc of `radius`. Sparse needles stay well under 1. */
  density: number;
}

function footprintReach(solid: Solid): number {
  if (Math.abs(solid.pitch) > 0.4) return Math.max(solid.hx, solid.hy, solid.hz);
  if (solid.shape === "cuboid") {
    const cos = Math.abs(Math.cos(solid.yaw));
    const sin = Math.abs(Math.sin(solid.yaw));
    return Math.max(solid.hx * cos + solid.hz * sin, solid.hx * sin + solid.hz * cos);
  }
  return Math.max(solid.hx, solid.hz);
}

function meshCandidates(template: PropTemplate, item: PropInstance): MeshCandidate[] {
  const found: MeshCandidate[] = [];
  for (const part of template.parts) {
    const candidate = candidateFrom(part.geometry, item, template.height);
    if (candidate) found.push(candidate);
  }
  const contact = contactCandidate(template, item);
  if (contact) found.push(contact);
  return found;
}

function candidateFrom(geometry: THREE.BufferGeometry, item: PropInstance, _height: number): MeshCandidate | null {
  return measureGeometry(geometry, item, Number.POSITIVE_INFINITY);
}

function contactCandidate(template: PropTemplate, item: PropInstance): MeshCandidate | null {
  let merged: MeshCandidate | null = null;
  for (const part of template.parts) {
    const band = measureGeometry(part.geometry, item, template.height * 0.22);
    if (!band) continue;
    if (!merged) {
      merged = band;
      continue;
    }
    merged = {
      minX: Math.min(merged.minX, band.minX),
      maxX: Math.max(merged.maxX, band.maxX),
      minZ: Math.min(merged.minZ, band.minZ),
      maxZ: Math.max(merged.maxZ, band.maxZ),
      radius: Math.max(merged.radius, band.radius),
      density: merged.density + band.density,
    };
  }
  return merged;
}

function measureGeometry(geometry: THREE.BufferGeometry, item: PropInstance, yMax: number): MeshCandidate | null {
  const pos = geometry.getAttribute("position");
  if (!pos) return null;
  const index = geometry.getIndex();
  const sx = item.scale3?.x ?? item.scale;
  const sy = item.scale3?.y ?? item.scale;
  const sz = item.scale3?.z ?? item.scale;
  const yaw = item.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const count = index ? index.count : pos.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let area = 0;
  let tris = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    const ia = at(i);
    const ib = at(i + 1);
    const ic = at(i + 2);
    const ay = pos.getY(ia) * sy;
    const by = pos.getY(ib) * sy;
    const cy = pos.getY(ic) * sy;
    if ((ay + by + cy) / 3 > yMax) continue;
    const ax = pos.getX(ia) * sx;
    const az = pos.getZ(ia) * sz;
    const bx = pos.getX(ib) * sx;
    const bz = pos.getZ(ib) * sz;
    const cx = pos.getX(ic) * sx;
    const cz = pos.getZ(ic) * sz;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const tri = Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) * 0.5;
    if (tri < 1e-8) continue;
    area += tri;
    tris += 1;
    for (const [lx, lz] of [
      [ax, az],
      [bx, bz],
      [cx, cz],
    ] as const) {
      const x = item.x + lx * cos + lz * sin;
      const z = item.z - lx * sin + lz * cos;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  if (tris < 4) return null;
  const radius = Math.max((maxX - minX) / 2, (maxZ - minZ) / 2);
  if (radius < 0.02) return null;
  return { minX, maxX, minZ, maxZ, radius, density: area / (Math.PI * radius * radius) };
}

function footprintMatches(candidate: MeshCandidate, x: number, z: number, reach: number, loose: boolean): boolean {
  const nearestX = Math.min(Math.max(x, candidate.minX), candidate.maxX);
  const nearestZ = Math.min(Math.max(z, candidate.minZ), candidate.maxZ);
  if (Math.hypot(nearestX - x, nearestZ - z) > 0.35) return false;
  const ratio = candidate.radius / reach;
  // Round trunks, stones, and logs have to land on a part about the same
  // size. A cuboid crate is scaled to its height, so its base can differ
  // a little more. Canopy bounds are wider than either and do not count.
  return ratio >= 0.4 && ratio <= (loose ? 2.9 : 1.85);
}

function cityProp(
  solid: Solid,
  props: Record<string, PropTemplate>,
): { template: PropTemplate; item: PropInstance } | null {
  if (solid.look === "tree" || solid.look === "pine") {
    const template = solid.look === "pine" ? props.pine : props.broadleaf;
    const scale = cityTrunkScale(solid);
    if (!template || scale == null) return null;
    const yaw = hashYaw(solid.x, solid.z);
    return { template, item: anchoredInstance(template, solid.x, solid.z, solidFoot(solid), yaw, scale) };
  }
  if (solid.look === "bush" && props.shrub) {
    const scale = solid.hx / Math.max(0.05, props.shrub.radius);
    return { template: props.shrub, item: anchoredInstance(props.shrub, solid.x, solid.z, solidFoot(solid), hashYaw(solid.x, solid.z), scale) };
  }
  if (solid.look === "rock" && props.boulder) {
    const scale = solid.hx / Math.max(0.05, props.boulder.radius);
    return { template: props.boulder, item: anchoredInstance(props.boulder, solid.x, solid.z, solidFoot(solid), hashYaw(solid.x, solid.z), scale) };
  }
  if (solid.look === "bench" && props.bench) {
    const scale = (Math.max(solid.hx, solid.hz) * 2) / (props.bench.radius * 2);
    return { template: props.bench, item: anchoredInstance(props.bench, solid.x, solid.z, solidFoot(solid), solid.yaw, scale) };
  }
  if (solid.look === "light" && props.lamp) {
    const scale = (solid.hy * 2) / props.lamp.height;
    return { template: props.lamp, item: anchoredInstance(props.lamp, solid.x, solid.z, solidFoot(solid), solid.yaw, scale) };
  }
  return cargoProp(solid, props);
}

function cargoProp(
  solid: Solid,
  props: Record<string, PropTemplate>,
  heightMul = 1,
): { template: PropTemplate; item: PropInstance } | null {
  if (solid.look === "crate" && solid.hy < 0.35) return null;
  if (solid.look !== "barrel" && solid.look !== "crate" && solid.look !== "pallet") return null;
  const template = solid.look === "barrel" ? props.barrel : props.crate;
  if (!template) return null;
  const yaw = solid.look === "barrel" ? hashYaw(solid.x, solid.z) : solid.yaw;
  const scale = (solid.hy * 2 * heightMul) / template.height;
  return { template, item: anchoredInstance(template, solid.x, solid.z, solidFoot(solid), yaw, scale) };
}

function fake(anchor: { x: number; z: number; radius: number }, radius = 1, size = { x: 1, y: 1, z: 1 }): PropTemplate {
  return { parts: [], height: 1, radius, size, anchor };
}

describe("blocked footprints", () => {
  it("matches every forest collider pose with a short ground slab", async () => {
    await expectFootprints("forest", buildForestSolids());
  });

  it("matches city, track, and warehouse colliders the same way", async () => {
    await expectFootprints("city", buildCourseSolids());
    await expectFootprints("track", buildTrackSolids());
    await expectFootprints("warehouse", buildWarehouseSolids());
  });

  it("fits every forest trunk to the scanned wood and seats the mesh on that collider", () => {
    const solids = buildForestSolids();
    for (const solid of solids) {
      const dress = forestTreeDress(solid);
      if (!dress) continue;
      expect(solid.hx, `${dress.file} ${solid.x},${solid.z}`).toBeCloseTo(SCANNED_TRUNK[dress.file].radius * dress.scale, 5);
      expect(solid.hz).toBe(solid.hx);
    }
    const props = {
      broadleaf: fake({ x: -0.11, z: -0.74, radius: 0.291 }, 2.1),
      bushy: fake({ x: 0.19, z: -0.11, radius: 0.495 }, 1),
      pine: fake({ x: 0, z: 0, radius: 0.065 }, 0.42),
      boulder: fake({ x: 0.13, z: -0.05, radius: 0.68 }, 0.91),
      rock: fake({ x: 0, z: 0, radius: 0.12 }, 0.16),
      shrub: fake({ x: -0.02, z: 0.08, radius: 0.24 }, 0.82),
      log: fake({ x: -0.01, z: -0.25, radius: 0.7 }, 1.53, { x: 0.28, y: 0.29, z: 3.05 }),
    };
    const dressed = forestDressing(solids, props);
    const broad = dressed.find((entry) => entry.template === props.broadleaf);
    expect(broad).toBeTruthy();
    const shift = worldAnchorShift(props.broadleaf.anchor, broad!.item.yaw ?? 0, broad!.item.scale, broad!.item.scale);
    expect(Math.hypot(shift.x, shift.z)).toBeGreaterThan(0.8);
    const landed = solids.some(
      (solid) => Math.hypot(solid.x - (broad!.item.x + shift.x), solid.z - (broad!.item.z + shift.z)) < 1e-3,
    );
    expect(landed).toBe(true);

    for (const { template, item } of dressed) {
      if (template !== props.log || !item.scale3) continue;
      const solid = solids.find(
        (candidate) => Math.abs(candidate.x - (item.shadeX ?? 99)) < 1e-6 && Math.abs(candidate.z - (item.shadeZ ?? 99)) < 1e-6,
      );
      expect(solid?.look).toBe("log");
      expect(item.scale3.x * template.size.x).toBeCloseTo(solid!.hx * 2, 4);
      expect(item.scale3.y * template.size.y).toBeCloseTo(solid!.hx * 2, 4);
      expect(item.scale3.z * template.size.z).toBeCloseTo(solid!.hy * 2, 4);
      const logShift = worldAnchorShift(template.anchor, item.yaw ?? 0, item.scale3.x, item.scale3.z);
      expect(item.x + logShift.x).toBeCloseTo(solid!.x, 4);
      expect(item.z + logShift.z).toBeCloseTo(solid!.z, 4);
    }

    for (const { template, item } of dressed) {
      if (template !== props.boulder && template !== props.rock && template !== props.shrub) continue;
      const solid = solids.find(
        (candidate) => Math.abs(candidate.x - (item.shadeX ?? 99)) < 1e-6 && Math.abs(candidate.z - (item.shadeZ ?? 99)) < 1e-6,
      );
      expect(solid).toBeTruthy();
      expect(template.radius * item.scale).toBeCloseTo(solid!.hx, 4);
    }
  });

  it("gives every forest collider a rendered mesh on that footprint", async () => {
    const props = {
      broadleaf: await loadBaked("broadleaf.glb"),
      pine: await loadBaked("pine.glb"),
      bushy: await loadBaked("bushy.glb"),
      shrub: await loadBaked("shrub.glb"),
      boulder: await loadBaked("boulder.glb"),
      rock: await loadBaked("rock.glb"),
      log: await loadBaked("log.glb"),
    };
    const solids = buildForestSolids();
    const dressed = forestDressing(solids, props);
    expect(props.pine.parts.some((part) => part.geometry.userData.trunk === true)).toBe(true);
    expect(props.pine.anchor.radius).toBeLessThan(props.pine.radius * 0.3);
    expect(props.broadleaf.parts.some((part) => part.geometry.userData.trunk === true)).toBe(false);
    const trunk = props.pine.parts.find((part) => part.geometry.userData.trunk === true)!;
    trunk.geometry.computeBoundingBox();
    const trunkBox = trunk.geometry.boundingBox!;
    const trunkRadius = Math.max(trunkBox.max.x - trunkBox.min.x, trunkBox.max.z - trunkBox.min.z) / 2;
    expect(trunkRadius).toBeCloseTo(props.pine.anchor.radius, 2);

    const covered = new Set(dressed.map((entry) => entry.solid));
    const misses: string[] = [];
    for (const solid of solids) {
      const where = `${solid.look} (${solid.x.toFixed(1)},${solid.z.toFixed(1)})`;
      const entry = dressed.find((candidate) => candidate.solid === solid);
      if (!entry) {
        if (solid.look !== "fence") misses.push(`${where} has no mesh`);
        continue;
      }
      const reach = footprintReach(solid);
      const candidates = meshCandidates(entry.template, entry.item);
      const hit = candidates.some((candidate) => footprintMatches(candidate, solid.x, solid.z, reach, solid.shape === "cuboid"));
      if (!hit) {
        misses.push(
          `${where} reach ${reach.toFixed(2)} ${candidates.map((c) => `${c.radius.toFixed(2)}/${c.density.toFixed(2)}`).join(" ")}`,
        );
      }
    }
    expect(covered.size).toBe(dressed.length);
    expect(misses).toEqual([]);
  });

  it("gives city, track, and warehouse colliders a rendered mesh on that footprint", async () => {
    const props = {
      broadleaf: await loadBaked("broadleaf.glb"),
      pine: await loadBaked("pine.glb"),
      shrub: await loadBaked("shrub.glb"),
      boulder: await loadBaked("boulder.glb"),
      barrel: await loadBaked("barrel.glb"),
      crate: await loadBaked("crate.glb"),
      bench: await loadBaked("bench.glb"),
      lamp: await loadBaked("lamp.glb"),
    };
    const procedural = new Set([
      "fence",
      "foam",
      "cone",
      "shelf",
      "barrier",
      "building",
      "silo",
      "planter",
      "car",
      "dumpster",
      "bollard",
      "sign",
      "ramp",
      "concrete",
      "shelter",
      "signal",
      "fountain",
      "steel",
    ]);
    const misses: string[] = [];
    const check = (world: string, solid: Solid, template: PropTemplate, item: PropInstance) => {
      const reach = footprintReach(solid);
      const candidates = meshCandidates(template, item);
      const hit = candidates.some((candidate) => footprintMatches(candidate, solid.x, solid.z, reach, solid.shape === "cuboid"));
      if (!hit) {
        misses.push(
          `${world} ${solid.look} (${solid.x.toFixed(1)},${solid.z.toFixed(1)}) reach ${reach.toFixed(2)} ${candidates.map((c) => c.radius.toFixed(2)).join(",")}`,
        );
      }
    };
    for (const solid of buildCourseSolids()) {
      const item = cityProp(solid, props);
      if (item) check("city", solid, item.template, item.item);
      else if (solid.look === "crate" && solid.hy < 0.35) {
        // The deck keeps the box mesh built from the collider.
      } else if (!procedural.has(solid.look)) misses.push(`city ${solid.look} has no mesh`);
    }
    for (const solid of buildTrackSolids()) {
      const item = cargoProp(solid, props);
      if (item) check("track", solid, item.template, item.item);
      else if (!procedural.has(solid.look)) misses.push(`track ${solid.look} has no mesh`);
    }
    for (const solid of buildWarehouseSolids()) {
      const item = cargoProp(solid, props, solid.look === "pallet" ? 0.72 : 1);
      if (item) check("warehouse", solid, item.template, item.item);
      else if (!procedural.has(solid.look)) misses.push(`warehouse ${solid.look} has no mesh`);
    }
    expect(misses).toEqual([]);
  });

  it("fits city pines and broadleaf to the same scanned radius", () => {
    for (const solid of buildCourseSolids()) {
      const scale = cityTrunkScale(solid);
      if (scale == null) continue;
      const trunk = solid.look === "pine" ? SCANNED_TRUNK.pine : SCANNED_TRUNK.broadleaf;
      expect(solid.hx, `${solid.look} ${solid.x},${solid.z}`).toBeCloseTo(trunk.radius * scale, 5);
      expect(solid.hz).toBe(solid.hx);
    }
  });
});
