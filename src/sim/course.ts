import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { quatRotate } from "../api/math";
import type { GraphicsQuality } from "./scene";
import { isKept, loadPropKit, tileBox, tileUvs, TILES_PER_METER, type PropKit } from "./surfaces";
import { asphaltTexture, bollardTexture, buildingTexture, crateTexture, foliageTexture, padTexture, rampTexture } from "./textures";

type Rapier = typeof RAPIER;
type World = InstanceType<Rapier["World"]>;

export type SolidShape = "cuboid" | "cylinder" | "cone" | "ball";

export type SolidLook =
  | "concrete"
  | "barrier"
  | "crate"
  | "bollard"
  | "building"
  | "steel"
  | "cone"
  | "barrel"
  | "car"
  | "tree"
  | "pine"
  | "bush"
  | "rock"
  | "light"
  | "bench"
  | "fence"
  | "ramp"
  | "dumpster"
  | "shelter"
  | "sign"
  | "planter"
  | "silo"
  | "fountain"
  | "foam"
  | "signal"
  | "shelf"
  | "log"
  | "pallet";

export interface Solid {
  shape: SolidShape;
  look: SolidLook;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
  pitch: number;
  color: number;
  friction: number;
}

/** Yaw then pitch, matching the mesh quaternion and the Rapier rotation. */
export function solidQuaternion(yaw: number, pitch: number): { x: number; y: number; z: number; w: number } {
  const hy = yaw / 2;
  const hp = pitch / 2;
  const sy = Math.sin(hy);
  const cy = Math.cos(hy);
  const sp = Math.sin(hp);
  const cp = Math.cos(hp);
  return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
}

/**
 * Props for the yard. The scan plane sits about a metre up, so anything the
 * lidar should notice is at least 1.25 m tall. Spawn (5.4, 0) is left open;
 * the drive north from there is a road with a weave, a cross street, and a
 * roundabout.
 */
