import { spawnFor, worldSpawn, type EvalWorld } from "../eval/scenarios";
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

export interface Lesson {
  id: string;
  moduleId: string;
  slug: string;
  title: string;
  order: number;
  status: "ready" | "soon";
  world: WorldId;
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
  if (lesson.spawn === "default") return worldSpawn(lesson.world);
  return spawnFor(lesson.world as EvalWorld, lesson.spawn, "scenario");
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
