/**
 * The Python adapter shared by the browser worker and the headless eval.
 * It builds the student-facing sensors object from a published JSON frame
 * and returns a command plus any debug drawings. It must not mention ground truth.
 */
export const STUDENT_PRELUDE = `
import base64
import copy
import io
import json
import sys
import types
from types import SimpleNamespace
import numpy as np

def _robo_frame(raw):
    lidar = raw["lidar"]
    odom = raw["odometry"]
    pose = odom["pose"]
    imu = raw["imu"]
    accel = imu["accel"]
    return SimpleNamespace(
        time=float(raw["time"]),
        dt=float(raw["dt"]),
        lidar=SimpleNamespace(
            ranges=np.asarray(lidar["ranges"], dtype=float),
            angles=np.asarray(lidar["angles"], dtype=float),
            max_range=float(lidar["maxRange"]),
        ),
        odometry=SimpleNamespace(
            speed=float(odom["speed"]),
            steering_angle=float(odom["steeringAngle"]),
            pose=SimpleNamespace(
                x=float(pose["x"]),
                y=float(pose["y"]),
                yaw=float(pose["yaw"]),
            ),
        ),
        imu=SimpleNamespace(
            yaw_rate=float(imu["yawRate"]),
            accel=SimpleNamespace(
                x=float(accel["x"]),
                y=float(accel["y"]),
                z=float(accel["z"]),
            ),
        ),
        camera=SimpleNamespace(available=False),
        task=_robo_task(raw.get("task") or {}),
    )

def _robo_task(task):
    path = [
        SimpleNamespace(x=float(point["x"]), y=float(point["y"]))
        for point in task.get("path") or []
    ]
    raw_map = task.get("map") or {}
    corner = raw_map.get("corner") or {}
    return SimpleNamespace(
        path=path,
        map=SimpleNamespace(
            resolution=float(raw_map.get("resolution") or 0.5),
            corner=SimpleNamespace(x=float(corner.get("x") or 0.0), y=float(corner.get("y") or 0.0)),
            width=int(raw_map.get("width") or 0),
            height=int(raw_map.get("height") or 0),
            field=str(raw_map.get("field") or ""),
            segments=list(raw_map.get("segments") or []),
            stamp=int(raw_map.get("stamp") or 0),
        ),
    )

class _RoboDraw:
    def __init__(self):
        self.ops = []

    def _remember(self, op):
        self.ops.append(op)
        if len(self.ops) > 12:
            del self.ops[0]

    def path(self, points, color="#7dcea0"):
        self._remember({"kind": "path", "points": _robo_points(points), "color": str(color)})

    def points(self, points, color="#f4d03f"):
        self._remember({"kind": "points", "points": _robo_points(points), "color": str(color)})

    def text(self, x, y, text, color="#f4f1ea"):
        self._remember({
            "kind": "text",
            "x": float(x),
            "y": float(y),
            "text": str(text)[:48],
            "color": str(color),
        })

    def ellipse(self, x, y, yaw, rx, ry, color="#ffd400"):
        self._remember({
            "kind": "ellipse",
            "x": float(x),
            "y": float(y),
            "yaw": float(yaw),
            "rx": float(rx),
            "ry": float(ry),
            "color": str(color),
        })

def _robo_points(points):
    arr = None
    try:
        arr = np.asarray(points, dtype=float)
    except (TypeError, ValueError):
        arr = None
    if isinstance(arr, np.ndarray) and arr.ndim == 2 and arr.shape[1] >= 2:
        n = min(int(arr.shape[0]), 1000)
        cols = int(arr.shape[1])
        out = []
        for i in range(n):
            item = {"x": float(arr[i, 0]), "y": float(arr[i, 1])}
            if cols > 2 and np.isfinite(arr[i, 2]):
                item["yaw"] = float(arr[i, 2])
            if cols > 3 and np.isfinite(arr[i, 3]):
                item["w"] = float(arr[i, 3])
            out.append(item)
        return out
    out = []
    for point in list(points)[:1000]:
        if isinstance(point, dict):
            item = {"x": float(point.get("x", 0.0)), "y": float(point.get("y", 0.0))}
            if "yaw" in point:
                item["yaw"] = float(point["yaw"])
            if "w" in point:
                item["w"] = float(point["w"])
            out.append(item)
        else:
            item = {"x": float(point[0]), "y": float(point[1])}
            if len(point) > 2:
                item["yaw"] = float(point[2])
            if len(point) > 3:
                item["w"] = float(point[3])
            out.append(item)
    return out

def _robo_decode_field(m):
    if not m.field or m.width < 1 or m.height < 1:
        return np.zeros((max(int(m.height), 1), max(int(m.width), 1)), dtype=np.float32)
    raw = np.frombuffer(base64.b64decode(m.field), dtype=np.uint8)
    if raw.size != int(m.width) * int(m.height):
        return np.zeros((int(m.height), int(m.width)), dtype=np.float32)
    return raw.reshape((int(m.height), int(m.width))).astype(np.float32) * np.float32(0.01)

def _robo_reset():
    _robo_prepare.task = None
    _robo_prepare.stamp = None
    _robo_prepare.warm = False
    _robo_frame_cache[0] = None

_robo_frame_cache = [None]

def _robo_prepare(raw_json):
    raw = json.loads(raw_json)
    task_raw = raw.get("task") or {}
    raw_map = task_raw.get("map") or {}
    stamp = int(raw_map.get("stamp") or 0)
    if getattr(_robo_prepare, "task", None) is None or getattr(_robo_prepare, "stamp", None) != stamp:
        task = _robo_task(task_raw)
        task.map.grid = _robo_decode_field(task.map)
        _robo_prepare.task = task
        _robo_prepare.stamp = stamp
        _robo_prepare.warm = False
    frame = _robo_frame(raw)
    frame.task = _robo_prepare.task
    _robo_frame_cache[0] = frame
    if not getattr(_robo_prepare, "warm", False):
        _robo_prepare.warm = True
        # Compile control once, then put the globals back so the timed steps
        # see the program as it was loaded. Swallow prints from this warm
        # call, or the first tick shows up twice.
        snap = _robo_snapshot()
        stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            _robo_invoke()
        except Exception:
            pass
        finally:
            sys.stdout = stdout
        _robo_restore(snap)
        init = _robo_ns.get("init")
        if callable(init):
            init(frame)
    return None

def _robo_snapshot():
    snap = {}
    for key, value in list(_robo_ns.items()):
        if key.startswith("_") or callable(value) or isinstance(value, types.ModuleType):
            continue
        try:
            snap[key] = copy.deepcopy(value)
        except Exception:
            continue
    return snap

def _robo_restore(snap):
    for key, value in snap.items():
        _robo_ns[key] = value

def _robo_invoke():
    frame = _robo_frame_cache[0]
    drawer = _RoboDraw()
    _robo_ns["draw"] = drawer
    result = _robo_ns["control"](frame)
    return result, drawer

def _robo_pack(result, drawer):
    if isinstance(result, dict):
        steering = result.get("steering", 0.0)
        throttle = result.get("throttle", 0.0)
    elif isinstance(result, (tuple, list)):
        if len(result) < 2:
            raise ValueError("control(sensors) must return (steering, throttle)")
        steering, throttle = result[0], result[1]
    else:
        raise TypeError(
            "control(sensors) must return (steering, throttle) or a dict with those keys"
        )
    return (float(steering), float(throttle), json.dumps(drawer.ops))

def _robo_step():
    result, drawer = _robo_invoke()
    return _robo_pack(result, drawer)

def _robo_call(raw_json):
    _robo_prepare(raw_json)
    return _robo_step()
`;