export function buildCourseSolids(): Solid[] {
  const solids: Solid[] = [];

  const box = (
    x: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    look: SolidLook,
    yaw = 0,
    pitch = 0,
    bottom = 0,
    color = 0xffffff,
    friction = 0.8,
  ) => {
    const q = solidQuaternion(yaw, pitch);
    let minY = Infinity;
    for (const cx of [-sx / 2, sx / 2]) {
      for (const cy of [-sy / 2, sy / 2]) {
        for (const cz of [-sz / 2, sz / 2]) {
          minY = Math.min(minY, quatRotate(q, { x: cx, y: cy, z: cz }).y);
        }
      }
    }
    solids.push({
      shape: "cuboid",
      look,
      x,
      y: bottom - minY,
      z,
      hx: sx / 2,
      hy: sy / 2,
      hz: sz / 2,
      yaw,
      pitch,
      color,
      friction,
    });
  };

  const cyl = (
    x: number,
    z: number,
    radius: number,
    height: number,
    look: SolidLook,
    bottom = 0,
    color = 0xffffff,
    friction = 0.7,
  ) => {
    solids.push({
      shape: "cylinder",
      look,
      x,
      y: bottom + height / 2,
      z,
      hx: radius,
      hy: height / 2,
      hz: radius,
      yaw: 0,
      pitch: 0,
      color,
      friction,
    });
  };

  const cone = (x: number, z: number, radius: number, height: number, color: number) => {
    solids.push({
      shape: "cone",
      look: "cone",
      x,
      y: height / 2,
      z,
      hx: radius,
      hy: height / 2,
      hz: radius,
      yaw: 0,
      pitch: 0,
      color,
      friction: 0.6,
    });
  };

  const ball = (x: number, z: number, radius: number, look: SolidLook, color: number) => {
    solids.push({
      shape: "ball",
      look,
      x,
      y: radius * 0.72,
      z,
      hx: radius,
      hy: radius,
      hz: radius,
      yaw: 0,
      pitch: 0,
      color,
      friction: 0.7,
    });
  };

  // Channelizer cones on the avenue. Tall enough for the hood lidar.
  cone(3.15, 14, 0.34, 1.28, 0xf06a12);
  cone(3.55, 15.4, 0.3, 1.22, 0xe4572e);
  cone(7.7, 19.2, 0.34, 1.28, 0xf06a12);
  cone(8.05, 20.6, 0.28, 1.2, 0xf4a261);
  cone(16.4, 23.5, 0.32, 1.25, 0xf06a12);
  cone(17.3, 24.6, 0.3, 1.22, 0xe4572e);
  cone(15.6, 25.4, 0.28, 1.2, 0xf4a261);

  // Drums and a stack beside the warehouse apron, off the driving lane.
  cyl(12.4, 22.4, 0.4, 1.25, "barrel", 0, 0x8d3b32);
  cyl(-9.2, 11.5, 0.42, 1.25, "barrel", 0, 0x2f4d86);
  cyl(-8.2, 12.6, 0.42, 1.25, "barrel", 0, 0x2f4d86);
  cyl(-8.2, 12.6, 0.42, 1.25, "barrel", 1.25, 0xc4553a);
  cyl(20.5, 14, 0.4, 1.25, "barrel", 0, 0x8d3b32);
  cyl(21.4, 14.2, 0.4, 1.25, "barrel", 0, 0x355e4a);

  // Parked cars, clear of the driving lane (x about 2 to 9).
  box(13.6, 9, 1.8, 1.45, 4.3, "car", 0.08, 0, 0, 0xd8dde2);
  box(13.8, 18.5, 1.8, 1.42, 4.15, "car", -0.04, 0, 0, 0xc23b3b);
  box(14.2, 42, 1.75, 1.4, 4.4, "car", 0.12, 0, 0, 0xf2c14e);
  box(-2.6, 11, 1.8, 1.45, 4.2, "car", Math.PI, 0, 0, 0x1f6f78);
  box(-2.8, 34, 1.8, 1.4, 4.5, "car", Math.PI + 0.1, 0, 0, 0x2c3338);
  box(22, 30.5, 1.75, 1.38, 4.2, "car", Math.PI / 2, 0, 0, 0xe8eef2);

  // Buildings, a silo, and a roundabout planter.
  box(-18, 4, 12, 4.6, 8, "building", 0.02, 0, 0, 0xc4b6a2);
  box(26, 6, 8, 3.8, 10, "building", -0.08, 0, 0, 0xb7c3bd);
  box(24, 40, 7, 3.4, 6.5, "building", 0.2, 0, 0, 0xd7c4a8);
  cyl(-30, 22, 2.1, 8.5, "silo", 0, 0xd5d8dc);
  cyl(5.5, 58, 2.35, 1.35, "planter", 0, 0x8d928c);
  cyl(5.5, 58, 0.28, 3.4, "tree", 1.2, 0x6a4b32);

  // Chicane on the avenue, after the cross street. Each leaves a 4 m gap.
  box(3.4, 39, 3.5, 1.35, 0.55, "barrier", 0.04);
  box(7.9, 48, 3.6, 1.35, 0.55, "barrier", -0.05);

  // Warehouse clutter: crates on pallets, a dumpster.
  box(-8.4, 7.2, 1.35, 1.15, 1.2, "crate", 0.2);
  box(-6.6, 8.4, 1.5, 1.35, 1.25, "crate", -0.15);
  box(-7.4, 6.2, 1.7, 0.22, 1.3, "crate", 0.1, 0, 0, 0x8a6a45);
  box(-11.5, 8.8, 1.5, 1.35, 2.4, "dumpster", 0.15);

  // Park dressing.
  ball(18.2, -16, 0.9, "rock", 0x6e7370);
  ball(16.4, -17.6, 0.85, "rock", 0x8a8680);
  ball(19.5, -14.2, 0.82, "rock", 0x5e6664);
  ball(-14, -12, 0.95, "rock", 0x7a756e);
  ball(-22, 16, 0.88, "bush", 0x2f6b45);
  ball(-20, 18.5, 0.84, "bush", 0x3d7d52);
  ball(20, 18, 0.86, "bush", 0x2a5e3d);
  ball(30, 22, 0.9, "bush", 0x346b46);
  ball(12.8, -12, 0.84, "bush", 0x3f7a50);
  ball(-6, -16, 0.86, "bush", 0x2c6240);

  cyl(11.6, 46, 0.22, 2.6, "pine", 0, 0x2a4a34);
  cyl(-14, 28, 0.24, 3.1, "pine", 0, 0x234432);
  cyl(32, -8, 0.2, 2.4, "pine", 0, 0x2d5340);
  cyl(-24, -6, 0.34, 2.2, "tree", 0, 0x6d4c34);
  cyl(-16, -22, 0.3, 2.4, "tree", 0, 0x6a4a30);
  cyl(28, 48, 0.32, 2.5, "tree", 0, 0x5e432c);
  cyl(36, 16, 0.28, 2.3, "tree", 0, 0x6d4c34);
  cyl(-36, 8, 0.3, 2.6, "tree", 0, 0x624832);
  cyl(15, 74, 0.26, 2.8, "tree", 0, 0x6a4b32);

  // Streetlights set back from both curbs.
  for (const z of [-8, 8, 16, 36, 52, 66]) {
    cyl(0.2, z, 0.09, 5.2, "light");
    cyl(11.2, z, 0.09, 5.2, "light");
  }
  cyl(-6, 21.2, 0.09, 5.2, "light");
  cyl(20, 21.2, 0.09, 5.2, "light");

  // Benches and a bus shelter off the lane.
  box(14.4, 4.5, 1.7, 1.3, 0.62, "bench", Math.PI / 2);
  box(-4.2, 22, 1.7, 1.3, 0.62, "bench", 0.2);
  box(16.5, 36, 1.7, 1.3, 0.62, "bench", -0.4);
  box(13.4, -7, 2.6, 2.4, 1.5, "shelter", 0);

  // Fences around the lots. None of them cross the avenue or the cross street.
  box(-8, -14, 0.12, 1.4, 16, "fence");
  box(18.5, 8, 0.12, 1.4, 14, "fence", 0.15);
  box(18.5, 46, 0.12, 1.4, 12, "fence");
  box(-14, 20, 14, 1.4, 0.12, "fence");
  box(30, 18, 0.12, 1.4, 16, "fence");
  box(-28, -2, 12, 1.4, 0.12, "fence");

  // A ramp up to a loading stub, rails tall enough to read on lidar.
  box(22, -18, 3.3, 0.22, 7.2, "ramp", 0, -0.2, 0, 0xffffff, 1.05);
  box(20.4, -18, 0.14, 1.15, 6.4, "steel", 0, -0.2, 0.15);
  box(23.6, -18, 0.14, 1.15, 6.4, "steel", 0, -0.2, 0.15);

  // Yard signs.
  cyl(1.2, 8.5, 0.06, 2.1, "sign", 0, 0x44515c);
  cyl(2.3, 8.5, 0.06, 2.1, "sign", 0, 0x44515c);
  box(1.75, 8.5, 1.5, 0.7, 0.08, "sign", 0, 0, 1.55, 0xf0c14e);
  cyl(10.2, 32.5, 0.06, 2.1, "sign", 0, 0x44515c);
  box(10.2, 32.5, 0.08, 0.85, 0.85, "sign", 0, 0, 1.35, 0xd23b3b);

  // Fountain in the west lawn.
  cyl(-22, -14, 1.5, 1.25, "fountain", 0, 0xb7c0c6);

  // Loose perimeter, with a gap where the avenue continues north and south.
  box(-28, 78, 28, 1.6, 0.4, "concrete");
  box(32, 78, 28, 1.6, 0.4, "concrete");
  box(-28, -40, 28, 1.6, 0.4, "concrete");
  box(32, -40, 28, 1.6, 0.4, "concrete");
  box(-48, -8, 0.4, 1.6, 24, "concrete");
  box(-48, 28, 0.4, 1.6, 28, "concrete");
  box(48, 0, 0.4, 1.6, 28, "concrete");
  box(48, 40, 0.4, 1.6, 24, "concrete");

  // Signals on the sidewalks, outside the avenue and the cross street.
  cyl(-1.4, 20.6, 0.08, 3.5, "signal", 0, 0x2c3338);
  box(-1.4, 20.6, 0.55, 0.9, 0.28, "signal", 0, 0, 2.85, 0x1c2126);
  cyl(12.4, 20.6, 0.08, 3.5, "signal", 0, 0x2c3338);
  box(12.4, 20.6, 0.55, 0.9, 0.28, "signal", 0, 0, 2.85, 0x1c2126);
  cyl(-1.4, 34.2, 0.08, 3.5, "signal", 0, 0x2c3338);
  box(-1.4, 34.2, 0.55, 0.9, 0.28, "signal", Math.PI, 0, 2.85, 0x1c2126);
  cyl(12.4, 34.2, 0.08, 3.5, "signal", 0, 0x2c3338);
  box(12.4, 34.2, 0.55, 0.9, 0.28, "signal", Math.PI, 0, 2.85, 0x1c2126);

  // Bollards marking the cross-street corners, off the driving lines.
  cyl(1.3, 22.2, 0.22, 1.45, "bollard");
  cyl(9.8, 22.2, 0.22, 1.45, "bollard");
  cyl(1.3, 32.2, 0.22, 1.45, "bollard");
  cyl(9.8, 32.2, 0.22, 1.45, "bollard");

  return solids;
}

