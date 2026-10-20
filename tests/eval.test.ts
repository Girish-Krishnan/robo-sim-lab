import { readFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { describe, expect, it } from "vitest";
import { odomToWorld } from "../src/api/odometry";
import { circleCenter, circleSpawn, CIRCLE_ENVELOPE, footprintGap, solidsFor, EVAL_WORLDS, wallSpawn } from "../src/eval/scenarios";
import { runEpisode } from "../src/eval/simulate";

describe("evaluation spawns", () => {
  it("keeps each circle pad outside the obstacles", () => {
    for (const world of EVAL_WORLDS) {
      const center = circleCenter(world);
      const spawn = circleSpawn(world);
      expect(Math.hypot(spawn.x - center.x, spawn.z - center.z)).toBeGreaterThan(5);
      for (const solid of solidsFor(world)) {
        const gap = footprintGap(solid, center.x, center.z);
        expect(gap, `${world} ${solid.look} at ${solid.x},${solid.z}`).toBeGreaterThan(CIRCLE_ENVELOPE);
      }
    }
  });

  it("starts wall follow beside a wall and not inside one", () => {
    for (const world of EVAL_WORLDS) {
      const spawn = wallSpawn(world);
      for (const solid of solidsFor(world)) {
        const gap = footprintGap(solid, spawn.x, spawn.z);
        expect(gap, `${world} ${solid.look}`).toBeGreaterThan(1.6);
      }
    }
  });
});

describe("seeded episodes", () => {
  it("replays the same trajectory from the same seed", async () => {
    await RAPIER.init({});
    const solids = solidsFor("track").slice(0, 0);
    const run = () =>
      runEpisode(RAPIER, solids, {
        world: "track",
        example: "circle",
        spawn: { x: 0, y: 0.84, z: 0, yaw: 0 },
        seconds: 1.2,
        seed: 7,
        policy: () => ({ steering: 0.2, throttle: 0.45 }),
      });
    const a = run();
    const b = run();
    expect(a.metrics.final).toEqual(b.metrics.final);
    expect(a.metrics.distance).toBeCloseTo(b.metrics.distance, 5);
    expect(a.trail.at(-1)).toEqual(b.trail.at(-1));
    const other = runEpisode(RAPIER, solids, {
      world: "track",
      example: "circle",
      spawn: { x: 0, y: 0.84, z: 0, yaw: 0 },
      seconds: 1.2,
      seed: 8,
      policy: () => ({ steering: 0.2, throttle: 0.45 }),
    });
    expect(other.trail.at(-1)?.odomX).not.toBe(a.trail.at(-1)?.odomX);
    expect(a.metrics.minUp).toBeGreaterThan(0.75);
  });
});

describe("odometry placement", () => {
  it("maps a forward integral onto world +Z when the spawn faces +Z", () => {
    expect(odomToWorld({ x: 5, z: -2, yaw: 0 }, { x: 3, y: 0 })).toEqual({ x: 5, z: 1 });
    expect(odomToWorld({ x: 5, z: -2, yaw: 0 }, { x: 0, y: 2 }).x).toBeCloseTo(7);
  });
});

describe("ground truth stays out of the sandbox sources", () => {
  it("does not mention a true pose in the prelude or the path overlay", () => {
    const prelude = readFileSync(new URL("../src/sandbox/prelude.ts", import.meta.url), "utf8");
    const overlay = readFileSync(new URL("../src/sim/path-overlay.ts", import.meta.url), "utf8");
    for (const source of [prelude, overlay]) {
      expect(source.includes("groundTruth")).toBe(false);
      expect(source.includes("truePose")).toBe(false);
    }
    expect(overlay.includes("teaching")).toBe(true);
    expect(overlay.includes("postMessage")).toBe(false);
  });
});
