import * as THREE from "three";
import type { DrawOp, LidarScan } from "../api";
import type { LidarDebug } from "../robots/types";

/** Drawings the student posted, in the odometry frame, plus the pose they estimated. */
export interface StudentOverlay {
  ops: readonly DrawOp[];
  pose: { x: number; y: number; yaw: number };
}

const MAX_POINTS = 360;

/**
 * Planar lidar overlay: rays and points in the 3D world, plus a top-down
 * inset drawn from the same ranges the student program receives.
 */
export class LidarView {
  private readonly positions = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly colors = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly lines: THREE.LineSegments;
  private readonly pointPositions = new Float32Array(MAX_POINTS * 3);
  private readonly pointColors = new Float32Array(MAX_POINTS * 3);
  private readonly points: THREE.Points;
  private readonly radar: HTMLCanvasElement;
  private readonly radarCtx: CanvasRenderingContext2D;
  private enabled = true;

  constructor(scene: THREE.Scene, viewport: HTMLElement) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 3;
    scene.add(this.lines);

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.BufferAttribute(this.pointPositions, 3));
    pointGeometry.setAttribute("color", new THREE.BufferAttribute(this.pointColors, 3));
    this.points = new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);

    this.radar = document.createElement("canvas");
    this.radar.id = "radar";
    this.radar.width = 196;
    this.radar.height = 196;
    this.radar.setAttribute("aria-hidden", "true");
    viewport.append(this.radar);
    const ctx = this.radar.getContext("2d");
    if (!ctx) throw new Error("Lidar inset canvas is unavailable.");
    this.radarCtx = ctx;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.lines.visible = enabled;
    this.points.visible = enabled;
    this.radar.hidden = !enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  update(debug: LidarDebug, scan: LidarScan, overlay?: StudentOverlay): void {
    if (!this.enabled) return;
    this.drawWorld(debug);
    this.drawRadar(scan, overlay);
  }

  private drawWorld(debug: LidarDebug): void {
    const origin = debug.origin;
    let segments = 0;
    let hits = 0;
    const count = Math.min(debug.points.length, MAX_POINTS);
    for (let i = 0; i < count; i++) {
      const point = debug.points[i];
      if (!point) continue;
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const dz = point.z - origin.z;
      const length = Math.hypot(dx, dy, dz) || 1;
      const dirX = dx / length;
      const dirY = dy / length;
      const dirZ = dz / length;
      // Pull hits off the surface so the depth buffer does not swallow them.
      const reach = point.hit ? Math.max(0.2, point.range - 0.12) : 2.1;
      const base = segments * 6;
      this.positions[base] = origin.x;
      this.positions[base + 1] = origin.y;
      this.positions[base + 2] = origin.z;
      this.positions[base + 3] = origin.x + dirX * reach;
      this.positions[base + 4] = origin.y + dirY * reach;
      this.positions[base + 5] = origin.z + dirZ * reach;
      const near = point.hit ? Math.min(1, point.range / 8) : 1;
      const r = point.hit ? 1 - near * 0.75 : 0.35;
      const g = point.hit ? 0.55 + near * 0.35 : 0.55;
      const b = point.hit ? 0.2 + near * 0.7 : 0.7;
      const alpha = point.hit ? 0.32 : 0.08;
      for (const end of [0, 3]) {
        this.colors[base + end] = r * alpha;
        this.colors[base + end + 1] = g * alpha;
        this.colors[base + end + 2] = b * alpha;
      }
      segments += 1;
      if (!point.hit) continue;
      const p = hits * 3;
      this.pointPositions[p] = origin.x + dirX * reach;
      this.pointPositions[p + 1] = origin.y + dirY * reach;
      this.pointPositions[p + 2] = origin.z + dirZ * reach;
      this.pointColors[p] = r;
      this.pointColors[p + 1] = g;
      this.pointColors[p + 2] = b;
      hits += 1;
    }
    this.lines.geometry.setDrawRange(0, segments * 2);
    this.lines.geometry.getAttribute("position").needsUpdate = true;
    this.lines.geometry.getAttribute("color").needsUpdate = true;
    this.points.geometry.setDrawRange(0, hits);
    this.points.geometry.getAttribute("position").needsUpdate = true;
    this.points.geometry.getAttribute("color").needsUpdate = true;
  }

  private drawRadar(scan: LidarScan, overlay?: StudentOverlay): void {
    const ctx = this.radarCtx;
    const w = this.radar.width;
    const h = this.radar.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(8, 12, 14, 0.82)";
    roundRect(ctx, 8, 8, w - 16, h - 16, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const cx = w / 2;
    const cy = h / 2 + 2;
    const radius = w / 2 - 28;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.beginPath();
    for (const frac of [0.33, 0.66, 1]) {
      ctx.moveTo(cx + radius * frac, cy);
      ctx.arc(cx, cy, radius * frac, 0, Math.PI * 2);
    }
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - radius);
    ctx.stroke();

    ctx.fillStyle = "rgba(215, 230, 224, 0.7)";
    ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("lidar", cx, 24);

    const maxRange = scan.maxRange > 0 ? scan.maxRange : 1;
    const count = Math.min(scan.ranges.length, scan.angles.length);
    for (let i = 0; i < count; i++) {
      const range = scan.ranges[i] ?? maxRange;
      const angle = scan.angles[i] ?? 0;
      const hit = range < maxRange - 0.05;
      const scaled = (Math.min(range, maxRange) / maxRange) * radius;
      const x = cx - Math.sin(angle) * scaled;
      const y = cy - Math.cos(angle) * scaled;
      ctx.fillStyle = hit ? (range < 4 ? "#ffb020" : "#8dfff2") : "rgba(190, 210, 220, 0.28)";
      const size = hit ? 3.2 : 1.6;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }

    if (overlay) drawStudentOverlay(ctx, overlay, cx, cy, radius);

    ctx.fillStyle = "#2fbfa8";
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx - 4.5, cy + 5);
    ctx.lineTo(cx + 4.5, cy + 5);
    ctx.closePath();
    ctx.fill();
  }
}

