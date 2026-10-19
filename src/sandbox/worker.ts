import { clampCommand, type RobotLimits, type SensorFrame } from "../api";
import type { HostToWorker, WorkerToHost } from "./messages";

/**
 * User-code sandbox. This module must not import the simulator.
 * It only receives an already-sanitized SensorFrame and returns a command.
 */

interface ConsoleLike {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

let runner: ((sensors: SensorFrame) => unknown) | null = null;
let limits: RobotLimits = { maxSteering: 0.55, minThrottle: -1, maxThrottle: 1 };

const ctx = self as unknown as {
  postMessage: (message: WorkerToHost) => void;
  onmessage: ((event: MessageEvent<HostToWorker>) => void) | null;
  console: Console;
};

function post(message: WorkerToHost): void {
  ctx.postMessage(message);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

function formatArg(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return String(Math.round(value * 1000) / 1000);
  }
  if (typeof value === "boolean" || value == null) return String(value);
  try {
    const text = JSON.stringify(value);
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return String(value).slice(0, 500);
  }
}

function makeConsole(logs: string[]): ConsoleLike {
  const push = (prefix: string, args: unknown[]) => {
    if (logs.length >= 24) return;
    const text = args.map(formatArg).join(" ");
    logs.push((prefix ? `${prefix} ${text}` : text).slice(0, 500));
  };
  const consoleLike: ConsoleLike = {
    log: (...args) => push("", args),
    info: (...args) => push("", args),
    warn: (...args) => push("warn:", args),
    error: (...args) => push("error:", args),
  };
  ctx.console = consoleLike as unknown as Console;
  return consoleLike;
}

ctx.onmessage = (event: MessageEvent<HostToWorker>) => {
  const message = event.data;
  if (message.type === "stop") {
    runner = null;
    return;
  }

  if (message.type === "load") {
    const logs: string[] = [];
    try {
      if (message.code.length > 200_000) throw new Error("Program is too long (200k character limit).");
      limits = message.limits;
      // Top-level statements run once, when the program is loaded. `update`
      // is called on each tick and closes over that state. Re-running the
      // whole script every tick would wipe student variables such as `ticks`.
      const initLogs: string[] = [];
      makeConsole(initLogs);
      const update = new Function(
        `"use strict";\n${message.code}\nif (typeof update !== "function") throw new Error("Define function update(sensors) that returns { steering, throttle }.");\nreturn update;`,
      )() as (sensors: SensorFrame) => unknown;
      if (typeof update !== "function") {
        throw new Error("Define function update(sensors) that returns { steering, throttle }.");
      }
      runner = update;
      post({ type: "ready", logs: initLogs });
    } catch (error) {
      runner = null;
      post({ type: "error", message: errorText(error), logs });
    }
    return;
  }

  const logs: string[] = [];
  makeConsole(logs);
  if (!runner) {
    post({ type: "error", message: "No program is loaded.", logs });
    return;
  }
  try {
    const output = runner(message.sensors);
    if (output && typeof (output as Promise<unknown>).then === "function") {
      throw new Error("update() must return synchronously. Promises are not awaited.");
    }
    if (!output || typeof output !== "object") {
      throw new Error("update() must return { steering, throttle }.");
    }
    const command = clampCommand(output as { steering?: number; throttle?: number }, limits);
    post({ type: "result", id: message.id, command, logs });
  } catch (error) {
    post({ type: "error", message: errorText(error), logs });
  }
};
