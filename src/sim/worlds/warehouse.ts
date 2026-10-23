import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Solid } from "../course";
import { mountSolids, type WorldMount } from "../course";
import type { Atmosphere, GraphicsQuality } from "../scene";
import { loadProps, placeCargo } from "../props";
import { loadPropKit, tileUvs, TILES_PER_METER } from "../surfaces";
import { cuboid } from "./factory";

export { WAREHOUSE_SPAWN } from "../spawns";

type Rapier = typeof RAPIER;

export const WAREHOUSE_ATMOSPHERE: Atmosphere = {
  background: "#8d98a3",
  fog: "#c5ced6",
  fogNear: 80,
  fogFar: 220,
  hemiSky: 0xd5dde6,
  hemiGround: 0x5a5048,
  hemiIntensity: 0.9,
  sunColor: 0xfff4e0,
  sunIntensity: 2.5,
  exposure: 1.12,
  zenith: "#7f93a8",
  horizon: "#e7d7c0",
  skyGround: "#6a6258",
  hdriBackground: false,
};

export function buildWarehouseSolids(): Solid[] {
  const solids: Solid[] = [];
  const shelf = (x: number, z: number, length: number) => {
    solids.push(cuboid(x, z, 1.35, 2.35, length, "shelf"));
  };
  // Aisle shelves sit north of the bay rack. Their south faces are at
  // z=22, clear of the outside orbit (the car rides ~3.2 m off the rack,
  // so the north lane is around z=18).
  shelf(-9.4, 27, 10);
  shelf(9.4, 27, 10);
  shelf(-16.2, 26, 10);
  shelf(16.2, 26, 10);
  solids.push(cuboid(0, 33.2, 16.2, 2.35, 1.2, "shelf"));
  // 16 m by 16 m. The south face stays at z=-1.2, outside the circle
  // envelope around (0, -8). Each face is long enough for the wall
  // follower to settle and brake before the corner. The outside of
  // this rack is the wall-follow loop and is kept empty.
  solids.push(cuboid(0, 6.8, 16, 2.2, 16, "shelf"));

  // Perimeter walls. The south wall sits behind the open bay.
  solids.push(cuboid(0, 36, 36, 3.2, 0.4, "concrete"));
  solids.push(cuboid(0, -20, 36, 3.2, 0.4, "concrete"));
  solids.push(cuboid(-17.8, 8, 0.4, 3.2, 56, "concrete"));
  solids.push(cuboid(17.8, 8, 0.4, 3.2, 56, "concrete"));

  // A loose slalom in the center aisle. Gaps stay wider than a reverse
  // arc, so a noisy scan can back out of the end shelf without planting
  // on the next pallet. The rack's outside lane stays empty for wall follow.
  solids.push(cuboid(5.0, 23.2, 1.2, 1.35, 1.05, "pallet", 0.08));
  solids.push(cuboid(-6.5, 29.5, 1.15, 1.4, 1.1, "pallet", -0.12));
  solids.push(cuboid(4.2, 30.2, 1.05, 1.45, 1.05, "crate", 0.15));
  solids.push(cuboid(-2.5, 22.8, 1.15, 1.4, 1.05, "barrel"));
  return solids;
}

export async function mountWarehouse(
  RAPIER: Rapier,
  world: InstanceType<Rapier["World"]>,
  scene: THREE.Scene,
  quality: GraphicsQuality,
): Promise<WorldMount> {
  const kit = await loadPropKit(quality).catch(() => null);
  const group = new THREE.Group();
  group.name = "world-warehouse";
  scene.add(group);

  const floorGeo = new THREE.PlaneGeometry(40, 70);
  tileUvs(floorGeo, 40 * TILES_PER_METER, 70 * TILES_PER_METER);
  const floor = new THREE.Mesh(
    floorGeo,
    kit?.concrete ?? new THREE.MeshStandardMaterial({ color: 0x8d9196, roughness: 0.86, metalness: 0.08 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.012, 10);
  floor.receiveShadow = true;
  group.add(floor);

  // Roof the north aisles only. The south bay stays open so the chase
  // camera (about 6 m up, behind the driving spawn) is not inside a plane,
  // and the bay reads as a building instead of a gray fog box.
  // A thin box over the north aisles only. A large plane's diagonal
  // reads as a dark triangle when the chase camera looks up the bay.
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(34, 0.18, 14),
    new THREE.MeshStandardMaterial({ color: 0x4a525a, roughness: 0.9 }),
  );
  ceiling.position.set(0, 9.4, 33);
  group.add(ceiling);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff6e0,
    emissive: 0xffe2a0,
    emissiveIntensity: 0.8,
    roughness: 0.3,
  });
  for (const z of [-4, 6, 16, 26]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.35), lampMat);
    lamp.position.set(0, 4.35, z);
    group.add(lamp);
  }

  const stripe = new THREE.MeshBasicMaterial({ color: 0xe3a23a });
  for (const x of [-3.4, 3.4]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 28), stripe);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.02, 14);
    group.add(line);
  }

  if (kit) {
    const railMat = new THREE.MeshStandardMaterial({ color: 0xd2a03a, roughness: 0.4, metalness: 0.65 });
    for (const x of [-3.5, 3.5, -11.8, 11.8]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 24, 12), railMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(x, 0.16, 14);
      rail.castShadow = true;
      group.add(rail);
    }
  }

  const solids = buildWarehouseSolids();
  const props = await loadProps(["crate", "barrel"]).catch((error: unknown) => {
    console.warn("[robo-sim] warehouse props unavailable", error);
    return null;
  });
  const bodies = mountSolids(
    RAPIER,
    world,
    group,
    solids,
    kit,
    props ? new Set(["crate", "barrel", "pallet"]) : undefined,
  );
  if (props) placeCargo(group, solids, props);
  return { group, bodies };
}
