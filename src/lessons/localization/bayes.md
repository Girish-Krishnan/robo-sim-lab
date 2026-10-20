---
title: The Bayes filter
order: 2
world: track
spawn: pursuit
starter: mcl
action: lab
prerequisites: localization/dead-reckoning
status: ready
---

A Bayes filter is the honest version of dead reckoning. Instead of one pose, you keep a belief over poses. Motion spreads the belief. A measurement tightens it back onto the poses that would have produced that measurement.

## In plain words

The belief $\mathrm{bel}(x_t)$ is a probability distribution over the car's pose at time $t$. You never write the whole function down. You either keep a grid (too big here) or a cloud of weighted samples (the next lesson). The shape of the update is the same.

Predict with the motion you commanded, or with the odometry you measured. Then correct with the lidar, using the map. The map is what makes a range a statement about pose. Without it, a range of 4 m is just "something is 4 m away". With it, a range of 4 m rules out every pose where the nearest wall in that direction is not about 4 m away.

## The math

The continuous Bayes filter is

$$\overline{\mathrm{bel}}(x_t) = \int p(x_t \mid x_{t-1}, u_t)\, \mathrm{bel}(x_{t-1})\, dx_{t-1}$$

$$\mathrm{bel}(x_t) = \eta\, p(z_t \mid x_t)\, \overline{\mathrm{bel}}(x_t)$$

$\eta$ makes the belief integrate to 1. $u_t$ is the motion. $z_t$ is the scan.

**Motion model.** Take the odometry pose before and after the tick, and turn the difference into a rotate-translate-rotate:

$$\delta_{\mathrm{rot1}} = \operatorname{atan2}(\Delta y, \Delta x) - \theta_0,\quad \delta_{\mathrm{trans}} = \sqrt{\Delta x^2 + \Delta y^2},\quad \delta_{\mathrm{rot2}} = \Delta\theta - \delta_{\mathrm{rot1}}.$$

Each particle applies those three numbers plus Gaussian noise. The noise is what keeps the cloud from collapsing to a single point that can never recover. When $\delta_{\mathrm{trans}}$ is almost zero, $\delta_{\mathrm{rot1}}$ is mostly noise, so the starter treats a tiny step as a pure rotation.

**Measurement model.** A likelihood field does not raycast. It projects each beam's endpoint into the world at the particle's pose, and looks up the distance $d$ to the nearest occupied cell:

$$p(z \mid x) \propto \exp\left(-\frac{d^2}{2\sigma^2}\right) + \lambda$$

The $\lambda$ floor keeps one bad beam from giving the particle probability zero. $\sigma$ is a few tens of centimetres, larger than the lidar's 2 cm, because the grid is 0.5 m and the car slips. Beams at `max_range` are skipped. They did not hit the map.

The starter's `map.field` is that lookup, precomputed, in centimetres, so the 20 Hz tick does not rebuild it. A 0 is an occupied cell. `map.segments` is the wall list the grid came from, if you want to draw or check it.

## Intuition and pitfalls

The predict step uses the odometry **delta**, not the odometry pose as if it were true. If you replace the particle with the odometry pose every tick, you have deleted the filter.

$\eta$ is not a constant you tune. It is "divide by the sum". Forgetting it makes weights explode, and the mean becomes NaN.

A likelihood field ignores beams that pass through a wall and hit a second wall, because it only looks at the endpoint. That is acceptable here. The yards do not have many thin false openings at scan height. A beam model would raycast. It is more correct and too slow for this tick if you do it for every particle and every beam.

## Try it

1. Open the filter starter but do not change it yet. Read `apply_motion` and name $\delta_{\mathrm{rot1}}$, $\delta_{\mathrm{trans}}$, and $\delta_{\mathrm{rot2}}$ in the code.
2. Read `likelihood` and find $\sigma$ and the floor added to each beam. Write down what happens to a particle if the floor is 0 and one beam misses.
3. Print `map.field` is a string. Decode it once, not every tick. The stamp is the cache key. The next lesson runs the cloud.
