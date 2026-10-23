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

One pose was never enough. A Bayes filter keeps a belief over poses, where dead reckoning kept one pose. Motion spreads the belief, the way a rumor gets fuzzier each time it is retold. A measurement pulls it back onto the poses that would have produced that measurement.

In the sim: the filter on the oval, pulled back so the cloud fits once it is running. The key names the pink guesses, the yellow ring, and the trails.

The belief $\mathrm{bel}(x_t)$ is a probability distribution over the car's pose at time $t$. You keep either a grid (too big here) or a cloud of weighted samples (the next lesson). The shape of the update is the same either way.

Predict with the motion you commanded, or with the odometry you measured. Then correct with the lidar, using the map. The map is what turns a range into a statement about pose. A range of 4 m, read against the floor plan, rules out every pose where the nearest wall in that direction sits somewhere else.

<svg viewBox="0 0 480 200" role="img" aria-label="Bayes filter loop: predict with motion, update with the scan">
  <rect width="480" height="200" rx="12" fill="#10161a"/>
  <rect x="36" y="70" width="150" height="52" rx="10" fill="#1b2a28" stroke="#2fbfa8"/>
  <rect x="294" y="70" width="150" height="52" rx="10" fill="#2a2416" stroke="#e3a23a"/>
  <text x="62" y="100" fill="#d7fff6" font-size="14" font-family="sans-serif">Predict</text>
  <text x="328" y="100" fill="#f4ead6" font-size="14" font-family="sans-serif">Update</text>
  <line x1="186" y1="88" x2="286" y2="88" stroke="#9fd8cf" stroke-width="2"/>
  <polygon points="294,88 284,83 284,93" fill="#9fd8cf"/>
  <line x1="294" y1="112" x2="194" y2="112" stroke="#e3a23a" stroke-width="2"/>
  <polygon points="186,112 196,107 196,117" fill="#e3a23a"/>
  <text x="196" y="74" fill="#9fd8cf" font-size="12" font-family="sans-serif">motion u</text>
  <text x="196" y="132" fill="#e3a23a" font-size="12" font-family="sans-serif">scan z, map</text>
  <text x="16" y="36" fill="#e7eeea" font-size="14" font-family="sans-serif">One loop, every control tick</text>
  <text x="16" y="176" fill="#8e9b94" font-size="13" font-family="sans-serif">Predict spreads the belief. Update multiplies by how well each pose explains the scan.</text>
</svg>

**Drive it yourself.** The button on the bar lets you steer with WASD or the arrows while this same filter keeps running. Click the 3D view first so the keys reach the car. The pink cloud, the yellow ring, and the trails update from the scan you are driving through.

## Predict, then correct

The continuous Bayes filter is

$$\overline{\mathrm{bel}}(x_t) = \int p(x_t \mid x_{t-1}, u_t)\, \mathrm{bel}(x_{t-1})\, dx_{t-1}$$

$$\mathrm{bel}(x_t) = \eta\, p(z_t \mid x_t)\, \overline{\mathrm{bel}}(x_t)$$

$\eta$ makes the belief integrate to 1. $u_t$ is the motion. $z_t$ is the scan. $\eta$ is "divide by the sum." The predict step uses the odometry **delta**. Replacing every particle with the odometry pose each tick would throw the filter away and leave you with dead reckoning again.

The motion model in the running program turns that delta into three noisy numbers and adds them to every guess.

{{code:apply_motion}}

## A motion model in three numbers

Take the odometry pose before and after the tick, and turn the difference into a rotate-translate-rotate:

$$\delta_{\mathrm{rot1}} = \operatorname{atan2}(\Delta y, \Delta x) - \theta_0,\quad \delta_{\mathrm{trans}} = \sqrt{\Delta x^2 + \Delta y^2},\quad \delta_{\mathrm{rot2}} = \Delta\theta - \delta_{\mathrm{rot1}}.$$

Each particle applies those three numbers plus Gaussian noise. The noise keeps a little diversity in the cloud, so a bad scan still leaves someone near the truth. When $\delta_{\mathrm{trans}}$ is almost zero, $\delta_{\mathrm{rot1}}$ is mostly noise, so the starter treats a tiny step as a pure rotation.

## A likelihood field

A likelihood field asks a simple question of each beam. Take the endpoint, place it in the world as if this particle's pose were true, and look up the distance $d$ to the nearest occupied cell. A pose that drops the endpoint on a wall scores well. A pose that drops it in the middle of the aisle scores badly.

$$p(z \mid x) \propto \exp\left(-\frac{d^2}{2\sigma^2}\right) + \lambda$$

The $\lambda$ floor keeps one bad beam from zeroing the particle. $\sigma$ is a few tens of centimeters, larger than the lidar's 2 cm, because the grid is 0.5 m and the car slips. Beams at `max_range` are skipped. They missed the map.

<svg viewBox="0 0 480 220" role="img" aria-label="Likelihood field: a beam endpoint scored by its distance to the wall">
  <rect width="480" height="220" rx="12" fill="#10161a"/>
  <line x1="40" y1="48" x2="440" y2="48" stroke="#9aa7a0" stroke-width="8"/>
  <rect x="40" y="52" width="400" height="28" fill="#3a3420" opacity="0.9"/>
  <rect x="40" y="80" width="400" height="22" fill="#2a2820" opacity="0.7"/>
  <line x1="200" y1="150" x2="250" y2="56" stroke="#8dfff2" stroke-width="2"/>
  <circle cx="250" cy="56" r="5" fill="#ffb020"/>
  <line x1="250" y1="56" x2="250" y2="48" stroke="#ffd400" stroke-width="2"/>
  <text x="256" y="78" fill="#ffd400" font-size="13" font-family="sans-serif">d</text>
  <text x="160" y="170" fill="#8dfff2" font-size="13" font-family="sans-serif">beam from this guess</text>
  <text x="16" y="200" fill="#8e9b94" font-size="13" font-family="sans-serif">Bright band: cells on the wall. The score falls off with d, the gap from the endpoint to that band.</text>
</svg>

The starter's `map.field` is that lookup, precomputed, in centimeters, so the 20 Hz tick reads a table. A 0 is an occupied cell. `map.segments` is the wall list the grid came from: packed edges $x_0, y_0, x_1, y_1$. The true pose stays off the sample.

The field scores the endpoint. A beam that passed through one wall and hit a second one still contributes its endpoint. These worlds have few thin false openings at scan height, so that shortcut holds. A beam model would raycast. It is the stricter question, and it is too slow here if you ask it for every particle and every beam.

The scoring function in the program:

{{code:likelihood}}

## A long wall, then a cone

Slide along a long straight wall and the scan barely changes. Every beam that hit the wall still hits it, at the same range, so many poses along that wall explain the scan equally well. The cloud stays where the motion step left it.

A cone, a crate, or a corner breaks that tie. Roll past it and the endpoint that used to land on the object now lands in empty space. The filter scores those short edges a little more tightly than a flat wall, which is what lets the estimate move along the corridor. The blocks above are the part of the running filter this page is about. The oval demo keeps the rest of the program loaded so the car still drives while you read.

## Try it

1. In the motion block, name $\delta_{\mathrm{rot1}}$, $\delta_{\mathrm{trans}}$, and $\delta_{\mathrm{rot2}}$.
2. In the likelihood block, find $\sigma$ and the floor added to each beam. A floor of 0 lets one missed beam zero that particle.
3. Turn on Drive it yourself and drive a slow arc. The yellow ring should stay small once the cloud has settled, and grow if you spin in place.
