import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { bollardTexture, buildingTexture, crateTexture, rampTexture } from "./textures";

type Rapier = typeof RAPIER;
type World = InstanceType<Rapier["World"]>;

/**
 * Obstacles sit outside the ~6 m circle the starter controller drives,
 * and a gate plus bollards sit on the straight path ahead of the spawn
 * point so the lidar example has something to avoid.
 */
export function addCourse(RAPIER: Rapier, world: World, scene: THREE.Scene): void {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8e949b, roughness: 0.9, metalness: 0.04 });
  const barrier = new THREE.MeshStandardMaterial({ color: 0xb7b1a6, roughness: 0.86, metalness: 0.05 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.82, metalness: 0.02 });
  const bollardMat = new THREE.MeshStandardMaterial({ map: bollardTexture(), roughness: 0.55, metalness: 0.04 });
  const buildingMat = new THREE.MeshStandardMaterial({ map: buildingTexture(), roughness: 0.78, metalness: 0.06 });
  const rampMat = new THREE.MeshStandardMaterial({
    map: rampTexture(),
    roughness: 0.55,
    metalness: 0.45,
    color: 0xffffff,
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4d5966, roughness: 0.45, metalness: 0.55 });
  const caution = new THREE.MeshStandardMaterial({ color: 0xe3a23a, roughness: 0.5, metalness: 0.1 });

  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, yaw = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    addFixedBox(RAPIER, world, scene, mesh, sx / 2, sy / 2, sz / 2);
  };

  // Gate on the straight-ahead path.
  box(3.9, 0.9, 13, 0.5, 1.8, 0.5, concrete);
  box(7.0, 0.9, 13, 0.5, 1.8, 0.5, concrete);
  box(5.45, 1.95, 13, 3.7, 0.28, 0.46, steel);
  box(5.45, 1.78, 13, 3.7, 0.08, 0.5, caution);

  // Bollard slalom further down the yard.
  for (const [x, z] of [
    [1.2, 17.5],
    [6.4, 21],
    [2.2, 25],
    [7.1, 29],
    [3.4, 33],
  ] as const) {
    addCylinder(RAPIER, world, scene, x, z, 0.28, 1.45, bollardMat);
  }

  // Crate yard to the east.
  box(17, 0.55, 6, 1.3, 1.1, 1.2, crateMat, 0.2);
  box(19.2, 0.7, 8.4, 1.5, 1.4, 1.3, crateMat, -0.15);
  box(16.2, 1.15, 9.2, 1.1, 1.0, 1.1, crateMat, 0.4);
  box(18.4, 0.45, 4.2, 1.6, 0.9, 1.2, crateMat);

  // Corridor on the west side.
  box(-16, 0.75, 4, 0.4, 1.5, 10, concrete);
  box(-20.5, 0.75, 4, 0.4, 1.5, 10, concrete);
  box(-18.2, 0.55, 10.2, 4.2, 1.1, 0.4, concrete);

  // Lab building and a couple of columns.
  box(-16, 1.5, -15, 6.5, 3, 4.2, buildingMat, 0.15);
  addCylinder(RAPIER, world, scene, -8, 20, 0.45, 2.4, concrete);
  addCylinder(RAPIER, world, scene, -11, 24, 0.4, 2.1, concrete);

  // Jersey barriers.
  box(12, 0.65, -18, 3.2, 1.3, 0.55, barrier, 0.4);
  box(-2, 0.65, 28, 3.2, 1.3, 0.55, barrier, -0.3);
  box(22, 0.65, 16, 2.6, 1.3, 0.55, barrier, 1.1);

  addRamp(RAPIER, world, scene, rampMat, caution);

  // Perimeter with corner gaps, tall enough for the planar lidar.
  const walls: Array<[number, number, number, number]> = [
    [-14, 36, 18, 0.5],
    [14, 36, 18, 0.5],
    [-14, -36, 18, 0.5],
    [14, -36, 18, 0.5],
  ];
  for (const [x, z, length, depth] of walls) {
    const alongZ = Math.abs(z) > 30 && Math.abs(x) < 20;
    if (alongZ) box(x, 0.7, z, length, 1.4, depth, concrete);
    else box(z === 0 ? x : x, 0.7, z, depth, 1.4, length, concrete);
  }
  box(36, 0.7, -12, 0.5, 1.4, 16, concrete);
  box(36, 0.7, 12, 0.5, 1.4, 16, concrete);
  box(-36, 0.7, -12, 0.5, 1.4, 16, concrete);
  box(-36, 0.7, 12, 0.5, 1.4, 16, concrete);

  addTrees(RAPIER, world, scene);
}

function addRamp(
  RAPIER: Rapier,
  world: World,
  scene: THREE.Scene,
  material: THREE.Material,
  railMat: THREE.Material,
): void {
  const length = 8;
  const width = 3.4;
  const thickness = 0.22;
  const pitch = -0.16;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, length), material);
  mesh.position.set(18, 1, -12);
  mesh.rotation.x = pitch;
  mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mesh);
  mesh.position.y += -bounds.min.y + 0.01;
  mesh.updateMatrixWorld(true);
  addFixedBox(RAPIER, world, scene, mesh, width / 2, thickness / 2, length / 2, 1.1);

  const top = new THREE.Box3().setFromObject(mesh);
  const railH = 0.55;
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, railH, length * 0.92), railMat);
    rail.position.set(18 + side * (width / 2 - 0.05), top.max.y + 0.15, -12);
    rail.rotation.x = pitch;
    addFixedBox(RAPIER, world, scene, rail, 0.06, railH / 2, (length * 0.92) / 2, 0.6);
  }
}

function addTrees(RAPIER: Rapier, world: World, scene: THREE.Scene): void {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c34, roughness: 0.9 });
  const leafA = new THREE.MeshStandardMaterial({ color: 0x2f6b4a, roughness: 0.85 });
  const leafB = new THREE.MeshStandardMaterial({ color: 0x234e38, roughness: 0.88 });
  const spots: Array<[number, number, number]> = [
    [44, 18, 1.1],
    [46, -16, 0.9],
    [-44, 20, 1.2],
    [-46, -8, 0.85],
    [8, 46, 1],
    [-18, 48, 1.15],
    [24, -46, 0.95],
    [-30, -44, 1.05],
    [48, 40, 1.2],
    [-42, 42, 0.9],
  ];
  for (const [x, z, scale] of spots) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.2 * scale, 1.2 * scale, 7), trunkMat);
    trunk.position.y = 0.6 * scale;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95 * scale, 1), leafA);
    crown.position.y = 1.55 * scale;
    const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62 * scale, 1), leafB);
    crown2.position.set(0.35 * scale, 1.9 * scale, 0.15 * scale);
    group.add(trunk, crown, crown2);
    group.position.set(x, 0, z);
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    scene.add(group);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.9 * scale, z),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.9 * scale, 0.45 * scale).setFriction(0.6),
      body,
    );
  }
}

function addCylinder(
  RAPIER: Rapier,
  world: World,
  scene: THREE.Scene,
  x: number,
  z: number,
  radius: number,
  height: number,
  material: THREE.Material,
): void {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), material);
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, height / 2, z));
  world.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, radius).setFriction(0.7), body);
}

function addFixedBox(
  RAPIER: Rapier,
  world: World,
  scene: THREE.Scene,
  mesh: THREE.Mesh,
  hx: number,
  hy: number,
  hz: number,
  friction = 0.85,
): void {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const p = mesh.position;
  const q = mesh.quaternion;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(p.x, p.y, p.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction).setRestitution(0.02), body);
}
