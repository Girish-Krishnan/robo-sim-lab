import type { DrawPoint } from "../api/draw";

/** 2-sigma position radius, meters. The cloud counts as tight below this. */
export const CONVERGE_RADIUS = 0.5;
/** Heading sigma, radians. 10 degrees. */
export const CONVERGE_HEADING = (10 * Math.PI) / 180;
/** Estimate versus true pose, meters. */
export const CONVERGE_POSITION = 0.5;
/** How long all three have to hold, seconds. */
export const CONVERGE_HOLD = 1;

export interface CloudSpread {
  /** Twice the square root of the largest eigenvalue of the weighted xy covariance. */
  radius: number;
  /** sqrt(-2 ln R) of the weighted circular mean. Large when headings disagree. */
  headingSigma: number;
}

/**
 * Weighted spread of a drawn particle cloud.
 * One heavy particle does not count as a tight posterior unless the other
 * weight is actually near it: the radius is the covariance, not the mode.
 */
export function cloudSpread(points: readonly DrawPoint[]): CloudSpread | undefined {
  if (points.length < 2) return undefined;
  let weightSum = 0;
  for (const point of points) {
    const weight = point.w ?? 1;
    if (weight > 0 && Number.isFinite(weight)) weightSum += weight;
  }
  if (!(weightSum > 0)) return undefined;

  let meanX = 0;
  let meanY = 0;
  let sinYaw = 0;
  let cosYaw = 0;
  const weights: number[] = [];
  for (const point of points) {
    const weight = point.w ?? 1;
    const unit = weight > 0 && Number.isFinite(weight) ? weight / weightSum : 0;
    weights.push(unit);
    meanX += unit * point.x;
    meanY += unit * point.y;
    const yaw = point.yaw ?? 0;
    sinYaw += unit * Math.sin(yaw);
    cosYaw += unit * Math.cos(yaw);
  }

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (let i = 0; i < points.length; i++) {
    const unit = weights[i] ?? 0;
    if (unit <= 0) continue;
    const point = points[i]!;
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    cxx += unit * dx * dx;
    cyy += unit * dy * dy;
    cxy += unit * dx * dy;
  }

  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const major = Math.max(0, trace / 2 + disc);
  const resultant = Math.min(1, Math.hypot(sinYaw, cosYaw));
  const headingSigma = resultant <= 1e-12 ? Math.PI : Math.sqrt(-2 * Math.log(Math.max(resultant, 1e-12)));
  return { radius: 2 * Math.sqrt(major), headingSigma };
}
