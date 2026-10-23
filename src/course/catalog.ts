import { spawnFor, worldSpawn } from "../sim/spawns";
import type { WorldId } from "../sim/worlds";
import { isWorldId } from "../sim/worlds";
import type { SpawnPose } from "../sim/vehicle";

export interface CourseModule {
  id: string;
  title: string;
  blurb: string;
  soon?: boolean;
}

export const MODULES: CourseModule[] = [
  { id: "getting-started", title: "Getting started", blurb: "The sandbox, the robot, and why the program never sees the true pose." },
  { id: "models", title: "Robot models and sensors", blurb: "The bicycle model, lidar, wheel odometry, the IMU, and the drift in the plots." },
  { id: "reactive", title: "Reactive control", blurb: "Open-loop circles, lidar avoidance, and a PD wall follower." },
  { id: "tracking", title: "Path tracking", blurb: "Pure pursuit, and why odometry drift bends it off the path." },
  { id: "localization", title: "Localization", blurb: "A particle filter that keeps a known map and the lidar in agreement." },
  { id: "mapping", title: "Mapping", blurb: "Occupancy grids and SLAM. Coming soon.", soon: true },
  { id: "planning", title: "Planning", blurb: "A* and RRT. Coming soon.", soon: true },
  { id: "advanced", title: "Advanced control", blurb: "Stanley and MPC. Coming soon.", soon: true },
];

export type LessonAction = "sandbox" | "drive" | "lab";
export type LessonSpawn = "default" | "circle" | "avoid" | "wall" | "pursuit" | "mcl" | "mcl-global";
export type LessonCamera = "chase" | "wide" | "overhead";

/** How the simulator should look while this lesson is open. */
export interface LessonScene {
  lidar: boolean;
  paths: boolean;
  /** Particle cloud, ellipse, and estimate trail are on screen. */
  particles: boolean;
  /** The program draws the reference route. */
  route: boolean;
  /** Localization lessons can hand the steering wheel to the keyboard. */
  manual: boolean;
  camera: LessonCamera;
  seed: number;
  /** Load and run the starter (or the saved edit). */
  run: boolean;
  /** Live true-versus-odometry error graph. */
  graph: boolean;
}

export interface Lesson {
  id: string;
  moduleId: string;
  slug: string;
  title: string;
  order: number;
  status: "ready" | "soon";
  world: WorldId;
  /** Worlds this lesson is written for. The picker locks the rest. */
  worlds: WorldId[];
  spawn: LessonSpawn;
  starter: string | null;
  action: LessonAction;
  prerequisites: string[];
  markdown: string;
}

const rawLessons = import.meta.glob("../lessons/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const LESSONS: Lesson[] = Object.entries(rawLessons)
  .map(([path, source]) => parseLesson(path, source))
  .filter((lesson): lesson is Lesson => lesson !== null)
  .sort((a, b) => moduleOrder(a.moduleId) - moduleOrder(b.moduleId) || a.order - b.order || a.slug.localeCompare(b.slug));

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}

export function moduleLessons(moduleId: string): Lesson[] {
  return LESSONS.filter((lesson) => lesson.moduleId === moduleId);
}

export function lessonIndex(id: string): number {
  return LESSONS.findIndex((lesson) => lesson.id === id);
}

export function resolveSpawn(lesson: Lesson): SpawnPose {
  return resolveSpawnIn(lesson, lesson.world);
}

/**
 * The lesson's start, in whichever world is on screen. Switching worlds
 * keeps the same kind of start (circle pad, wall, route, avoid) instead
 * of dropping back to that world's driving spawn.
 */
export function resolveSpawnIn(lesson: Lesson, world: WorldId): SpawnPose {
  if (lesson.spawn === "default") return worldSpawn(world);
  return spawnFor(world, lesson.spawn, "scenario");
}

/**
 * World, overlays, and camera for a lesson. Reading a lesson still sets a
 * scene: the bicycle lesson is a wide chase of the circle starter so the
 * steered wheels and the arc are both in frame.
 */
