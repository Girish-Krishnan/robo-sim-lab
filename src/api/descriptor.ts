import type { RobotDescriptor } from "./types";

/** Fixed rate of the student control loop. Physics steps faster than this. */
export const CONTROL_HZ = 20;
export const CONTROL_DT = 1 / CONTROL_HZ;

/**
 * Fixed physics rate. The live view accumulates real time and steps in
 * multiples of this; it never feeds a variable frame delta into the vehicle.
 */
export const PHYSICS_HZ = 60;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

/**
 * The only robot in this prototype. Static description: no pose, no velocity.
 * Add another descriptor (and a `SimRobot` implementation) for a new platform.
 */
export const ACKERMANN_BUGGY: RobotDescriptor = {
  id: "ackermann-buggy",
  name: "Ackermann buggy",
  kinematics: "ackermann",
  wheelbase: 1.9,
  trackWidth: 1.42,
  limits: {
    maxSteering: 0.55,
    minThrottle: -1,
    maxThrottle: 1,
  },
  sensors: {
    lidar: {
      // Hokuyo UST-10LX: 270°, 0.25° steps, 10 m, ±40 mm, 40 Hz.
      // The sandbox publishes one scan per 20 Hz control tick and keeps
      // every fourth hardware step (about 1°) so raycasts stay interactive.
      beams: 270,
      fov: (270 * Math.PI) / 180,
      maxRange: 12,
      rangeStdDev: 0.02,
    },
    odometry: {
      speedStdDev: 0.02,
      speedBiasStdDev: 0.012,
      steeringStdDev: 0.003,
      steeringBiasStdDev: 0.004,
    },
    imu: {
      // MEMS gyro, published at the control rate. Bias is chosen once per reset.
      yawRateStdDev: 0.002,
      yawRateBiasStdDev: 0.0015,
      accelStdDev: 0.04,
      accelBiasStdDev: 0.02,
    },
    camera: { available: false },
  },
};
