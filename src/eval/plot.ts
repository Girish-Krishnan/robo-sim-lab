import { deflateSync, crc32 } from "node:zlib";
import type { Solid } from "../sim/course";
import type { EvalWorld } from "./scenarios";
import type { TrailSample } from "./simulate";

export interface PathRaster {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/**
 * Top-down path plot. Truth is coloured by speed, odometry is amber,
 * and a new contact is a red mark. This file is evaluation-only.
 */
export function renderPathPlot(
  solids: readonly Solid[],
  trail: readonly TrailSample[],
  title: string,
  world: EvalWorld,
): Buffer {
  const raster = paintPathPlot(solids, trail, title, world);
  return rasterToPng(raster);
}

export function rasterToPng(raster: PathRaster): Buffer {
  return encodePng(raster.width, raster.height, raster.rgba);
}

export function paintPathPlot(
  solids: readonly Solid[],
  trail: readonly TrailSample[],
  title: string,
  world: EvalWorld,
): PathRaster {
  const width = 960;
  const height = 960;
  const rgba = new Uint8Array(width * height * 4);
  fill(rgba, width, height, 18, 24, 22, 255);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const grow = (x: number, z: number, pad = 0) => {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minZ = Math.min(minZ, z - pad);
    maxZ = Math.max(maxZ, z + pad);
  };
  // Frame on the path. Taking in every solid shrinks a lap to a speck
  // on the whole yard, and a few metres of drift disappears.
  for (const sample of trail) {
    grow(sample.x, sample.z, 8);
    grow(sample.odomX, sample.odomZ, 8);
  }
  if (trail.length === 0) {
    for (const solid of solids) grow(solid.x, solid.z, Math.hypot(solid.hx, solid.hz) + 1);
  }
  if (!Number.isFinite(minX)) {
    minX = -20;
    maxX = 20;
    minZ = -20;
    maxZ = 20;
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 8);
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  minX = midX - span / 2;
  maxX = midX + span / 2;
  minZ = midZ - span / 2;
  maxZ = midZ + span / 2;

  const margin = 36;
  const project = (x: number, z: number): [number, number] => {
    const u = (x - minX) / (maxX - minX);
    const v = (z - minZ) / (maxZ - minZ);
    return [margin + u * (width - margin * 2), height - margin - v * (height - margin * 2)];
  };

  drawGround(rgba, width, height, world, project);

  for (const solid of solids) {
    const corners = footprint(solid).map(([x, z]) => project(x, z));
    fillPoly(rgba, width, height, corners, solid.look === "foam" || solid.look === "concrete" ? 70 : 92, 98, 104, 255);
  }

  let maxSpeed = 0.5;
  for (const sample of trail) maxSpeed = Math.max(maxSpeed, sample.speed);

  strokeTrail(
    rgba,
    width,
    height,
    trail.map((sample) => project(sample.odomX, sample.odomZ)),
    214,
    150,
    58,
    255,
    2,
  );
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!;
    const b = trail[i]!;
    const [x0, y0] = project(a.x, a.z);
    const [x1, y1] = project(b.x, b.z);
    const tint = speedColor(b.speed / maxSpeed);
    line(rgba, width, height, x0, y0, x1, y1, tint[0], tint[1], tint[2], 255, 3);
  }
  for (const sample of trail) {
    if (!sample.hit) continue;
    const [x, y] = project(sample.x, sample.z);
    disc(rgba, width, height, x, y, 5, 220, 70, 60, 255);
  }
  if (trail.length > 0) {
    const start = trail[0]!;
    const [sx, sy] = project(start.x, start.z);
    disc(rgba, width, height, sx, sy, 6, 80, 210, 170, 255);
  }

  drawLegend(rgba, width, height, maxSpeed);
  drawScaleBar(rgba, width, height, maxX - minX);
  stamp(rgba, width, height, title);
  return { width, height, rgba };
}