export interface WorldMount {
  group: THREE.Group;
  bodies: InstanceType<Rapier["RigidBody"]>[];
}

export function mountSolids(
  RAPIER: Rapier,
  world: World,
  parent: THREE.Object3D,
  solids: readonly Solid[],
  kit: PropKit | null = null,
): WorldMount["bodies"] {
  const mats = createMaterials(kit);
  const bodies: WorldMount["bodies"] = [];
  for (const solid of solids) {
    const visual = buildVisual(solid, mats);
    visual.position.set(solid.x, solid.y, solid.z);
    const q = solidQuaternion(solid.yaw, solid.pitch);
    visual.quaternion.set(q.x, q.y, q.z, q.w);
    visual.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    parent.add(visual);
    bodies.push(addSolidBody(RAPIER, world, solid, q));
  }
  return bodies;
}

function addSolidBody(
  RAPIER: Rapier,
  world: World,
  solid: Solid,
  q: { x: number; y: number; z: number; w: number },
): InstanceType<Rapier["RigidBody"]> {
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
  world.createCollider(desc.setFriction(solid.friction).setRestitution(0.02), body);
  return body;
}

export function releaseMount(world: World, mount: WorldMount): void {
  for (const body of mount.bodies) world.removeRigidBody(body);
  const textures = new Set<THREE.Texture>();
  mount.group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (isKept(material)) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !isKept(value)) textures.add(value);
      }
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
  mount.group.removeFromParent();
}

export async function mountCity(
  RAPIER: Rapier,
  world: World,
  scene: THREE.Scene,
  quality: GraphicsQuality,
): Promise<WorldMount> {
  const kit = await loadPropKit(quality).catch((error: unknown) => {
    console.warn("[robo-sim] surface textures unavailable", error);
    return null;
  });
  const group = new THREE.Group();
  group.name = "world-city";
  scene.add(group);
  addCityGround(group, kit);
  addGroundDressing(group, kit);
  const bodies = mountSolids(RAPIER, world, group, buildCourseSolids(), kit);
  return { group, bodies };
}

