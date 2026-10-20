import type { WorldId } from "./worlds";

export interface RoutePoint {
  x: number;
  z: number;
}

function arc(cx: number, cz: number, radius: number, start: number, end: number, steps: number): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    points.push({ x: cx + Math.cos(t) * radius, z: cz + Math.sin(t) * radius });
  }
  return points;
}

function line(x0: number, z0: number, x1: number, z1: number, step: number): RoutePoint[] {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const count = Math.max(1, Math.ceil(length / step));
  const points: RoutePoint[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
  }
  return points;
}

function join(parts: RoutePoint[][]): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (const part of parts) {
    for (const point of part) {
      const last = points[points.length - 1];
      if (last && Math.hypot(last.x - point.x, last.z - point.z) < 0.05) continue;
      points.push(point);
    }
  }
  return points;
}

/** Lane center of the oval, midway between the walls, corners rounded at 8 m. */
function trackRoute(): RoutePoint[] {
  const straight = 34;
  const radius = 8;
  return join([
    line(16, -straight, 16, straight, 4),
    arc(8, straight, radius, 0, Math.PI / 2, 6),
    line(8, straight + radius, -8, straight + radius, 4),
    arc(-8, straight, radius, Math.PI / 2, Math.PI, 6),
    line(-16, straight, -16, -straight, 4),
    arc(-8, -straight, radius, Math.PI, Math.PI * 1.5, 6),
    line(-8, -(straight + radius), 8, -(straight + radius), 4),
    arc(8, -straight, radius, -Math.PI / 2, 0, 6),
  ]);
}

/** Roundabout apron around the planter. The barriers below it close the avenue. */
function cityRoute(): RoutePoint[] {
  // Clockwise on the map, which is a left turn from the driver's seat.
  return arc(5.5, 58, 5.8, -Math.PI / 2, -Math.PI / 2 - Math.PI * 2, 72);
}

/**
 * Trail through the trunks, then back along the open west lane.
 * The bridge deck is a single car wide, and the north fence sits too close
 * for a U-turn on the deck, so the loop leaves the trail only at the north
 * clearing and returns between the tree row and the corridor fence.
 */
function forestRoute(): RoutePoint[] {
  return join([
    line(-0.6, -9.8, -0.4, 2, 2),
    line(-0.4, 2, -2.4, 6, 1),
    line(-2.4, 6, -5.4, 7.2, 0.6),
    line(-5.4, 7.2, -6.15, 9.4, 0.6),
    line(-6.15, 9.4, -6.05, 11.2, 0.6),
    line(-6.05, 11.2, -4.6, 14.2, 0.6),
    line(-4.6, 14.2, -2.6, 17, 0.6),
    line(-2.6, 17, -1.2, 21, 2),
    line(-1.2, 21, -0.2, 24, 2),
    line(-0.2, 24, 0.2, 27.4, 1),
    line(0.2, 27.4, 0.15, 28.2, 0.4),
    line(0.15, 28.2, -0.3, 29.2, 0.4),
    line(-0.3, 29.2, -0.5, 30.6, 0.4),
    line(-0.5, 30.6, -0.4, 32, 0.6),
    arc(-4, 32, 3.6, 0, Math.PI / 2, 8),
    line(-4, 35.6, -10.3, 35.6, 2),
    arc(-10.3, 32, 3.6, Math.PI / 2, Math.PI, 8),
    line(-13.9, 32, -13.9, -9.8, 2),
    arc(-10.3, -9.8, 3.6, Math.PI, Math.PI * 1.5, 8),
    line(-10.3, -13.4, -4.2, -13.4, 2),
    arc(-4.2, -9.8, 3.6, -Math.PI / 2, 0, 8),
  ]);
}

/** Open floor around the south face of the bay rack, clear of the shelf row. */
function warehouseRoute(): RoutePoint[] {
  return join([
    line(-8, -14, 8, -14, 4),
    arc(8, -10, 4, -Math.PI / 2, 0, 4),
    line(12, -10, 12, -8.5, 2),
    arc(8, -8.5, 4, 0, Math.PI / 2, 4),
    line(8, -4.5, -8, -4.5, 4),
    arc(-8, -8.5, 4, Math.PI / 2, Math.PI, 4),
    line(-12, -8.5, -12, -10, 2),
    arc(-8, -10, 4, Math.PI, Math.PI * 1.5, 4),
  ]);
}

const ROUTES: Record<WorldId, () => RoutePoint[]> = {
  city: cityRoute,
  track: trackRoute,
  forest: forestRoute,
  warehouse: warehouseRoute,
};

/** World-frame reference path. This is a map, not the car's pose. */
export function referenceRoute(world: WorldId): RoutePoint[] {
  return ROUTES[world]();
}
