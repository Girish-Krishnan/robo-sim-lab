import type { ControlCommand, RobotDescriptor, SensorFrame } from "../api";

/** On-screen telemetry. Never pass this object to the code sandbox. */
export interface VehicleTelemetry {
  trueSpeed: number;
  odomSpeed: number;
  commandedSteering: number;
  actuatorSteering: number;
  commandedThrottle: number;
}

/** World-space lidar returns for the 3D overlay. Main thread only. */
export interface LidarDebugPoint {
  x: number;
  y: number;
  z: number;
  range: number;
  hit: boolean;
}

export interface ChassisFocus {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * Implemented by each simulated platform. The sandbox never sees this
 * interface: it only receives `SensorFrame` and returns `ControlCommand`.
 * A future diff-drive robot or a Pyodide-backed controller stays behind
 * the same two types.
 */
export interface SimRobot {
  readonly descriptor: RobotDescriptor;
  reset(): void;
  setCommand(command: ControlCommand, brake: number): void;
  preStep(dt: number): void;
  syncVisuals(): void;
  sampleSensors(dt: number): SensorFrame;
  lidarDebug(): readonly LidarDebugPoint[];
  telemetry(): VehicleTelemetry;
  focus(): ChassisFocus;
  dispose(): void;
}
