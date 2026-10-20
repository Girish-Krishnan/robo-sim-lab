---
title: Pursuit with the filter
order: 4
world: track
spawn: mcl
starter: mcl
action: lab
prerequisites: localization/particles, tracking/pursuit
status: ready
---

This is the same pure pursuit law as the path-tracking lesson, with one input changed. The lookahead is computed from the particle-filter mean instead of from `sensors.odometry.pose`. Wheel speed is still the wheel speed. The gyro is still inside the motion model. It is no longer the heading you steer by.

## In plain words

On the oval, pursuit that trusts odometry lets cross-track grow from about 0.18 m in the first 15 seconds to about 2.23 m after 45 seconds. On seed 1, the same minute with this filter stayed near **0.19 m** mean cross-track, and about **0.34 m** after 45 seconds, with no real contact. The estimate is what the lidar and the map agree on, so a slow gyro bias stops being a slow steer away from the centreline.

The starter still draws the path and the lookahead in the odometry frame. It also draws the particles and the estimate. Paths in the header still draws truth and raw odometry, which the program cannot see. The picture you want is: coloured truth on the centreline, red estimate on the car, amber odometry leaving.

The city will not drop to zero cross-track. The body slides in a tight roundabout even with a perfect pose. Judge the filter on the oval, where slip is small and the bias has a full minute to integrate.

The control step has to finish inside the 20 Hz budget, 50 ms, with margin. The starter is sized for that: 360 particles, 40 beams, one distance-field decode on the first tick, then table lookups. If you add a Python loop over particles and beams, you will miss the budget before you miss the wall.

## The math

Let $(\hat x, \hat y, \hat\theta)$ be the weighted mean. The lookahead target $(g_x, g_y)$ is the same search as before, in the odometry frame. The body-frame offset is

$$x_b = \cos\hat\theta\,(g_x - \hat x) + \sin\hat\theta\,(g_y - \hat y)$$

$$y_b = -\sin\hat\theta\,(g_x - \hat x) + \cos\hat\theta\,(g_y - \hat y)$$

$$\alpha = \operatorname{atan2}(y_b, x_b),\quad \kappa = \frac{2\sin\alpha}{L_d},\quad \delta = \arctan(\kappa L).$$

That is the pursuit lesson with $\theta$ replaced by $\hat\theta$ and the position replaced by the mean. Speed still comes from `sensors.odometry.speed`, because wheel speed is a good sensor. Using the derivative of $\hat x$ as speed would add the filter's jitter to the throttle.

Position error of the estimate, measured only in the eval, is the distance between $(\hat x, \hat y)$ and the true pose expressed in this same frame. Heading error is the wrapped difference of yaw. A useful filter on this oval keeps the position error well under the 2 m the raw odometry eventually reaches, and the heading error to a few degrees.

## Intuition and pitfalls

If the red trail leaves the car, pursuit will follow the red trail and the bug is in the filter, not in $\kappa$. If the red trail stays on the car and the car still leaves the path, the bug is in the body-frame transform or the lookahead index.

Do not feed `odometry.pose` back in "as a prior" by mixing it 50/50 with the mean. That re-introduces the bias you just removed. The motion model already used the odometry delta.

The first second can have a larger pose error while the weights concentrate. That spike is not the steady-state error. Look at the late part of the minute, which is where raw pursuit falls apart.

## Try it

1. Run the starter on the oval for a full minute with Paths on. The amber trail should still leave. The car and the red estimate should stay near the centreline.
2. Increase `LOOKAHEAD` to `6`. The cloud should look the same. The path should cut corners more, which is pursuit, not the filter.
3. Change `UNKNOWN_START` to `True`, or open the kidnapped lesson, and watch the cloud start spread out instead of on the car.
