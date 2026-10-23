import { worldToOdom } from "../api/odometry";
import type { KnownMap } from "../api/types";
import type { Solid } from "./course";

/** Cell size of the known map. Coarse enough to ship every control tick. */
const RESOLUTION = 0.5;
/** Cap so a yard cannot turn the 20 Hz message into a huge grid. */
const MAX_CELLS = 240;
/** Meters of map kept around the route, enough for a 12 m scan plus the car. */
const FOCUS_PAD = 14;
const SCAN = 1.06;

/**
 * A prebuilt map in the odometry frame at this spawn.
 * Occupied cells are where a lidar at scan height would see a solid.
 * `field` is a chamfer distance to those cells, in centimeters, so a
 * particle filter can look weights up instead of raycasting.
 * Ground-truth pose is not an input and is not an output.
 */
export function buildKnownMap(
  solids: readonly Solid[],
  spawn: { x: number; z: number; yaw: number },
  focus: readonly { x: number; y: number }[] = [],
): KnownMap {
  const visible = solids.filter(lidarVisible);
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const point of focus) grow(point.x, point.y);
  minX -= FOCUS_PAD;
  maxX += FOCUS_PAD;
  minY -= FOCUS_PAD;
  maxY += FOCUS_PAD;
  const windowed = fitWindow(minX, maxX, minY, maxY);
  const segments: number[] = [];
  for (const solid of visible) {
    const edges = footprintEdges(solid).map((edge) => [worldToOdom(spawn, edge[0]), worldToOdom(spawn, edge[1])] as const);
    const seen = edges.some(([a, b]) => inWindow(windowed, a.x, a.y) || inWindow(windowed, b.x, b.y));
    if (!seen || segments.length >= 480 * 4) continue;
    for (const [a, b] of edges) segments.push(round2(a.x), round2(a.y), round2(b.x), round2(b.y));
  }
  const width = windowed.width;
  const height = windowed.height;
  const occupied = new Uint8Array(width * height);
  const bounds = visible.map(solidRadius);
  for (let iy = 0; iy < height; iy++) {
    const y = windowed.minY + (iy + 0.5) * windowed.resolution;
    for (let ix = 0; ix < width; ix++) {
      const x = windowed.minX + (ix + 0.5) * windowed.resolution;
      const world = odomToWorldPoint(spawn, x, y);
      for (let s = 0; s < visible.length; s++) {
        const box = bounds[s]!;
        if (world.x < box.minX || world.x > box.maxX || world.z < box.minZ || world.z > box.maxZ) continue;
        if (insideFootprint(visible[s]!, world.x, world.z, windowed.resolution * Math.SQRT1_2)) {
          occupied[iy * width + ix] = 1;
          break;
        }
      }
    }
  }
  const field = distanceCentimetres(occupied, width, height, windowed.resolution);
  return {
    resolution: windowed.resolution,
    corner: { x: round2(windowed.minX), y: round2(windowed.minY) },
    width,
    height,
    field: toBase64(field),
    segments,
    stamp: checksum(field),
  };
}

function lidarVisible(solid: Solid): boolean {
  const top = solid.y + solid.hy;
  const bottom = solid.y - solid.hy;
  if (top < SCAN - 0.2) return false;
  if (bottom > SCAN + 0.4) return false;
  if (solid.hy < 0.35) return false;
  return true;
}

function solidRadius(solid: Solid): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const reach = Math.hypot(solid.hx, solid.hz) + 0.05;
  return {
    minX: solid.x - reach,
    maxX: solid.x + reach,
    minZ: solid.z - reach,
    maxZ: solid.z + reach,
  };
}

function insideFootprint(solid: Solid, x: number, z: number, pad: number): boolean {
  const dx = x - solid.x;
  const dz = z - solid.z;
  const cos = Math.cos(solid.yaw);
  const sin = Math.sin(solid.yaw);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  if (solid.shape === "cuboid") return Math.abs(localX) <= solid.hx + pad && Math.abs(localZ) <= solid.hz + pad;
  const radius = Math.max(solid.hx, solid.hz) + pad;
  return localX * localX + localZ * localZ <= radius * radius;
}

