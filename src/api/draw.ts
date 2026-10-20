/**
 * Debug drawings are a one-way list of primitives. The worker posts them
 * with the command. Nothing in this module reads the simulator.
 */

export interface DrawPoint {
  x: number;
  y: number;
}

export type DrawOp =
  | { kind: "path"; points: DrawPoint[]; color: string }
  | { kind: "points"; points: DrawPoint[]; color: string }
  | { kind: "text"; x: number; y: number; text: string; color: string };

const HEX = /^#[0-9a-fA-F]{6}$/;

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim() : fallback;
}

function points(value: unknown): DrawPoint[] {
  if (!Array.isArray(value)) return [];
  const out: DrawPoint[] = [];
  for (const item of value.slice(0, 400)) {
    if (!item || typeof item !== "object") continue;
    const point = item as { x?: unknown; y?: unknown };
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ x, y });
  }
  return out;
}

/** Parse the JSON the prelude attaches to a control result. Bad input is empty. */
export function parseDrawOps(raw: unknown): DrawOp[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const ops: DrawOp[] = [];
  for (const item of parsed.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const op = item as { kind?: unknown; points?: unknown; color?: unknown; x?: unknown; y?: unknown; text?: unknown };
    if (op.kind === "path") {
      const path = points(op.points);
      if (path.length >= 2) ops.push({ kind: "path", points: path, color: color(op.color, "#7dcea0") });
    } else if (op.kind === "points") {
      const marks = points(op.points);
      if (marks.length > 0) ops.push({ kind: "points", points: marks, color: color(op.color, "#f4d03f") });
    } else if (op.kind === "text") {
      const x = Number(op.x);
      const y = Number(op.y);
      const text = typeof op.text === "string" ? op.text.slice(0, 48) : "";
      if (Number.isFinite(x) && Number.isFinite(y) && text) {
        ops.push({ kind: "text", x, y, text, color: color(op.color, "#f4f1ea") });
      }
    }
  }
  return ops;
}
