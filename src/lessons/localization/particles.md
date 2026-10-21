---
title: Particle filter
order: 3
world: track
spawn: mcl
starter: mcl
action: lab
prerequisites: localization/bayes
status: ready
---

Monte Carlo localization represents the belief with $N$ poses, the particles. Each one is a guess. The weight is how well that guess explains the current scan. Low-variance resampling keeps the guesses that earned their weight and drops the ones that did not. On the oval the cloud starts near the car.

In the sim: the tracking cloud on the oval, a little above the car, so the dots, the ellipse, and the walls share one picture.

The starter uses a few hundred particles, a few dozen lidar beams, and the precomputed distance field. That is the budget that fits in a 20 Hz Pyodide tick. Using all 270 beams and a few thousand particles will miss the deadline and the car will stutter. The geometry does not need it. Walls are large compared with a 0.5 m cell.

Each particle is a saturated magenta dot a few centimetres off the ground, about 8 px across, with a dark outline so it stays visible on asphalt, grass, and dirt. The marks are drawn after the scene's color grade, so the magenta is not washed into the ground. A short tick, about 28 cm, shows its heading. Brighter dots earned more weight. The weighted-mean estimate is a yellow heading mark. A yellow ellipse around that mean is the 2-sigma contour of the cloud's covariance. The trail of the mean is drawn in red. The green path is the route. The same marks are in the lidar inset. None of these drawings are fed back into the next tick. If you want the estimate, keep it in a variable. Do not read it off the screen.

<svg viewBox="0 0 460 230" role="img" aria-label="Particles against a wall">
  <rect width="460" height="230" rx="12" fill="#10161a"/>
  <line x1="40" y1="36" x2="420" y2="36" stroke="#9aa7a0" stroke-width="6"/>
  <ellipse cx="198" cy="116" rx="78" ry="46" fill="none" stroke="#ffd400" stroke-width="3"/>
  <g fill="#ff2bd6" stroke="#140014" stroke-width="2">
    <circle cx="160" cy="100" r="5"/><circle cx="175" cy="114" r="5"/><circle cx="190" cy="98" r="5"/>
    <circle cx="200" cy="120" r="5"/><circle cx="214" cy="106" r="5"/><circle cx="228" cy="118" r="5"/>
    <circle cx="180" cy="130" r="5"/><circle cx="210" cy="138" r="5"/>
  </g>
  <circle cx="200" cy="110" r="5" fill="#ff5d73"/>
  <line x1="200" y1="110" x2="200" y2="70" stroke="#ffe08a" stroke-width="2"/>
  <text x="16" y="186" fill="#ff2bd6" font-size="13" font-family="sans-serif">particles</text>
  <text x="110" y="186" fill="#ff5d73" font-size="13" font-family="sans-serif">weighted mean</text>
  <text x="250" y="186" fill="#ffe08a" font-size="13" font-family="sans-serif">heading</text>
  <text x="330" y="186" fill="#ffd400" font-size="13" font-family="sans-serif">2σ</text>
  <text x="16" y="214" fill="#9aa7a0" font-size="13" font-family="sans-serif">wall from the known map</text>
</svg>

## Weight, then keep the particles that earned it

Start with particles $x^{[i]}$ and weights $w^{[i]}$, usually uniform after a resample.

**Predict.** Apply the noisy motion model to every particle. In the starter this is a vector of $N$ samples, not a Python loop over particles.

**Weight.** For each particle, sum the log of the per-beam likelihoods:

$$\ell^{[i]} = \sum_k \log p(z_k \mid x^{[i]}),\quad w^{[i]} \propto \exp(\ell^{[i]} - \max_j \ell^{[j]}).$$

Subtracting the max keeps the exponential from underflowing to zero. Then divide by $\sum w$.

**Effective sample size.**

$$N_{\mathrm{eff}} = \frac{1}{\sum_i (w^{[i]})^2}.$$

When $N_{\mathrm{eff}}$ is near $N$, the weights are flat and resampling is a waste. When it falls below about $0.55N$, a few particles own the belief and it is time to resample. The tracking starter uses that threshold.

**Low-variance resampling.** Draw one number $u_0 \sim \mathrm{Uniform}(0, 1/N)$, then take

$$u_i = u_0 + \frac{i}{N},\quad i = 0,\ldots,N-1$$

and pick the particle whose cumulative weight interval contains $u_i$. One random number, $N$ evenly spaced picks. Particles with weight $2/N$ are copied about twice. Particles with weight near zero disappear. After resampling, set every weight back to $1/N$.

**Estimate.** The pose you publish is the weighted mean. Yaw is a circular mean, not an arithmetic mean, or a cloud that straddles $\pm\pi$ averages to 0:

$$\bar\theta = \operatorname{atan2}\left(\sum_i w^{[i]}\sin\theta^{[i]},\; \sum_i w^{[i]}\cos\theta^{[i]}\right).$$

Resampling every tick, with no motion noise, makes every particle a copy of one survivor. That is sample impoverishment. The starter adds a little noise even when the odometry delta is small, and it resamples only when $N_{\mathrm{eff}}$ drops.

The mean is not a particle. It can sit inside a wall if two modes disagree. On these maps one corridor usually wins. If the magenta cloud splits into two blobs, the yellow ellipse grows to cover both, and the red mean sits between them until one blob dies.

Global localization (the kidnapped starter) is the same filter with a different initial cloud. Tracking from the origin is easier and is what flattens the oval. Do not confuse a cloud that started on the answer with a cloud that found the answer.

## Make the cloud too small

Run the starter on the oval. You should see a magenta cloud on the car, a yellow ellipse tight around it, and a red trail that stays with it while the amber odometry trail walks away. Cut `N` to `40` and run again. The mean should jump more. Put `360` back. Force a resample every tick by ignoring $N_{\mathrm{eff}}$. The cloud should look thinner and, after a bad scan, it may not recover. Restore the threshold.
