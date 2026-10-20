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

A kidnapped robot is one that was moved while it was not looking. The odometry origin is no longer a hint. Global localization starts the particles over the free cells of the map, with random yaw, and waits until the cloud collapses before it trusts the mean for pursuit.

## In plain words

`UNKNOWN_START` in the kidnapped starter is true. The initial cloud is uniform over cells whose distance field is greater than about 0.9 m, so particles do not start inside walls, and yaw is uniform on $(-\pi, \pi)$. Until the standard deviation of the cloud drops and a couple of seconds have passed, the car only creeps and steers. A bad mean would otherwise pure-pursuit into the first wall that the mean happened to invent.

The map is distinctive enough on the oval, the warehouse, and the city that a scan is not the same in every corridor. The forest is harder: many trunks look like many other trunks. Expect the oval to lock on, and do not be surprised if the trees take longer or lock onto a wrong aisle.

This is still the same filter. Only the initial belief changed. The motion noise, the likelihood, and the resampler are the tracking starter's.

## The math

The initial belief is approximately uniform on the free set $\mathcal{F}$:

$$x^{[i]} \sim \mathrm{Uniform}(\mathcal{F}),\quad \theta^{[i]} \sim \mathrm{Uniform}(-\pi, \pi).$$

After a scan, weights concentrate on poses whose wall distances match the beam endpoints. $N_{\mathrm{eff}}$ falls, resampling copies those poses, and the variance of the cloud drops. A practical gate for "I am localized" is

$$\sigma_x + \sigma_y < \sigma^\star$$

with $\sigma^\star$ around 1.5 m, after at least one full second of scans so a single lucky scan cannot start the car. The starter uses a gate in that spirit. It is a heuristic on the cloud, not a probability you were given.

Kidnapping in the strict sense would also need a detector that says "my weights are all terrible, spread out again". This lesson only does the unknown start. Re-spreading when the mean likelihood collapses is the exercise.

## Intuition and pitfalls

The true start is still $(0, 0)$ in this frame, because the map was built at reset. A global filter that peeks at that and seeds a blob there has not solved the problem. The starter does not read a pose. It reads free cells.

Creeping before convergence is safer than sitting still only because a moving scan breaks symmetries. It is also how you hit a wall if the gate is too loose. If you tighten the gate and never move, you may be localized and not know it. Watch the blue cloud, not the throttle.

Particle count matters more here than in tracking. A few hundred particles over a whole yard is a sparse net. If the cloud dies out in the wrong bay, raise `N` a little, or add noise and try again, before you touch the pursuit gains.

## Try it

1. Run the kidnapped starter on the oval. The blue points should begin scattered, then gather on the car, and only then should the car take the centreline.
2. Tighten the spread gate (the `1.6` in the starter) to `0.4`. The car should wait longer. If it never goes, the cloud is localized enough to see and not enough to pass your gate.
3. Set the gate back, and after the cloud has collapsed, add a check: if the average beam distance in the field is suddenly large, spread the particles over free space again. That is a kidnapped detector. Try it by resetting the world mid-lap and see whether the cloud lets go of the old pose.
