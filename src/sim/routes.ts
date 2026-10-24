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

/**
 * Roundabout apron, shifted northwest of the planter (+X is west) so the line clears both
 * the planter and the lamps on the south side of the circle. Clockwise on the
 * map is a left turn from the driver's seat.
 */
function cityRoute(): RoutePoint[] {
  return arc(6.3, 59.1, 5.9, -Math.PI / 2, -Math.PI / 2 - Math.PI * 2, 72);
}

/**
 * Trail through the trunks, then back on the open lane east of the pines (−X is east).
 * The bridge deck is a single car wide, so the loop leaves the trail at the
 * north clearing. The return is far enough from the pine row that a corner
 * cut still clears the trunks.
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
    // The east pine row sits at x=-11.5 (+X is west). The return stays east of x=-16 so a
    // corner cut still leaves a meter of body clearance, then rejoins the trail.
    line(-4, 35.6, -16.5, 35.65, 2),
    arc(-16.5, 32.05, 3.6, Math.PI / 2, Math.PI, 8),
    line(-20.1, 32.05, -20.1, -9.0, 2),
    arc(-16.5, -9.0, 3.6, Math.PI, Math.PI * 1.5, 8),
    line(-16.5, -12.6, -4.2, -13.4, 2),
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
