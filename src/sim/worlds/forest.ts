import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Solid } from "../course";
import { mountSolids, type WorldMount } from "../course";
import type { Atmosphere, GraphicsQuality } from "../scene";
import { forestGroundMaterial, loadPropKit, tileUvs } from "../surfaces";
import {
  anchoredInstance,
  hashYaw,
  loadProps,
  SCANNED_TRUNK,
  scatter,
  type PropInstance,
  type PropTemplate,
} from "../props";
import { bladeTexture } from "../textures";
import { referenceRoute } from "../routes";
import { ballSolid, cuboid, logSolid, pillar } from "./factory";

export { FOREST_SPAWN } from "../spawns";

type Rapier = typeof RAPIER;

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
    // The corridor fence closes at z=38. Trees past the trail's north
    // bend sit in the outside lane a wall follower uses.
    if (z > 34) continue;
    const wave = Math.sin(z * 0.18) * 1.4;
    tree(-7.2 - (i % 3) * 1.3, z + (i % 2), i % 3 === 0 ? "pine" : "tree");
    tree(7.4 + (i % 4) * 1.1, z - 1.2, i % 2 === 0 ? "pine" : "tree");
    tree(-11.5, z + 2, "pine");
    tree(12.2, z - 0.4, "tree");
    if (i % 4 === 0) tree(wave - 9.5, z + 6, "tree");
  }

  // Trail obstacles, tall enough for the lidar, with a clear line down the middle.
  solids.push(ballSolid(2.8, 16, 0.9, "rock", 0x6e7370));
  // West of the bridge, off the reference line. On the deck it sat in the
  // path a drifted second lap was tracking.
  solids.push(ballSolid(-5.4, 22.8, 0.95, "rock", 0x7c756c));
  solids.push(ballSolid(2.7, 30, 0.88, "rock", 0x5e6664));
  solids.push(logSolid(3.4, 21, 0.72, 2.2, 0.5));
  solids.push(logSolid(1.6, 6, 0.72, 2.4, -0.4));
  solids.push(ballSolid(-3.3, 10, 0.86, "bush", 0x2f6b45));
  solids.push(ballSolid(-1.4, 13, 0.9, "bush", 0x346b46));
  solids.push(ballSolid(6.2, 18, 0.92, "bush", 0x2a5e3d));
  solids.push(ballSolid(-6.4, 30, 0.88, "bush", 0x3d7d52));

  // Stream banks and bridge rails. The deck itself is the physics ground.
  // The north posts stop short of the turnaround so a U-turn on the trail
  // does not clip a post.
  for (const x of [-4.3, 4.3]) {
    for (const z of [23.2, 25.4, 30.6]) {
      solids.push(pillar(x, z, 0.08, 1.45, "fence", 0x6a4a30));
    }
    solids.push(cuboid(x, 28, 0.1, 1.15, 6.2, "fence"));
  }
  solids.push(ballSolid(-8, 26, 0.9, "rock", 0x6a6760));
  solids.push(ballSolid(8.2, 31, 0.95, "rock", 0x7a756e));
  solids.push(logSolid(-7.2, 29, 0.7, 2.4, 0.2));
  solids.push(logSolid(7.4, 24.5, 0.7, 2.4, -0.2));

  // Corridor around the trail. The outer yard fence is far enough that a
  // gap follower leaves the trees and laps empty grass. This one keeps
  // that run among the trunks, and gives wall follow a continuous edge.
  // The west fence sits out from the return lane (x=-20.1). A noisy lap
  // drifts about 2 m off that line, and the body still has to clear the
  // boards. North and south fences reach the same corner.
  solids.push(cuboid(16.5, 11, 0.45, 1.6, 54, "fence"));
  solids.push(cuboid(-24.2, 11, 0.45, 1.6, 54, "fence"));
  solids.push(cuboid(-3.875, 38, 41.65, 1.6, 0.45, "fence"));
  solids.push(cuboid(-3.875, -16, 41.65, 1.6, 0.45, "fence"));

  // Yard boundary, tall enough for the lidar. Keeps an open-space
  // follower from driving off the ground plane.
  solids.push(cuboid(0, 50, 78, 1.45, 0.25, "fence"));
  solids.push(cuboid(0, -48, 78, 1.45, 0.25, "fence"));
  solids.push(cuboid(40, 1, 0.25, 1.45, 98, "fence"));
  solids.push(cuboid(-40, 1, 0.25, 1.45, 98, "fence"));

  for (const tree of forestBackground(mulberry32(19))) {
    const radius = tree.kind === "pine" ? 0.34 : 0.5;
    solids.push(pillar(tree.x, tree.z, radius, Math.max(3.2, tree.height), tree.kind, tree.kind === "pine" ? 0x2a4a34 : 0x6a4b32));
  }
  for (let i = 0; i < 6; i++) {
    const z = 6 + i * 9;
    const side = i % 2 === 0 ? 1 : -1;
    const parked = parkOffTheLanes(Math.sin(z * 0.09) * 1.2 + side * 3.4, z);
    solids.push(logSolid(parked.x, parked.z, 0.72, 2.6, side * 0.7));
  }
  fitAndSeatTrunks(solids);
  return solids;
}

