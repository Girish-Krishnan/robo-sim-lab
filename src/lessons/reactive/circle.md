---
title: Open-loop circle
order: 1
worlds: city, track, forest, warehouse
world: track
spawn: circle
starter: circle
action: lab
prerequisites: models/bicycle
status: ready
---

Watch the car lean into a left turn and trace the same circle, lap after lap. The program sends one command, 0.34 rad of left steer and a medium throttle, every tick, and never checks where it is. That's open loop. You met this circle in the bicycle lesson. Here it's the baseline that the reactive controllers improve on.

In the sim: the same fixed command, with the camera far enough back to see the whole lap. The car is placed on a pad checked to be clear of that circle: the south lawn in the city, the oval infield, the meadow south of the trees, and the open bay in the warehouse. Move the steer or the throttle a lot and that clearance ends.

When the lap goes wrong, watch the car: it shows you which number is wrong. Slip, a tight steer, or the wrong pad shows up there. There is no feedback to debug, because you never asked the sensors what they saw. Later controllers close the loop because a wall that curves, or a path that drifts, needs a command that can change.

{{code:control}}

## Constant steer is constant curvature

From the bicycle model, constant $\delta$ and constant $v$ give constant curvature

$$\kappa = \frac{\tan\delta}{L},\quad R = \frac{L}{\tan\delta}.$$

One lap takes time $T = 2\pi R / v$ when the car actually holds speed $v$ and radius $R$. Throttle is a request, and speed is what the wheels settle to. A throttle of 0.5 on flat ground settles near a few meters per second. Read `sensors.odometry.speed` for the number.

The discrete command is held for $\Delta t = 0.05$ s. Returning $(0.34,\ 0.5)$ is the whole controller.

If the circle hits something, the cause is one of three: the pad, the steer, or the speed. The avoid lesson is the one that reacts. A positive steer is left. A circle that goes right is a negative number in the return.

Open loop leaves the gyro bias alone, and the geometric circle in the world is still the circle. Odometry is a passenger. The trails will show the blue odometry line leaving a perfectly good lap.

## Try it

1. Run the starter on the oval infield and on the city lawn. Both should stay clear and keep turning left.
2. Replace the steer with `-0.34`. The circle should reverse direction and may leave the pad. Put it back.
3. Print `odometry.pose.yaw` once a second next to `sensors.time`. Every lap it should grow by about $2\pi$. Compare the lap time with $2\pi R / v$.
