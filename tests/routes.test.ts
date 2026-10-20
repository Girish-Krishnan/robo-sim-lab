import { describe, expect, it } from "vitest";
import { footprintGap, solidsFor, type EvalWorld } from "../src/eval/scenarios";
import { referenceRoute } from "../src/sim/routes";

const WORLDS: EvalWorld[] = ["city", "track", "forest", "warehouse"];

describe("reference routes", () => {
  it("keeps every waypoint clear of solid obstacles", () => {
    const failures: string[] = [];
    for (const world of WORLDS) {
      const route = referenceRoute(world);
      expect(route.length, world).toBeGreaterThan(12);
      let worst = Infinity;
      let where = "";
      for (const point of route) {
        for (const solid of solidsFor(world)) {
          const gap = footprintGap(solid, point.x, point.z);
          if (gap < worst) {
            worst = gap;
            where = `${solid.look} at ${solid.x},${solid.z} vs ${point.x.toFixed(1)},${point.z.toFixed(1)} gap ${gap.toFixed(2)}`;
          }
        }
      }
      console.log(`${world} closest ${where}`);
      if (worst <= 1.8) failures.push(`${world} ${where}`);
    }
    expect(failures).toEqual([]);
  });
});
