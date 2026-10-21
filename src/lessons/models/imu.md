---
title: The IMU
order: 4
world: city
spawn: default
starter: circle
action: lab
prerequisites: models/odometry
status: ready
---

The IMU in this sandbox is a yaw gyro and a three-axis accelerometer. There is no magnetometer, so nothing here measures absolute heading. Yaw is only as good as the integral of the gyro. The circle program is running so the yaw rate has a steady value you can compare with $(v/L)\tan\delta$.

`sensors.imu.yaw_rate` is radians per second about body +z. Positive is a left turn, the same sign as positive steering and as the odometry yaw. White noise is about 0.002 rad/s. A bias drawn once per reset has standard deviation 0.0012 rad/s. The odometry lesson integrates this rate. If you integrate it yourself, use the same sample the odometry used or the two headings will drift apart for no good reason.

`sensors.imu.accel` is specific force in the robot frame, in m/s². At rest on level ground the z component is about $+9.81$. The sensor feels the ground pushing up. It does not read $(0, 0, -g)$ the way a free-body diagram draws weight. In a hard brake, x (forward) changes. In a tight left turn, y (left) shows the lateral specific force.

## A bias becomes degrees, then metres

A constant bias $b$ on the yaw gyro, integrated for $T$ seconds, is a heading error

$$\Delta\theta = b\,T.$$

With $b = 0.0012$ rad/s and $T = 60$ s, $\Delta\theta = 0.072$ rad, about 4.1°. After travelling a distance $s$, the cross-track contribution of a heading error is roughly $s\,\Delta\theta$ while the error is still small and growing, which is metres, not centimetres, on an oval lap of about 200 m. The noise around the bias averages down. The bias does not.

Specific force $f$ and acceleration $a$ are different by gravity. In the world, $f = a - g$ with $g$ pointing down. On flat ground at rest, $a = 0$ and $f_z = +9.81$ in the body. A tilt $\phi$ leaks that into the horizontal axes. This course does not ask you to level the car from the accelerometer. The yards are flat. The number is there so the sample looks like a real IMU, and so you do not "subtract 9.81 from z" and then treat the result as forward acceleration without thinking.

Do not estimate speed by integrating `accel.x`. The bias is 0.02 m/s², one sigma. Integrated for a minute that is tens of metres per second of fake speed. Wheel speed is the speed sensor. The accelerometer is for bumps, braking, and, later, an attitude filter this course does not build yet.

The gyro bias and the speed bias are drawn in a fixed order from the seed. Seed 1 is the seed the eval uses. If your console numbers disagree with the lesson, check the seed field in the header before changing a gain.

## A rate you can predict

Print `yaw_rate` every second while the circle runs. It should sit near $(v/L)\tan\delta$, with a small offset that does not average out. That offset is the bias. Then change the return to `0.0, 0.0` and print `accel.z`. Expect a number near 9.8, not 0, and not $-9.8$. After a reset, print a running sum of `yaw_rate * dt` next to `odometry.pose.yaw`. They start together. A bug in the sign shows up in the first second, not the first minute.
