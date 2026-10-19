import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Solid } from "../course";
import { mountSolids, type WorldMount } from "../course";
import type { Atmosphere, GraphicsQuality } from "../scene";
import { forestGroundMaterial, loadPropKit, tileUvs } from "../surfaces";
import { hashYaw, loadProps, scatter, type PropTemplate, type ScatterSolid } from "../props";
import { bladeTexture } from "../textures";
import type { SpawnPose } from "../vehicle";
import { ballSolid, cuboid, logSolid, pillar } from "./factory";

type Rapier = typeof RAPIER;

export const FOREST_SPAWN: SpawnPose = { x: 0, y: 0.84, z: -4, yaw: 0 };

export const FOREST_ATMOSPHERE: Atmosphere = {
  background: "#9aada0",
  fog: "#9aab98",
  fogNear: 80,
  fogFar: 210,
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
  tileUvs(geo, 90 * 1.15, 110 * 1.15);
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

  const solids = buildForestSolids();
  const props = await loadProps(["broadleaf", "pine", "bushy", "shrub", "fern", "grass", "boulder", "rock", "log"]).catch(
    (error: unknown) => {
      console.warn("[robo-sim] forest props unavailable", error);
      return null;
    },
  );
  const bodies = mountSolids(
    RAPIER,
    world,
    group,
    solids,
    kit,
    props ? new Set(["tree", "pine", "rock", "bush", "log"]) : undefined,
  );
  if (props) dressForest(group, solids, props, quality);
  return { group, bodies };
}

