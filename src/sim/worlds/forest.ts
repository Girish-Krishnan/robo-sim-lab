import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Solid } from "../course";
import { mountSolids, type WorldMount } from "../course";
import type { Atmosphere, GraphicsQuality } from "../scene";
import { forestGroundMaterial, loadPropKit, tileUvs, TILES_PER_METER } from "../surfaces";
import { foliageTexture } from "../textures";
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

function forestHeight(x: number, z: number): number {
  const trail = Math.exp(-((x - Math.sin(z * 0.09) * 1.2) ** 2) / 22);
  const bank = Math.exp(-((Math.abs(x) - 8) ** 2) / 8) * Math.exp(-((z - 28) ** 2) / 18);
  const bump = Math.sin(x * 0.7) * Math.cos(z * 0.45) * 0.18;
  return 0.02 + (1 - trail) * (0.28 + Math.max(0, bump)) + bank * 0.15;
}

export async function mountForest(
  RAPIER: Rapier,
  world: InstanceType<Rapier["World"]>,
  scene: THREE.Scene,
  quality: GraphicsQuality,
): Promise<WorldMount> {
  const kit = await loadPropKit(quality).catch(() => null);
  const group = new THREE.Group();
  group.name = "world-forest";
  scene.add(group);

  const geo = new THREE.PlaneGeometry(90, 110, 70, 80);
  tileUvs(geo, 90 * TILES_PER_METER, 110 * TILES_PER_METER);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  if (!pos) throw new Error("forest ground is missing positions");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, forestHeight(x, z));
  }
  geo.computeVertexNormals();
  const groundMat = kit
    ? await forestGroundMaterial(quality)
    : new THREE.MeshStandardMaterial({ color: 0x6a553c, roughness: 1 });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  if (quality === "high") scatterGroundCover(group);

  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x1f7f9c,
    roughness: 0.06,
    metalness: 0.55,
    transparent: true,
    opacity: 0.92,
    envMapIntensity: 1.4,
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

  const plankMat = kit?.planks ?? new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.85 });
  for (let z = 24.6; z <= 31.4; z += 0.55) {
    const plankGeo = new THREE.BoxGeometry(7.6, 0.06, 0.42);
    tileUvs(plankGeo, 4, 1);
    const plank = new THREE.Mesh(plankGeo, plankMat);
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

  const bodies = mountSolids(RAPIER, world, group, buildForestSolids(), kit);
  return { group, bodies };
}

function scatterGroundCover(group: THREE.Group): void {
  const blade = new THREE.PlaneGeometry(0.16, 0.55);
  blade.translate(0, 0.28, 0);
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x3e6a34,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const count = 3200;
  const grass = new THREE.InstancedMesh(blade, grassMat, count);
  grass.castShadow = false;
  grass.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count * 3 && n < count; i++) {
    const x = (Math.random() - 0.5) * 70;
    const z = (Math.random() - 0.5) * 90;
    const along = x - Math.sin(z * 0.09) * 1.2;
    if (Math.abs(along) < 2.4) continue;
    if (Math.abs(z - 28) < 6 && Math.abs(x) < 6) continue;
    dummy.position.set(x, forestHeight(x, z), z);
    dummy.rotation.y = Math.random() * Math.PI;
    const h = 0.55 + Math.random() * 0.7;
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(n, dummy.matrix);
    color.setHex(Math.random() > 0.5 ? 0x4e7a3c : 0x2f5a30);
    grass.setColorAt(n, color);
    n += 1;
  }
  grass.count = n;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  group.add(grass);

  const leafMat = new THREE.MeshStandardMaterial({
    map: foliageTexture(),
    alphaTest: 0.25,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const leafGeo = new THREE.PlaneGeometry(0.28, 0.18);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 220);
  let leavesN = 0;
  for (let i = 0; i < 220; i++) {
    const x = (Math.random() - 0.5) * 60;
    const z = (Math.random() - 0.5) * 80;
    dummy.position.set(x, forestHeight(x, z) + 0.02, z);
    dummy.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.4, Math.random() * Math.PI, 0);
    dummy.scale.setScalar(0.7 + Math.random());
    dummy.updateMatrix();
    leaves.setMatrixAt(leavesN, dummy.matrix);
    leavesN += 1;
  }
  leaves.instanceMatrix.needsUpdate = true;
  group.add(leaves);

  const stone = new THREE.MeshStandardMaterial({ color: 0x8d8880, roughness: 0.95 });
  for (let i = 0; i < 18; i++) {
    const x = (Math.random() - 0.5) * 50;
    const z = -10 + Math.random() * 70;
    if (Math.abs(x - Math.sin(z * 0.09) * 1.2) < 2.2) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.22, 0), stone);
    rock.scale.set(1.2, 0.55, 1);
    rock.position.set(x, forestHeight(x, z) + 0.05, z);
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }
}
