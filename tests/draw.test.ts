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
});
