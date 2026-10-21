import { describe, expect, it } from "vitest";
import { cloudSpread, CONVERGE_HEADING, CONVERGE_RADIUS } from "../src/eval/spread";

describe("weighted cloud spread", () => {
  it("stays under the gate for a tight cloud and not for a yard-sized one", () => {
    const tight = cloudSpread([
      { x: 0, y: 0, yaw: 0.01, w: 0.25 },
      { x: 0.08, y: -0.04, yaw: -0.02, w: 0.25 },
      { x: -0.05, y: 0.06, yaw: 0.03, w: 0.25 },
      { x: 0.02, y: 0.01, yaw: -0.01, w: 0.25 },
    ]);
    expect(tight).toBeDefined();
    expect(tight!.radius).toBeLessThan(CONVERGE_RADIUS);
    expect(tight!.headingSigma).toBeLessThan(CONVERGE_HEADING);

    const wide = [];
    for (let i = 0; i < 40; i++) {
      wide.push({ x: Math.cos(i) * 12, y: Math.sin(i) * 8, yaw: i * 0.4, w: 1 });
    }
    const spread = cloudSpread(wide);
    expect(spread!.radius).toBeGreaterThan(CONVERGE_RADIUS);
    expect(spread!.headingSigma).toBeGreaterThan(CONVERGE_HEADING);
  });

  it("does not treat one heavy particle as a collapsed cloud while the rest cover the yard", () => {
    const points = [{ x: 0, y: 0, yaw: 0, w: 0.4 }];
    for (let i = 0; i < 30; i++) points.push({ x: (i % 10) * 3, y: Math.floor(i / 10) * 4, yaw: i, w: 0.02 });
    const spread = cloudSpread(points);
    expect(spread!.radius).toBeGreaterThan(CONVERGE_RADIUS);
  });
});
