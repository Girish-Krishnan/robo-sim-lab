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

In the sim: the filter on the oval, pulled back so the cloud fits once it is running.

The belief $\mathrm{bel}(x_t)$ is a probability distribution over the car's pose at time $t$. You never write the whole function down. You either keep a grid (too big here) or a cloud of weighted samples (the next lesson). The shape of the update is the same.

Predict with the motion you commanded, or with the odometry you measured. Then correct with the lidar, using the map. The map is what makes a range a statement about pose. Without it, a range of 4 m is just "something is 4 m away". With it, a range of 4 m rules out every pose where the nearest wall in that direction is not about 4 m away.

## Predict, then correct

The continuous Bayes filter is

$$\overline{\mathrm{bel}}(x_t) = \int p(x_t \mid x_{t-1}, u_t)\, \mathrm{bel}(x_{t-1})\, dx_{t-1}$$

$$\mathrm{bel}(x_t) = \eta\, p(z_t \mid x_t)\, \overline{\mathrm{bel}}(x_t)$$

$\eta$ makes the belief integrate to 1. $u_t$ is the motion. $z_t$ is the scan. $\eta$ is not a constant you tune. It is "divide by the sum". Forgetting it makes weights explode, and the mean becomes NaN.

The predict step uses the odometry **delta**, not the odometry pose as if it were true. If you replace the particle with the odometry pose every tick, you have deleted the filter.

## A motion model in three numbers

Take the odometry pose before and after the tick, and turn the difference into a rotate-translate-rotate:

$$\delta_{\mathrm{rot1}} = \operatorname{atan2}(\Delta y, \Delta x) - \theta_0,\quad \delta_{\mathrm{trans}} = \sqrt{\Delta x^2 + \Delta y^2},\quad \delta_{\mathrm{rot2}} = \Delta\theta - \delta_{\mathrm{rot1}}.$$

Each particle applies those three numbers plus Gaussian noise. The noise is what keeps the cloud from collapsing to a single point that can never recover. When $\delta_{\mathrm{trans}}$ is almost zero, $\delta_{\mathrm{rot1}}$ is mostly noise, so the starter treats a tiny step as a pure rotation.

## A likelihood that does not raycast

A likelihood field projects each beam's endpoint into the world at the particle's pose, and looks up the distance $d$ to the nearest occupied cell:

$$p(z \mid x) \propto \exp\left(-\frac{d^2}{2\sigma^2}\right) + \lambda$$

The $\lambda$ floor keeps one bad beam from giving the particle probability zero. $\sigma$ is a few tens of centimetres, larger than the lidar's 2 cm, because the grid is 0.5 m and the car slips. Beams at `max_range` are skipped. They did not hit the map.

The starter's `map.field` is that lookup, precomputed, in centimetres, so the 20 Hz tick does not rebuild it. A 0 is an occupied cell. `map.segments` is the wall list the grid came from: packed edges $x_0, y_0, x_1, y_1$. It is on the allow-list. The true pose is not.

A likelihood field ignores beams that pass through a wall and hit a second wall, because it only looks at the endpoint. That is acceptable here. The yards do not have many thin false openings at scan height. A beam model would raycast. It is more correct and too slow for this tick if you do it for every particle and every beam.

## Why a long wall does not tell you how far you have driven

Slide a pose along a long straight wall by a distance $s$, and keep the heading. Every beam that hit that wall still hits it, at the same range. The endpoint moved along the wall, and the distance from the endpoint to the nearest occupied cell did not. So

$$p(z \mid x) \approx p(z \mid x + s\, t)$$

for a tangent $t$ and a shift $s$ that has not yet reached a corner. The likelihood is flat along the corridor. A cloud that is only a few tenths of a metre wide cannot walk a metre of that flat direction by resampling. The mean stays where the motion model left it, and the along-track error is whatever the wheel-speed bias integrated.

A short edge breaks the equality. A cone, a crate, a barrel, a trunk, or a pillar is a segment a couple of metres long, or shorter. A building corner is an endpoint of a long segment. Shift the pose by $s$ along the route tangent $t$ and an endpoint that used to land on that object now lands in an empty cell. Beams whose endpoint is within about 1.6 m of one of those points are scored with a tighter width $\sigma_\ell$. Ordinary wall beams keep $\sigma$.

$$p(z_k \mid x + s t) \propto \exp\left(-\frac{d_k(s)^2}{2\sigma_k^2}\right) + \lambda$$

The particle weights use that same rule, so a cone the cloud has already reached can pull the mean along the corridor. The along-track correction is also a one-dimensional search of the estimate itself, for the case where no particle sits on the true shift. It uses $\sigma_\ell$ on the landmark beams:

$$\hat s = \arg\max_s \left[\sum_k \log p(z_k \mid x + s t) - \kappa s^2\right].$$

Every beam is in the sum, including the ones that just left a landmark. Dropping those is how a shift onto the next crate looks free. The penalty $\kappa s^2$ is what a uniform corridor needs. If every shift scores the same, the maximum is $s = 0$.

The distance grid is constant inside a 0.5 m cell, so a shift of a few tenths often ties with its neighbour. In a trunk row most endpoints already sit on a landmark, and that tie is broken by accepting a smaller improvement over $s = 0$. A sparse cone is the opposite: the peak is sharp, and the shift is taken only when it beats $s = 0$ by a clear margin. Taking every small improvement on a cone walks the pose onto the next one. The starter runs this only after the cloud has collapsed onto a corridor, and it moves the whole cloud with the estimate, at most half a metre per tick. None of this reads the true pose. The points come from `map.segments`. The ranges come from the lidar.

## Name the three deltas in the source

Open `apply_motion` and name $\delta_{\mathrm{rot1}}$, $\delta_{\mathrm{trans}}$, and $\delta_{\mathrm{rot2}}$ in the code. In `likelihood`, find $\sigma$ and the floor added to each beam. If the floor is 0 and one beam misses, that particle's weight goes to zero. `map.field` is a string. Decode it once, not every tick. The stamp is the cache key. The next lesson runs the cloud.
