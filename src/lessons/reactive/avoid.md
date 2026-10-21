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

Avoidance looks at the scan and steers toward a gap the car fits through. There is no map and no path. Pointed into the trees, a gap follower has something to do besides drive a straight empty road.

In the sim: the forest, aimed into the trees, with the lidar drawn.

Each hit blocks a wedge about as wide as the car, not a single ray. A one-beam hole between two trunks is not a door. Among the openings that remain in front of the car, the starter aims at the widest one, and it slows down when the nearest forward return is close. Speed follows that nearest return, not only the dead-ahead beam, because a cone off to the side is still on the bumper's path.

If the car is boxed in, or if it has barely moved for a couple of seconds, it backs up and yaws toward the clearer side, then tries again. That escape is part of the starter. Deleting it makes the city corner and the warehouse aisle into traps.

In the forest the starter also prefers a heading that keeps it in the corridor, using the pattern of ranges, not a stored route. It is still reactive. It does not read `sensors.task.path`.

## A gap is an interval of angles

Let the forward beams be those with $|\alpha| < \alpha_{\max}$. A simple attractive heading is the direction of the longest range, but that ray is often a crack. A better one treats a return $r$ at angle $\alpha$ as occupying

$$\alpha \in \big[\alpha - \arcsin(w / 2r),\; \alpha + \arcsin(w / 2r)\big]$$

for a car half-width $w$, and then picks the centre of the largest remaining interval. The starter is that idea, written with a discrete histogram of beams.

Throttle is a function of the nearest forward range $r_{\min}$. Far away, throttle is positive and modest. As $r_{\min}$ falls toward the bumper offset, throttle falls toward 0 and then toward a small reverse. There is no fixed "stop distance" that works at every speed, so the starter uses a few bands rather than one threshold.

Reactive avoidance does not know the way out of a maze. In the warehouse it explores and still bumps twice on seed 1, once creeping into the end shelf and once backing into a pallet. In the city it leaves the start and still finds one corner. The eval allows that one city contact and those two warehouse contacts, and none on the oval or in the forest. "None" means manifolds that actually contain a contact point, not a broadphase pair with an empty manifold. A wider "back up whenever something is close" rule also reverses next to a cone or a trunk, and that version collects contacts on the oval and in the forest. The starter only backs up for a short forward return, or when the tail is already at a wall.

Do not steer toward the longest single beam if you have just inflated obstacles. The longest beam might be the one you already marked blocked. A gap on the left has positive angle, and positive steering turns left. If you negate the command "to match the camera", you will turn into the obstacle.

## Thread the trees, then make the wedge too thin

Run the starter in the forest. You should thread the corridor rather than orbit the empty meadow. On the oval, watch it treat cones as blockers. A one-beam gap between cones should not be driven through. Halve the wedge width in the source (the car-width term) and run the forest again. The car should start accepting gaps it cannot fit, and the bumper should find a trunk.
