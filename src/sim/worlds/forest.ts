import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Solid } from "../course";
import { mountSolids, type WorldMount } from "../course";
import type { Atmosphere } from "../scene";
import { dirtTexture } from "../textures";
import type { SpawnPose } from "../vehicle";
import { ballSolid, cuboid, logSolid, pillar } from "./factory";

type Rapier = typeof RAPIER;

export const FOREST_SPAWN: SpawnPose = { x: 0, y: 0.84, z: -4, yaw: 0 };

export const FOREST_ATMOSPHERE: Atmosphere = {
  background: "#9aada0",
  fog: "#c5d0c2",
  fogNear: 14,
  fogFar: 78,
  hemiSky: 0xc9d8c4,
  hemiGround: 0x3d4a32,
  hemiIntensity: 0.72,
  sunColor: 0xffe6c2,
  sunIntensity: 2.2,
  exposure: 1.05,
  zenith: "#6e8f9a",
  horizon: "#d5c7a4",
  skyGround: "#5c684c",
};

export function buildForestSolids(): Solid[] {
  const solids: Solid[] = [];
  const tree = (x: number, z: number, kind: "tree" | "pine") => {
    const height = kind === "pine" ? 4.2 + ((x * 3 + z) % 5) * 0.35 : 3.4 + ((x + z * 2) % 4) * 0.4;
    solids.push(pillar(x, z, kind === "pine" ? 0.22 : 0.28, height, kind, kind === "pine" ? 0x2a4a34 : 0x6a4b32));
  };

  for (let i = 0; i < 18; i++) {
    const z = -8 + i * 4.3;
    const wave = Math.sin(z * 0.18) * 1.4;
    tree(-7.2 - (i % 3) * 1.3, z + (i % 2), i % 3 === 0 ? "pine" : "tree");
    tree(7.4 + (i % 4) * 1.1, z - 1.2, i % 2 === 0 ? "pine" : "tree");
    tree(-11.5, z + 2, "pine");
    tree(12.2, z - 0.4, "tree");
    if (i % 4 === 0) tree(wave - 9.5, z + 6, "tree");
  }

  // Trail obstacles, tall enough for the lidar, with a clear line down the middle.
  solids.push(ballSolid(2.8, 16, 0.9, "rock", 0x6e7370));
  solids.push(ballSolid(-3.0, 28, 0.95, "rock", 0x7c756c));
  solids.push(ballSolid(2.7, 42, 0.88, "rock", 0x5e6664));
  solids.push(logSolid(-2.8, 22, 0.72, 2.2, 0.5));
  solids.push(logSolid(2.9, 36, 0.72, 2.4, -0.4));
  solids.push(ballSolid(-3.3, 10, 0.86, "bush", 0x2f6b45));
  solids.push(ballSolid(3.2, 48, 0.9, "bush", 0x346b46));
  solids.push(ballSolid(6.2, 18, 0.92, "bush", 0x2a5e3d));
  solids.push(ballSolid(-6.4, 30, 0.88, "bush", 0x3d7d52));

  // Stream banks and bridge rails. The deck itself is the physics ground.
  for (const x of [-4.3, 4.3]) {
    for (const z of [23.2, 25.4, 30.6, 32.8]) {
      solids.push(pillar(x, z, 0.08, 1.45, "fence", 0x6a4a30));
    }
    solids.push(cuboid(x, 28, 0.1, 1.15, 6.2, "fence"));
  }
  solids.push(ballSolid(-8, 26, 0.9, "rock", 0x6a6760));
  solids.push(ballSolid(8.2, 31, 0.95, "rock", 0x7a756e));
  solids.push(logSolid(-7.2, 29, 0.7, 2.4, 0.2));
  solids.push(logSolid(7.4, 24.5, 0.7, 2.4, -0.2));
  return solids;
}

export function mountForest(RAPIER: Rapier, world: InstanceType<Rapier["World"]>, scene: THREE.Scene): WorldMount {
  const group = new THREE.Group();
  group.name = "world-forest";
  scene.add(group);

  const geo = new THREE.PlaneGeometry(90, 110, 50, 60);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  if (!pos) throw new Error("forest ground is missing positions");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const trail = Math.exp(-((x - Math.sin(z * 0.09) * 1.2) ** 2) / 22);
    const bank = Math.exp(-((Math.abs(x) - 8) ** 2) / 8) * Math.exp(-((z - 28) ** 2) / 18);
    const bump = Math.sin(x * 0.7) * Math.cos(z * 0.45) * 0.18;
    const height = (1 - trail) * (0.28 + Math.max(0, bump)) + bank * 0.15;
    pos.setY(i, 0.02 + height);
  }
  geo.computeVertexNormals();
  const dirt = dirtTexture();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: dirt, roughness: 1, metalness: 0, color: 0xc4b090 }),
  );
  ground.receiveShadow = true;
  group.add(ground);

  const trailMat = new THREE.MeshStandardMaterial({ color: 0x6a553c, roughness: 1 });
  for (const [z, length] of [
    [6, 36],
    [50, 36],
  ] as const) {
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(6.2, length), trailMat);
    trail.rotation.x = -Math.PI / 2;
    trail.position.set(0, 0.03, z);
    trail.receiveShadow = true;
    group.add(trail);
  }

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2a8eab,
    roughness: 0.12,
    metalness: 0.35,
    transparent: true,
    opacity: 0.92,
  });
  for (const x of [-9.2, 9.2]) {
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(8, 9), waterMat);
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(x, 0.045, 28);
    group.add(bank);
  }
  const under = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 7.4), waterMat);
  under.rotation.x = -Math.PI / 2;
  under.position.set(0, 0.018, 28);
  group.add(under);

  const plankMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.85 });
  for (let z = 24.6; z <= 31.4; z += 0.55) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.06, 0.42), plankMat);
    plank.position.set(0, 0.05, z);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  const shaftMat = new THREE.MeshBasicMaterial({
    color: 0xfff0cc,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const [x, z] of [
    [-3, 12],
    [4, 36],
    [-2, 52],
  ] as const) {
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(2.4, 16, 8, 1, true), shaftMat);
    shaft.position.set(x, 8, z);
    group.add(shaft);
  }

  const bodies = mountSolids(RAPIER, world, group, buildForestSolids());
  return { group, bodies };
}
