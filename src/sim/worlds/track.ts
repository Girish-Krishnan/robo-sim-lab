import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Solid } from "../course";
import { mountSolids, type WorldMount } from "../course";
import type { Atmosphere, GraphicsQuality } from "../scene";
import { loadProps, placeCargo } from "../props";
import { loadPropKit, tileUvs, TILES_PER_METER } from "../surfaces";
import { TRACK_SPAWN } from "../spawns";
import { coneSolid, cuboid } from "./factory";

export { TRACK_SPAWN };

type Rapier = typeof RAPIER;

const INNER = 9;
const OUTER = 23;
const Z_IN = 36;
const Z_OUT = 48;
const WALL_H = 1.58;
const WALL_T = 0.42;

export const TRACK_ATMOSPHERE: Atmosphere = {
  background: "#9eb6cc",
  fog: "#c5d3e2",
  fogNear: 40,
  fogFar: 170,
  hemiSky: 0xd5e4f5,
  hemiGround: 0x6a7a58,
  hemiIntensity: 0.9,
  sunColor: 0xfff4e0,
  sunIntensity: 3.3,
  exposure: 1.14,
  zenith: "#4d78b4",
  horizon: "#f3e2c4",
  skyGround: "#8d9078",
};

/** Closed oval. Corridor is about 14 m wide, so a gentle circle fits on the straight. */
export function buildTrackSolids(): Solid[] {
  const wall = (x: number, z: number, sx: number, sz: number) =>
    cuboid(x, z, sx, WALL_H, sz, "foam", 0, 0xe24b2a, 0.7);

  const solids: Solid[] = [
    wall(INNER, 0, WALL_T, Z_IN * 2),
    wall(-INNER, 0, WALL_T, Z_IN * 2),
    wall(0, Z_IN, INNER * 2, WALL_T),
    wall(0, -Z_IN, INNER * 2, WALL_T),
    wall(OUTER, 0, WALL_T, Z_OUT * 2),
    wall(-OUTER, 0, WALL_T, Z_OUT * 2),
    wall(0, Z_OUT, OUTER * 2, WALL_T),
    wall(0, -Z_OUT, OUTER * 2, WALL_T),
  ];

  // Obstacles sit off the inner racing line so a right-wall pass still has a gap.
  const cones: [number, number][] = [
    [20.2, -2],
    [19.4, 10],
    [20.6, 22],
    [19.2, 32],
    [-20.4, 12],
    [-19.5, -2],
    [-20.2, -16],
    [16, 44.5],
    [-16, 44.5],
    [2, -44.2],
  ];
  for (const [x, z] of cones) solids.push(coneSolid(x, z, 0.34, 1.45, 0xf06a12));

  solids.push(cuboid(20.4, 16, 1.15, 1.5, 1.15, "crate", 0.15));
  solids.push(cuboid(19.6, 4, 1.1, 1.45, 1.15, "crate", -0.1));
  solids.push(cuboid(-20.2, 2, 1.15, 1.5, 1.1, "crate", 0.3));
  solids.push(cuboid(18, 45.2, 1.15, 1.45, 1.15, "barrel"));
  return solids;
}

export async function mountTrack(
  RAPIER: Rapier,
  world: InstanceType<Rapier["World"]>,
  scene: THREE.Scene,
  quality: GraphicsQuality,
): Promise<WorldMount> {
  const kit = await loadPropKit(quality).catch(() => null);
  const group = new THREE.Group();
  group.name = "world-track";
  scene.add(group);

  const grassMat = kit?.grass ?? new THREE.MeshStandardMaterial({ color: 0x3f6b45, roughness: 1 });
  const asphaltMat = kit?.asphalt ?? new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.92, metalness: 0.04 });
  const yard = new THREE.PlaneGeometry(130, 150);
  tileUvs(yard, 130 * 1.15, 150 * 1.15);
  const floor = new THREE.Mesh(yard, grassMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.008;
  floor.receiveShadow = true;
  group.add(floor);

  const band = (x: number, z: number, w: number, d: number, y: number) => {
    const geo = new THREE.PlaneGeometry(w, d);
    tileUvs(geo, w * TILES_PER_METER, d * TILES_PER_METER);
    const mesh = new THREE.Mesh(geo, asphaltMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const lane = OUTER - INNER + 1.6;
  band((INNER + OUTER) / 2, 0, lane, Z_OUT * 2 + 2, 0.012);
  band(-(INNER + OUTER) / 2, 0, lane, Z_OUT * 2 + 2, 0.012);
  const cap = Z_OUT - Z_IN + 2.4;
  band(0, (Z_IN + Z_OUT) / 2, OUTER * 2 + 2, cap, 0.013);
  band(0, -(Z_IN + Z_OUT) / 2, OUTER * 2 + 2, cap, 0.013);

  const infieldGeo = new THREE.PlaneGeometry(INNER * 2 - 1.4, Z_IN * 2 - 1.4);
  tileUvs(infieldGeo, (INNER * 2) * TILES_PER_METER, (Z_IN * 2) * TILES_PER_METER);
  const infield = new THREE.Mesh(infieldGeo, grassMat);
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = 0.02;
  infield.receiveShadow = true;
  group.add(infield);

  const paint = new THREE.MeshBasicMaterial({ color: 0xf4f1e6 });
  const kerb = new THREE.MeshBasicMaterial({ color: 0xe25b2a });
  const kerb2 = new THREE.MeshBasicMaterial({ color: 0xf7f4ee });
  for (let z = -Z_IN + 2; z < Z_IN - 2; z += 2.2) {
    for (const x of [INNER + 0.7, OUTER - 0.7, -INNER - 0.7, -OUTER + 0.7]) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.05), (Math.round(z / 2.2) % 2 === 0 ? kerb : kerb2));
      a.rotation.x = -Math.PI / 2;
      a.position.set(x, 0.025, z);
      group.add(a);
    }
  }
  // Start/finish across the east straight.
  for (let i = 0; i < 8; i++) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.55), i % 2 === 0 ? paint : kerb);
    band.rotation.x = -Math.PI / 2;
    band.position.set(10.2 + i * 1.35, 0.03, TRACK_SPAWN.z);
    group.add(band);
  }

  const solids = buildTrackSolids();
  const props = await loadProps(["crate", "barrel"]).catch((error: unknown) => {
    console.warn("[robo-sim] track props unavailable", error);
    return null;
  });
  const bodies = mountSolids(RAPIER, world, group, solids, kit, props ? new Set(["crate", "barrel"]) : undefined);
  if (props) placeCargo(group, solids, props);
  return { group, bodies };
}
