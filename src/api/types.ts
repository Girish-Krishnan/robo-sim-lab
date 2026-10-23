/**
 * Student-facing sensor and command types.
 *
 * These are the only runtime values a user program is allowed to see.
 * World pose, body velocity, and the physics handles are not part of this
 * module. The Python worker turns a SensorFrame into attribute-style objects
 * and must return the same ControlCommand.
 *
 * Robot frame: x forward, y left, z up. Yaw is counterclockwise viewed
 * from above. Angles are radians.
 */

export interface LidarScan {
  /** Beam angle in the robot frame. 0 is forward, positive is left, range (−π, π]. */
  angles: number[];
  /** Meters. A value equal to `maxRange` means no return. */
  ranges: number[];
  maxRange: number;
}

export interface OdometryPose {
  /** Dead-reckoned meters. This is not the world position. */
  x: number;
  y: number;
  /** Dead-reckoned yaw, radians, counterclockwise from above. */
  yaw: number;
}

export interface WheelOdometry {
  /** Forward speed from the rear wheels, m/s, with noise. */
  speed: number;
  /** Measured front steering angle, radians, positive left, with noise. */
  steeringAngle: number;
  /**
   * Pose integrated from noisy wheel speed and the gyro yaw rate. Steering bias is not part of the integral.
   * It starts at the origin on reset and drifts. It is not ground truth.
   */
  pose: OdometryPose;
}

export interface ImuSample {
  /** Yaw rate about body +z, rad/s, with bias and noise. */
  yawRate: number;
  /**
   * Specific force in the robot frame, m/s².
   * At rest on level ground, z is about +9.81 (the accelerometer feels the normal force).
   */
  accel: { x: number; y: number; z: number };
}

/** A map waypoint in the odometry frame at reset. Not a measured pose. */
export interface MapPoint {
  x: number;
  y: number;
}

/**
 * A known map in the odometry frame at reset. Same idea as handing a
 * real robot a floor plan: walls and a grid, not the robot's pose.
 * `corner` is the cell-(0, 0) anchor. The name `origin` is not used,
 * so it cannot be confused with a pose.
 */
export interface KnownMap {
  /** Meters per cell. */
  resolution: number;
  /** Odometry-frame coordinates of the minimum corner of cell (0, 0). */
  corner: { x: number; y: number };
  width: number;
  height: number;
  /**
   * Base64 bytes, row-major, one byte per cell. The value is the chamfer
   * distance to the nearest occupied cell, in centimeters, clipped at 255.
   * A 0 is an occupied cell. Row 0 is the minimum y.
   */
  field: string;
  /**
   * Wall edges in the odometry frame, packed as x0, y0, x1, y1.
   * These are the lidar-visible outlines the grid was built from.
   */
  segments: number[];
  /** Changes when the grid changes. Student code can cache on this. */
  stamp: number;
}

/**
 * A goal the world is allowed to give the program, the way a real robot
 * is given a lane or a route. This is not ground-truth state.
 */
export interface TaskInfo {
  path: MapPoint[];
  map: KnownMap;
}

/** Placeholder so a real camera can be added without changing the call shape. */
export interface CameraStub {
  available: false;
  width: number;
  height: number;
}

export interface SensorFrame {
  /** Seconds since the physics world started, not a pose. */
  time: number;
  /** Seconds since the previous control tick. */
  dt: number;
  lidar: LidarScan;
  odometry: WheelOdometry;
  imu: ImuSample;
  camera: CameraStub;
  /**
   * Reference path in the odometry frame at reset. A map the world gives
   * the program. It is not the car's pose.
   */
  task: TaskInfo;
}

export interface ControlCommand {
  /** Radians. Positive steers left. Clamped to the robot limit. */
  steering: number;
  /** −1 full reverse … +1 full forward. */
  throttle: number;
}

export interface RobotLimits {
  /** Maximum |steering| in radians. */
  maxSteering: number;
  minThrottle: number;
  maxThrottle: number;
}

export interface LidarSpec {
  /** Number of beams across `fov`. A downsample of a 0.25° Hokuyo scan. */
  beams: number;
  /** Total field of view, radians, centered on forward. */
  fov: number;
  maxRange: number;
  /** One-sigma range noise, meters. */
  rangeStdDev: number;
}

export interface RobotDescriptor {
  id: string;
  name: string;
  kinematics: "ackermann";
  /** Meters between front and rear axles. */
  wheelbase: number;
  /** Meters between the left and right wheels. */
  trackWidth: number;
  limits: RobotLimits;
  sensors: {
    lidar: LidarSpec;
    odometry: {
      /** White noise on wheel speed, m/s. */
      speedStdDev: number;
      /** One-sigma fractional speed bias, sampled once per reset. 0.01 is 1%. */
      speedBiasStdDev: number;
      /** White noise on steering, radians. */
      steeringStdDev: number;
      /** One-sigma steering-angle bias, radians, sampled once per reset. Not integrated into pose. */
      steeringBiasStdDev: number;
    };
    imu: {
      yawRateStdDev: number;
      yawRateBiasStdDev: number;
      accelStdDev: number;
      accelBiasStdDev: number;
    };
    camera: { available: false };
  };
}