function footprintEdges(solid: Solid): [{ x: number; z: number }, { x: number; z: number }][] {
  const corners =
    solid.shape === "cuboid"
      ? [
          localToWorld(solid, -solid.hx, -solid.hz),
          localToWorld(solid, solid.hx, -solid.hz),
          localToWorld(solid, solid.hx, solid.hz),
          localToWorld(solid, -solid.hx, solid.hz),
        ]
      : roundOutline(solid, 8);
  const edges: [{ x: number; z: number }, { x: number; z: number }][] = [];
  for (let i = 0; i < corners.length; i++) edges.push([corners[i]!, corners[(i + 1) % corners.length]!]);
  return edges;
}

function roundOutline(solid: Solid, steps: number): { x: number; z: number }[] {
  const radius = Math.max(solid.hx, solid.hz);
  const points = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    points.push(localToWorld(solid, Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return points;
}

function localToWorld(solid: Solid, lx: number, lz: number): { x: number; z: number } {
  const cos = Math.cos(solid.yaw);
  const sin = Math.sin(solid.yaw);
  return { x: solid.x + cos * lx + sin * lz, z: solid.z - sin * lx + cos * lz };
}

function odomToWorldPoint(
  spawn: { x: number; z: number; yaw: number },
  x: number,
  y: number,
): { x: number; z: number } {
  const forwardX = -Math.sin(spawn.yaw);
  const forwardZ = Math.cos(spawn.yaw);
  const leftX = Math.cos(spawn.yaw);
  const leftZ = Math.sin(spawn.yaw);
  return {
    x: spawn.x + forwardX * x + leftX * y,
    z: spawn.z + forwardZ * x + leftZ * y,
  };
}

function fitWindow(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): { minX: number; minY: number; width: number; height: number; resolution: number } {
  let resolution = RESOLUTION;
  let width = Math.max(1, Math.ceil((maxX - minX) / resolution));
  let height = Math.max(1, Math.ceil((maxY - minY) / resolution));
  while ((width > MAX_CELLS || height > MAX_CELLS) && resolution < 1.25) {
    resolution += 0.25;
    width = Math.max(1, Math.ceil((maxX - minX) / resolution));
    height = Math.max(1, Math.ceil((maxY - minY) / resolution));
  }
  width = Math.min(width, MAX_CELLS);
  height = Math.min(height, MAX_CELLS);
  return { minX, minY, width, height, resolution };
}

function inWindow(
  windowed: { minX: number; minY: number; width: number; height: number; resolution: number },
  x: number,
  y: number,
): boolean {
  return (
    x >= windowed.minX &&
    y >= windowed.minY &&
    x <= windowed.minX + windowed.width * windowed.resolution &&
    y <= windowed.minY + windowed.height * windowed.resolution
  );
}

/** Chamfer distance in centimeters, clipped at 2.55 m. 0 is an occupied cell. */
function distanceCentimetres(occupied: Uint8Array, width: number, height: number, resolution: number): Uint8Array {
  const diag = 1.41421356237;
  const inf = 1e6;
  const d = new Float64Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = occupied[i] ? 0 : inf;
  const at = (x: number, y: number) => d[y * width + x]!;
  const set = (x: number, y: number, value: number) => {
    d[y * width + x] = value;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = at(x, y);
      if (x > 0) v = Math.min(v, at(x - 1, y) + 1);
      if (y > 0) v = Math.min(v, at(x, y - 1) + 1);
      if (x > 0 && y > 0) v = Math.min(v, at(x - 1, y - 1) + diag);
      if (x + 1 < width && y > 0) v = Math.min(v, at(x + 1, y - 1) + diag);
      set(x, y, v);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      let v = at(x, y);
      if (x + 1 < width) v = Math.min(v, at(x + 1, y) + 1);
      if (y + 1 < height) v = Math.min(v, at(x, y + 1) + 1);
      if (x + 1 < width && y + 1 < height) v = Math.min(v, at(x + 1, y + 1) + diag);
      if (x > 0 && y + 1 < height) v = Math.min(v, at(x - 1, y + 1) + diag);
      set(x, y, v);
    }
  }
  const out = new Uint8Array(width * height);
  for (let i = 0; i < d.length; i++) {
    const meters = d[i]! * resolution;
    out[i] = meters >= 2.55 ? 255 : Math.max(0, Math.round(meters * 100));
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return btoa(binary);
}

function checksum(bytes: Uint8Array): number {
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i += 13) hash = Math.imul(hash ^ bytes[i]!, 16777619);
  return hash >>> 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
