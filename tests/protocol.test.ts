import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ackermannAngles } from "../src/api/ackermann";
import { beamDirection, quatRotate, worldToBody, yawFromQuaternion } from "../src/api/math";
import { createOdometry } from "../src/api/odometry";
import {
  assertNoBannedKeys,
  clampCommand,
  publishSensorFrame,
} from "../src/api/protocol";
import type { SensorFrame } from "../src/api/types";

describe("publishSensorFrame", () => {
  it("drops ground-truth fields and keeps the sensor channels", () => {
    const dirty = {
      time: 1.5,
      dt: 0.05,
      lidar: { angles: [0, 1], ranges: [2, 40], maxRange: 25, origin: { x: 9, y: 1, z: 2 } },
      odometry: {
        speed: 1.2,
        steeringAngle: 0.2,
        pose: { x: 0.1, y: -0.2, yaw: 0.3 },
        truePose: { x: 8, y: 7, yaw: 1 },
        position: { x: 1 },
      },
      imu: {
        yawRate: 0.4,
        accel: { x: 0.1, y: 0, z: 9.8 },
        worldVelocity: { x: 1, y: 0, z: 2 },
      },
      camera: { available: true, width: 320, height: 240, pixels: [1, 2, 3], image: "nope" },
      groundTruth: { x: 5.4, y: 0.8, z: 0, vx: 3 },
      translation: { x: 1, y: 2, z: 3 },
      velocity: { x: 4 },
    } as SensorFrame;

    const published = publishSensorFrame(dirty);
    expect(Object.keys(published).sort()).toEqual(["camera", "dt", "imu", "lidar", "odometry", "time"]);
    expect(Object.keys(published.odometry).sort()).toEqual(["pose", "speed", "steeringAngle"]);
    expect(Object.keys(published.odometry.pose).sort()).toEqual(["x", "y", "yaw"]);
    expect(Object.keys(published.lidar).sort()).toEqual(["angles", "maxRange", "ranges"]);
    expect(Object.keys(published.imu).sort()).toEqual(["accel", "yawRate"]);
    expect(published.camera).toEqual({ available: false, width: 0, height: 0 });
    expect(() => assertNoBannedKeys(published)).not.toThrow();

    const text = JSON.stringify(published);
    for (const banned of ["groundTruth", "truePose", "translation", "velocity", "pixels", "origin", "worldVelocity"]) {
      expect(text.includes(`"${banned}"`)).toBe(false);
    }
  });

  it("rejects a frame that still carries a banned key", () => {
    expect(() => assertNoBannedKeys({ lidar: { origin: { x: 1 } } })).toThrow(/origin/);
    expect(() => assertNoBannedKeys({ groundTruth: { x: 1 } })).toThrow(/groundTruth/);
  });

  it("clamps commands to the vehicle limits", () => {
    const limits = { maxSteering: 0.55, minThrottle: -1, maxThrottle: 1 };
    expect(clampCommand({ steering: 4, throttle: 9 }, limits)).toEqual({ steering: 0.55, throttle: 1 });
    expect(clampCommand({ steering: -4, throttle: -9 }, limits)).toEqual({ steering: -0.55, throttle: -1 });
    expect(clampCommand({ steering: Number.NaN, throttle: Number.NaN }, limits)).toEqual({
      steering: 0,
      throttle: 0,
    });
    expect(clampCommand(undefined, limits)).toEqual({ steering: 0, throttle: 0 });
  });
});

describe("odometry", () => {
  it("integrates speed and steering only, starting from the origin", () => {
    const odom = createOdometry(1.9);
    expect(odom.pose()).toEqual({ x: 0, y: 0, yaw: 0 });
    odom.integrate(2, 0, 0.5);
    const straight = odom.pose();
    expect(straight.x).toBeCloseTo(1);
    expect(straight.y).toBeCloseTo(0);
    expect(straight.yaw).toBeCloseTo(0);
    odom.integrate(2, 0.3, 0.5);
    expect(odom.pose().yaw).toBeGreaterThan(0);
    odom.reset();
    expect(odom.pose()).toEqual({ x: 0, y: 0, yaw: 0 });
  });
});

describe("ackermann", () => {
  it("gives the inner wheel a larger angle", () => {
    const leftTurn = ackermannAngles(0.3, 1.9, 1.42);
    expect(leftTurn.left).toBeGreaterThan(leftTurn.right);
    expect(leftTurn.left).toBeGreaterThan(0);
    const rightTurn = ackermannAngles(-0.3, 1.9, 1.42);
    expect(rightTurn.right).toBeLessThan(rightTurn.left);
    expect(ackermannAngles(0, 1.9, 1.42)).toEqual({ left: 0, right: 0 });
  });
});

describe("body frame", () => {
  it("treats identity as forward +Z and yaw 0", () => {
    const q = { x: 0, y: 0, z: 0, w: 1 };
    expect(yawFromQuaternion(q)).toBeCloseTo(0);
    const forward = beamDirection(q, 0);
    expect(forward.z).toBeCloseTo(1);
    expect(forward.x).toBeCloseTo(0);
    const left = beamDirection(q, Math.PI / 2);
    // Driver's left is local +X, which is world +X when the nose points +Z.
    expect(left.x).toBeCloseTo(1);
    expect(left.z).toBeCloseTo(0);
    const body = worldToBody(q, { x: 0, y: 0, z: 4 });
    expect(body.x).toBeCloseTo(4);
    expect(body.y).toBeCloseTo(0);
    expect(body.z).toBeCloseTo(0);
    const leftward = worldToBody(q, { x: 3, y: 0, z: 0 });
    expect(leftward.y).toBeCloseTo(3);
    const rotated = quatRotate({ x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }, { x: 0, y: 0, z: 1 });
    expect(rotated.x).toBeCloseTo(-1);
    expect(yawFromQuaternion({ x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 })).toBeCloseTo(Math.PI / 2);
  });
});

describe("sandbox source", () => {
  it("does not import the simulator or mention ground-truth fields", () => {
    const worker = readFileSync("src/sandbox/worker.ts", "utf8");
    const controller = readFileSync("src/sandbox/controller.ts", "utf8");
    expect(worker.includes("../sim")).toBe(false);
    expect(worker.includes("../robots")).toBe(false);
    expect(worker.includes("groundTruth")).toBe(false);
    expect(worker.includes("linvel")).toBe(false);
    expect(worker.includes("loadPyodide")).toBe(true);
    expect(worker.includes("new Function")).toBe(false);
    expect(controller.includes("publishSensorFrame")).toBe(true);
    expect(controller.includes("assertNoBannedKeys")).toBe(true);
    expect(controller.includes("terminate")).toBe(true);
  });

  it("ships Python examples that define control(sensors)", () => {
    const examples = readFileSync("src/editor/examples.ts", "utf8");
    expect(examples.includes("function update")).toBe(false);
    expect(examples.match(/def control\(sensors\)/g)?.length).toBe(3);
  });
});
