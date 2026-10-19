import { ACKERMANN_BUGGY, assertNoBannedKeys, publishSensorFrame, type ControlCommand, type SensorFrame } from "../api";
import type { WorkerToHost } from "./messages";

export type SandboxState = "idle" | "loading" | "running" | "stopped" | "error";

const TICK_TIMEOUT_MS = 400;
const LOAD_TIMEOUT_MS = 2500;
const BOOT_TIMEOUT_MS = 45000;

export interface SandboxCallbacks {
  onCommand: (command: ControlCommand) => void;
  onLog: (line: string, level: "log" | "error") => void;
  onState: (state: SandboxState) => void;
}

/**
 * Host side of the Python sandbox. Sensor frames are copied through
 * `publishSensorFrame` immediately before postMessage, and rejected if a
 * banned key is present. The worker stays alive across Run and Stop so
 * Pyodide is not downloaded again. It is terminated only when a tick or a
 * load does not return (a hung control() cannot be unwound).
 */
export class CodeSandbox {
  private worker: Worker | null = null;
  private generation = 0;
  private state: SandboxState = "idle";
  private runtimeReady = false;
  private booting = false;
  private pendingCode: string | null = null;
  private ignoreCommands = false;
  private waiting: { id: number; sentAt: number; kind: "boot" | "load" | "tick" } | null = null;
  private tickId = 0;
  private timer = 0;

  constructor(private readonly callbacks: SandboxCallbacks) {}

  get current(): SandboxState {
    return this.state;
  }

  /** Start Pyodide the first time Code mode is opened. */
  warmup(): void {
    if (this.runtimeReady || this.booting) return;
    this.boot();
  }

  run(code: string): void {
    this.pendingCode = code;
    this.ignoreCommands = false;
    if (!this.runtimeReady) {
      this.warmup();
      this.setState("loading");
      return;
    }
    this.postLoad(code);
  }

  stop(): void {
    this.pendingCode = null;
    this.ignoreCommands = true;
    const hungRisk = this.waiting?.kind === "tick" || this.waiting?.kind === "load";
    if (!hungRisk) {
      this.waiting = null;
      this.clearTimer();
      this.worker?.postMessage({ type: "stop" });
    }
    this.setState("stopped");
  }

  offer(frame: SensorFrame): void {
    if (this.state !== "running" || !this.worker || !this.runtimeReady) return;
    if (this.waiting) return;
    const sensors = publishSensorFrame(frame);
    assertNoBannedKeys(sensors);
    const id = ++this.tickId;
    this.arm(id, "tick", TICK_TIMEOUT_MS);
    this.worker.postMessage({ type: "tick", id, sensors });
  }

  dispose(): void {
    this.generation += 1;
    this.clearTimer();
    this.worker?.terminate();
    this.worker = null;
  }

  private boot(): void {
    const worker = this.replaceWorker();
    this.runtimeReady = false;
    this.booting = true;
    this.setState("loading");
    this.arm(0, "boot", BOOT_TIMEOUT_MS);
    worker.postMessage({ type: "boot" });
  }

  private postLoad(code: string): void {
    if (!this.worker) return;
    this.pendingCode = null;
    this.arm(++this.tickId, "load", LOAD_TIMEOUT_MS);
    this.worker.postMessage({
      type: "load",
      code,
      limits: {
        maxSteering: ACKERMANN_BUGGY.limits.maxSteering,
        minThrottle: ACKERMANN_BUGGY.limits.minThrottle,
        maxThrottle: ACKERMANN_BUGGY.limits.maxThrottle,
      },
    });
  }

  private replaceWorker(): Worker {
    this.generation += 1;
    const generation = this.generation;
    this.clearTimer();
    this.worker?.terminate();
    this.waiting = null;
    this.runtimeReady = false;
    this.booting = false;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<WorkerToHost>) => {
      if (generation !== this.generation) return;
      this.onWorker(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      if (generation !== this.generation) return;
      this.callbacks.onLog(event.message || "Worker crashed.", "error");
      this.failWorker();
    };
    return worker;
  }

  private onWorker(message: WorkerToHost): void {
    this.flushLogs(message.logs);
    if (message.type === "runtime") {
      this.booting = false;
      this.runtimeReady = true;
      this.waiting = null;
      this.clearTimer();
      if (this.pendingCode && this.state !== "stopped") {
        this.postLoad(this.pendingCode);
      } else if (this.state === "loading") {
        this.setState("idle");
      }
      return;
    }
    if (message.type === "ready") {
      if (this.waiting?.kind !== "load" && this.waiting?.kind !== "tick") {
        // A late ready after stop is ignored below if state is stopped.
      }
      this.waiting = null;
      this.clearTimer();
      if (this.state === "stopped") return;
      this.ignoreCommands = false;
      this.setState("running");
      return;
    }
    if (message.type === "result") {
      if (message.id !== this.waiting?.id) return;
      this.waiting = null;
      this.clearTimer();
      if (this.ignoreCommands || this.state !== "running") return;
      this.callbacks.onCommand(message.command);
      return;
    }
    this.waiting = null;
    this.clearTimer();
    this.logError(message.message);
    if (!this.runtimeReady) {
      this.failWorker();
      return;
    }
    if (this.state !== "stopped") this.setState("error");
  }

  private arm(id: number, kind: "boot" | "load" | "tick", timeout: number): void {
    this.waiting = { id, sentAt: performance.now(), kind };
    this.clearTimer();
    this.timer = window.setTimeout(() => this.checkDeadline(), timeout + 30);
  }

  private checkDeadline(): void {
    const waiting = this.waiting;
    if (!waiting) return;
    const limit = waiting.kind === "boot" ? BOOT_TIMEOUT_MS : waiting.kind === "load" ? LOAD_TIMEOUT_MS : TICK_TIMEOUT_MS;
    if (performance.now() - waiting.sentAt < limit) return;
    const why =
      waiting.kind === "boot"
        ? "Python runtime did not finish loading."
        : `Controller timed out after ${limit} ms and the worker was reset. control() has to return every tick — an infinite loop causes this.`;
    this.callbacks.onLog(why, "error");
    this.waiting = null;
    this.pendingCode = null;
    this.failWorker();
  }

  private failWorker(): void {
    this.runtimeReady = false;
    this.booting = false;
    this.waiting = null;
    this.clearTimer();
    this.generation += 1;
    this.worker?.terminate();
    this.worker = null;
    this.setState("error");
  }

  private flushLogs(lines: string[]): void {
    for (const line of lines) {
      this.callbacks.onLog(line, line.startsWith("error:") ? "error" : "log");
    }
  }

  private logError(message: string): void {
    for (const line of message.split("\n")) {
      if (line.trim()) this.callbacks.onLog(line, "error");
    }
  }

  private clearTimer(): void {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private setState(state: SandboxState): void {
    this.state = state;
    this.callbacks.onState(state);
  }
}
