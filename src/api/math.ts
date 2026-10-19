export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** Rotate a vector by a unit quaternion (local → world when `q` is the body rotation). */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/**
 * Yaw of a Y-up, +Z-forward body, counterclockwise from above.
 * Identity rotation (nose along +Z) is yaw 0. Positive yaw turns toward −X.
 */
export function yawFromQuaternion(q: Quat): number {
  const siny = 2 * (q.w * q.y + q.x * q.z);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return -Math.atan2(siny, cosy);
}

/**
 * World vector → robot frame.
 * Three.js local axes are x right, y up, z forward.
 * Robot axes are x forward, y left, z up.
 */
export function worldToBody(q: Quat, world: Vec3): Vec3 {
  const local = quatRotate(quatConjugate(q), world);
  return { x: local.z, y: -local.x, z: local.y };
}

/** Unit direction of a lidar beam. `angle` 0 is forward, positive is left. */
export function beamDirection(q: Quat, angle: number): Vec3 {
  return quatRotate(q, { x: -Math.sin(angle), y: 0, z: Math.cos(angle) });
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function gaussian(stdDev: number, random: () => number = Math.random): number {
  if (stdDev === 0) return 0;
  const u = Math.max(1e-12, random());
  const v = random();
  return stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
