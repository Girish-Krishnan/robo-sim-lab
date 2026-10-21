---
title: The sensor contract
order: 3
world: city
spawn: default
starter: circle
action: lab
prerequisites: getting-started/robot
status: ready
---

`control(sensors)` receives a fresh sample twenty times a second. The object is the whole contract. If a value is not on it, the program is not allowed to use it.

You get lidar, wheel odometry, an IMU, a clock, and a task. The task can include a path and, later, a known map. You do not get the true pose, the true velocity, the physics body, or a camera image. The HUD speed is for the person watching. It is not in the sample.

That is on purpose. A controller that reads the true position will look brilliant and teach nothing. Localization only means something when the estimate is built from the same sensors a real robot would have.

The Python side is a sandbox. NumPy is there. `print` and tracebacks show up in the console. Names you create above `control` live for the whole run. A name you create inside `control` does not, unless you hang it on the function or declare it global.

## What is actually on the sample

- `sensors.lidar.ranges` and `.angles` are NumPy arrays. Angle 0 is forward, positive is left. A range equal to `max_range` (12 m) means no return.
- `sensors.odometry.speed` is noisy rear-wheel speed in m/s. `steering_angle` is the actuator angle, also noisy.
- `sensors.odometry.pose` is x, y, yaw integrated from that speed and the gyro. It starts at the origin on reset and then drifts.
- `sensors.imu.yaw_rate` is rad/s about body +z. `accel` is specific force. Standing still on flat ground, z is about $+9.81$, because the accelerometer feels the normal force, not gravity as a signed acceleration.
- `sensors.time` and `sensors.dt` are seconds.
- `sensors.task.path` is a list of waypoints in the odometry frame. `sensors.task.map` is a known floor plan in that same frame. Neither is a measurement of the car.
- `sensors.camera.available` is false. The field is on the sample so a later lesson can add an image without changing the call. There is no picture, and the camera is not modeled yet.

The noise on the sensors that do exist is not a mystery number. Lidar range is a Gaussian of 2 cm. Wheel speed carries a 1.2% scale bias. The gyro carries a 0.0012 rad/s bias. The noise lesson writes each of those as an equation, and shows why the biases become odometry drift while the white noise mostly averages away.

Return `(steering, throttle)` or a dict with those keys. Steering is radians, positive left, clamped near $\pm 0.5$. Throttle is $-1$ to $1$.

## Two signs that will bite you

The odometry pose and the chase-camera heading use opposite signs. A left turn increases odometry yaw and decreases the camera yaw. If you mix them up, a pursuit controller steers the wrong way. Stay in the odometry frame and you never need the camera yaw. The program is not given it anyway.

`draw.path`, `draw.points`, and `draw.text` post pictures back to the view. They are not sensors. Coordinates are the odometry frame. The host places them with the spawn transform, so a path the world gave you stays on the map, and a point computed from a drifting pose walks away from the car.

## Read one sample out loud

Run the circle starter and read the console. It prints how many lidar beams arrived, and that the pose is odometry. Add a `print` of `sensors.odometry.pose.x` once a second, reset the world, and watch it start again at 0. Then try to read a true position. There is no such attribute. The console should show the error, and the car should stop.
