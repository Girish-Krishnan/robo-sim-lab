---
title: The sensor contract
order: 3
worlds: city, track, forest, warehouse
world: city
spawn: circle
starter: circle
action: lab
prerequisites: getting-started/robot
status: ready
---

Twenty times a second, your program gets a fresh look at the world. You write one function, `control(sensors)`. Twenty times a second the lab calls it with a fresh `sensors` sample, and whatever you return (steering, throttle) drives the car. That call is the whole contract between your program and the car.

You get lidar (a laser range scanner), wheel odometry (the wheels' own estimate of where you've gone), an IMU (a gyro plus an accelerometer), the time, and a task (the route, and later a map, the world hands you). The true pose (position x, y plus heading), the true velocity, and the physics body stay with the simulator. The HUD speed, on the readout strip under the 3D view, is for the person watching.

That split is the point of the lab. A controller that could read the true position would look brilliant and would have skipped the sensing. Localization, working out where you are, only means something once the estimate is built from the same sensors a real robot would have.

The Python side is a sandbox. NumPy is there. `print` and tracebacks show up in the console.

Note: Your car remembers things between ticks in one object called `run`. `class Run` lists what it remembers: a tick counter, the last error, whatever you need. At the start of every run, `init(sensors)` makes a fresh `Run`, so each drive begins with a clean memory. (`global run` lets `init` replace the module-level one.) Inside `control`, read and change it directly: `run.ticks += 1`. Settings that never change, like a target speed, can stay plain names at the top of the file. That's it: one object, reset every run.

The circle program below counts ticks in `run`, and every other example keeps its memory between ticks the same way.