function dressForest(
  group: THREE.Group,
  solids: readonly Solid[],
  props: Record<string, PropTemplate>,
  quality: GraphicsQuality,
): void {
  const list = solids as readonly ScatterSolid[];
  const trees = list.filter((solid) => solid.look === "tree");
  const broad = trees.filter((solid) => hashYaw(solid.x, solid.z) < Math.PI);
  const leafy = trees.filter((solid) => hashYaw(solid.x, solid.z) >= Math.PI);
  scatter(
    group,
    props.broadleaf!,
    broad.map((solid) => ({
      x: solid.x,
      y: forestHeight(solid.x, solid.z),
      z: solid.z,
      yaw: hashYaw(solid.x, solid.z),
      scale: (solid.hy * 2 * 2.15) / props.broadleaf!.height,
    })),
  );
  scatter(
    group,
    props.bushy!,
    leafy.map((solid) => ({
      x: solid.x,
      y: forestHeight(solid.x, solid.z),
      z: solid.z,
      yaw: hashYaw(solid.z, solid.x),
      scale: (solid.hy * 2 * 1.7) / props.bushy!.height,
    })),
  );
  scatter(
    group,
    props.pine!,
    list
      .filter((solid) => solid.look === "pine")
      .map((solid) => ({
        x: solid.x,
        y: forestHeight(solid.x, solid.z),
        z: solid.z,
        yaw: hashYaw(solid.x, solid.z),
        scale: (solid.hy * 2 * 2.4) / props.pine!.height,
      })),
  );
  for (const solid of list.filter((item) => item.look === "rock")) {
    const template = solid.hx > 0.9 ? props.boulder! : props.rock!;
    scatter(group, template, [
      {
        x: solid.x,
        y: forestHeight(solid.x, solid.z),
        z: solid.z,
        yaw: hashYaw(solid.x, solid.z),
        scale: (solid.hx * 1.8) / template.height,
      },
    ]);
  }
  scatter(
    group,
    props.shrub!,
    list
      .filter((solid) => solid.look === "bush")
      .map((solid) => ({
        x: solid.x,
        y: forestHeight(solid.x, solid.z),
        z: solid.z,
        yaw: hashYaw(solid.x, solid.z),
        scale: (solid.hx * 2.4) / props.shrub!.height,
      })),
  );
  scatter(
    group,
    props.log!,
    list
      .filter((solid) => solid.look === "log")
      .map((solid) => ({
        x: solid.x,
        y: forestHeight(solid.x, solid.z),
        z: solid.z,
        yaw: solid.yaw,
        scale: (solid.hy * 2) / Math.max(0.2, props.log!.radius * 2),
      })),
    { cast: true },
  );

  const rand = mulberry32(19);
  const background: { template: PropTemplate; scale: number }[] = [
    { template: props.broadleaf!, scale: 8 },
    { template: props.pine!, scale: 7.5 },
    { template: props.bushy!, scale: 5.5 },
  ];
  const extras: { template: PropTemplate; items: { x: number; y: number; z: number; yaw: number; scale: number }[] }[] =
    background.map((entry) => ({ template: entry.template, items: [] }));
  for (let i = 0; i < 42; i++) {
    const z = -16 + rand() * 96;
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * (12 + rand() * 24);
    const pick = extras[Math.floor(rand() * extras.length)]!;
    const spec = background[extras.indexOf(pick)]!;
    pick.items.push({
      x,
      y: forestHeight(x, z),
      z,
      yaw: rand() * Math.PI * 2,
      scale: (spec.scale * (0.75 + rand() * 0.45)) / spec.template.height,
    });
  }
  for (const batch of extras) scatter(group, batch.template, batch.items);

  const edgeLogs: { x: number; y: number; z: number; yaw: number; scale: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const z = 6 + i * 9;
    const side = i % 2 === 0 ? 1 : -1;
    const x = Math.sin(z * 0.09) * 1.2 + side * 3.4;
    edgeLogs.push({
      x,
      y: forestHeight(x, z),
      z,
      yaw: side * 0.7,
      scale: 2.6 / Math.max(0.2, props.log!.radius * 2),
    });
  }
  scatter(group, props.log!, edgeLogs, { cast: true });

  if (quality !== "high") return;
  const ferns: { x: number; y: number; z: number; yaw: number; scale: number }[] = [];
  const tufts: { x: number; y: number; z: number; yaw: number; scale: number }[] = [];
  const shrubs: { x: number; y: number; z: number; yaw: number; scale: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const z = -8 + (i / 70) * 78;
    const side = i % 2 === 0 ? 1 : -1;
    const x = Math.sin(z * 0.09) * 1.2 + side * (2.5 + (i % 5) * 0.45);
    if (Math.abs(z - 28) < 5 && Math.abs(x) < 5.5) continue;
    const y = forestHeight(x, z);
    const yaw = hashYaw(x, z);
    if (i % 3 === 0) ferns.push({ x, y, z, yaw, scale: (0.7 + (i % 4) * 0.15) / props.fern!.height });
    else if (i % 3 === 1) tufts.push({ x, y, z, yaw, scale: 0.9 + (i % 3) * 0.25 });
    else shrubs.push({ x, y, z, yaw, scale: (1.1 + (i % 3) * 0.25) / props.shrub!.height });
  }
  for (let i = 0; i < 80; i++) {
    const x = (rand() - 0.5) * 64;
    const z = -12 + rand() * 90;
    const along = x - Math.sin(z * 0.09) * 1.2;
    if (Math.abs(along) < 2.3) continue;
    if (Math.abs(z - 28) < 5 && Math.abs(x) < 5.5) continue;
    const y = forestHeight(x, z);
    const yaw = rand() * Math.PI * 2;
    if (i < 28) ferns.push({ x, y, z, yaw, scale: (0.55 + rand() * 0.5) / props.fern!.height });
    else if (i < 48) shrubs.push({ x, y, z, yaw, scale: (0.9 + rand() * 0.7) / props.shrub!.height });
    else tufts.push({ x, y, z, yaw, scale: 0.7 + rand() * 0.8 });
  }
  scatter(group, props.fern!, ferns, { shadow: false, cast: false });
  scatter(group, props.shrub!, shrubs, { shadow: false });
  scatter(group, props.grass!, tufts, { shadow: false, cast: false });
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatterGroundCover(group: THREE.Group): void {
  const blade = new THREE.PlaneGeometry(0.09, 0.42);
  blade.translate(0, 0.21, 0);
  const grassMat = new THREE.MeshStandardMaterial({
    map: bladeTexture(),
    alphaTest: 0.6,
    roughness: 0.85,
    side: THREE.DoubleSide,
    color: 0xffffff,
  });
  const count = 2600;
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
    color.setHex(Math.random() > 0.5 ? 0xd7e8b0 : 0xb7d48a);
    grass.setColorAt(n, color);
    n += 1;
  }
  grass.count = n;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  group.add(grass);

  const leafMat = new THREE.MeshStandardMaterial({
    map: bladeTexture(),
    alphaTest: 0.55,
    roughness: 0.9,
    side: THREE.DoubleSide,
    color: 0xc4a05a,
  });
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.09);
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
