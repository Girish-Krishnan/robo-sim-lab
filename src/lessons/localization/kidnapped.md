---
title: Kidnapped start
order: 5
world: track
spawn: mcl-global
starter: mcl-global
action: lab
prerequisites: localization/pf-pursuit
status: ready
---

A kidnapped robot is one that was moved while it was not looking. The odometry origin is no longer a hint. The ideal prior is uniform over free space and yaw. A few hundred particles cannot tile that, so the starter puts most of them along the known path, at twelve headings, and scatters the rest on free cells. The car waits until the cloud collapses before it trusts a pose for pursuit.

## In plain words

`UNKNOWN_START` in the kidnapped starter is true. A few hundred particles cannot fill the yard in x, y, and yaw at once, so the prior is poses along the known path (the route is task info) plus a scatter of free cells, with a grid of headings. The car holds still until the weighted cloud tightens. Driving on a mean that sits between two modes is how you aim at the wrong aisle.

On seed 1 the forest collapses and then completes a lap: the mode is under 0.5 m at the end, with no real contact. The oval's mode is also on the car within about a third of a metre, but the opposite straight is a second mode with the same wall distances, so the variance stays high and the car waits. That symmetry is the lesson. The warehouse aisle is similar along its length, so the mode can sit under a metre off without the cloud dying. The roundabout is less decisive: the mode stays near a metre. Watch the cloud, not the throttle.

## The math

The belief you want, if you had thousands of particles, is uniform on the free set $\mathcal{F}$:

$$x^{[i]} \sim \mathrm{Uniform}(\mathcal{F}),\quad \theta^{[i]} \sim \mathrm{Uniform}(-\pi, \pi).$$

The starter cannot afford that. About four fifths of the 360 particles sit on the known path, twelve headings, with a little position noise. The rest are free cells. Both are drawn, so the first frame is a cloud along the route plus a scatter, not a blob on the car.

After a scan, weights concentrate on poses whose wall distances match the beam endpoints. The starter cubes those weights when the start is unknown, so one good mode pulls ahead of a flat prior. $N_{\mathrm{eff}}$ falls, resampling copies those poses, and the variance of the cloud drops. A practical gate for "I am localized" is

$$\sigma_x + \sigma_y < \sigma^\star$$

with $\sigma^\star$ around 1.2 m, after at least one full second of scans so a single lucky scan cannot start the car. The starter uses that gate. It is a heuristic on the cloud, not a probability you were given. While the spread is still large, the published pose is the best particle, because the mean of two modes sits in the wall between them.

Kidnapping in the strict sense would also need a detector that says "my weights are all terrible, spread out again". This lesson only does the unknown start. Re-spreading when the mean likelihood collapses is the exercise.

## Intuition and pitfalls

The true start is still $(0, 0)$ in this frame, because the map was built at reset. A global filter that peeks at that and seeds a blob there has not solved the problem. The starter does not read a pose. It reads free cells.

Creeping before convergence is safer than sitting still only because a moving scan breaks symmetries. It is also how you hit a wall if the gate is too loose. If you tighten the gate and never move, you may be localized and not know it. Watch the blue cloud, not the throttle.

Particle count matters more here than in tracking. A few hundred particles over a whole yard is a sparse net. If the cloud dies out in the wrong bay, raise `N` a little, or add noise and try again, before you touch the pursuit gains.

## Try it

1. Run the kidnapped starter on the forest. The dots should begin spread along the trail, then gather on the car, and only then should the car take the path. On the oval, look for a second clump on the far straight that does not die.
2. Tighten the spread gate (the `1.2` in `ready`) to `0.4`. The car should wait longer. If it never goes, the cloud is localized enough to see and not enough to pass your gate.
3. Set the gate back, and after the cloud has collapsed, add a check: if the average beam distance in the field is suddenly large, spread the particles over free space again. That is a kidnapped detector. Try it by resetting the world mid-lap and see whether the cloud lets go of the old pose.