Open **Full program** once. The first lines are `SEED` and `START_POSE`. `SEED` draws the sensor bias once (each sensor's small built-in error, held for the run), and the same number replays the same noise. Use it for your own random numbers too: `np.random.default_rng(SEED)`. `START_POSE` is where the car is placed on Run and Reset. `x` and `y` are meters on the map (`y` runs north, `x` runs west), and the third number is heading in degrees. 0 faces north, and 90 faces east (a left turn decreases the heading). That chooses a start. It is not a sensor, and it is not the true pose (position x, y plus heading). A dict with one pose per world lets the same program travel. A bare tuple is the one-world form. A pose inside a wall, or off the map, is refused in the console, and this lesson's start is used instead.

## Frames and angles

Four ways of naming a direction show up in this lab. They are not the same number, and later lessons point back here.

**Map, `START_POSE`.** `x` and `y` are meters on the ground. `y` runs north. `x` runs west, because facing north the driver's left is west, and the car's left is the world's +X. Heading is degrees measured from north. 0 faces north, and 90 faces east (a left turn decreases the heading). West is −90. This only places the car. It is not a sensor.

**Odometry frame.** The origin is wherever the car started this run. +x points the way it faced then, and +y is its left. `pose.x` and `pose.y` are meters. `pose.yaw` is radians, 0 at the start, and a left turn increases it. Your pose, the path, and the map all share this frame. A left turn increases this yaw and decreases the map heading. Do not add those two numbers.

**Robot frame.** x is forward, y is left, and z is up. A lidar angle of 0 is forward, positive is left, and the unit is radians. A hit at range $r$ and angle $\alpha$ sits at $(r\cos\alpha,\ r\sin\alpha)$ from the puck: forward, then left.

**World axes.** +Z is north, +X is west, and +Y is up. The program never reads them. The lab uses them to drop odometry drawings onto the map.

Degrees are only for `START_POSE`. Sensor angles and the steering you return are radians. −90° is $-\pi/2$ rad, straight out the right side. The camera's heading is not in the sample, and you never need it.

{{code:Run}}

{{code:init}}

In the sim: the circle program on the south lawn, so the sample is changing and the car has room. The same program is happy on the oval infield, the south meadow, and the warehouse bay. The World menu lists them.

The block below is the part that runs every tick. It prints one sample and returns `0.34, 0.5`: a steady left steer (radians) at half throttle.

{{code:control}}

## What is on the sample

- `sensors.lidar.ranges` and `.angles` are NumPy arrays. Angles are in radians: 0 is forward, positive is left. A range equal to `sensors.lidar.max_range` (12 m) means the beam came back empty.
- `sensors.odometry.speed` is noisy rear-wheel speed in m/s. `sensors.odometry.steering_angle` is the angle the front wheels have actually reached, in radians, also noisy.
- `sensors.odometry.pose` has `.x`, `.y` (meters) and `.yaw` (radians, positive is a left turn). It's built by adding up the wheel speed and the gyro (`imu.yaw_rate`) every tick. It starts at the origin on reset and then drifts. That triple is a pose: position plus heading.
- `sensors.imu.yaw_rate` is rad/s around the car's vertical axis (positive means turning left). `sensors.imu.accel` (`.x`, `.y`, `.z`, m/s²) is specific force, acceleration with gravity left in. Standing still on flat ground, z is about $+9.81$, because the accelerometer feels the ground pushing up. Here z is that up axis, not a range.
- `sensors.time` and `sensors.dt` are seconds. At 20 calls a second, `dt` is about 0.05 s.
- `sensors.task.path` is a list of waypoints in the odometry frame: origin wherever the car started, +x the way it faced. `sensors.task.map` is a known floor plan in that same frame. Both are given to you. A measurement of the car is the lidar, the wheels, and the IMU.
- `sensors.camera.available` is false. The field is reserved so a later lesson can add an image without changing the call. The camera's heading is not in the sample.

The noise on these sensors has a written model. Lidar range jitters by about 2 cm (a Gaussian with 2 cm standard deviation: a bell curve of random error). Wheel speed reads about 1.2% high or low for the whole run (a scale bias). The gyro carries a 0.0012 rad/s bias. The noise lesson writes each of those as an equation. The biases become odometry drift. The white noise, a fresh random wiggle every sample, mostly averages away.

Return `(steering, throttle)` or a dict with those keys. Steering is radians, positive left, clamped to $\pm 0.55$. Throttle is $-1$ to $1$.

The diagram below sums it up. Time and the task ride along with the three sensors. The arrows are what `control` is allowed to see, and what it is allowed to send back.

<svg viewBox="0 0 520 268" role="img" aria-label="The sensor contract: lidar, odometry, and IMU go in. The true pose stays out.">
  <rect width="520" height="268" rx="12" fill="#0e1418"/>
  <rect x="24" y="70" width="130" height="44" rx="8" fill="#16302c" stroke="#7ee0d0" stroke-width="2"/>
  <rect x="24" y="126" width="130" height="44" rx="8" fill="#1a2740" stroke="#6ea8ff" stroke-width="2"/>
  <rect x="24" y="182" width="130" height="44" rx="8" fill="#2a2414" stroke="#ffd24a" stroke-width="2"/>
  <text x="48" y="98" fill="#f4f7f4" font-size="16" font-family="sans-serif">lidar</text>
  <text x="40" y="154" fill="#f4f7f4" font-size="16" font-family="sans-serif">odometry</text>
  <text x="62" y="210" fill="#f4f7f4" font-size="16" font-family="sans-serif">IMU</text>
  <rect x="250" y="110" width="150" height="64" rx="10" fill="#13211f" stroke="#f4f7f4" stroke-width="2"/>
  <text x="268" y="148" fill="#f4f7f4" font-size="16" font-family="sans-serif">control(sensors)</text>
  <path d="M154 92 H200 V124 H250" fill="none" stroke="#7ee0d0" stroke-width="2"/>
  <path d="M154 148 H250" stroke="#6ea8ff" stroke-width="2"/>
  <path d="M154 204 H220 V142 H250" fill="none" stroke="#ffd24a" stroke-width="2"/>
  <path d="M400 142 H500" stroke="#f4f7f4" stroke-width="2"/>
  <text x="404" y="188" fill="#f4f7f4" font-size="15" font-family="sans-serif">steer, throttle</text>
  <text x="24" y="40" fill="#f4f7f4" font-size="18" font-family="sans-serif">What the program is allowed to see</text>
  <text x="24" y="248" fill="#e36d5c" font-size="15" font-family="sans-serif">The program cannot read the true pose.</text>
</svg>

## Pictures you can post

Your program also gets a ready-made `draw` object. `draw.path`, `draw.points`, and `draw.text` post pictures back to the view, in odometry coordinates. The lab shifts them from the odometry origin onto the map, so a path the world gave you stays on the map, and a point computed from a drifting pose walks away from the car.

Note: the HUD and the colored trail are for you. They are pictures, and the program keeps its own variables if it wants a number next tick.

## Try it

1. Run the circle and read the console. It prints how many lidar beams arrived, and that the pose is odometry.
2. Add a `print` of `sensors.odometry.pose.x` once a second, then press Reset run. The program starts again, and the pose starts at 0. Switching worlds does the same: the program starts again on its own.
3. Try to read a true position. There is no such attribute. The console shows the error, and the car stops.
