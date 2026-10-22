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

Pure pursuit on the oval is a good controller attached to a drifting pose. The path plot is the picture: the plan stays on the centreline, the car follows it at first, and the odometry trail walks away. Cross-track of the true car grows because the controller is steering the ghost, the way a careful driver following a phone map still leaves the road when the blue dot is wrong.

Cross-track here is the distance from the true position to the reference polyline. The odometry pose stays close to the path by construction, because pursuit is tracking that pose. The car is what leaves.

On seed 1, for a 60 second run, the oval numbers are:

- about **0.18 m** mean cross-track in the first 15 seconds
- about **2.23 m** mean cross-track after 45 seconds
- one lap, the car clear of the walls, odometry drift of a few metres by the end

The city roundabout tells a different story. There the body crabs in the turn, and cross-track sits near 0.6 m the whole minute. Sideslip dominates the gyro. When you want to see drift, use the oval.

The forest and the warehouse grow too, less dramatically than the oval, because the paths are shorter and more interrupted. The oval is the clean experiment: a long closed loop, a bias that integrates, a controller that steers from the pose.

In the sim: that oval run, with the plan and both trails drawn.

The steer itself is the pursuit block. The pose inside it is the one that walks away.

{{code:lookahead}}

## A heading error that grows, then a cross-track that bends

Suppose the pose yaw is wrong by $\Delta\theta = b_\omega t$, and pursuit drives the estimated pose along the path. The true velocity points $\Delta\theta$ away from the path tangent. The cross-track $e$ then behaves like

$$\dot{e} \approx v\sin\Delta\theta \approx v b_\omega t$$

while $\Delta\theta$ is still small and the feedback has only heard about the ghost. Integrating,

$$e(t) \approx \tfrac{1}{2} v b_\omega t^2$$

plus the ordinary tracking error from lookahead and slip. The $t^2$ is why the first 15 seconds look fine and the last 15 seconds bend upward. A constant cross-track offset would be a bad gain. A cross-track that bends is a bias.

Feedback on the true $e$ would hold it. This program sees the odometry $e$. The localization module builds an $e$ the lidar can see, by comparing the scan to a known map, and then hands pursuit that pose.

Judge the controller by the coloured trail against the planned path. The amber trail is the input. A contact on the second lap is often the drift: the car is 2 m off the centreline and in the cones. Shortening the lookahead makes the first ten seconds prettier and tracks the bad pose more tightly after that.

## Try it

1. Run a full minute on the oval. Compare the gap between the car and the amber trail around 15 seconds with the gap around 50 seconds. The later gap should be much larger.
2. Run the same starter in the city. Cross-track should stay roughly flat. The roundabout's error is slip, and it stays flat with time.
3. Open the particle-filter pursuit on this same oval. Late cross-track should stop climbing the way 0.18 m to 2.23 m climbs.