type TreeFile = "broadleaf" | "bushy" | "pine";

interface TreeChoice {
  file: TreeFile;
  scale: number;
}

/** Which scanned tree a solid wears. Remembered before a clearance nudge, which can move the hash. */
const treeChoice = new WeakMap<Solid, TreeChoice>();

function chooseTree(solid: { look: string; x: number; z: number; hy: number }): TreeChoice | null {
  if (solid.look === "pine") {
    return { file: "pine", scale: (solid.hy * 2 * 2.4) / SCANNED_TRUNK.pine.height };
  }
  if (solid.look === "tree") {
    if (hashYaw(solid.x, solid.z) < Math.PI) {
      return { file: "broadleaf", scale: (solid.hy * 2 * 2.15) / SCANNED_TRUNK.broadleaf.height };
    }
    return { file: "bushy", scale: (solid.hy * 2 * 1.7) / SCANNED_TRUNK.bushy.height };
  }
  return null;
}

/** Dress choice for one trunk. Scale is the uniform factor applied to the scanned model. */
export function forestTreeDress(solid: Solid): { file: TreeFile; yaw: number; scale: number } | null {
  const choice = treeChoice.get(solid) ?? chooseTree(solid);
  if (!choice) return null;
  const yaw = choice.file === "bushy" ? hashYaw(solid.z, solid.x) : hashYaw(solid.x, solid.z);
  return { file: choice.file, yaw, scale: choice.scale };
}

/** Closest point on the forest loop, so a trunk cannot hide between waypoints. */
function closestOnRoute(x: number, z: number, route: readonly { x: number; z: number }[]): { dist: number; x: number; z: number } {
  let best = Infinity;
  let nearX = x;
  let nearZ = z;
  for (let i = 0; i < route.length; i++) {
    const a = route[i]!;
    const b = route[(i + 1) % route.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best) {
      best = dist;
      nearX = px;
      nearZ = pz;
    }
  }
  return { dist: best, x: nearX, z: nearZ };
}

/**
 * Widen each trunk to the scanned wood, then step it off the reference
 * loop until a pursuit lap still clears the bark. If a step would drop
 * the tree into the return lane, shrink that one tree instead — the
 * collider and the mesh stay the same size either way.
 */