/** Odometry-frame drawings, relative to the pose the program believes it has. */
function drawStudentOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: StudentOverlay,
  cx: number,
  cy: number,
  radius: number,
): void {
  let reach = 12;
  for (const op of overlay.ops) {
    if (op.kind === "ellipse") {
      reach = Math.max(reach, Math.hypot(op.x - overlay.pose.x, op.y - overlay.pose.y) + Math.max(op.rx, op.ry));
      continue;
    }
    if (op.kind !== "points") continue;
    for (const point of op.points) {
      reach = Math.max(reach, Math.hypot(point.x - overlay.pose.x, point.y - overlay.pose.y));
    }
  }
  const range = Math.min(90, reach * 1.08);
  const project = (x: number, y: number): [number, number] => {
    const dx = x - overlay.pose.x;
    const dy = y - overlay.pose.y;
    const forward = Math.cos(overlay.pose.yaw) * dx + Math.sin(overlay.pose.yaw) * dy;
    const left = -Math.sin(overlay.pose.yaw) * dx + Math.cos(overlay.pose.yaw) * dy;
    const scale = radius / range;
    return [cx - left * scale, cy - forward * scale];
  };
  for (const op of overlay.ops) {
    ctx.strokeStyle = op.color;
    ctx.fillStyle = op.color;
    if (op.kind === "path" && op.points.length >= 2) {
      ctx.beginPath();
      ctx.lineWidth = 2;
      op.points.forEach((point, index) => {
        const [x, y] = project(point.x, point.y);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else if (op.kind === "points") {
      let maxWeight = 0;
      for (const point of op.points) if (point.w !== undefined) maxWeight = Math.max(maxWeight, point.w);
      const weighted = maxWeight > 0;
      const dot = op.points.length >= 24 ? 6 : 8;
      for (const point of op.points) {
        const [x, y] = project(point.x, point.y);
        const weight = weighted ? Math.min(1, Math.max(0, (point.w ?? 0) / maxWeight)) : 1;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#140014";
        ctx.fillRect(x - (dot + 2) / 2, y - (dot + 2) / 2, dot + 2, dot + 2);
        ctx.globalAlpha = 0.75 + 0.25 * weight;
        ctx.fillStyle = op.color;
        ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
        if (point.yaw !== undefined && Number.isFinite(point.yaw)) {
          const tip = project(point.x + Math.cos(point.yaw) * 0.28, point.y + Math.sin(point.yaw) * 0.28);
          ctx.strokeStyle = op.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(tip[0], tip[1]);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    } else if (op.kind === "ellipse") {
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = op.color;
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        const localX = Math.cos(t) * op.rx;
        const localY = Math.sin(t) * op.ry;
        const cos = Math.cos(op.yaw);
        const sin = Math.sin(op.yaw);
        const [x, y] = project(op.x + cos * localX - sin * localY, op.y + sin * localX + cos * localY);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (op.kind === "text") {
      const [x, y] = project(op.x, op.y);
      ctx.font = "10px IBM Plex Mono, ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText(op.text, x + 6, y - 6);
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
