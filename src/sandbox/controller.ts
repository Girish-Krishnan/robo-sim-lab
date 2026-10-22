import { ACKERMANN_BUGGY, assertNoBannedKeys, publishSensorFrame, type ControlCommand, type DrawOp, type SensorFrame } from "../api";
import type { HostToWorker, WorkerToHost } from "./messages";

export type SandboxState = "idle" | "loading" | "running" | "stopped" | "error";

const TICK_TIMEOUT_MS = 400;
const LOAD_TIMEOUT_MS = 2500;
const BOOT_TIMEOUT_MS = 45000;

export interface SandboxCallbacks {
  onCommand: (command: ControlCommand) => void;
  onDraw?: (ops: DrawOp[]) => void;
  onLog: (line: string, level: "log" | "error") => void;
  onState: (state: SandboxState) => void;
}

/** Enough of a Worker for the host, and for tests that fake one. */
export interface SandboxWorker {
  postMessage(message: HostToWorker): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerToHost>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface SandboxOptions {
  workerFactory?: () => SandboxWorker;
  tickTimeoutMs?: number;
  loadTimeoutMs?: number;
  bootTimeoutMs?: number;
}

/**
 * Host side of the Python sandbox. Sensor frames are copied through
 * `publishSensorFrame` immediately before postMessage, and rejected if a
 * banned key is present. The worker stays alive across Run and Stop so
 * Pyodide is not downloaded again. It is terminated only when a tick or a
 * load does not return (a hung control() cannot be unwound).
 *
 * Run is safe to repeat. Stop, Reset, a new example, and a timeout all leave
 * the host ready for another Run: a fresh load id is armed, and replies from
 * the previous attempt are ignored.
 */
export class CodeSandbox {
  private worker: SandboxWorker | null = null;
  private generation = 0;
  private state: SandboxState = "idle";
  private runtimeReady = false;
  private booting = false;
  private pendingCode: string | null = null;
  private ignoreCommands = false;
  private waiting: { id: number; sentAt: number; kind: "boot" | "load" | "tick" } | null = null;
  private tickId = 0;
  private drawEpoch = 0;
  private epochByTick = new Map<number, number>();
  private timer = 0;
  private readonly workerFactory: () => SandboxWorker;
  private readonly tickTimeoutMs: number;
  private readonly loadTimeoutMs: number;
  private readonly bootTimeoutMs: number;

  constructor(
    private readonly callbacks: SandboxCallbacks,
    options: SandboxOptions = {},
  ) {
    this.workerFactory = options.workerFactory ?? (() => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
    this.tickTimeoutMs = options.tickTimeoutMs ?? TICK_TIMEOUT_MS;
    this.loadTimeoutMs = options.loadTimeoutMs ?? LOAD_TIMEOUT_MS;
    this.bootTimeoutMs = options.bootTimeoutMs ?? BOOT_TIMEOUT_MS;
  }

  get current(): SandboxState {
    return this.state;
  }

  /** False while Pyodide is still downloading. Program loads after that stay warm. */
  get runtimeIsReady(): boolean {
    return this.runtimeReady;
  }

  /** Start Pyodide the first time Code mode is opened. */
  warmup(): void {
    if (this.runtimeReady || this.booting) return;
    this.boot();
  }

  /** Drop draw messages from a run that has already been left. */
  invalidateDraws(): void {
    this.drawEpoch += 1;
  }

  run(code: string): void {
    this.drawEpoch += 1;
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
    this.drawEpoch += 1;
    this.pendingCode = null;
    this.ignoreCommands = true;
    const inFlight = this.waiting?.kind === "tick" || this.waiting?.kind === "load";
    if (!inFlight) {
      this.waiting = null;
      this.clearTimer();
    }
    // Drop the loaded program once the worker finishes whatever it is in.
    // A reply that belongs to the old id is ignored. The runtime stays warm.
    this.worker?.postMessage({ type: "stop" });
    this.setState("stopped");
  }

  offer(frame: SensorFrame): void {
    if (this.state !== "running" || !this.worker || !this.runtimeReady) return;
    if (this.waiting) return;
    const sensors = publishSensorFrame(frame);
    assertNoBannedKeys(sensors);
    const id = ++this.tickId;
    this.epochByTick.set(id, this.drawEpoch);
    this.arm(id, "tick", this.tickTimeoutMs);
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
    this.arm(0, "boot", this.bootTimeoutMs);
    worker.postMessage({ type: "boot" });
  }

  private postLoad(code: string): void {
    if (!this.worker) return;
    this.pendingCode = null;
    // Leave "stopped" before the worker replies. A ready that arrives for
    // this load must not be discarded as a leftover from Stop.
    this.setState("loading");
    const id = ++this.tickId;
    this.arm(id, "load", this.loadTimeoutMs);
    this.worker.postMessage({
      type: "load",
      id,
      code,
      limits: {
        maxSteering: ACKERMANN_BUGGY.limits.maxSteering,
        minThrottle: ACKERMANN_BUGGY.limits.minThrottle,
        maxThrottle: ACKERMANN_BUGGY.limits.maxThrottle,
      },
    });
  }

  private replaceWorker(): SandboxWorker {
    this.generation += 1;
    const generation = this.generation;
    this.clearTimer();
    this.worker?.terminate();
    this.waiting = null;
    this.runtimeReady = false;
    this.booting = false;
    const worker = this.workerFactory();
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
    if (message.type === "ready" || message.type === "result") {
      if (message.id !== this.waiting?.id) return;
    }
    if (message.type === "error" && message.id !== undefined && message.id !== this.waiting?.id) return;

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
      this.waiting = null;
      this.clearTimer();
      if (this.state === "stopped") return;
      this.ignoreCommands = false;
      this.setState("running");
      return;
    }
    if (message.type === "result") {
      this.waiting = null;
      this.clearTimer();
      const epoch = this.epochByTick.get(message.id);
      this.epochByTick.delete(message.id);
      if (epoch !== this.drawEpoch) return;
      if (this.ignoreCommands || this.state !== "running") return;
      this.callbacks.onCommand(message.command);
      this.callbacks.onDraw?.(message.draw ?? []);
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
    this.timer = globalThis.setTimeout(() => this.checkDeadline(), timeout + 30);
  }

  private checkDeadline(): void {
    const waiting = this.waiting;
    if (!waiting) return;
    const limit = waiting.kind === "boot" ? this.bootTimeoutMs : waiting.kind === "load" ? this.loadTimeoutMs : this.tickTimeoutMs;
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
    if (message.trim()) this.callbacks.onLog(message, "error");
  }

  private clearTimer(): void {
    if (this.timer) globalThis.clearTimeout(this.timer);
    this.timer = 0;
  }

  private setState(state: SandboxState): void {
    this.state = state;
    this.callbacks.onState(state);
  }
}
