import { describe, expect, it } from "vitest";
import { BANNED_SENSOR_KEYS, assertNoBannedKeys, publishSensorFrame } from "../src/api/protocol";
import type { SensorFrame } from "../src/api/types";
import { pursuitSpawn, solidsFor } from "../src/eval/scenarios";
import { buildKnownMap } from "../src/sim/known-map";

describe("known map", () => {
  it("publishes an occupancy field and wall segments without a pose", () => {
    const spawn = pursuitSpawn("track");
    const map = buildKnownMap(solidsFor("track"), spawn);
    expect(map.width).toBeGreaterThan(20);
    expect(map.height).toBeGreaterThan(20);
    expect(map.segments.length).toBeGreaterThan(16);
    expect(map.segments.length % 4).toBe(0);
    const frame = publishSensorFrame(frameWith(map));
    expect(frame.task.map.stamp).toBe(map.stamp);
    expect(frame.task.map.field.length).toBeGreaterThan(100);
    expect(() => assertNoBannedKeys(frame)).not.toThrow();
    const text = JSON.stringify(frame);
    for (const banned of BANNED_SENSOR_KEYS) expect(text.includes(`"${banned}"`)).toBe(false);

    const bytes = Uint8Array.from(atob(frame.task.map.field), (char) => char.charCodeAt(0));
    expect(bytes.length).toBe(frame.task.map.width * frame.task.map.height);
    const occupied = bytes.filter((value) => value === 0).length;
    expect(occupied).toBeGreaterThan(10);

    const dirty = frameWith(map);
    (dirty.task.map as unknown as { origin: { x: number }; groundTruth: { x: number } }).origin = { x: 1 };
    (dirty.task.map as unknown as { groundTruth: { x: number } }).groundTruth = { x: 4 };
    const cleaned = publishSensorFrame(dirty);
    expect(JSON.stringify(cleaned).includes("groundTruth")).toBe(false);
    expect(JSON.stringify(cleaned).includes("origin")).toBe(false);
    expect(Object.keys(cleaned.task.map).sort()).toEqual([
      "corner",
      "field",
      "height",
      "resolution",
      "segments",
      "stamp",
      "width",
    ]);
  });
});

function frameWith(map: ReturnType<typeof buildKnownMap>): SensorFrame {
  return {
    time: 0,
    dt: 0.05,
    lidar: { angles: [0], ranges: [4], maxRange: 12 },
    odometry: { speed: 0, steeringAngle: 0, pose: { x: 0, y: 0, yaw: 0 } },
    imu: { yawRate: 0, accel: { x: 0, y: 0, z: 9.8 } },
    camera: { available: false, width: 0, height: 0 },
    task: { path: [{ x: 1, y: 2, groundTruth: { x: 9 } } as unknown as { x: number; y: number }], map },
  };
}