function fitAndSeatTrunks(solids: Solid[]): void {
  const homes = new Map<Solid, { x: number; z: number }>();
  for (const solid of solids) {
    const choice = chooseTree(solid);
    if (!choice) continue;
    treeChoice.set(solid, choice);
    homes.set(solid, { x: solid.x, z: solid.z });
    const radius = SCANNED_TRUNK[choice.file].radius * choice.scale;
    solid.hx = radius;
    solid.hz = radius;
  }
  const route = referenceRoute("forest");
  // Surface gap. The body is about 0.7 m wide of center and a noisy
  // pursuit lap wanders; 3.1 m of bark-to-path kept seed 1 off the trunks.
  const keep = 3.1;
  for (let pass = 0; pass < 16; pass++) {
    let moved = false;
    for (const solid of solids) {
      const choice = treeChoice.get(solid);
      if (!choice) continue;
      const near = closestOnRoute(solid.x, solid.z, route);
      const gap = near.dist - solid.hx;
      if (gap >= keep) continue;
      const push = keep - gap + 0.04;
      const dx = solid.x - near.x;
      const dz = solid.z - near.z;
      const len = Math.hypot(dx, dz) || 1;
      const nextX = solid.x + (dx / len) * push;
      const nextZ = solid.z + (dz / len) * push;
      const home = homes.get(solid)!;
      const stepped = Math.hypot(nextX - home.x, nextZ - home.z);
      const intoReturn = nextZ > -16 && nextZ < 38 && Math.abs(nextX + 20.1) < 2.6;
      if (stepped > 4 || intoReturn) {
        const cap = Math.max(0.22, near.dist - keep);
        solid.hx = cap;
        solid.hz = cap;
        choice.scale = cap / SCANNED_TRUNK[choice.file].radius;
        continue;
      }
      solid.x = nextX;
      solid.z = nextZ;
      moved = true;
    }
    if (!moved) break;
  }
}

export interface ForestDressing {
  template: PropTemplate;
  item: PropInstance;
  solid: Solid;
}

/** One instanced prop per blocking solid the forest dresses with a scan. */
export function forestDressing(
  solids: readonly Solid[],
  props: Partial<Record<TreeFile | "boulder" | "rock" | "shrub" | "log", PropTemplate>>,
): ForestDressing[] {
  const dressed: ForestDressing[] = [];
  for (const solid of solids) {
    const tree = forestTreeDress(solid);
    if (tree) {
      const template = props[tree.file];
      if (!template) continue;
      dressed.push({
        template,
        item: anchoredInstance(template, solid.x, solid.z, forestHeight(solid.x, solid.z), tree.yaw, tree.scale),
        solid,
      });
      continue;
    }
    if (solid.look === "rock") {
      const template = solid.hx > 0.9 ? props.boulder : props.rock;
      if (!template) continue;
      const scale = solid.hx / Math.max(0.05, template.radius);
      dressed.push({
        template,
        item: anchoredInstance(template, solid.x, solid.z, forestHeight(solid.x, solid.z), hashYaw(solid.x, solid.z), scale),
        solid,
      });
      continue;
    }
    if (solid.look === "bush") {
      const template = props.shrub;
      if (!template) continue;
      const scale = solid.hx / Math.max(0.05, template.radius);
      dressed.push({
        template,
        item: anchoredInstance(template, solid.x, solid.z, forestHeight(solid.x, solid.z), hashYaw(solid.x, solid.z), scale),
        solid,
      });
      continue;
    }
    if (solid.look === "log" && props.log) {
      const template = props.log;
      dressed.push({
        template,
        item: anchoredInstance(template, solid.x, solid.z, forestHeight(solid.x, solid.z), solid.yaw, {
          x: (solid.hx * 2) / template.size.x,
          y: (solid.hx * 2) / template.size.y,
          z: (solid.hy * 2) / template.size.z,
        }),
        solid,
      });
    }
  }
  return dressed;
}

/**
 * The 42 trees that used to be painted with no collider. They are nudged
 * off the trail, the west return, and the lap wall follow drives around
 * the outside of the corridor fence. The same draw is burned again while
 * dressing ferns, which keeps those plants where they were.
 */
