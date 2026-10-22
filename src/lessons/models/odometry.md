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

Wheel odometry is a running guess of the pose. Each tick it adds "how far the rear wheels turned" and "how much the gyro says we yawed." Picture pacing a room with your eyes closed, counting steps and turns. The count is careful. The room you imagine still slides away from the room you are in.

In the sim: pure pursuit on the oval. The amber trail is that guess leaving the car.

Each reset, the pose starts at $(0, 0, 0)$ in its own frame. Forward is the direction the car faced at that instant. After that, the only inputs are noisy wheel speed and the gyro yaw rate. A bias in either one walks the guess off the car, and the guess has no way to notice.

The amber trail is this pose, dropped into the world with the spawn transform. At the first tick it lies on the car. A minute later, on the oval, it has peeled away.

The steering angle is measured and published, with its own small bias, and the pose leaves it out. Heading comes from the gyro. Folding the steer measurement into the heading would turn a small bias into a constant curve, and one oval lap would leave the amber trail tens of metres from the car. A gyro bias of about 0.001 rad/s is a few degrees per minute, which is what a calibrated MEMS gyro actually does.

<svg viewBox="0 0 480 230" role="img" aria-label="True path and odometry trail separating over one lap">
  <rect width="480" height="230" rx="12" fill="#10161a"/>
  <path d="M40 150 C 120 150, 160 70, 250 70 C 340 70, 380 160, 450 150" fill="none" stroke="#3f8cc0" stroke-width="4"/>
  <path d="M40 150 C 130 158, 180 96, 270 88 C 360 80, 400 176, 452 168" fill="none" stroke="#e3a23a" stroke-width="3"/>
  <circle cx="40" cy="150" r="5" fill="#f4f1ea"/>
  <text x="52" y="146" fill="#f4f1ea" font-size="12" font-family="sans-serif">start, both together</text>
  <text x="300" y="58" fill="#7eb6d6" font-size="13" font-family="sans-serif">true path</text>
  <text x="300" y="196" fill="#e3a23a" font-size="13" font-family="sans-serif">odometry</text>
  <text x="16" y="214" fill="#8e9b94" font-size="13" font-family="sans-serif">A small heading bias bends the guess off the car. The gap grows with time.</text>
</svg>

## Integrating one control period

Let $v$ be the wheel-speed sample and $\omega$ the gyro yaw-rate sample, both already noisy. Over a control period $\Delta t$, using the yaw at the start of the step:

$$x \leftarrow x + v\cos\theta\,\Delta t,\quad y \leftarrow y + v\sin\theta\,\Delta t,\quad \theta \leftarrow \theta + \omega\,\Delta t.$$

The speed sample is the true speed times $(1 + b_v)$ plus white noise. $b_v$ is drawn once per reset from a Gaussian with standard deviation 0.012, so a typical bias is about one percent. White noise on speed is 0.02 m/s. On a straight line the fractional distance error is about $b_v$: the bias is constant, so it scales the whole trip.

Heading error from a constant gyro bias $b_\omega$ grows like $b_\omega t$. Cross-track then grows like distance times that angle. A small bias is centimetres in the first few seconds and metres on a long lap.

Odometry error and control error add. Pure pursuit can track a bad pose perfectly, and the car still leaves the lane. The drift lesson measures that on the oval: cross-track starts near 0.18 m and is near 2.23 m after 45 seconds. The controller held its gains. The pose moved.

The program driving this lesson is that pursuit law. The pose it steers from is the integral above.

{{code:lookahead}}

Resetting the world resets the pose to the origin and draws a new bias. Compare two runs with the same seed, or you are comparing different biases. The pose lives in the odometry frame. Adding it to a world coordinate, or to the camera yaw, gives a number in a mixed frame.

## Try it

1. Run pure pursuit on the oval. The amber trail should leave the coloured one as the lap goes on.
2. Print `sensors.odometry.pose.yaw` and a sum of `yaw_rate * dt`. They should stay close. They are the same integral.
3. Change the seed from 1 to 2 and run again. The amber trail should leave on a different side or at a different rate. The bias was redrawn.