function addCityGround(parent: THREE.Object3D, kit: PropKit | null): void {
  const ground = kit
    ? paved(220, 220, kit.grass, 0.004)
    : new THREE.Mesh(
        new THREE.BoxGeometry(220, 1, 220),
        new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.94, metalness: 0.02 }),
      );
  if (!kit) ground.position.y = -0.5;
  ground.receiveShadow = true;
  parent.add(ground);

  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 48),
    new THREE.MeshStandardMaterial({
      map: padTexture(),
      transparent: true,
      roughness: 0.85,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.015;
  pad.receiveShadow = true;
  parent.add(pad);
}

function paved(w: number, d: number, material: THREE.Material, y: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d);
  tileUvs(geo, w * TILES_PER_METER, d * TILES_PER_METER);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function addGroundDressing(parent: THREE.Object3D, kit: PropKit | null): void {
  const roadMat = kit?.asphalt ?? new THREE.MeshStandardMaterial({ color: 0x4a525a, roughness: 0.9, metalness: 0.05 });
  const road = (x: number, z: number, w: number, d: number) => {
    const mesh = kit ? paved(w, d, roadMat, 0.02) : new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    if (!kit) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      mesh.receiveShadow = true;
    }
    mesh.position.x = x;
    mesh.position.z = z;
    parent.add(mesh);
  };
  // Gap around z = 0 so the painted start pad stays visible.
  road(5.5, 37, 9.2, 66);
  road(5.5, -14, 9.2, 16);
  road(8, 27.2, 52, 9);
  const plazaGeo = new THREE.CircleGeometry(9.2, 48);
  tileUvs(plazaGeo, 8, 8);
  const plaza = new THREE.Mesh(plazaGeo, roadMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(5.5, 0.025, 58);
  plaza.receiveShadow = true;
  parent.add(plaza);

  const paint = new THREE.MeshBasicMaterial({ color: 0xf4f1e6 });
  const amber = new THREE.MeshBasicMaterial({ color: 0xe0b15a });
  for (let z = 6; z <= 70; z += 4.2) {
    if (z > 22 && z < 33) continue;
    if (z > 52 && z < 64) continue;
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.7), paint);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(5.5, 0.03, z);
    parent.add(dash);
  }
  for (const edge of [1.15, 9.85]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 64), amber);
    line.rotation.x = -Math.PI / 2;
    line.position.set(edge, 0.03, 38);
    parent.add(line);
  }
  for (let x = -12; x <= 30; x += 3.4) {
    if (x > 0.5 && x < 10.5) continue;
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.14), paint);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.032, 27.2);
    parent.add(dash);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.9, 40), amber);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(5.5, 0.035, 58);
  parent.add(ring);

  const walk = kit?.concrete ?? new THREE.MeshStandardMaterial({ color: 0xd2cdc4, roughness: 0.92, metalness: 0.02 });
  const curbMat = kit?.concrete ?? new THREE.MeshStandardMaterial({ color: 0x9a9ea2, roughness: 0.8 });
  const sidewalk = (x: number, z: number, w: number, d: number) => {
    const mesh = kit ? paved(w, d, walk, 0.028) : new THREE.Mesh(new THREE.PlaneGeometry(w, d), walk);
    if (!kit) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
    }
    mesh.position.set(x, kit ? 0.028 : 0.028, z);
    parent.add(mesh);
  };
  sidewalk(-0.8, 36, 1.7, 64);
  sidewalk(11.6, 36, 1.7, 64);
  sidewalk(8, 21.4, 50, 1.5);
  sidewalk(8, 33, 50, 1.5);

  const curb = (x: number, z: number, w: number, d: number) => {
    const geo = new THREE.BoxGeometry(w, 0.12, d);
    if (kit) tileBox(geo, w, 0.12, d, TILES_PER_METER);
    const mesh = new THREE.Mesh(geo, curbMat);
    mesh.position.set(x, 0.06, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  };
  curb(0.15, 38, 0.18, 60);
  curb(10.85, 38, 0.18, 60);

  const stripe = new THREE.MeshBasicMaterial({ color: 0xf7f4ee });
  const cross = (x: number, z: number, alongX: boolean) => {
    for (let i = -3; i <= 3; i++) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? 0.45 : 2.4, alongX ? 2.4 : 0.45), stripe);
      band.rotation.x = -Math.PI / 2;
      band.position.set(alongX ? x + i * 0.85 : x, 0.034, alongX ? z : z + i * 0.85);
      parent.add(band);
    }
  };
  cross(5.5, 23.15, true);
  cross(5.5, 31.3, true);
  cross(0.7, 27.2, false);
  cross(10.3, 27.2, false);

  const wearMat = new THREE.MeshBasicMaterial({ color: 0x1c2126, transparent: true, opacity: 0.28, depthWrite: false });
  for (const [x, z, w, d] of [
    [4.2, 18, 1.4, 6],
    [7.1, 44, 1.1, 8],
    [5.2, 62, 2.2, 3.5],
  ] as const) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(w, d), wearMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.033, z);
    parent.add(patch);
  }
}

