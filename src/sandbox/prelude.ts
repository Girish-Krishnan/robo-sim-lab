/**
 * The Python adapter shared by the browser worker and the headless eval.
 * It builds the student-facing sensors object from a published JSON frame
 * and returns (steering, throttle). It must not mention ground truth.
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
    )

def _robo_call(raw_json):
    frame = _robo_frame(json.loads(raw_json))
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
    return (float(steering), float(throttle))
`;
