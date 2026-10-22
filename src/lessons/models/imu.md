---
title: The IMU
order: 4
world: city
spawn: circle
starter: circle
action: lab
prerequisites: models/odometry
status: ready
---

The IMU in this sandbox is a yaw gyro and a three-axis accelerometer. There is no magnetometer, so nothing here measures absolute heading. Yaw is the integral of the gyro, the way a spinning office chair tells you how far you have turned and forgets which way the door was. On a steady circle that rate sits near $(v/L)\tan\delta$, plus a bias that stays put.

In the sim: the circle program on an open pad, so the yaw rate has a steady value to compare.

<svg viewBox="0 0 520 252" role="img" aria-label="A gyro bias adds a little yaw every second, so heading walks off in a fan.">
  <rect width="520" height="252" rx="12" fill="#0e1418"/>
  <line x1="64" y1="188" x2="300" y2="152" stroke="#f4f7f4" stroke-width="3"/>
  <line x1="64" y1="188" x2="380" y2="56" stroke="#6ea8ff" stroke-width="3"/>
  <path d="M150 176 Q 168 158 142 148" fill="none" stroke="#ffd24a" stroke-width="3"/>
  <text x="186" y="160" fill="#ffd24a" font-size="18" font-family="sans-serif">b·t</text>
  <text x="176" y="185" fill="#f4f7f4" font-size="16" font-family="sans-serif">true heading</text>
  <text x="348" y="48" text-anchor="middle" fill="#6ea8ff" font-size="16" font-family="sans-serif">integrated gyro</text>
  <text x="24" y="22" fill="#f4f7f4" font-size="18" font-family="sans-serif">The bias is a heading that grows with time</text>
  <text x="24" y="236" fill="#d5ddd8" font-size="16" font-family="sans-serif">b is 0.0012 rad/s, one sigma. Over a minute that is a few degrees.</text>
</svg>

`sensors.imu.yaw_rate` is radians per second about body +z. Positive is a left turn, the same sign as positive steering and as the odometry yaw. White noise is about 0.002 rad/s. A bias drawn once per reset has standard deviation 0.0012 rad/s. The odometry lesson integrates this rate. If you integrate it yourself, use the same sample the odometry used, and the two headings stay in step.

`sensors.imu.accel` is specific force in the robot frame, in m/s². At rest on level ground the z component is about $+9.81$. The sensor feels the ground pushing up. In a hard brake, x (forward) changes. In a tight left turn, y (left) shows the lateral specific force.

The circle program below holds $\delta$ and the throttle still, which is what makes the rate easy to predict.

{{code:drive}}

## A bias becomes degrees, then metres

A constant bias $b$ on the yaw gyro, integrated for $T$ seconds, is a heading error

$$\Delta\theta = b\,T.$$

With $b = 0.0012$ rad/s and $T = 60$ s, $\Delta\theta = 0.072$ rad, about 4.1°. After travelling a distance $s$, the cross-track contribution of a heading error is roughly $s\,\Delta\theta$ while the error is still small and growing. On an oval lap of about 200 m that is metres. The noise around the bias averages down. The bias stays.

Specific force $f$ and acceleration $a$ differ by gravity. In the world, $f = a - g$ with $g$ pointing down. On flat ground at rest, $a = 0$ and $f_z = +9.81$ in the body. A tilt $\phi$ leaks that into the horizontal axes. This course keeps the yards flat, so the accelerometer is here to make the sample look like a real IMU. Wheel speed remains the speed sensor. Integrating `accel.x` for a minute, with a bias of 0.02 m/s², invents tens of metres per second of fake speed.

The gyro bias and the speed bias are drawn in a fixed order from the seed. When the console numbers disagree with the lesson, check the seed before changing a gain. **Reset seed** replays the draw you already have.

Note: a free-body diagram draws weight as $(0, 0, -g)$. The accelerometer reports the opposite while you are standing on the floor, because it feels the floor's push.

## Try it

1. Print `yaw_rate` every second while the circle runs. It should sit near $(v/L)\tan\delta$, with a small offset that stays. That offset is the bias.
2. Change the return to `0.0, 0.0` and print `accel.z`. Expect a number near 9.8.
3. After a reset, print a running sum of `yaw_rate * dt` next to `odometry.pose.yaw`. They start together. A sign bug shows up in the first second.
