/**
 * The Python adapter shared by the browser worker and the headless eval.
 * It builds the student-facing sensors object from a published JSON frame
 * and returns a command plus any debug drawings. It must not mention ground truth.
 */
export const STUDENT_PRELUDE = `
import json
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
        task=SimpleNamespace(path=[
            SimpleNamespace(x=float(point["x"]), y=float(point["y"]))
            for point in (raw.get("task") or {}).get("path") or []
        ]),
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

def _robo_points(points):
    out = []
    for point in list(points)[:400]:
        if isinstance(point, dict):
            out.append({"x": float(point.get("x", 0.0)), "y": float(point.get("y", 0.0))})
        else:
            out.append({"x": float(point[0]), "y": float(point[1])})
    return out

def _robo_call(raw_json):
    frame = _robo_frame(json.loads(raw_json))
    drawer = _RoboDraw()
    _robo_ns["draw"] = drawer
    result = _robo_ns["control"](frame)
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
`;
