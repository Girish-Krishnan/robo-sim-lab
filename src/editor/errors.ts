import { chunkAtLine } from "./chunks";

const SENSOR_HINT =
  "sensors has time, dt, lidar.ranges, lidar.angles, lidar.max_range, odometry.speed, odometry.steering_angle, odometry.pose.x, odometry.pose.y, odometry.pose.yaw, imu.yaw_rate, imu.accel.x, imu.accel.y, imu.accel.z, task.path, and task.map. There is no true pose on this object.";

export interface StudentError {
  text: string;
  /** 1-based line in the full program, when the traceback names one. */
  line: number | null;
  chunk: string | null;
  /** 1-based line inside that slice, matching the editor. */
  local: number | null;
}

/** Drop worker frames and point a student.py line at the slice that contains it. */
export function formatStudentError(message: string, source: string): StudentError {
  const raw = message.replace(/\r/g, "").split("\n");
  const kept: string[] = [];
  let line: number | null = null;
  for (const entry of raw) {
    const text = entry.trimEnd();
    if (!text.trim()) continue;
    const named = /File "student\.py", line (\d+)/.exec(text);
    if (named) {
      line = Number(named[1]);
      continue;
    }
    if (/pyodide|_base\.py|_robo_step|_robo_invoke|_robo_prepare|_robo_call|_robo_pack|_robo_frame/.test(text)) continue;
    if (/^File ".+", line \d+/.test(text.trim())) continue;
    if (/^Traceback \(most recent call last\):?$/.test(text.trim())) continue;
    if (/CodeRunner|PyCF_|_parse_and_compile|self\.ast|self\._gen|\bcompile\(/.test(text)) continue;
    if (/^[~^|\s]+$/.test(text)) continue;
    kept.push(text.trim());
  }
  const errorAt = kept.findIndex((item) => /^[A-Za-z_]*Error\b/.test(item) || /\bError:/.test(item));
  const ordered = errorAt > 0 ? [kept[errorAt]!, ...kept.slice(0, errorAt), ...kept.slice(errorAt + 1)] : kept;
  const snippet = line == null ? "" : (source.split("\n")[line - 1] ?? "").trim();
  const useful = ordered.filter((item) => {
    if (/^[A-Za-z_]*Error\b/.test(item) || /\bError:/.test(item)) return true;
    return Boolean(snippet) && item.includes(snippet);
  });
  const located = line == null ? null : chunkAtLine(source, line);
  const where = located
    ? `line ${located.local} of ${located.id}`
    : line == null
      ? null
      : `line ${line} of the program`;
  const body = (useful.length ? useful : ordered).filter((item) => item !== where);
  const errorFirst = body.findIndex((item) => /^[A-Za-z_]*Error\b/.test(item) || /\bError:/.test(item));
  const head = !where ? body : errorFirst >= 0 ? [...body.slice(0, errorFirst + 1), where, ...body.slice(errorFirst + 1)] : [where, ...body];
  let text = head.join("\n").trim() || message.trim();
  if (/AttributeError/.test(text) && !text.includes("sensors has time")) text = `${text}\n${SENSOR_HINT}`;
  return { text, line, chunk: located?.id ?? null, local: located?.local ?? null };
}