/** 4 columns of worlds, 3 rows of examples, each cell a half-size path plot. */
export function renderContactSheet(panels: { world: EvalWorld; example: string; rgba: Uint8Array }[]): Buffer {
  const worlds: EvalWorld[] = ["city", "track", "forest", "warehouse"];
  const examples = ["circle", "avoid", "wall"];
  const cell = 480;
  const gap = 8;
  const labelW = 88;
  const labelH = 32;
  const width = labelW + worlds.length * cell + (worlds.length - 1) * gap;
  const height = labelH + examples.length * cell + (examples.length - 1) * gap;
  const rgba = new Uint8Array(width * height * 4);
  fill(rgba, width, height, 10, 14, 12, 255);
  for (let col = 0; col < worlds.length; col++) {
    const name = worlds[col]!;
    text(rgba, width, height, labelW + col * (cell + gap) + 8, 8, name, 2);
  }
  for (let row = 0; row < examples.length; row++) {
    const name = examples[row]!;
    text(rgba, width, height, 8, labelH + row * (cell + gap) + 8, name, 2);
  }
  for (const panel of panels) {
    const col = worlds.indexOf(panel.world);
    const row = examples.indexOf(panel.example);
    if (col < 0 || row < 0) continue;
    const small = downsample(panel.rgba, 960, 960, 2);
    blit(rgba, width, small, cell, labelW + col * (cell + gap), labelH + row * (cell + gap));
  }
  return encodePng(width, height, rgba);
}

function drawGround(
  rgba: Uint8Array,
  width: number,
  height: number,
  world: EvalWorld,
  project: (x: number, z: number) => [number, number],
): void {
  const rect = (x: number, z: number, w: number, d: number, r: number, g: number, b: number) => {
    fillPoly(
      rgba,
      width,
      height,
      [
        [x - w / 2, z - d / 2],
        [x + w / 2, z - d / 2],
        [x + w / 2, z + d / 2],
        [x - w / 2, z + d / 2],
      ].map(([px, pz]) => project(px, pz)),
      r,
      g,
      b,
      255,
    );
  };
  if (world === "city") {
    rect(5.5, 24, 9.2, 92, 46, 48, 52);
    rect(8, 27.2, 52, 9, 46, 48, 52);
    const plaza: [number, number][] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      plaza.push(project(5.5 + Math.cos(a) * 9.2, 58 + Math.sin(a) * 9.2));
    }
    fillPoly(rgba, width, height, plaza, 46, 48, 52, 255);
    for (const x of [0.15, 10.85]) {
      rect(x, 0.5, 0.45, 40, 168, 164, 150);
      rect(x, 52, 0.45, 36, 168, 164, 150);
    }
    rect(-8, 22.55, 18, 0.45, 168, 164, 150);
    rect(24, 22.55, 22, 0.45, 168, 164, 150);
    rect(-8, 31.85, 18, 0.45, 168, 164, 150);
    rect(24, 31.85, 22, 0.45, 168, 164, 150);
    return;
  }
  if (world === "track") {
    rect(16, 0, 15.6, 98, 52, 54, 58);
    rect(-16, 0, 15.6, 98, 52, 54, 58);
    rect(0, 42, 48, 14.4, 52, 54, 58);
    rect(0, -42, 48, 14.4, 52, 54, 58);
    return;
  }
  if (world === "forest") {
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let z = -46; z <= 48; z += 1.4) {
      const x = Math.sin(z * 0.09) * 1.2;
      const slope = Math.cos(z * 0.09) * 1.2 * 0.09;
      const len = Math.hypot(-1, slope);
      const nx = -1 / len;
      const nz = slope / len;
      left.push(project(x + nx * 2.6, z + nz * 2.6));
      right.push(project(x - nx * 2.6, z - nz * 2.6));
    }
    fillPoly(rgba, width, height, [...left, ...right.reverse()], 62, 86, 58, 255);
    strokeTrail(rgba, width, height, left, 186, 196, 140, 255, 2);
    strokeTrail(rgba, width, height, right, 186, 196, 140, 255, 2);
    return;
  }
  rect(0, 10, 40, 70, 58, 60, 62);
}

function footprint(solid: Solid): [number, number][] {
  const yaw = solid.yaw;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const corners: [number, number][] = [
    [solid.hx, solid.hz],
    [-solid.hx, solid.hz],
    [-solid.hx, -solid.hz],
    [solid.hx, -solid.hz],
  ];
  if (solid.shape !== "cuboid") {
    const r = Math.max(solid.hx, solid.hz);
    const ring: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ring.push([solid.x + Math.cos(a) * r, solid.z + Math.sin(a) * r]);
    }
    return ring;
  }
  return corners.map(([x, z]) => [solid.x + c * x + s * z, solid.z - s * x + c * z]);
}

