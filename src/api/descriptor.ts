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
      // 1.2% scale factor. This stretches distance. It does not turn the heading.
      speedBiasStdDev: 0.012,
      steeringStdDev: 0.003,
      // Reported on steering_angle only. Heading is the gyro integral, so this
      // bias does not walk the pose around a curve.
      steeringBiasStdDev: 0.004,
    },
    imu: {
      // MEMS gyro at the control rate, after a startup calibration.
      // 0.0012 rad/s is about 0.07 deg/s. Seed 1 draws nearly one sigma,
      // so the integrated heading walks about 4 deg in 60 s. On a straight
      // that is a few meters of cross-track, under 5% of distance. White
      // noise is small next to that bias. A larger residual (a few tenths
      // of a deg/s) is what previously turned one oval lap into a 50 m miss;
      // that was the bicycle-model steering bias, and it is not used here.
      yawRateStdDev: 0.002,
      yawRateBiasStdDev: 0.0012,
      accelStdDev: 0.04,
      accelBiasStdDev: 0.02,
    },
    camera: { available: false },
  },
};
