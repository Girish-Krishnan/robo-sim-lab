import { describe, expect, it } from "vitest";
import { parseDrawOps } from "../src/api/draw";

describe("parseDrawOps", () => {
  it("keeps a heading and a weight on each point", () => {
    const ops = parseDrawOps(
      JSON.stringify([{ kind: "points", color: "#8eb8ff", points: [{ x: 1, y: 2, yaw: 0.4, w: 0.02 }, { x: 3, y: 4 }] }]),
    );
    expect(ops).toEqual([
      {
        kind: "points",
        color: "#8eb8ff",
        points: [
          { x: 1, y: 2, yaw: 0.4, w: 0.02 },
          { x: 3, y: 4 },
        ],
      },
    ]);
  });

  it("keeps a 2-sigma ellipse and caps a huge radius", () => {
    const ops = parseDrawOps(
      JSON.stringify([{ kind: "ellipse", x: 1.5, y: -2, yaw: 0.3, rx: 4, ry: 200, color: "#ffd400" }]),
    );
    expect(ops).toEqual([{ kind: "ellipse", x: 1.5, y: -2, yaw: 0.3, rx: 4, ry: 80, color: "#ffd400" }]);
  });
});
