import { readFileSync } from "node:fs";
import path from "node:path";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { ACKERMANN_BUGGY, clampCommand, parseDrawOps, type SensorFrame } from "../api";
import { STUDENT_PRELUDE } from "../sandbox/prelude";
import type { Policy } from "./simulate";

/**
 * Runs student Python through the same prelude the browser worker uses.
 * The Node runtime comes from the pyodide package. NumPy is the wheel
 * fetched into public/pyodide, the same one the browser serves.
 */
export async function loadStudentRuntime(root: string): Promise<PyodideInterface> {
  const runtime = path.join(root, "node_modules", "pyodide");
  const lock = JSON.parse(readFileSync(path.join(runtime, "pyodide-lock.json"), "utf8")) as {
    packages?: { numpy?: { file_name?: string } };
  };
  const wheel = lock.packages?.numpy?.file_name;
  if (!wheel) throw new Error("pyodide-lock.json has no numpy wheel.");
  const pyodide = await loadPyodide({ indexURL: runtime });
  await pyodide.loadPackage(path.join(root, "public", "pyodide", wheel));
  pyodide.setStdout({ batched: () => undefined });
  pyodide.setStderr({ batched: () => undefined });
  pyodide.runPython(STUDENT_PRELUDE);
  return pyodide;
}

export function loadStudentPolicy(pyodide: PyodideInterface, source: string): Policy {
  pyodide.runPython(
    "import builtins, numpy\n_robo_ns = {'__builtins__': builtins, 'numpy': numpy, 'np': numpy}\n",
  );
  const globals = pyodide.globals.get("_robo_ns");
  pyodide.runPython(source, { globals, filename: "student.py" });
  pyodide.runPython("_robo_reset()");
  const defined = pyodide.runPython("callable(_robo_ns.get('control'))");
  if (defined !== true) throw new Error("Example did not define control(sensors).");
  const limits = ACKERMANN_BUGGY.limits;
  const controlMs: number[] = [];
  const policy: Policy = (frame: SensorFrame) => {
    pyodide.globals.set("_robo_raw", JSON.stringify(frame));
    pyodide.runPython("_robo_prepare(_robo_raw)");
    const started = performance.now();
    const output = pyodide.runPython("_robo_step()") as { get?: (index: number) => unknown; destroy?: () => void };
    controlMs.push(performance.now() - started);
    const steering = Number(output.get?.(0));
    const throttle = Number(output.get?.(1));
    const estimate = estimateFromDraw(output.get?.(2));
    output.destroy?.();
    return { ...clampCommand({ steering, throttle }, limits), estimate };
  };
  policy.controlMs = controlMs;
  return policy;
}

/** The heading tick is the short path drawn in #ffe08a. Its start is the estimate. */
function estimateFromDraw(raw: unknown): { x: number; y: number; yaw: number } | undefined {
  const ops = parseDrawOps(typeof raw === "string" ? raw : "");
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    if (!op || op.kind !== "path" || op.color.toLowerCase() !== "#ffe08a" || op.points.length < 2) continue;
    const start = op.points[0]!;
    const end = op.points[1]!;
    return { x: start.x, y: start.y, yaw: Math.atan2(end.y - start.y, end.x - start.x) };
  }
  return undefined;
}