function speedColor(t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  if (u < 0.5) {
    const k = u / 0.5;
    return [lerp(70, 240, k), lerp(150, 200, k), lerp(190, 70, k)];
  }
  const k = (u - 0.5) / 0.5;
  return [lerp(240, 220, k), lerp(200, 80, k), lerp(70, 60, k)];
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function drawLegend(rgba: Uint8Array, width: number, height: number, maxSpeed: number): void {
  fillRectScreen(rgba, width, 14, 14, 210, 108, 12, 18, 16, 220);
  for (let i = 0; i < 150; i++) {
    const tint = speedColor(i / 149);
    for (let y = 0; y < 12; y++) set(rgba, width, 24 + i, 24 + y, tint[0], tint[1], tint[2], 255);
  }
  text(rgba, width, height, 24, 38, "0", 2);
  const fast = `${maxSpeed.toFixed(1)} m/s`;
  text(rgba, width, height, 174 - fast.length * 12, 38, fast, 2);
  for (let i = 0; i < 28; i++) {
    const tint = speedColor(i / 27);
    for (let y = 0; y < 4; y++) set(rgba, width, 24 + i, 58 + y, tint[0], tint[1], tint[2], 255);
  }
  text(rgba, width, height, 58, 52, "true path", 2);
  line(rgba, width, height, 24, 76, 52, 76, 214, 150, 58, 255, 3);
  text(rgba, width, height, 58, 70, "odometry", 2);
  disc(rgba, width, height, 32, 96, 5, 220, 70, 60, 255);
  text(rgba, width, height, 44, 88, "contact", 2);
}

function drawScaleBar(rgba: Uint8Array, width: number, height: number, span: number): void {
  const plotPx = width - 72;
  const metresPerPx = span / plotPx;
  let metres = 5;
  for (const choice of [5, 10, 20, 50, 100]) {
    if (choice / metresPerPx <= 160) metres = choice;
  }
  const px = metres / metresPerPx;
  const x1 = width - 28;
  const x0 = x1 - px;
  const y = height - 28;
  line(rgba, width, height, x0, y, x1, y, 230, 236, 230, 255, 2);
  line(rgba, width, height, x0, y - 5, x0, y + 5, 230, 236, 230, 255, 2);
  line(rgba, width, height, x1, y - 5, x1, y + 5, 230, 236, 230, 255, 2);
  const label = `${metres} m`;
  text(rgba, width, height, x0 + px / 2 - label.length * 6, y - 18, label, 2);
}

function fillRectScreen(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) set(rgba, width, px, py, r, g, b, a);
  }
}

function stamp(rgba: Uint8Array, width: number, height: number, title: string): void {
  text(rgba, width, height, 16, height - 22, title.slice(0, 48), 1);
}

function text(rgba: Uint8Array, width: number, height: number, x: number, y: number, message: string, scale: number): void {
  for (let i = 0; i < message.length; i++) {
    blitGlyph(rgba, width, height, x + i * 6 * scale, y, message.charCodeAt(i), scale);
  }
}

function blitGlyph(rgba: Uint8Array, width: number, height: number, x: number, y: number, code: number, scale = 1): void {
  const rows = font(code);
  for (let row = 0; row < 7; row++) {
    const bits = rows[row] ?? 0;
    for (let col = 0; col < 5; col++) {
      if ((bits & (1 << (4 - col))) === 0) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = x + col * scale + sx;
          const py = y + row * scale + sy;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          set(rgba, width, px, py, 230, 236, 230, 255);
        }
      }
    }
  }
}

/** 5×7 glyphs, bits left to right. Enough for titles. */
function font(code: number): number[] {
  const known = FONT[String.fromCharCode(code)] ?? FONT[" "];
  return known ?? [0, 0, 0, 0, 0, 0, 0];
}

const FONT: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0b00100, 0],
  "/": [0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0, 0],
  "-": [0, 0, 0b11111, 0, 0, 0, 0],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
};

