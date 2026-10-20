import { deflateSync, crc32 } from "node:zlib";
import type { Solid } from "../sim/course";
import type { TrailSample } from "./simulate";

/**
 * Top-down path plot. Truth is coloured by speed, odometry is amber,
 * and a new contact is a red mark. This file is evaluation-only.
 */
export function renderPathPlot(solids: readonly Solid[], trail: readonly TrailSample[], title: string): Buffer {
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
  for (const solid of solids) {
    grow(solid.x, solid.z, Math.hypot(solid.hx, solid.hz) + 1);
  }
  for (const sample of trail) {
    grow(sample.x, sample.z, 2);
    grow(sample.odomX, sample.odomZ, 2);
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

  legend(rgba, width, maxSpeed);
  stamp(rgba, width, height, title);
  return encodePng(width, height, rgba);
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

function legend(rgba: Uint8Array, width: number, maxSpeed: number): void {
  for (let i = 0; i < 120; i++) {
    const tint = speedColor(i / 119);
    for (let y = 18; y < 30; y++) set(rgba, width, 18 + i, y, tint[0], tint[1], tint[2], 255);
  }
  for (let x = 150; x < 210; x++) {
    for (let y = 20; y < 28; y++) set(rgba, width, x, y, 214, 150, 58, 255);
  }
  disc(rgba, width, 960, 230, 24, 5, 220, 70, 60, 255);
  void maxSpeed;
}

function stamp(rgba: Uint8Array, width: number, height: number, title: string): void {
  const text = title.slice(0, 48);
  for (let i = 0; i < text.length; i++) blitGlyph(rgba, width, height, 16 + i * 6, height - 22, text.charCodeAt(i));
}

function blitGlyph(rgba: Uint8Array, width: number, height: number, x: number, y: number, code: number): void {
  const rows = font(code);
  for (let row = 0; row < 7; row++) {
    const bits = rows[row] ?? 0;
    for (let col = 0; col < 5; col++) {
      if ((bits & (1 << (4 - col))) === 0) continue;
      const px = x + col;
      const py = y + row;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      set(rgba, width, px, py, 230, 236, 230, 255);
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
