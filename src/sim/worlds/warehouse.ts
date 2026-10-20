import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Solid } from "../course";
import { mountSolids, type WorldMount } from "../course";
import type { Atmosphere, GraphicsQuality } from "../scene";
import { loadProps, placeCargo } from "../props";
import { loadPropKit, tileUvs, TILES_PER_METER } from "../surfaces";
import type { SpawnPose } from "../vehicle";
import { cuboid } from "./factory";

type Rapier = typeof RAPIER;

export const WAREHOUSE_SPAWN: SpawnPose = { x: 0, y: 0.84, z: -10, yaw: 0 };

export const WAREHOUSE_ATMOSPHERE: Atmosphere = {
  background: "#4c545c",
  fog: "#6e767e",
  fogNear: 22,
  fogFar: 78,
  hemiSky: 0xc5ccd2,
  hemiGround: 0x3a4046,
  hemiIntensity: 0.55,
  sunColor: 0xf0f2f4,
  sunIntensity: 1.7,
  exposure: 1.02,
  zenith: "#5c656e",
  horizon: "#8b9298",
  skyGround: "#3e444a",
  hdriBackground: false,
};

export function buildWarehouseSolids(): Solid[] {
  const solids: Solid[] = [];
  const shelf = (x: number, z: number, length: number) => {
    solids.push(cuboid(x, z, 1.35, 2.35, length, "shelf"));
  };
  // Main aisle is about 16 m between shelf faces so a teaching circle
  // (radius ~5.4 m, body out to ~6.4 m) fits in the south bay.
  // Side aisles stay wide enough for the car.
  shelf(-9.4, 14, 26);
  shelf(9.4, 14, 26);
  shelf(-15, 14, 26);
  shelf(15, 14, 26);
  solids.push(cuboid(0, 33.2, 16.2, 2.35, 1.2, "shelf"));

  // Perimeter walls. The south wall sits behind the open bay.
  solids.push(cuboid(0, 36, 36, 3.2, 0.4, "concrete"));
  solids.push(cuboid(0, -20, 36, 3.2, 0.4, "concrete"));
  solids.push(cuboid(-17.8, 8, 0.4, 3.2, 56, "concrete"));
  solids.push(cuboid(17.8, 8, 0.4, 3.2, 56, "concrete"));

  // Pallets in the main aisle. Each leaves a gap wider than the car.
  solids.push(cuboid(2.15, 6, 1.2, 1.35, 1.05, "pallet", 0.08));
  solids.push(cuboid(-2.05, 14, 1.15, 1.4, 1.1, "pallet", -0.12));
  solids.push(cuboid(1.9, 22, 1.2, 1.3, 1.15, "pallet", 0.2));
  solids.push(cuboid(-1.7, 28, 1.05, 1.45, 1.05, "crate", -0.05));
  solids.push(cuboid(-12.2, 8, 1.1, 1.35, 1.0, "pallet", 0.4));
  solids.push(cuboid(12.2, 18, 1.15, 1.4, 1.05, "barrel"));
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

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 60),
    new THREE.MeshStandardMaterial({ color: 0x3c434a, roughness: 0.9, side: THREE.DoubleSide }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 4.6, 12);
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
