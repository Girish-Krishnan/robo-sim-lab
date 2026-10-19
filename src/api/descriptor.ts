import type { RobotDescriptor } from "./types";

/** Fixed rate of the student control loop. Physics steps faster than this. */
export const CONTROL_HZ = 20;
export const CONTROL_DT = 1 / CONTROL_HZ;

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
      beams: 360,
      maxRange: 25,
      rangeStdDev: 0.035,
    },
    odometry: {
      speedStdDev: 0.04,
      steeringStdDev: 0.008,
    },
    imu: {
      yawRateStdDev: 0.012,
      yawRateBiasStdDev: 0.008,
      accelStdDev: 0.06,
      accelBiasStdDev: 0.03,
    },
    camera: { available: false },
  },
};
