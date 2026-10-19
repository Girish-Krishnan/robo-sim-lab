import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { quatRotate } from "../api/math";
import { bollardTexture, buildingTexture, crateTexture, rampTexture } from "./textures";

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
  | "fountain";

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
  ball(18.2, -16, 0.85, "rock", 0x6e7370);
  ball(16.4, -17.6, 0.7, "rock", 0x8a8680);
  ball(19.5, -14.2, 0.62, "rock", 0x5e6664);
  ball(-14, -12, 0.9, "rock", 0x7a756e);
  ball(-22, 16, 0.75, "bush", 0x2f6b45);
  ball(-20, 18.5, 0.68, "bush", 0x3d7d52);
  ball(20, 18, 0.72, "bush", 0x2a5e3d);
  ball(30, 22, 0.8, "bush", 0x346b46);
  ball(12.8, -12, 0.66, "bush", 0x3f7a50);
  ball(-6, -16, 0.7, "bush", 0x2c6240);

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

  // Bollards marking the cross-street corners, off the driving lines.
  cyl(1.3, 22.2, 0.22, 1.45, "bollard");
  cyl(9.8, 22.2, 0.22, 1.45, "bollard");
  cyl(1.3, 32.2, 0.22, 1.45, "bollard");
  cyl(9.8, 32.2, 0.22, 1.45, "bollard");

  return solids;
}

export function addCourse(RAPIER: Rapier, world: World, scene: THREE.Scene): void {
  addGroundDressing(scene);
  const mats = createMaterials();
  for (const solid of buildCourseSolids()) {
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
    scene.add(visual);

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(solid.x, solid.y, solid.z)
        .setRotation(q),
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
  }
}

function addGroundDressing(scene: THREE.Scene): void {
  const grass = new THREE.MeshStandardMaterial({ color: 0x4a7c49, roughness: 1, metalness: 0 });
  const lawn = (x: number, z: number, w: number, d: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), grass);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.012, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  lawn(-20, 8, 36, 70);
  lawn(28, 10, 34, 80);
  lawn(6, -24, 40, 28);
  lawn(8, 70, 50, 18);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.92, metalness: 0.04 });
  const road = (x: number, z: number, w: number, d: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  // Gap around z = 0 so the painted start pad stays visible.
  road(5.5, 37, 9.2, 66);
  road(5.5, -14, 9.2, 16);
  road(8, 27.2, 52, 9);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(9.2, 40), roadMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(5.5, 0.025, 58);
  plaza.receiveShadow = true;
  scene.add(plaza);

  const paint = new THREE.MeshBasicMaterial({ color: 0xf4f1e6 });
  const amber = new THREE.MeshBasicMaterial({ color: 0xe0b15a });
  for (let z = 6; z <= 70; z += 4.2) {
    if (z > 22 && z < 33) continue;
    if (z > 52 && z < 64) continue;
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.7), paint);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(5.5, 0.03, z);
    scene.add(dash);
  }
  for (const edge of [1.15, 9.85]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 64), amber);
    line.rotation.x = -Math.PI / 2;
    line.position.set(edge, 0.03, 38);
    scene.add(line);
  }
  for (let x = -12; x <= 30; x += 3.4) {
    if (x > 0.5 && x < 10.5) continue;
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.14), paint);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.032, 27.2);
    scene.add(dash);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.9, 40), amber);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(5.5, 0.035, 58);
  scene.add(ring);
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
  paint: (color: number) => THREE.MeshStandardMaterial;
}