function forestBackground(rand: () => number): { kind: "tree" | "pine"; x: number; z: number; height: number }[] {
  const trees: { kind: "tree" | "pine"; x: number; z: number; height: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const z = -16 + rand() * 96;
    const side = rand() > 0.5 ? 1 : -1;
    let x = side * (12 + rand() * 24);
    const pick = Math.floor(rand() * 3);
    rand();
    const jitter = 0.75 + rand() * 0.45;
    const specScale = pick === 1 ? 7.5 : pick === 2 ? 5.5 : 8;
    const parked = parkOffTheLanes(x, z);
    const height = (specScale * jitter) / (pick === 1 ? 2.4 : 2.15);
    trees.push({ kind: pick === 1 ? "pine" : "tree", x: parked.x, z: parked.z, height });
  }
  return trees;
}

function parkOffTheLanes(x: number, z: number): { x: number; z: number } {
  const clear = () => {
    const trail = Math.sin(z * 0.09) * 1.2;
    if (Math.abs(x - trail) < 2.3) x = x >= trail ? trail + 2.5 : trail - 2.5;
    // Pursuit returns on x=-20.1, inside the west fence.
    if (z > -16 && z < 38 && Math.abs(x + 20.1) < 2.4) x = -26;
    // Wall follow holds about 3.2 m off the outside of the corridor fence
    // (east face x≈16.7, west x≈-24.4, north z≈38.2, south z≈-16.2).
    if (z > -22 && z < 46 && x > 16.2 && x < 25) x = 29;
    if (z > -22 && z < 46 && x < -23.8 && x > -34) x = -37;
    if (x > -38 && x < 32 && z > 37.4 && z < 46) z = 47;
    if (x > -38 && x < 32 && z < -15.4 && z > -24) z = -28;
  };
  clear();
  // A noisy pursuit lap wanders a few meters off the waypoints. Keep the
  // extra trunks and logs outside that band, then run the lane clear again
  // so the push cannot drop one onto the wall lap.
  for (const point of referenceRoute("forest")) {
    const dx = x - point.x;
    const dz = z - point.z;
    if (dx * dx + dz * dz >= 4.8 * 4.8) continue;
    x = point.x >= 0 ? point.x + 5.4 : point.x - 5.4;
  }
  clear();
  return { x, z };
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
  const groups = new Map<PropTemplate, PropInstance[]>();
  for (const { template, item } of forestDressing(solids, props)) {
    const items = groups.get(template) ?? [];
    items.push(item);
    groups.set(template, items);
  }
  for (const [template, items] of groups) scatter(group, template, items);

  const rand = mulberry32(19);
  forestBackground(rand);

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
    if (i % 3 === 0) ferns.push({ x, y, z, yaw, scale: (0.55 + (i % 4) * 0.1) / props.fern!.height });
    else if (i % 3 === 1) tufts.push({ x, y, z, yaw, scale: (0.32 + (i % 3) * 0.1) / props.grass!.height });
    else shrubs.push({ x, y, z, yaw, scale: (0.9 + (i % 3) * 0.2) / props.shrub!.height });
  }
  for (let i = 0; i < 80; i++) {
    const x = (rand() - 0.5) * 64;
    const z = -12 + rand() * 90;
    const along = x - Math.sin(z * 0.09) * 1.2;
    if (Math.abs(along) < 2.3) continue;
    if (Math.abs(z - 28) < 5 && Math.abs(x) < 5.5) continue;
    const y = forestHeight(x, z);
    const yaw = rand() * Math.PI * 2;
    if (i < 28) ferns.push({ x, y, z, yaw, scale: (0.45 + rand() * 0.35) / props.fern!.height });
    else if (i < 48) shrubs.push({ x, y, z, yaw, scale: (0.8 + rand() * 0.5) / props.shrub!.height });
    else tufts.push({ x, y, z, yaw, scale: (0.28 + rand() * 0.28) / props.grass!.height });
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
