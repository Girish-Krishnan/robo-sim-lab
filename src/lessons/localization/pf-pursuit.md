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

This is the payoff. The same pure pursuit law as the path-tracking lesson, with one input changed. The lookahead is computed from the particle-filter mean. Wheel speed is still the wheel speed. The gyro still lives inside the motion model. The heading you steer by is the filter's heading. Three poses are in the picture at once: truth, the estimate, and raw odometry. The key on the view names them.

In the sim: the oval, with the path trails and the particle cloud drawn.

On the oval, pursuit that trusts odometry lets cross-track grow from about 0.18 m in the first 15 seconds to about 2.23 m after 45 seconds. The same minute with this filter has late cross-track of about **0.34 m**. The estimate ends about **0.38 m** from the car. Those are different numbers: 0.34 m is how far the car sits from the centerline late in the minute, and 0.38 m is how far the red estimate sits from the car at the end. The car stays clear of the walls. The estimate is what the lidar and the map agree on, so a slow gyro bias stops steering the car off the centerline.

The colored trail is where the car went. The red trail is the filter's estimate. The blue trail is raw odometry. You want truth on the centerline, the red estimate on the car, and the blue trail leaving.

A tight roundabout still has some cross-track, because the body slides even with a good pose. A long aisle of parallel walls is a weak place to ask a lidar how far along the corridor you are, until a crate or a pillar breaks the pattern. A cone or a trunk changes the scan when the pose slides, which is the idea from the Bayes lesson.

The steer below is computed from the filter's mean. The rest of the program is the filter from the previous lessons, still loaded so the cloud stays on screen.

**Drive it yourself**, beside the sim note above, keeps this filter and lets you be the driver. Turn it on and the keys steer at once. The red estimate should stay near the car while the blue trail still peels away.

## The same arc, measured from the mean

Let $(\hat x, \hat y, \hat\theta)$ be the weighted mean. The lookahead target $(g_x, g_y)$ is the same search as before, in the odometry frame. The body-frame offset is

$$x_b = \cos\hat\theta\,(g_x - \hat x) + \sin\hat\theta\,(g_y - \hat y)$$

$$y_b = -\sin\hat\theta\,(g_x - \hat x) + \cos\hat\theta\,(g_y - \hat y)$$

$$\alpha = \operatorname{atan2}(y_b, x_b),\quad \kappa = \frac{2\sin\alpha}{L_d},\quad \delta = \arctan(\kappa L).$$

That is the pursuit lesson with $\theta$ replaced by $\hat\theta$ and the position replaced by the mean. Speed still comes from `sensors.odometry.speed`. Wheel speed is a good sensor. The derivative of $\hat x$ would add the filter's jitter to the throttle.

`LOOKAHEAD` is in meters. The other lines are the filter's own knobs. `N` is the particle count for a known start.

{{code:tunables}}

The function that turns the estimate into that steer:

{{code:pursue}}

The gap you can see between the red trail and the car is the position error. Heading error is the wrapped difference of yaw. On this oval a useful filter keeps that gap well under the 2 m raw odometry eventually reaches, and the heading error to a few degrees.

If the red trail leaves the car, pursuit follows the red trail and the bug is in the filter. If the red trail stays on the car and the car still leaves the path, the bug is in the body-frame transform or the lookahead index.

The motion model already used the odometry delta. Mixing `odometry.pose` back in, half and half with the mean, would re-introduce the bias the filter just removed. The first second can show a larger pose error while the weights concentrate. The late part of the minute is where raw pursuit falls apart, and where this one should hold.

## Try it

1. Run the starter on the oval for a full minute. The blue trail should still leave. The car and the red estimate should stay near the centerline. Late cross-track is about 0.34 m. The estimate finishes about 0.38 m from the car.
2. In the tunables block, increase `LOOKAHEAD` to `6`. The cloud should look the same. The path should cut corners more, which is pursuit.
3. Turn on Drive it yourself and drive the straight. The particles should ride with the car, and the blue trail should keep its own opinion.
