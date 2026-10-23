import type { Solid } from "../sim/course";
import { spawnFor, worldSpawn } from "../sim/spawns";
import type { WorldId } from "../sim/worlds";

export interface MapPose {
  x: number;
  /** North-south map axis, which is world z. */
  y: number;
  /** Degrees. 0 faces north, 90 faces east. */
  heading: number;
}

export type PoseKind = "default" | "circle" | "avoid" | "wall" | "pursuit" | "mcl" | "mcl-global";

const WORLDS: WorldId[] = ["city", "track", "forest", "warehouse"];

export function formatPoseNumber(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-8) return "0";
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

/** Comment, SEED, and a per-world START_POSE. The host reads these on Run and Reset. */
export function programPreamble(kind: PoseKind): string {
  const lines = WORLDS.map((world) => {
    const pose = kind === "default" ? worldSpawn(world) : spawnFor(world, kind, "scenario");
    const heading = (pose.yaw * 180) / Math.PI;
    return `    "${world}": (${formatPoseNumber(pose.x)}, ${formatPoseNumber(pose.z)}, ${formatPoseNumber(heading)}),`;
  });
  return `# SEED draws the sensor bias once. The same number replays the same noise.
# Your own random numbers should use np.random.default_rng(SEED) too.
# START_POSE places the car on Run and Reset. x and y are meters on the map
# (y runs north), and the third number is heading in degrees. 0 faces north,
# and 90 faces east.
# This chooses where the car starts. It is not a sensor reading.
SEED = 1
START_POSE = {
${lines.join("\n")}
}

`;
}

export function readProgramSeed(source: string): number {
  const match = /(?:^|\n)\s*SEED\s*=\s*(-?\d+(?:\.\d+)?)/.exec(source);
  if (!match) return 1;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 1;
  return value >>> 0;
}

/**
 * A dict is the per-world form. A bare tuple is the single-world form, and
 * only then: a dict that omits this world does not fall through to a tuple.
 */
export function readStartPose(source: string, world: string): MapPose | null {
  const at = source.search(/(?:^|\n)\s*START_POSE\s*=/);
  if (at < 0) return null;
  const after = source.slice(at).replace(/^[\s\S]*?START_POSE\s*=\s*/, "");
  if (after.startsWith("{")) {
    const body = takeBlock(after, "{", "}");
    if (body == null) return null;
    const entry = new RegExp(`["']${world}["']\\s*:\\s*\\(([^)]*)\\)`).exec(body);
    if (!entry) return null;
    return parseTriple(entry[1] ?? "");
  }
  if (after.startsWith("(")) {
    const tuple = /^\(([^)]*)\)/.exec(after);
    if (!tuple) return null;
    return parseTriple(tuple[1] ?? "");
  }
  return null;
}

function takeBlock(text: string, open: string, close: string): string | null {
  if (!text.startsWith(open)) return null;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(0, index + 1);
    }
  }
  return null;
}

function parseTriple(body: string): MapPose | null {
  const parts = body.split(",").map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return { x: parts[0]!, y: parts[1]!, heading: parts[2]! };
}

/** What the console says when a coded start is refused. */
export function invalidPoseMessage(
  x: number,
  y: number,
  problem: "off the map" | "inside a wall",
  fallback: "lesson" | "example" | "world",
): string {
  const where =
    fallback === "lesson" ? "this lesson's start" : fallback === "example" ? "this example's start" : "this world's default start";
  return `START_POSE (${formatPoseNumber(x)}, ${formatPoseNumber(y)}) is ${problem}. Using ${where}.`;
}

/** Why a coded start cannot be used. Null means the point is clear. */
export function poseProblem(solids: readonly Solid[], x: number, z: number): "off the map" | "inside a wall" | null {
  if (Math.abs(x) > 100 || Math.abs(z) > 100) return "off the map";
  for (const solid of solids) {
    if (solid.hy < 0.3) continue;
    const dx = x - solid.x;
    const dz = z - solid.z;
    const cos = Math.cos(solid.yaw);
    const sin = Math.sin(solid.yaw);
    const localX = cos * dx + sin * dz;
    const localZ = -sin * dx + cos * dz;
    if (solid.shape === "cuboid") {
      if (Math.abs(localX) < solid.hx + 0.55 && Math.abs(localZ) < solid.hz + 0.55) return "inside a wall";
    } else if (localX * localX + localZ * localZ < (solid.hx + 0.55) * (solid.hx + 0.55)) {
      return "inside a wall";
    }
  }
  return null;
}
