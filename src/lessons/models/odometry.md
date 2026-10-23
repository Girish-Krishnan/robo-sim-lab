---
title: Wheel odometry
order: 3
worlds: city, track, forest, warehouse
world: track
spawn: pursuit
starter: none
action: drive
prerequisites: models/bicycle
status: ready
---

Close your eyes and keep walking. Wheel odometry is that same brave guess, done by the car. Each tick it adds "how far the rear wheels turned" and "how much the gyro says we yawed." The count can be careful, and the room you imagine still slides away from the room you are standing in.

In the sim: you drive. WASD or the arrow keys, Space to brake. The colored trail is the car. The blue trail is the guess. The little graph is how far those two have drifted apart, in meters, as the clock runs. Pause freezes the car, the clock, and the graph together.

You start on the oval, nose north, on the route. The same drive works on the city streets, the forest trail, and the warehouse floor. Pick another world from the menu and take the same lap. Each world places you at that world's start.

Each reset, the pose starts at $(0, 0, 0)$ in its own frame. Forward is the direction the car faced at that instant. After that, the only inputs are noisy wheel speed and the gyro yaw rate. A bias in either one walks the guess off the car, and the guess has no way to notice.

The blue trail is this pose, dropped into the world with the spawn transform (the shift from the odometry origin onto the map). At the first tick it lies on the car. Give it a minute and it peels away. That peel is the graph climbing.

The steering angle is measured and published, with its own small bias, and the pose leaves it out. Heading comes from the gyro. Folding the steer measurement into the heading would turn a small bias into a constant curve, and one oval lap would leave the blue trail tens of meters from the car. A gyro bias of 0.0012 rad/s, one sigma, is a few degrees per minute. MEMS means the gyro is a small sensor etched onto a chip. That is the class of part this bias is standing in for.

<svg viewBox="0 0 480 230" role="img" aria-label="True path and odometry trail separating over one lap">
  <rect width="480" height="230" rx="12" fill="#10161a"/>
  <path d="M40 150 C 120 150, 160 70, 250 70 C 340 70, 380 160, 450 150" fill="none" stroke="#e3a23a" stroke-width="4"/>
  <path d="M40 150 C 130 158, 180 96, 270 88 C 360 80, 400 176, 452 168" fill="none" stroke="#3f8cc0" stroke-width="3"/>
  <circle cx="40" cy="150" r="5" fill="#f4f1ea"/>
  <text x="52" y="146" fill="#f4f1ea" font-size="12" font-family="sans-serif">start, both together</text>
  <text x="300" y="58" fill="#e3a23a" font-size="13" font-family="sans-serif">true path</text>
  <text x="300" y="196" fill="#6ea8ff" font-size="13" font-family="sans-serif">odometry</text>
  <text x="16" y="214" fill="#8e9b94" font-size="13" font-family="sans-serif">A small heading bias bends the guess off the car. The gap grows with time.</text>
</svg>

## Integrating one control period

Let $v$ be the wheel-speed sample and $\omega$ the gyro yaw-rate sample, both already noisy. Over a control period $\Delta t$, using the yaw at the start of the step:

$$x \leftarrow x + v\cos\theta\,\Delta t,\quad y \leftarrow y + v\sin\theta\,\Delta t,\quad \theta \leftarrow \theta + \omega\,\Delta t.$$

The speed sample is the true speed times $(1 + b_v)$ plus white noise. $b_v$ is drawn once per reset from a Gaussian with standard deviation 0.012, so a typical bias is about one percent. White noise on speed is 0.02 m/s. On a straight line the fractional distance error is about $b_v$: the bias is constant, so it scales the whole trip.

Heading error from a constant gyro bias $b_\omega$ grows like $b_\omega t$. Cross-track then grows like distance times that angle. A small bias is centimeters in the first few seconds and meters on a long lap.

There is no controller in this lesson on purpose. You are the driver, so the only thing moving the blue trail is the integral above. A later lesson puts a path tracker on top of this same guess and shows what that costs. Reset run puts the car back and replays the same bias. The pose lives in the odometry frame. Adding it to a world coordinate, or to the camera yaw, gives a number in a mixed frame.

This page has no program, so you are on seed 1. Reset run replays that same draw. A program with `SEED` at the top is how a later lesson picks a different one.

## Try it

1. Drive the east straight, then the north bend. The blue trail should leave the colored one, and the graph should climb.
2. Stop and read the graph. The number is the distance, in meters, between where you are and where the wheels say you are.
3. Press Reset run and drive the same bend again. The peel should come back in the same direction. That is the bias, replayed.
