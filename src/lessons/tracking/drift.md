---
title: Why odometry drift hurts
order: 2
worlds: track, city
world: track
spawn: pursuit
starter: pursuit
action: lab
prerequisites: tracking/pursuit, models/noise
status: ready
---

A good driver with a bad map still leaves the road. Pure pursuit on the oval is a good controller attached to a drifting pose. The path plot is the picture: the plan stays on the centerline, the car follows it at first, and the odometry trail walks away. Cross-track of the true car grows because the controller is steering the ghost, the way a careful driver following a phone map still leaves the road when the blue dot is wrong.

Cross-track here is the distance from the true position to the reference path, a chain of short straight segments (a polyline). The odometry pose stays close to the path by construction, because pursuit is tracking that pose. The car is what leaves.

<svg viewBox="0 0 520 240" role="img" aria-label="The reference path stays put. Odometry follows it. The car peels away. Cross-track is the gap.">
  <rect width="520" height="240" rx="12" fill="#0e1418"/>
  <path d="M30 160 H490" fill="none" stroke="#7dcea0" stroke-width="3"/>
  <path d="M30 160 C 140 158, 240 152, 360 136 S 460 128, 500 120" fill="none" stroke="#f4f7f4" stroke-width="3"/>
  <path d="M30 168 H470" fill="none" stroke="#6ea8ff" stroke-width="3" stroke-dasharray="8 6"/>
  <line x1="360" y1="136" x2="360" y2="160" stroke="#ffd24a" stroke-width="2"/>
  <text x="372" y="100" fill="#ffd24a" font-size="16" font-family="sans-serif">cross-track</text>
  <text x="30" y="36" fill="#f4f7f4" font-size="18" font-family="sans-serif">The ghost stays on the path. The car does not.</text>
  <text x="30" y="196" fill="#7dcea0" font-size="15" font-family="sans-serif">Green: reference path.</text>
  <text x="30" y="218" fill="#d5ddd8" font-size="15" font-family="sans-serif">White: where the car went. Blue dashes: odometry, still on the plan.</text>
</svg>

On seed 1, for a 60 second run, the oval numbers are:

- about **0.18 m** mean cross-track in the first 15 seconds
- about **2.23 m** mean cross-track after 45 seconds
- one lap, the car clear of the walls, odometry drift of a few meters by the end

The city roundabout tells a different story. There the body slides sideways while the wheels still point along the turn. That slide is sideslip, also called crabbing. Cross-track sits near 0.6 m the whole minute, and the slide dominates the gyro. When you want to see drift, use the oval.

The forest and the warehouse grow too, less dramatically than the oval, because the paths are shorter and more interrupted. The oval is the clean experiment: a long closed loop, a bias that integrates, a controller that steers from the pose.

In the sim: that oval run, with the plan and both trails drawn.

The steer itself is the pursuit block. The pose inside it is the one that walks away.

{{code:pursuit_steer}}

## A heading error that grows, then a cross-track that bends

Suppose the pose yaw is wrong by $\Delta\theta = b_\omega t$, and pursuit drives the estimated pose along the path. The true velocity points $\Delta\theta$ away from the path tangent. The cross-track $e$ then behaves like

$$\dot{e} \approx v\sin\Delta\theta \approx v b_\omega t$$

while $\Delta\theta$ is still small and the feedback has only heard about the ghost. Integrating,

$$e(t) \approx \tfrac{1}{2} v b_\omega t^2$$

plus the ordinary tracking error from lookahead and slip. The $t^2$ is why the first 15 seconds look fine and the last 15 seconds bend upward. A constant cross-track offset would be a bad gain. A cross-track that bends is a bias.

Feedback on the true $e$ would hold it. This program sees the odometry $e$. The localization module builds an $e$ the lidar can see, by comparing the scan to a known map, and then hands pursuit that pose.

Judge the controller by the colored trail against the planned path. The blue trail is the input the controller believes. A contact on the second lap is often the drift: the car is 2 m off the centerline and in the cones. Shortening the lookahead makes the first ten seconds prettier and tracks the bad pose more tightly after that.

## Try it

1. Run the oval and watch the Time row. Compare the gap between the car and the blue trail around 15 s with the gap around 50 s. Pause at each mark. The later gap should be much larger.
2. Run the same starter in the city. Cross-track should stay roughly flat. The roundabout's error is slip, and it stays flat with time.
3. Open the particle-filter pursuit on this same oval. Late cross-track should stop climbing the way 0.18 m to 2.23 m climbs.
