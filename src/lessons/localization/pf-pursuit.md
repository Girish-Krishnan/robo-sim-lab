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

This is the same pure pursuit law as the path-tracking lesson, with one input changed. The lookahead is computed from the particle-filter mean instead of from `sensors.odometry.pose`. Wheel speed is still the wheel speed. The gyro is still inside the motion model. It is no longer the heading you steer by. Three poses are in the picture at once: truth, the estimate, and raw odometry.

In the sim: the oval, with the path trails and the particle cloud drawn.

On the oval, pursuit that trusts odometry lets cross-track grow from about 0.18 m in the first 15 seconds to about 2.23 m after 45 seconds. On seed 1, the same minute with this filter stayed near **0.19 m** mean cross-track, and about **0.34 m** after 45 seconds, with no real contact. The estimate is what the lidar and the map agree on, so a slow gyro bias stops being a slow steer away from the centreline.

The starter draws the path and the lookahead in the odometry frame, and it draws the particles and the estimate. The coloured trail is where the car actually went, the red trail is the filter's estimate, and the amber trail is raw odometry. The program cannot read the coloured or amber trails. The picture you want is coloured truth on the centreline, the red estimate on the car, and amber odometry leaving.

The city will not drop to zero cross-track. The body slides in a tight roundabout even with a perfect pose, so the mean stays near 0.6 m. On seed 1 the filter's late cross-track, after 45 s, was about 0.43 m against about 0.63 m for raw odometry. That is a real correction of heading, on top of a slip the bicycle model does not remove.

The warehouse bay is still the weak case. The loop sits in a long rectangle: the south wall and the rack face are straight, so a pose shifted along the aisle explains the scan about as well as the truth until a crate, a barrel, or a pillar breaks that shift. On seed 1 the known-start pose error averages about 1.67 m and ends near 1.50 m, and late cross-track is about 1.38 m. That final is lower than the 2.5 m the same minute ended at before those short edges were in the likelihood, and it is not under half a metre. Parallel walls between the crates are still a weak place to ask a lidar for along-track position.

The oval and the forest are where the correction shows up. A cone or a trunk makes $p(z \mid x)$ change when the pose slides along the corridor, which is the argument in the Bayes lesson. On seed 1 the known-start estimate ends near 0.38 m on the oval and near 0.88 m in the forest. The kidnapped run, scored on the cloud rather than on the single best particle, ends near 0.29 m on the oval and near 0.63 m in the forest.

The control step has to finish inside the 20 Hz budget, 50 ms, with margin. The host decodes `map.grid` once, before the timed step. The starter then does table lookups: 360 particles and 40 beams. If you add a Python loop over particles and beams, you will miss the budget before you miss the wall.

## The same arc, measured from the mean

Let $(\hat x, \hat y, \hat\theta)$ be the weighted mean. The lookahead target $(g_x, g_y)$ is the same search as before, in the odometry frame. The body-frame offset is

$$x_b = \cos\hat\theta\,(g_x - \hat x) + \sin\hat\theta\,(g_y - \hat y)$$

$$y_b = -\sin\hat\theta\,(g_x - \hat x) + \cos\hat\theta\,(g_y - \hat y)$$

$$\alpha = \operatorname{atan2}(y_b, x_b),\quad \kappa = \frac{2\sin\alpha}{L_d},\quad \delta = \arctan(\kappa L).$$

That is the pursuit lesson with $\theta$ replaced by $\hat\theta$ and the position replaced by the mean. Speed still comes from `sensors.odometry.speed`, because wheel speed is a good sensor. Using the derivative of $\hat x$ as speed would add the filter's jitter to the throttle.

Position error of the estimate, measured only in the eval, is the distance between $(\hat x, \hat y)$ and the true pose expressed in this same frame. Heading error is the wrapped difference of yaw. A useful filter on this oval keeps the position error well under the 2 m the raw odometry eventually reaches, and the heading error to a few degrees.

If the red trail leaves the car, pursuit will follow the red trail and the bug is in the filter, not in $\kappa$. If the red trail stays on the car and the car still leaves the path, the bug is in the body-frame transform or the lookahead index.

Do not feed `odometry.pose` back in "as a prior" by mixing it 50/50 with the mean. That re-introduces the bias you just removed. The motion model already used the odometry delta. The first second can have a larger pose error while the weights concentrate. That spike is not the steady-state error. Look at the late part of the minute, which is where raw pursuit falls apart.

## Truth, red, and amber

Run the starter on the oval for a full minute. The amber trail should still leave. The car and the red estimate should stay near the centreline. Increase `LOOKAHEAD` to `6`. The cloud should look the same. The path should cut corners more, which is pursuit, not the filter. Change `UNKNOWN_START` to `True`, or open the kidnapped lesson, and watch the cloud start spread out instead of on the car.
