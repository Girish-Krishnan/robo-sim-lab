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
 * Heading of a Y-up, +Z-forward body, used to keep the chase camera behind it.
 * Identity (nose along +Z) is 0. Positive is a right-hand rotation about +Y,
 * which swings the nose toward world −X.
 *
 * That geometric sign is not the driver's steering sign. A left turn, as the
 * driver sees it, swings the nose toward world +X (the left side of the screen
 * when the chase camera sits behind the car) and decreases this heading.
 */
export function yawFromQuaternion(q: Quat): number {
  const siny = 2 * (q.w * q.y + q.x * q.z);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return -Math.atan2(siny, cosy);
}

/**
 * World vector → robot frame.
 * The chassis faces local +Z. Local +X is the driver's left (world +X at
 * yaw 0, and the left side of the screen from the chase camera).
 * Robot axes are x forward, y left, z up.
 */
export function worldToBody(q: Quat, world: Vec3): Vec3 {
  const local = quatRotate(quatConjugate(q), world);
  return { x: local.z, y: local.x, z: local.y };
}

/**
 * Unit direction of a lidar beam.
 * `angle` 0 is forward (+Z). Positive is the driver's left (+X at yaw 0).
 */
export function beamDirection(q: Quat, angle: number): Vec3 {
  return quatRotate(q, { x: Math.sin(angle), y: 0, z: Math.cos(angle) });
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Deterministic uniform [0, 1) generator. The same seed replays the same noise. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(stdDev: number, random: () => number = Math.random): number {
  if (stdDev === 0) return 0;
  const u = Math.max(1e-12, random());
  const v = random();
  return stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
