import { clampCommand, parseDrawOps, type RobotLimits, type SensorFrame } from "../api";
import type { HostToWorker, WorkerToHost } from "./messages";
import { STUDENT_PRELUDE } from "./prelude";

/**
 * Python sandbox. This module must not import the simulator.
 * It receives an already-sanitized sensor frame and returns a command.
 * Pyodide runs in this worker; a hung control() is stopped by terminating
 * the worker from the main thread.
 */

interface PyodideLike {
  loadPackage: (name: string) => Promise<unknown>;
  runPython: (code: string, options?: { globals?: PyProxy; filename?: string }) => unknown;
  globals: { get: (name: string) => unknown; set: (name: string, value: unknown) => void };
  setStdout: (options: { batched: (text: string) => void }) => void;
  setStderr: (options: { batched: (text: string) => void }) => void;
  toPy: (value: Record<string, unknown>) => PyProxy;
}

interface PyProxy {
  destroy?: () => void;
  get?: (key: number | string) => unknown;
}

let pyodide: PyodideLike | null = null;
let student: PyProxy | null = null;
let limits: RobotLimits = { maxSteering: 0.55, minThrottle: -1, maxThrottle: 1 };
let bucket: string[] = [];

const ctx = self as unknown as {
  postMessage: (message: WorkerToHost) => void;
  onmessage: ((event: MessageEvent<HostToWorker>) => void) | null;
  location: Location;
};

function post(message: WorkerToHost): void {
  ctx.postMessage(message);
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    let message = String((error as { message: unknown }).message);
    const lineno = (error as { lineno?: unknown }).lineno;
    if (typeof lineno === "number" && Number.isFinite(lineno) && !/line \d+/.test(message)) {
      message = `File "student.py", line ${lineno}\n${message}`;
    }
    if (message.includes("Traceback") || message.includes("Error") || message.includes("line ")) return message.slice(0, 4000);
  }
  if (error instanceof Error) return (error.message || error.stack || "Error").slice(0, 4000);
  return String(error).slice(0, 4000);
}

function capture(text: string): void {
  const line = text.replace(/\s+$/u, "");
  if (!line || bucket.length >= 24) return;
  bucket.push(line.slice(0, 500));
}

function runtimeIndex(): string {
  const url = new URL(`${import.meta.env.BASE_URL}pyodide/`, ctx.location.origin);
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

async function boot(): Promise<void> {
  try {
    const indexURL = runtimeIndex();
    // Load the self-hosted build. Bundling pyodide.mjs pulls in Node builtins
    // and breaks the worker output, and a CDN would have to satisfy COEP.
    const runtime = (await import(
      /* @vite-ignore */ new URL("pyodide.mjs", indexURL).href
    )) as {
      loadPyodide: (options: { indexURL: string }) => Promise<PyodideLike>;
    };
    pyodide = await runtime.loadPyodide({ indexURL });
    await pyodide.loadPackage("numpy");
    pyodide.setStdout({ batched: capture });
    pyodide.setStderr({ batched: capture });
    bucket = [];
    pyodide.runPython(STUDENT_PRELUDE);
    bucket = [];
    post({ type: "runtime", logs: ["Python runtime ready (NumPy loaded)."] });
  } catch (error) {
    pyodide = null;
    post({ type: "error", message: errorText(error), logs: bucket });
  }
}

function loadProgram(id: number, code: string, nextLimits: RobotLimits): void {
  if (!pyodide) {
    post({ type: "error", id, message: "Python runtime is not ready.", logs: [] });
    return;
  }
  bucket = [];
  student?.destroy?.();
  student = null;
  try {
    if (code.length > 200_000) throw new Error("Program is too long (200k character limit).");
    limits = nextLimits;
    // A fresh dict each Run, so top-level names from the previous program do not linger.
    // Statements above control() run once and persist for later ticks.
    pyodide.runPython(
      "import builtins, numpy\n_student = {'__builtins__': builtins, 'numpy': numpy, 'np': numpy}\n",
    );
    const globals = pyodide.globals.get("_student");
    if (!globals || typeof globals !== "object") {
      throw new Error("Could not create a Python namespace.");
    }
    student = globals as PyProxy;
    pyodide.globals.set("_robo_ns", student);
    pyodide.runPython(code, { globals: student, filename: "student.py" });
    pyodide.runPython("_robo_reset()");
    const defined = pyodide.runPython("callable(_robo_ns.get('control'))");
    if (defined !== true) {
      throw new Error("Define control(sensors) that returns (steering, throttle).");
    }
    post({ type: "ready", id, logs: bucket });
  } catch (error) {
    student = null;
    post({ type: "error", id, message: errorText(error), logs: bucket });
  }
}

function tick(id: number, sensors: SensorFrame): void {
  bucket = [];
  if (!pyodide || !student) {
    post({ type: "error", id, message: "No program is loaded.", logs: [] });
    return;
  }
  try {
    pyodide.globals.set("_robo_raw", JSON.stringify(sensors));
    pyodide.runPython("_robo_prepare(_robo_raw)");
    const output = pyodide.runPython("_robo_step()") as PyProxy;
    const steering = Number(output.get?.(0));
    const throttle = Number(output.get?.(1));
    const draw = parseDrawOps(output.get?.(2));
    output.destroy?.();
    const command = clampCommand({ steering, throttle }, limits);
    post({ type: "result", id, command, draw, logs: bucket });
  } catch (error) {
    post({ type: "error", id, message: errorText(error), logs: bucket });
  }
}

ctx.onmessage = (event: MessageEvent<HostToWorker>) => {
  const message = event.data;
  if (message.type === "boot") {
    void boot();
    return;
  }
  if (message.type === "stop") {
    student?.destroy?.();
    student = null;
    return;
  }
  if (message.type === "load") {
    loadProgram(message.id, message.code, message.limits);
    return;
  }
  tick(message.id, message.sensors);
};
