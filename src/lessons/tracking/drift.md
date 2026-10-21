---
title: Why odometry drift hurts
order: 2
world: track
spawn: pursuit
starter: pursuit
action: lab
prerequisites: tracking/pursuit, models/noise
status: ready
---

Pure pursuit on the oval is a good controller attached to a drifting pose. The path plot is the picture: the plan stays on the centreline, the car follows it at first, and the odometry trail walks away. Cross-track of the **true** car grows because the controller is steering the ghost.

Cross-track here is the distance from the true position to the reference polyline, not the distance from the odometry pose to the polyline. The odometry pose stays close to the path by construction. Pursuit is tracking it. The car is what leaves.

On seed 1, for a 60 second run, the oval numbers are:

- about **0.18 m** mean cross-track in the first 15 seconds
- about **2.23 m** mean cross-track after 45 seconds
- one lap, no real contact, odometry drift of a few metres by the end

The city roundabout does not tell this story. There the body crabs in the turn, and cross-track sits near 0.6 m the whole minute. Sideslip dominates the gyro. When you want to see drift, use the oval.

The forest and the warehouse grow too, less dramatically than the oval because the paths are shorter and more interrupted. The oval is the clean experiment: a long closed loop, a bias that integrates, a controller that never looks at the lidar.

## A heading error that grows, then a cross-track that bends

Suppose the pose yaw is wrong by $\Delta\theta = b_\omega t$, and pursuit drives the estimated pose along the path. The true velocity points $\Delta\theta$ away from the path tangent. The cross-track $e$ then behaves like

$$\dot{e} \approx v\sin\Delta\theta \approx v b_\omega t$$

while $\Delta\theta$ is still small and the feedback has not been told about $e$. Integrating,

$$e(t) \approx \tfrac{1}{2} v b_\omega t^2$$

plus the ordinary tracking error from lookahead and slip. The $t^2$ is why the first 15 seconds look fine and the last 15 seconds do not. A constant cross-track offset would be a bad gain. A cross-track that bends upward is a bias.

Feedback on the true $e$ would hold it. This program never sees true $e$. The localization module builds an $e$ the lidar can see, by comparing the scan to a known map, and then hands pursuit that pose instead of the raw odometry.

Do not judge the controller by the amber trail. The amber trail is the input. Judge it by the coloured trail against the planned path. Resetting in the middle of a run resets the bias draw only if you reset the world. Hot-editing the lookahead and pressing Run again restarts the program and the world in this lab, so the bias is a new sample if the seed resets with the world. Compare like with like.

A contact on the second lap is often the drift, not a bad curvature formula. If the car is 2 m off the centreline, it is in the cones. Fixing that by shortening the lookahead makes the first ten seconds prettier and the bias worse, because you track the bad pose more tightly.

## Fifteen seconds, then fifty

Run a full minute on the oval with Paths on. Pause near 15 seconds and again near 50 seconds. The gap between the car and the amber trail should be much larger the second time. Run the same starter in the city. Cross-track should stay roughly flat. That does not contradict this lesson: the roundabout's error is slip, and it does not bend upward with time. The particle-filter pursuit on this same oval is what stops the late cross-track climbing the way 0.18 m to 2.23 m climbs.