for (const [ch, rows] of Object.entries({
  a: [0, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111, 0],
  b: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b11110, 0],
  c: [0, 0b01110, 0b10000, 0b10000, 0b10000, 0b01110, 0],
  d: [0b00001, 0b00001, 0b01111, 0b10001, 0b10001, 0b01111, 0],
  e: [0, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110, 0],
  f: [0b00110, 0b01001, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000],
  g: [0, 0b01111, 0b10001, 0b01111, 0b00001, 0b01110, 0],
  h: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0],
  i: [0b00100, 0, 0b01100, 0b00100, 0b00100, 0b01110, 0],
  k: [0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0],
  l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110, 0],
  m: [0, 0b11010, 0b10101, 0b10101, 0b10101, 0b10101, 0],
  n: [0, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0],
  o: [0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110, 0],
  p: [0b10000, 0b11110, 0b10001, 0b11110, 0b10000, 0b10000, 0],
  r: [0, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000, 0],
  s: [0, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110, 0],
  t: [0b01000, 0b11100, 0b01000, 0b01000, 0b01001, 0b00110, 0],
  u: [0, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101, 0],
  v: [0, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0],
  w: [0, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010, 0],
  y: [0, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110, 0],
})) {
  FONT[ch] = rows;
}
for (let code = 97; code <= 122; code++) {
  const lower = FONT[String.fromCharCode(code)];
  if (lower) FONT[String.fromCharCode(code - 32)] = lower;
}

function fill(rgba: Uint8Array, width: number, height: number, r: number, g: number, b: number, a: number): void {
  for (let i = 0; i < width * height; i++) setIndex(rgba, i, r, g, b, a);
}

function set(rgba: Uint8Array, width: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= rgba.length / (width * 4)) return;
  setIndex(rgba, py * width + px, r, g, b, a);
}

function setIndex(rgba: Uint8Array, index: number, r: number, g: number, b: number, a: number): void {
  const o = index * 4;
  rgba[o] = r;
  rgba[o + 1] = g;
  rgba[o + 2] = b;
  rgba[o + 3] = a;
}

function disc(rgba: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number, r: number, g: number, b: number, a: number): void {
  const rad = Math.ceil(radius);
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y > radius * radius) continue;
      const px = Math.round(cx + x);
      const py = Math.round(cy + y);
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      setIndex(rgba, py * width + px, r, g, b, a);
    }
  }
}

function line(
  rgba: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
  a: number,
  thickness: number,
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(rgba, width, height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness / 2, r, g, b, a);
  }
}

function strokeTrail(
  rgba: Uint8Array,
  width: number,
  height: number,
  points: [number, number][],
  r: number,
  g: number,
  b: number,
  a: number,
  thickness: number,
): void {
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    line(rgba, width, height, p0[0], p0[1], p1[0], p1[1], r, g, b, a, thickness);
  }
}

function fillPoly(
  rgba: Uint8Array,
  width: number,
  height: number,
  corners: [number, number][],
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (corners.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of corners) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i]!;
      const q = corners[(i + 1) % corners.length]!;
      if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) {
        const t = (y - p[1]) / (q[1] - p[1]);
        xs.push(p[0] + t * (q[0] - p[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i]!));
      const xb = Math.min(width - 1, Math.floor(xs[i + 1]!));
      for (let x = xa; x <= xb; x++) setIndex(rgba, y * width + x, r, g, b, a);
    }
  }
}

function downsample(src: Uint8Array, sw: number, sh: number, factor: number): Uint8Array {
  const dw = sw / factor;
  const dh = sh / factor;
  const out = new Uint8Array(dw * dh * 4);
  const n = factor * factor;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const o = ((y * factor + sy) * sw + (x * factor + sx)) * 4;
          r += src[o] ?? 0;
          g += src[o + 1] ?? 0;
          b += src[o + 2] ?? 0;
          a += src[o + 3] ?? 0;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return out;
}

function blit(dst: Uint8Array, dstWidth: number, src: Uint8Array, srcWidth: number, x: number, y: number): void {
  const srcHeight = src.length / (srcWidth * 4);
  for (let row = 0; row < srcHeight; row++) {
    const from = row * srcWidth * 4;
    const to = ((y + row) * dstWidth + x) * 4;
    dst.set(src.subarray(from, from + srcWidth * 4), to);
  }
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }
  const idat = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk("IHDR", ihdr(width, height)), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function ihdr(width: number, height: number): Buffer {
  const buf = Buffer.alloc(13);
  buf.writeUInt32BE(width, 0);
  buf.writeUInt32BE(height, 4);
  buf[8] = 8;
  buf[9] = 6;
  return buf;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
