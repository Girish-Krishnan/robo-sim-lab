---
title: Wheel odometry
order: 3
world: track
spawn: pursuit
starter: pursuit
action: lab
prerequisites: models/bicycle
status: ready
---

Wheel odometry is a guess of the pose, updated from how fast the rear wheels turned and how fast the gyro says the car is yawing. It is not a measurement of position. Nothing in the sample looks at the map. This lesson runs pure pursuit on the oval with Paths on, so you can watch the guess leave the car.

Each reset, the pose starts at $(0, 0, 0)$ in its own frame. Forward is the direction the car faced at that instant. After that, the only inputs are noisy wheel speed and the gyro yaw rate. If those are biased, the guess walks off the car and never notices.

The amber trail is this pose, dropped into the world with the spawn transform. At the first tick it lies on the car. A minute later, on the oval, it does not.

The steering angle is measured and published, with its own small bias, but it is **not** mixed into the pose. An earlier version integrated $(v/L)\tan\delta$. A constant steer bias then became a constant curvature bias, and one oval lap put the amber trail about 50 m away from the car. A gyro bias of about 0.001 rad/s is a few degrees per minute, which is what a calibrated MEMS gyro actually does.

## Integrating one control period

Let $v$ be the wheel-speed sample and $\omega$ the gyro yaw-rate sample, both already noisy. Over a control period $\Delta t$, using the yaw at the **start** of the step:

$$x \leftarrow x + v\cos\theta\,\Delta t,\quad y \leftarrow y + v\sin\theta\,\Delta t,\quad \theta \leftarrow \theta + \omega\,\Delta t.$$

The speed sample is the true speed times $(1 + b_v)$ plus white noise. $b_v$ is drawn once per reset from a Gaussian with standard deviation 0.012, so a typical bias is about one percent. White noise on speed is 0.02 m/s. On a straight line the fractional distance error is about $b_v$, not a random walk: the bias is constant, so it scales the whole trip.

Heading error from a constant gyro bias $b_\omega$ grows like $b_\omega t$. Cross-track then grows like distance times that angle, which is why a small bias becomes metres of path error on a long lap and only centimetres in the first few seconds.

Odometry error and control error add. Pure pursuit can be a perfect tracker of a bad pose, and the car still leaves the lane. The drift lesson measures that on the oval: cross-track starts near 0.18 m and is near 2.23 m after 45 seconds. The controller did not get worse. The pose did.

Resetting the world resets the pose to the origin and draws a new bias. If you compare two runs, reset the seed too, or you are comparing different biases. The pose is in the odometry frame. Adding it to a world coordinate, or to the camera yaw, will not give you the car. `world` is not a Python object you can see.

## Watch the amber trail leave

Run pure pursuit on the oval. The amber trail should leave the coloured one as the lap goes on. Print `sensors.odometry.pose.yaw` and the integrated gyro yourself (`yaw += sensors.imu.yaw_rate * sensors.dt`). They should stay close. They are the same integral. Then change nothing about steering, reset the seed from 1 to 2, and run again. The amber trail should leave on a different side or at a different rate. The bias was resampled.
