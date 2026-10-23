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

Press **Scatter guesses** and watch pink dots fly 7 m out, then pull back onto the car. Dots whose predicted scan matches the real lidar survive; the red dot is where the car thinks it is.

In the sim, the tracking cloud starts in a tight neighborhood of the car, so the first frame already agrees. Scatter guesses is what throws it wide. The Key on the map names the pink dots, the yellow ring, the red trail, and the blue odometry. The red trail is the filter's mean, drawn on top of the dots.

The yellow ring is two standard deviations of the cloud, how far the guesses sit from their mean. A small ring means the guesses agree.

The starter keeps a few hundred guesses and scores a few dozen lidar beams. A wall covers many cells of the known map, so that thinner scan still lands on it, and the car keeps its pace.

{{scatter}}

On a straight every stretch of wall looks the same, so the red mean can sit a few meters ahead or behind with a small ring: confident and wrong. The first corner settles it, usually within 15 s.

The blocks below are one tick of that filter. They are slices of the same program that is driving the oval.

How many guesses, and how far ahead pursuit looks. These names sit at the top of the program:

{{code:settings}}

**Drive it yourself** runs this filter on whatever path you drive. Turn it on, then use WASD or the arrows. Space brakes. The cloud keeps scoring the live scan.

<svg viewBox="0 0 480 250" role="img" aria-label="Predict, update, and resample as a cycle">
  <rect width="480" height="250" rx="12" fill="#10161a"/>
  <rect x="30" y="78" width="120" height="48" rx="10" fill="#1b2a28" stroke="#2fbfa8"/>
  <rect x="180" y="78" width="120" height="48" rx="10" fill="#2a2416" stroke="#e3a23a"/>
  <rect x="330" y="78" width="120" height="48" rx="10" fill="#2a1624" stroke="#ff2bd6"/>
  <text x="58" y="107" fill="#d7fff6" font-size="14" font-family="sans-serif">Predict</text>
  <text x="210" y="107" fill="#f4ead6" font-size="14" font-family="sans-serif">Update</text>
  <text x="348" y="107" fill="#ffd0ef" font-size="14" font-family="sans-serif">Resample</text>
  <path d="M150 102 H180" stroke="#9fd8cf" stroke-width="2"/>
  <path d="M300 102 H330" stroke="#e3a23a" stroke-width="2"/>
  <path d="M390 126 C 390 180, 90 180, 90 126" fill="none" stroke="#ff2bd6" stroke-width="2"/>
  <text x="16" y="36" fill="#e7eeea" font-size="14" font-family="sans-serif">One tick of the particle filter</text>
  <text x="16" y="214" fill="#8e9b94" font-size="13" font-family="sans-serif">Predict moves every guess. Update sets its weight from the scan.</text>
  <text x="16" y="234" fill="#8e9b94" font-size="13" font-family="sans-serif">Resample copies the heavy guesses and drops the light ones.</text>
</svg>

## Weight, then keep the particles that earned it

Start with particles $x^{[i]}$ and weights $w^{[i]}$, usually uniform after a resample.

**Predict.** Apply the noisy motion model to every particle. In the starter this is a vector of $N$ samples.

{{code:apply_motion}}

**Weight.** For each particle, sum the log of the per-beam likelihoods:

$$\ell^{[i]} = \sum_k \log p(z_k \mid x^{[i]}),\quad w^{[i]} \propto \exp(\ell^{[i]} - \max_j \ell^{[j]}).$$

Subtracting the max keeps the exponential from underflowing to zero. Then divide by $\sum w$.

{{code:likelihood}}

**Effective sample size.**

$$N_{\mathrm{eff}} = \frac{1}{\sum_i (w^{[i]})^2}.$$

When $N_{\mathrm{eff}}$ is near $N$, the weights are flat and resampling mostly copies everyone. When it falls below about $0.55N$, a few particles own the belief and it is time to resample. The tracking starter uses that threshold.

**Low-variance resampling.** Draw one number $u_0 \sim \mathrm{Uniform}(0, 1/N)$, then take

$$u_i = u_0 + \frac{i}{N},\quad i = 0,\ldots,N-1$$

and pick the particle whose cumulative weight interval contains $u_i$. One random number, $N$ evenly spaced picks. Particles with weight $2/N$ are copied about twice. Particles with weight near zero disappear. After resampling, set every weight back to $1/N$.

{{code:resample}}

**Estimate.** The pose you publish is the weighted mean. Yaw is a circular mean, so a cloud that straddles $\pm\pi$ stays near the cut instead of averaging to 0:

$$\bar\theta = \operatorname{atan2}\left(\sum_i w^{[i]}\sin\theta^{[i]},\; \sum_i w^{[i]}\cos\theta^{[i]}\right).$$

The starter adds a little noise even when the odometry delta is small, and it resamples when $N_{\mathrm{eff}}$ drops. Resampling every tick with the noise turned off copies one survivor until the cloud is a single point. That collapse is called sample impoverishment.

The mean can sit between two disagreeing clumps, including inside a wall, when the cloud is split. On these maps one corridor usually wins. A pink cloud in two blobs grows the yellow ring until it covers both, and the red mean sits between them until one blob dies.

Note: global localization, the kidnapped starter, is this same filter with a different initial cloud. A cloud that started on the answer and a cloud that found the answer are different experiments. This lesson is the first one.

## Try it

1. Press Scatter guesses. The pink dots should open up, then tighten onto the car. The red mean stays visible on top of the dots, and the blue trail still walks away.
2. In the settings above, cut `N` to `40` and run again. The mean should jump more. Put `360` back.
3. Turn on Drive it yourself and drive onto the infield. The yellow ring should swell while the scan is ambiguous, then tighten when a wall or a cone picks a winner.
