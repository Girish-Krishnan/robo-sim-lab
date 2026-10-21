---
title: Open-loop circle
order: 1
world: track
spawn: circle
starter: circle
action: lab
prerequisites: models/bicycle
status: ready
---

Open loop means the command does not look at a sensor. The circle starter returns the same steering and the same throttle on every tick. It is the right first program because when it fails, the failure is the plant, not a bug in your feedback.

In the sim: the same fixed command, with the camera far enough back to see the whole lap.

The starter turns left at 0.34 rad and asks for a medium throttle. The car is placed on a pad that was checked to be clear of that circle: the south lawn in the city, the oval infield, the meadow south of the trees, and the open bay in the warehouse. If you move the steer or the throttle a lot, that clearance promise ends.

There is no goal pose. The lesson is the radius, and the fact that a fixed command repeats. Later controllers close the loop because a fixed command cannot follow a wall that curves or a path that drifts.

## Constant steer is constant curvature

From the bicycle model, constant $\delta$ and constant $v$ give constant curvature

$$\kappa = \frac{\tan\delta}{L},\quad R = \frac{L}{\tan\delta}.$$

One lap takes time $T = 2\pi R / v$ only if the car actually holds speed $v$ and radius $R$. Throttle is not speed. A throttle of 0.5 on flat ground settles near a few metres per second, and the hold behaviour depends on the brake model. Read `sensors.odometry.speed` if you want the number. Do not assume it equals the throttle.

The discrete command is held for $\Delta t = 0.05$ s. You do not need to integrate the circle yourself. Returning $(0.34,\ 0.5)$ is the whole controller.

If the circle hits something, do not add a special case yet. Either the pad is the wrong one (check the world) or the steer is tighter than 0.34 or the speed is high enough to slide. The avoid lesson is the one that reacts. A positive steer is left. If your circle goes right, the sign of the number you return is negative, whatever the comment says.

Open loop cannot reject the gyro bias, and it does not have to. The geometric circle is in the world. Odometry is only a passenger. Paths will show the amber trail leaving a perfectly good circle. That is not the circle being wrong.

## Reverse it, then measure the gap

Run the starter on the oval infield and on the city lawn. Both should stay clear and keep turning left. Replace the steer with `-0.34`. The circle should reverse direction and may leave the pad. Put it back. After ten seconds of a clean circle, print the distance of `odometry.pose` from the origin. It should be near the radius only if the yaw integral matches the truth. It will not, quite. Write down the gap.
