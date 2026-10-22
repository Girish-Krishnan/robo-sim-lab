---
title: Lidar obstacle avoidance
order: 2
world: forest
spawn: avoid
starter: avoid
action: lab
prerequisites: models/lidar
status: ready
---

Avoidance looks at the scan and steers toward a gap the car fits through. There is no map and no path. Pointed into the trees, a gap follower has trunks to thread instead of an empty road to hold.

In the sim: the forest, aimed into the trees, with the lidar drawn.

Each hit blocks a wedge about as wide as the car, a single ray thickened until the bumper would fit. Among the openings that remain in front of the car, the starter aims at the widest one, and it slows down when the nearest forward return is close. Speed follows that nearest return, because a cone off to the side is still on the bumper's path.

If the car is boxed in, or if it has barely moved for a couple of seconds, it backs up a short way and yaws toward the clearer side, then tries again. That escape is part of the starter. The rear scan is a thin wedge, so the backup stays short.

In the forest the starter also prefers a heading that keeps it in the corridor, using the pattern of ranges. It is still reactive. `sensors.task.path` stays unread.

## A gap is an interval of angles

Let the forward beams be those with $|\alpha| < \alpha_{\max}$. The longest single range is often a crack between two trunks. A better rule treats a return $r$ at angle $\alpha$ as occupying

$$\alpha \in \big[\alpha - \arctan(w / r),\; \alpha + \arctan(w / r)\big]$$

for a half-width $w$ a bit larger than the car, and then picks the opening with the best score. The starter writes that idea as a pass over the beams.

The helper that paints those wedges:

{{code:inflate}}

Throttle is a function of the nearest forward range $r_{\min}$. Far away, throttle is positive and modest. As $r_{\min}$ falls toward the bumper offset, throttle falls toward 0 and then toward a short reverse. One threshold would be wrong at every speed, so the starter uses a few bands.

Reactive avoidance decides from this scan alone. This lesson runs in the forest, where the car threads trunks and keeps moving. The same program on the oval treats cones as blockers and stays off them.

A gap on the left has positive angle, and positive steering turns left. Negating the command "to match the camera" turns into the obstacle.

## Try it

1. Run the starter in the forest. You should thread the corridor and keep moving.
2. On the oval, watch it treat cones as blockers. A one-beam gap between cones should stay closed.
3. Halve `HALF` in the block above and run the forest again. The car should start accepting gaps it cannot fit.