interface Materials {
  concrete: THREE.MeshStandardMaterial;
  barrier: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  caution: THREE.MeshStandardMaterial;
  crate: THREE.MeshStandardMaterial;
  bollard: THREE.MeshStandardMaterial;
  building: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  leafDark: THREE.MeshStandardMaterial;
  trunk: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  lamp: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  foam: THREE.MeshStandardMaterial;
  foamBand: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  paint: (color: number) => THREE.MeshStandardMaterial;
}

function createMaterials(kit: PropKit | null): Materials {
  const paintCache = new Map<number, THREE.MeshStandardMaterial>();
  const flatSteel = new THREE.MeshStandardMaterial({ color: 0x4d5966, roughness: 0.45, metalness: 0.55 });
  const foliageMap = foliageTexture();
  return {
    concrete: kit?.concrete ?? new THREE.MeshStandardMaterial({ color: 0x8e949b, roughness: 0.9, metalness: 0.04 }),
    barrier: kit?.concrete ?? new THREE.MeshStandardMaterial({ color: 0xb7b1a6, roughness: 0.86, metalness: 0.05 }),
    steel: kit?.metal ?? flatSteel,
    caution: new THREE.MeshStandardMaterial({ color: 0xe3a23a, roughness: 0.5, metalness: 0.1 }),
    crate: kit?.planks ?? new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.82, metalness: 0.02 }),
    bollard: new THREE.MeshStandardMaterial({ map: bollardTexture(), roughness: 0.55, metalness: 0.04 }),
    building: kit?.brick ?? new THREE.MeshStandardMaterial({ map: buildingTexture(), roughness: 0.78, metalness: 0.06 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xb7d4de,
      roughness: 0.05,
      metalness: 0.7,
      transparent: true,
      opacity: 0.62,
      envMapIntensity: 1.55,
    }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b4a, roughness: 0.85 }),
    leafDark: new THREE.MeshStandardMaterial({ color: 0x234e38, roughness: 0.9 }),
    trunk: kit?.bark ?? new THREE.MeshStandardMaterial({ color: 0x6d4c34, roughness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.92 }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xfff1c4,
      emissive: 0xffc56b,
      emissiveIntensity: 0.8,
      roughness: 0.35,
    }),
    metal: kit?.metal ?? flatSteel,
    stone: kit?.stone ?? new THREE.MeshStandardMaterial({ color: 0x7a7e82, roughness: 0.95 }),
    foam: new THREE.MeshPhysicalMaterial({
      color: 0xe24b2a,
      roughness: 0.42,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
    }),
    foamBand: new THREE.MeshPhysicalMaterial({
      color: 0xf4f1ea,
      roughness: 0.38,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
    }),
    foliage: new THREE.MeshStandardMaterial({
      map: foliageMap,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.85,
      color: 0xd5e6c8,
    }),
    paint: (color: number) => {
      let material = paintCache.get(color);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.12 });
        paintCache.set(color, material);
      }
      return material;
    },
  };
}