export function sceneFor(lesson: Lesson): LessonScene {
  if (lesson.status === "soon") {
    return { lidar: true, paths: false, particles: false, route: false, manual: false, camera: "chase", seed: 1, run: false, graph: false };
  }
  const kidnapped = lesson.spawn === "mcl-global" || lesson.starter === "mcl-global";
  const particles =
    kidnapped ||
    lesson.starter === "mcl" ||
    lesson.slug === "particles" ||
    lesson.slug === "bayes" ||
    lesson.slug === "pf-pursuit";
  const steering = lesson.slug === "bicycle" || lesson.slug === "circle" || lesson.slug === "imu";
  const paths =
    particles ||
    steering ||
    lesson.moduleId === "tracking" ||
    lesson.moduleId === "localization" ||
    lesson.slug === "odometry" ||
    lesson.slug === "noise" ||
    lesson.slug === "wall" ||
    lesson.slug === "driving" ||
    lesson.slug === "sandbox";
  const lidarOff = lesson.slug === "bicycle" || lesson.slug === "circle" || lesson.slug === "odometry" || lesson.slug === "imu" || lesson.slug === "noise" || lesson.slug === "pursuit" || lesson.slug === "drift" || lesson.slug === "dead-reckoning";
  const route =
    lesson.starter === "pursuit" ||
    lesson.starter === "mcl" ||
    lesson.starter === "mcl-global" ||
    lesson.moduleId === "tracking" ||
    lesson.moduleId === "localization";
  const camera: LessonCamera = kidnapped ? "overhead" : particles || steering ? "wide" : "chase";
  return {
    lidar: !lidarOff,
    paths,
    particles,
    route,
    manual: lesson.slug === "bayes" || lesson.slug === "particles" || lesson.slug === "pf-pursuit" || lesson.slug === "kidnapped",
    camera,
    seed: 1,
    run: Boolean(lesson.starter),
    graph: lesson.slug === "odometry" || lesson.slug === "noise",
  };
}

function moduleOrder(id: string): number {
  const index = MODULES.findIndex((module) => module.id === id);
  return index === -1 ? 99 : index;
}

function parseLesson(path: string, source: string): Lesson | null {
  const match = path.match(/lessons\/([^/]+)\/([^/]+)\.md$/);
  if (!match) return null;
  const moduleId = match[1]!;
  const slug = match[2]!;
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const fields = front ? parseFields(front[1] ?? "") : {};
  const markdown = (front ? front[2] : source).trim();
  const module = MODULES.find((item) => item.id === moduleId);
  const world = fields.world && isWorldId(fields.world) ? fields.world : "city";
  const starter = fields.starter && fields.starter !== "none" ? fields.starter : null;
  const status = fields.status === "soon" || module?.soon ? "soon" : "ready";
  const action = parseAction(fields.action, starter, status);
  return {
    id: `${moduleId}/${slug}`,
    moduleId,
    slug,
    title: fields.title || slug,
    order: Number(fields.order ?? 0) || 0,
    status,
    world,
    worlds: parseWorlds(fields.worlds, world),
    spawn: parseSpawn(fields.spawn),
    starter,
    action,
    prerequisites: (fields.prerequisites ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
    markdown,
  };
}

function parseFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    fields[match[1]!] = match[2]!.trim();
  }
  return fields;
}

function parseWorlds(value: string | undefined, home: WorldId): WorldId[] {
  const listed = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is WorldId => isWorldId(item));
  if (!listed.includes(home)) listed.unshift(home);
  return listed;
}

function parseSpawn(value: string | undefined): LessonSpawn {
  if (
    value === "circle" ||
    value === "avoid" ||
    value === "wall" ||
    value === "pursuit" ||
    value === "mcl" ||
    value === "mcl-global" ||
    value === "default"
  ) {
    return value;
  }
  return "default";
}

function parseAction(value: string | undefined, starter: string | null, status: "ready" | "soon"): LessonAction {
  if (status === "soon") return "sandbox";
  if (value === "sandbox" || value === "drive" || value === "lab") return value;
  return starter ? "lab" : "drive";
}
