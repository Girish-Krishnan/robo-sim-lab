import type { ControlCommand, DrawOp, RobotLimits, SensorFrame } from "../api";

export type HostToWorker =
  | { type: "boot" }
  | { type: "load"; id: number; code: string; limits: RobotLimits }
  | { type: "tick"; id: number; sensors: SensorFrame }
  | { type: "stop" };

export type WorkerToHost =
  | { type: "runtime"; logs: string[] }
  | { type: "ready"; id: number; logs: string[] }
  | { type: "result"; id: number; command: ControlCommand; draw?: DrawOp[]; logs: string[] }
  | { type: "error"; id?: number; message: string; logs: string[] };