function buildVisual(solid: Solid, mats: Materials): THREE.Object3D {
  const group = new THREE.Group();
  const add = (mesh: THREE.Mesh) => {
    group.add(mesh);
    return mesh;
  };

  switch (solid.look) {
    case "cone": {
      add(new THREE.Mesh(new THREE.ConeGeometry(solid.hx, solid.hy * 2, 12), mats.paint(solid.color)));
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(solid.hx * 0.62, solid.hx * 0.72, solid.hy * 0.18, 12), mats.paint(0xf7f4ee)));
      band.position.y = -solid.hy * 0.15;
      break;
    }
    case "barrel": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(solid.hx, solid.hx, solid.hy * 2, 16), mats.paint(solid.color)));
      for (const y of [-solid.hy * 0.45, solid.hy * 0.45]) {
        const rib = add(new THREE.Mesh(new THREE.TorusGeometry(solid.hx, 0.035, 6, 16), mats.steel));
        rib.rotation.x = Math.PI / 2;
        rib.position.y = y;
      }
      break;
    }
    case "car":
      buildCar(group, solid, mats);
      break;
    case "tree":
    case "pine":
      buildTree(group, solid, mats);
      break;
    case "bush":
      addFoliage(group, solid.hx * 2.2, solid.hx * 1.6, 0, mats.foliage, 2);
      break;
    case "rock": {
      const geo = new THREE.DodecahedronGeometry(solid.hx, 0);
      tileUvs(geo, 2.2, 2.2);
      add(new THREE.Mesh(geo, mats.stone)).scale.set(1.15, 0.7, 1.05);
      break;
    }
    case "light":
      buildLight(group, solid, mats);
      break;
    case "bench":
      buildBench(group, solid, mats);
      break;
    case "building":
      buildBuilding(group, solid, mats);
      break;
    case "silo": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(solid.hx, solid.hx * 1.02, solid.hy * 2, 20), mats.paint(solid.color)));
      const cap = add(new THREE.Mesh(new THREE.SphereGeometry(solid.hx, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.steel));
      cap.position.y = solid.hy;
      break;
    }
    case "planter":
      add(new THREE.Mesh(new THREE.CylinderGeometry(solid.hx, solid.hx * 1.04, solid.hy * 2, 24), mats.concrete));
      break;
    case "fountain": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(solid.hx, solid.hx * 1.08, solid.hy * 2, 24), mats.concrete));
      const water = add(
        new THREE.Mesh(
          new THREE.CircleGeometry(solid.hx * 0.78, 20),
          new THREE.MeshStandardMaterial({ color: 0x3d8ea8, roughness: 0.15, metalness: 0.2 }),
        ),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = solid.hy * 0.72;
      break;
    }
    case "dumpster": {
      add(new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2), mats.paint(0x2f6a45)));
      const lid = add(new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2.05, 0.08, solid.hz * 2.05), mats.paint(0x244e34)));
      lid.position.y = solid.hy;
      break;
    }
    case "shelter":
      buildShelter(group, solid, mats);
      break;
    case "signal":
      buildSignal(group, solid, mats);
      break;
    case "shelf":
      buildShelf(group, solid, mats);
      break;
    case "log": {
      const geo = new THREE.CylinderGeometry(solid.hx, solid.hx * 0.92, solid.hy * 2, 14);
      tileUvs(geo, Math.max(2, solid.hx * 8), solid.hy * 2 * TILES_PER_METER);
      add(new THREE.Mesh(geo, mats.trunk));
      break;
    }
    case "pallet": {
      const deck = new THREE.BoxGeometry(solid.hx * 2, solid.hy * 0.28, solid.hz * 2);
      tileBox(deck, solid.hx * 2, solid.hy * 0.28, solid.hz * 2, 0.8);
      add(new THREE.Mesh(deck, mats.crate));
      const box = new THREE.BoxGeometry(solid.hx * 1.55, solid.hy * 1.15, solid.hz * 1.35);
      tileBox(box, solid.hx * 1.55, solid.hy * 1.15, solid.hz * 1.35, 0.7);
      const load = add(new THREE.Mesh(box, mats.crate));
      load.position.y = solid.hy * 0.45;
      break;
    }
    case "sign":
      if (solid.shape === "cylinder") {
        add(new THREE.Mesh(new THREE.CylinderGeometry(solid.hx, solid.hx, solid.hy * 2, 8), mats.steel));
      } else {
        add(new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2), mats.paint(solid.color)));
      }
      break;
    case "ramp": {
      add(
        new THREE.Mesh(
          new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2),
          new THREE.MeshStandardMaterial({ map: rampTexture(), roughness: 0.55, metalness: 0.4 }),
        ),
      );
      break;
    }
    case "crate": {
      const geo = new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2);
      tileBox(geo, solid.hx * 2, solid.hy * 2, solid.hz * 2, 0.65);
      add(new THREE.Mesh(geo, solid.hy < 0.2 ? mats.paint(0x8a6a45) : mats.crate));
      break;
    }
    case "bollard":
      add(new THREE.Mesh(new THREE.CylinderGeometry(solid.hx, solid.hx, solid.hy * 2, 16), mats.bollard));
      break;
    case "foam":
      addFoamTubes(group, solid, mats);
      break;
    case "fence":
    case "concrete":
    case "barrier":
    case "steel": {
      const material =
        solid.look === "fence" || solid.look === "steel"
          ? mats.steel
          : solid.look === "barrier"
            ? mats.barrier
            : mats.concrete;
      const geo = new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2);
      if (solid.look === "concrete" || solid.look === "barrier") tileBox(geo, solid.hx * 2, solid.hy * 2, solid.hz * 2);
      add(new THREE.Mesh(geo, material));
      if (solid.look === "barrier") {
        const stripe = add(new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2.02, solid.hy * 0.22, solid.hz * 2.02), mats.caution));
        stripe.position.y = solid.hy * 0.15;
      }
      break;
    }
    default:
      add(new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2), mats.concrete));
  }
  return group;
}

function buildCar(group: THREE.Group, solid: Solid, mats: Materials): void {
  const paint = mats.paint(solid.color);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), paint);
  body.scale.set(solid.hx * 0.95, solid.hy * 0.36, solid.hz * 0.98);
  body.position.y = -solid.hy * 0.32;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), mats.glass);
  cabin.scale.set(solid.hx * 0.72, solid.hy * 0.3, solid.hz * 0.36);
  cabin.position.set(0, -solid.hy * 0.02, -solid.hz * 0.06);
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint);
  hood.scale.set(solid.hx * 0.9, solid.hy * 0.16, solid.hz * 0.34);
  hood.position.set(0, -solid.hy * 0.12, solid.hz * 0.42);
  group.add(hood);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 1.7, solid.hy * 0.1, 0.08), mats.paint(0x1a1e22));
  bumper.position.set(0, -solid.hy * 0.42, solid.hz * 0.9);
  group.add(bumper);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(solid.hx * 0.12, 10, 8), mats.lamp);
    lamp.scale.set(1.5, 0.7, 0.55);
    lamp.position.set(side * solid.hx * 0.55, -solid.hy * 0.18, solid.hz * 0.78);
    group.add(lamp);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
  const rimGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.21, 12);
  for (const [x, z] of [
    [-solid.hx * 0.78, solid.hz * 0.58],
    [solid.hx * 0.78, solid.hz * 0.58],
    [-solid.hx * 0.78, -solid.hz * 0.58],
    [solid.hx * 0.78, -solid.hz * 0.58],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeo, mats.rubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -solid.hy + 0.3, z);
    const rim = new THREE.Mesh(rimGeo, mats.metal);
    rim.rotation.z = Math.PI / 2;
    rim.position.copy(wheel.position);
    group.add(wheel, rim);
  }
}

