import { ACKERMANN_BUGGY, assertNoBannedKeys, publishSensorFrame, type ControlCommand, type SensorFrame } from "../api";
import type { WorkerToHost } from "./messages";

export type SandboxState = "idle" | "running" | "stopped" | "error";

const TIMEOUT_MS = 400;

export interface SandboxCallbacks {
  onCommand: (command: ControlCommand) => void;
  onLog: (line: string, level: "log" | "error") => void;
  onState: (state: SandboxState) => void;
}

/**
 * Host side of the control sandbox. Sensor frames are copied through
 * `publishSensorFrame` immediately before postMessage, and rejected if a
 * banned ground-truth key is present. The worker is terminated and replaced
 * on Stop and on a missed deadline (a hung update() cannot be unwound).
 */
export class CodeSandbox {
  private worker: Worker | null = null;
  private generation = 0;
  private state: SandboxState = "idle";
  private waiting: { id: number; sentAt: number } | null = null;
  private tickId = 0;

  constructor(private readonly callbacks: SandboxCallbacks) {}

  get current(): SandboxState {
    return this.state;
  }

  run(code: string): void {
    const worker = this.replaceWorker();
    this.setState("idle");
    worker.postMessage({
      type: "load",
      code,
      limits: {
        maxSteering: ACKERMANN_BUGGY.limits.maxSteering,
        minThrottle: ACKERMANN_BUGGY.limits.minThrottle,
        maxThrottle: ACKERMANN_BUGGY.limits.maxThrottle,
      },
    });
  }

  stop(): void {
    this.waiting = null;
    this.replaceWorker();
    this.setState("stopped");
  }

  offer(frame: SensorFrame): void {
    if (this.state !== "running" || !this.worker) return;
    if (this.waiting) {
      if (performance.now() - this.waiting.sentAt > TIMEOUT_MS) {
        this.callbacks.onLog(
          `Controller timed out after ${TIMEOUT_MS} ms and the worker was reset. update() has to return every tick — an infinite loop causes this.`,
          "error",
        );
        this.waiting = null;
        this.replaceWorker();
        this.setState("error");
      }
      return;
    }
    const sensors = publishSensorFrame(frame);
    assertNoBannedKeys(sensors);
    const id = ++this.tickId;
    this.waiting = { id, sentAt: performance.now() };
    this.worker.postMessage({ type: "tick", id, sensors });
  }

  dispose(): void {
    this.generation += 1;
    this.worker?.terminate();
    this.worker = null;
  }

  private replaceWorker(): Worker {
    this.generation += 1;
    const generation = this.generation;
    this.worker?.terminate();
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    this.waiting = null;
    worker.onmessage = (event: MessageEvent<WorkerToHost>) => {
      if (generation !== this.generation) return;
      this.onWorker(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      if (generation !== this.generation) return;
      this.callbacks.onLog(event.message || "Worker crashed.", "error");
      this.replaceWorker();
      this.setState("error");
    };
    return worker;
  }

  private onWorker(message: WorkerToHost): void {
    if (message.type === "ready") {
      for (const line of message.logs) {
        this.callbacks.onLog(line, line.startsWith("error:") ? "error" : "log");
      }
      this.setState("running");
      return;
    }
    for (const line of message.logs) {
      this.callbacks.onLog(line, line.startsWith("error:") ? "error" : "log");
    }
    if (message.type === "result") {
      if (message.id !== this.waiting?.id) return;
      this.waiting = null;
      this.callbacks.onCommand(message.command);
      return;
    }
    this.waiting = null;
    this.callbacks.onLog(message.message, "error");
    this.replaceWorker();
    this.setState("error");
  }

  private setState(state: SandboxState): void {
    this.state = state;
    this.callbacks.onState(state);
  }
}
