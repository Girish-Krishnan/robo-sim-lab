import type { Scene } from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import { mountCity, releaseMount, type WorldMount } from "../course";
import { CITY_ATMOSPHERE, type Atmosphere, type GraphicsQuality } from "../scene";
import { DEFAULT_SPAWN, type SpawnPose } from "../vehicle";

type Rapier = typeof RAPIER;
type World = InstanceType<Rapier["World"]>;

export const WORLD_STORAGE_KEY = "robo-sim-lab.world";
export const QUALITY_STORAGE_KEY = "robo-sim-lab.quality";

export const WORLDS = [
  { id: "city", label: "City streets" },
  { id: "track", label: "F1TENTH track" },
  { id: "forest", label: "Forest trail" },
  { id: "warehouse", label: "Warehouse" },
] as const;

export type WorldId = (typeof WORLDS)[number]["id"];

export interface SimWorld extends WorldMount {
  id: WorldId;
  spawn: SpawnPose;
  atmosphere: Atmosphere;
}

export function isWorldId(value: string | null): value is WorldId {
  return WORLDS.some((world) => world.id === value);
}

/** City is in the main bundle. The other yards load the first time they are selected. */
export async function mountWorld(
  id: WorldId,
  RAPIER: Rapier,
  world: World,
  scene: Scene,
  quality: GraphicsQuality,
): Promise<SimWorld> {
  if (id === "city") {
    return { ...(await mountCity(RAPIER, world, scene, quality)), id, spawn: DEFAULT_SPAWN, atmosphere: CITY_ATMOSPHERE };
  }
  if (id === "track") {
    const mod = await import("./track");
    return {
      ...(await mod.mountTrack(RAPIER, world, scene, quality)),
      id,
      spawn: mod.TRACK_SPAWN,
      atmosphere: mod.TRACK_ATMOSPHERE,
    };
  }
  if (id === "forest") {
    const mod = await import("./forest");
    return {
      ...(await mod.mountForest(RAPIER, world, scene, quality)),
      id,
      spawn: mod.FOREST_SPAWN,
      atmosphere: mod.FOREST_ATMOSPHERE,
    };
  }
  const mod = await import("./warehouse");
  return {
    ...(await mod.mountWarehouse(RAPIER, world, scene, quality)),
    id,
    spawn: mod.WAREHOUSE_SPAWN,
    atmosphere: mod.WAREHOUSE_ATMOSPHERE,
  };
}

export function disposeWorld(world: World, mount: WorldMount): void {
  releaseMount(world, mount);
}