function buildTree(group: THREE.Group, solid: Solid, mats: Materials): void {
  const height = solid.hy * 1.55;
  const trunkGeo = new THREE.CylinderGeometry(solid.hx * 0.28, solid.hx * 0.55, height, 12);
  tileUvs(trunkGeo, 2.4, height * 0.8);
  const trunk = new THREE.Mesh(trunkGeo, mats.trunk);
  trunk.position.y = -solid.hy + height / 2;
  group.add(trunk);
  const flareGeo = new THREE.CylinderGeometry(solid.hx * 0.55, solid.hx * 0.9, solid.hy * 0.28, 10);
  tileUvs(flareGeo, 2, 1);
  const flare = new THREE.Mesh(flareGeo, mats.trunk);
  flare.position.y = -solid.hy + solid.hy * 0.14;
  group.add(flare);
  if (solid.look === "pine") {
    for (let layer = 0; layer < 4; layer++) {
      const y = -solid.hy * 0.15 + layer * solid.hy * 0.42;
      addFoliage(group, solid.hx * (2.6 - layer * 0.45), solid.hy * 0.7, y, mats.foliage, 3);
    }
    return;
  }
  addFoliage(group, solid.hx * 3.1, solid.hy * 1.15, solid.hy * 0.35, mats.foliage, 3);
  addFoliage(group, solid.hx * 2.2, solid.hy * 0.85, solid.hy * 0.85, mats.foliage, 3);
}

function buildLight(group: THREE.Group, solid: Solid, mats: Materials): void {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(solid.hx, solid.hx * 1.3, solid.hy * 2, 8), mats.steel);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), mats.steel);
  arm.position.set(0.35, solid.hy * 0.92, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.16), mats.lamp);
  head.position.set(0.7, solid.hy * 0.84, 0);
  group.add(pole, arm, head);
}

function buildBench(group: THREE.Group, solid: Solid, mats: Materials): void {
  const wood = mats.paint(0x8a5a32);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2, 0.08, 0.46), wood);
  seat.position.y = -solid.hy * 0.15;
  const back = new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2, solid.hy * 1.1, 0.08), wood);
  back.position.set(0, solid.hy * 0.15, -0.24);
  group.add(seat, back);
  for (const x of [-solid.hx * 0.7, solid.hx * 0.7]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, solid.hy * 1.3, 0.46), mats.steel);
    leg.position.set(x, -solid.hy * 0.3, 0);
    group.add(leg);
  }
}

function buildBuilding(group: THREE.Group, solid: Solid, mats: Materials): void {
  const width = solid.hx * 2;
  const height = solid.hy * 2;
  const depth = solid.hz * 2;
  const geo = new THREE.BoxGeometry(width, height, depth);
  tileBox(geo, width, height, depth, 0.45);
  const body = new THREE.Mesh(geo, mats.building);
  const lipGeo = new THREE.BoxGeometry(width + 0.35, 0.18, depth + 0.35);
  tileBox(lipGeo, width + 0.35, 0.18, depth + 0.35, 0.4);
  const lip = new THREE.Mesh(lipGeo, mats.concrete);
  lip.position.y = solid.hy - 0.02;
  group.add(body, lip);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.15, 0.08), mats.paint(0x2a3036));
  door.position.set(0, -solid.hy + 1.08, solid.hz + 0.02);
  group.add(door);
  const cols = Math.max(2, Math.round(solid.hx / 1.1));
  const rows = Math.max(2, Math.round(solid.hy / 1.4));
  const place = (x: number, y: number, z: number, rotY: number) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.05, 0.05), mats.paint(0x1c2126));
    const lit = (Math.round(x * 4) + Math.round(y * 3) + Math.round(z * 2)) % 5 === 0;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.88, 0.04), lit ? mats.lamp : mats.glass);
    frame.position.set(x, y, z);
    pane.position.set(x, y, z);
    frame.rotation.y = rotY;
    pane.rotation.y = rotY;
    group.add(frame, pane);
  };
  for (let row = 0; row < rows; row++) {
    const y = -solid.hy + 1.7 + row * 1.45;
    if (y > solid.hy - 0.7) continue;
    for (let col = 0; col < cols; col++) {
      const x = -solid.hx + ((col + 0.5) * width) / cols;
      if (Math.abs(x) < 0.85 && row === 0) continue;
      place(x, y, solid.hz + 0.03, 0);
    }
    const sideCols = Math.max(1, Math.round(solid.hz / 1.4));
    for (let col = 0; col < sideCols; col++) {
      const z = -solid.hz + ((col + 0.5) * depth) / sideCols;
      place(solid.hx + 0.03, y, z, Math.PI / 2);
      place(-solid.hx - 0.03, y, z, Math.PI / 2);
    }
  }
}

