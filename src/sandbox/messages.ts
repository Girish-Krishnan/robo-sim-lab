import type { ControlCommand, RobotLimits, SensorFrame } from "../api";

export type HostToWorker =
  | { type: "boot" }
  | { type: "load"; code: string; limits: RobotLimits }
  | { type: "tick"; id: number; sensors: SensorFrame }
  | { type: "stop" };

export type WorkerToHost =
  | { type: "runtime"; logs: string[] }
  | { type: "ready"; logs: string[] }
  | { type: "result"; id: number; command: ControlCommand; logs: string[] }
  | { type: "error"; message: string; logs: string[] };