function createMaterials(): Materials {
  const paintCache = new Map<number, THREE.MeshStandardMaterial>();
  return {
    concrete: new THREE.MeshStandardMaterial({ color: 0x8e949b, roughness: 0.9, metalness: 0.04 }),
    barrier: new THREE.MeshStandardMaterial({ color: 0xb7b1a6, roughness: 0.86, metalness: 0.05 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x4d5966, roughness: 0.45, metalness: 0.55 }),
    caution: new THREE.MeshStandardMaterial({ color: 0xe3a23a, roughness: 0.5, metalness: 0.1 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.82, metalness: 0.02 }),
    bollard: new THREE.MeshStandardMaterial({ map: bollardTexture(), roughness: 0.55, metalness: 0.04 }),
    building: new THREE.MeshStandardMaterial({ map: buildingTexture(), roughness: 0.78, metalness: 0.06 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9fd8e2,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 0.55,
    }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b4a, roughness: 0.85 }),
    leafDark: new THREE.MeshStandardMaterial({ color: 0x234e38, roughness: 0.9 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x6d4c34, roughness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.92 }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xfff1c4,
      emissive: 0xffc56b,
      emissiveIntensity: 0.8,
      roughness: 0.35,
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
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(solid.hx, 1), mats.leaf));
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(solid.hx * 0.72, 0), mats.leafDark)).position.set(
        solid.hx * 0.35,
        solid.hx * 0.2,
        solid.hx * 0.1,
      );
      break;
    case "rock":
      add(new THREE.Mesh(new THREE.DodecahedronGeometry(solid.hx, 0), mats.paint(solid.color))).scale.set(1, 0.72, 1.05);
      break;
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
    case "crate":
      add(new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2), solid.hy < 0.2 ? mats.paint(0x8a6a45) : mats.crate));
      break;
    case "bollard":
      add(new THREE.Mesh(new THREE.CylinderGeometry(solid.hx, solid.hx, solid.hy * 2, 16), mats.bollard));
      break;
    case "fence":
    case "concrete":
    case "barrier":
    case "steel": {
      const material = solid.look === "fence" ? mats.steel : solid.look === "barrier" ? mats.barrier : solid.look === "steel" ? mats.steel : mats.concrete;
      add(new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2), material));
      if (solid.look === "barrier") {
        const stripe = add(new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2.02, solid.hy * 0.28, solid.hz * 2.02), mats.caution));
        stripe.position.y = solid.hy * 0.2;
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
  const body = new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 1.85, solid.hy * 0.7, solid.hz * 1.9), paint);
  body.position.y = -solid.hy * 0.15;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 1.6, solid.hy * 0.55, solid.hz * 0.85), mats.glass);
  cabin.position.set(0, solid.hy * 0.28, -solid.hz * 0.05);
  group.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
  for (const [x, z] of [
    [-solid.hx * 0.78, solid.hz * 0.62],
    [solid.hx * 0.78, solid.hz * 0.62],
    [-solid.hx * 0.78, -solid.hz * 0.62],
    [solid.hx * 0.78, -solid.hz * 0.62],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeo, mats.rubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -solid.hy + 0.32, z);
    group.add(wheel);
  }
}

function buildTree(group: THREE.Group, solid: Solid, mats: Materials): void {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(solid.hx * 0.45, solid.hx * 0.7, solid.hy * 2, 7), mats.trunk);
  group.add(trunk);
  if (solid.look === "pine") {
    for (const [scale, y] of [
      [2.4, solid.hy * 0.15],
      [1.7, solid.hy * 0.7],
      [1.05, solid.hy * 1.15],
    ] as const) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(solid.hx * scale, solid.hy * 0.9, 8), mats.leafDark);
      tier.position.y = y;
      group.add(tier);
    }
    return;
  }
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(solid.hx * 2.4, 1), mats.leaf);
  crown.position.y = solid.hy * 0.85;
  const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(solid.hx * 1.6, 0), mats.leafDark);
  crown2.position.set(solid.hx * 0.8, solid.hy * 1.15, solid.hx * 0.3);
  group.add(crown, crown2);
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
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(solid.hx * 2, solid.hy * 2, solid.hz * 2),
    solid.color === 0xc4b6a2 ? mats.building : mats.paint(solid.color),
  );
  const lip = new THREE.Mesh(new THREE.BoxGeometry(solid.hx * 2 + 0.4, 0.16, solid.hz * 2 + 0.4), mats.concrete);
  lip.position.y = solid.hy - 0.02;
  group.add(body, lip);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.08), mats.paint(0x3a4048));
  door.position.set(0, -solid.hy + 1.05, solid.hz + 0.01);
  group.add(door);
  const cols = Math.max(2, Math.round(solid.hx));
  const rows = Math.max(1, Math.round(solid.hy / 1.6));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.06), mats.glass);
      const x = -solid.hx + ((col + 0.5) * (solid.hx * 2)) / cols;
      const y = -solid.hy * 0.2 + row * 1.3;
      window.position.set(x, y, solid.hz + 0.02);
      group.add(window);
    }
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
