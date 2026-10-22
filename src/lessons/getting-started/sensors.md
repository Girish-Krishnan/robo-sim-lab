---
title: The sensor contract
order: 3
world: city
spawn: circle
starter: circle
action: lab
prerequisites: getting-started/robot
status: ready
---

`control(sensors)` receives a fresh sample twenty times a second. That object is the whole contract between your program and the car.

You get lidar, wheel odometry, an IMU, the time, and a task. The task can carry a path and, later, a known map. The true pose, the true velocity, and the physics body stay with the simulator. The HUD speed is for the person watching.

That split is the point of the lab. A controller that could read the true position would look brilliant and would have skipped the sensing. Localization means something once the estimate is built from the same sensors a real robot would have.

The Python side is a sandbox. NumPy is there. `print` and tracebacks show up in the console. Names you create above `control` live for the whole run. A name you create inside `control` lives for that tick, unless you hang it on the function or declare it global.

In the sim: the circle program on the south lawn, so the sample is changing and the car has room.

The block below is the program that is running. It prints one sample and then holds the wheel.

{{code:drive}}

## What is on the sample

- `sensors.lidar.ranges` and `.angles` are NumPy arrays. Angle 0 is forward, positive is left. A range equal to `max_range` (12 m) means the beam came back empty.
- `sensors.odometry.speed` is noisy rear-wheel speed in m/s. `steering_angle` is the actuator angle, also noisy.
- `sensors.odometry.pose` is x, y, yaw integrated from that speed and the gyro. It starts at the origin on reset and then drifts.
- `sensors.imu.yaw_rate` is rad/s about body +z. `accel` is specific force. Standing still on flat ground, z is about $+9.81$, because the accelerometer feels the normal force.
- `sensors.time` and `sensors.dt` are seconds.
- `sensors.task.path` is a list of waypoints in the odometry frame. `sensors.task.map` is a known floor plan in that same frame. Both are given to you. A measurement of the car is the lidar, the wheels, and the IMU.
- `sensors.camera.available` is false. The field is reserved so a later lesson can add an image without changing the call.

The noise on these sensors has a written model. Lidar range is a Gaussian of 2 cm. Wheel speed carries a 1.2% scale bias. The gyro carries a 0.0012 rad/s bias. The noise lesson writes each of those as an equation. The biases become odometry drift. The white noise mostly averages away.

Return `(steering, throttle)` or a dict with those keys. Steering is radians, positive left, clamped near $\pm 0.5$. Throttle is $-1$ to $1$.

## Two signs worth learning once

The odometry pose and the chase-camera heading grow in opposite directions. A left turn increases odometry yaw and decreases the camera yaw. A pursuit controller that mixes them steers the wrong way. Stay in the odometry frame and the camera yaw never enters the program. The sample leaves it out.

`draw.path`, `draw.points`, and `draw.text` post pictures back to the view. Coordinates are the odometry frame. The host places them with the spawn transform, so a path the world gave you stays on the map, and a point computed from a drifting pose walks away from the car.

Note: the HUD and the coloured trail are for you. They are pictures, and the program keeps its own variables if it wants a number next tick.

## Try it

1. Run the circle and read the console. It prints how many lidar beams arrived, and that the pose is odometry.
2. Add a `print` of `sensors.odometry.pose.x` once a second, reset, and watch it start again at 0.
3. Try to read a true position. There is no such attribute. The console shows the error, and the car stops.
