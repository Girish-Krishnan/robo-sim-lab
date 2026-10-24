import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";
import { buildCourseSolids, cityTrunkScale, solidQuaternion, type Solid } from "../src/sim/course";
import { BLOCKED_SLAB, BlockedAreas, type BlockedFootprint } from "../src/sim/blocked-areas";
import { SCANNED_TRUNK, worldAnchorShift, type PropTemplate } from "../src/sim/props";
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
      pine: fake({ x: -0.02, z: 0.05, radius: 0.213 }, 0.42),
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