function buildSignal(group: THREE.Group, solid: Solid, mats: Materials): void {
  if (solid.shape === "cylinder") {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(solid.hx, solid.hx * 1.15, solid.hy * 2, 8), mats.steel));
    return;
  }
  group.add(new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2), mats.paint(0x1c2126)));
  const lensGeo = new THREE.BoxGeometry(solid.hx * 1.4, solid.hy * 0.42, solid.hz * 0.4);
  const colors = [0x39c15f, 0xe3a23a, 0xd23b3b];
  colors.forEach((color, index) => {
    const lens = new THREE.Mesh(
      lensGeo,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: index === 2 ? 0.9 : 0.25, roughness: 0.3 }),
    );
    lens.position.set(0, solid.hy * 0.55 - index * solid.hy * 0.55, solid.hz * 0.7);
    group.add(lens);
  });
}

function buildShelf(group: THREE.Group, solid: Solid, mats: Materials): void {
  const w = solid.hx * 2;
  const h = solid.hy * 2;
  const d = solid.hz * 2;
  const postGeo = new THREE.BoxGeometry(0.08, h, 0.08);
  tileBox(postGeo, 0.08, h, 0.08, 2);
  for (const x of [-solid.hx + 0.04, solid.hx - 0.04]) {
    for (const z of [-solid.hz + 0.04, solid.hz - 0.04]) {
      const post = new THREE.Mesh(postGeo, mats.steel);
      post.position.set(x, 0, z);
      group.add(post);
    }
  }
  const levels = 4;
  for (let i = 0; i < levels; i++) {
    const boardGeo = new THREE.BoxGeometry(w * 0.96, 0.05, d * 0.96);
    tileBox(boardGeo, w, 0.05, d, 0.8);
    const board = new THREE.Mesh(boardGeo, mats.crate);
    board.position.y = -solid.hy + 0.1 + (i * (h - 0.25)) / (levels - 1);
    group.add(board);
    if (i < levels - 1) {
      for (const side of [-1, 1]) {
        const bw = w * 0.34;
        const bh = h * 0.14;
        const bd = d * 0.42;
        const boxGeo = new THREE.BoxGeometry(bw, bh, bd);
        tileBox(boxGeo, bw, bh, bd, 0.7);
        const cargo = new THREE.Mesh(boxGeo, mats.crate);
        cargo.position.set(side * w * 0.18, board.position.y + bh * 0.65, (i % 2 === 0 ? 0.08 : -0.08) * d);
        group.add(cargo);
      }
    }
  }
}

function addFoamTubes(group: THREE.Group, solid: Solid, mats: Materials): void {
  const alongZ = solid.hz >= solid.hx;
  const length = (alongZ ? solid.hz : solid.hx) * 2;
  const radius = 0.2;
  const rows = Math.max(3, Math.round((solid.hy * 2) / (radius * 1.7)));
  for (let i = 0; i < rows; i++) {
    const geo = new THREE.CylinderGeometry(radius, radius * 0.98, length * 0.995, 18);
    if (alongZ) geo.rotateX(Math.PI / 2);
    else geo.rotateZ(Math.PI / 2);
    const tube = new THREE.Mesh(geo, i % 2 === 0 ? mats.foam : mats.foamBand);
    const span = solid.hy * 2 - radius * 2;
    tube.position.y = -solid.hy + radius + (rows === 1 ? span / 2 : (i * span) / (rows - 1));
    group.add(tube);
  }
}

function addFoliage(
  group: THREE.Group,
  width: number,
  height: number,
  y: number,
  material: THREE.Material,
  crosses: number,
): void {
  const geo = new THREE.PlaneGeometry(width, height);
  for (let i = 0; i < crosses; i++) {
    const card = new THREE.Mesh(geo, material);
    card.position.set(Math.sin(i * 2.1) * width * 0.12, y, Math.cos(i * 1.7) * width * 0.12);
    card.rotation.y = (i / crosses) * Math.PI + 0.4;
    card.castShadow = false;
    group.add(card);
  }
}

function buildShelter(group: THREE.Group, solid: Solid, mats: Materials): void {
  const roof = new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2, 0.1, solid.hz * 2), mats.paint(0x2f6f78));
  roof.position.y = solid.hy * 0.7;
  group.add(roof);
  for (const x of [-solid.hx * 0.8, solid.hx * 0.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, solid.hy * 1.6, 8), mats.steel);
    post.position.set(x, -solid.hy * 0.1, -solid.hz * 0.7);
    group.add(post);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 1.4, 0.08, 0.4), mats.paint(0x8a5a32));
  bench.position.set(0, -solid.hy * 0.35, -solid.hz * 0.35);
  group.add(bench);
}
