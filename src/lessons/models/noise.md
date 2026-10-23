---
title: Noise and bias
order: 5
world: track
spawn: pursuit
worlds: city, track, forest, warehouse
starter: none
action: drive
prerequisites: models/imu
status: ready
---

The plots look jittery, and they also look slowly wrong. Those are two different animals. White noise is a fresh coin flip every sample. Bias is one coin flip at the start of the run, then held, so the late error is that single draw, grown up.

In the sim: you drive the oval, seed 1. The colored trail is the car and the blue trail is the guess. The graph is the distance between them as the clock runs. Pause stops the car, the clock, and the graph together. The same drive works in the other worlds.

<svg viewBox="0 0 520 240" role="img" aria-label="White noise jitters around the truth. A bias walks away and stays walked away.">
  <rect width="520" height="240" rx="12" fill="#0e1418"/>
  <line x1="40" y1="150" x2="490" y2="150" stroke="#3d4a44" stroke-width="2"/>
  <text x="400" y="174" fill="#d5ddd8" font-size="15" font-family="sans-serif">truth</text>
  <path d="M40 146 L70 158 L100 140 L130 162 L160 144 L190 156 L220 138 L250 160 L280 148 L310 142 L340 158 L370 146" fill="none" stroke="#ffd24a" stroke-width="2"/>
  <path d="M40 150 V118 H490" fill="none" stroke="#6ea8ff" stroke-width="3"/>
  <text x="48" y="36" fill="#f4f7f4" font-size="18" font-family="sans-serif">Two kinds of wrong</text>
  <text x="48" y="200" fill="#ffd24a" font-size="16" font-family="sans-serif">Yellow: white noise, a fresh error every sample.</text>
  <text x="48" y="224" fill="#6ea8ff" font-size="16" font-family="sans-serif">Blue: a bias, drawn once, then held.</text>
</svg>

**White noise** is a fresh random number every sample. On the lidar it is about 2 cm. On wheel speed it is about 2 cm/s. On the gyro it is about 0.002 rad/s. Averaged over a second of 20 Hz control, a lot of it shrinks.

**Bias** is drawn once from the seed and then held. Reset run replays that same draw. Speed bias scales every meter you travel. Gyro bias turns every second into a little extra yaw. Steering bias shows up on `steering_angle` and stays out of the pose. A heading you build from $\tan(\delta)$ puts that bias back into the curvature, and the blue trail leaves the road.

This page has no program, so the draw is seed 1. Reset run replays it. Open Code and change `SEED` at the top of the file when you want a different coin flip.

## Each sensor, written as an equation

Each sensor has a white-noise term, redrawn every sample, and some have a bias drawn once per reset from the seed. The camera is reserved: `sensors.camera.available` is false, and there is no image model yet.

**Lidar.** A hit at true range $r$ is reported as

$$z = \mathrm{clip}(r + \mathcal{N}(0, \sigma_r^2),\; 0.05,\; r_{\max}),\quad \sigma_r = 0.02\,\mathrm{m}.$$

That is a 2 cm Gaussian. Beams that miss stay at $r_{\max} = 12$ m. The noise stays the same size at every range in this model.

**Wheel speed.** The true rear-wheel speed $v$ is published as

$$v_{\mathrm{odom}} = v(1 + b_v) + \mathcal{N}(0, \sigma_v^2)$$

with $\sigma_v = 0.02$ m/s and $b_v \sim \mathcal{N}(0, 0.012^2)$. The 0.012 is a 1.2% scale bias, drawn once and then held, so it stretches every meter by the same fraction.

**Gyro.** The true yaw rate $\omega$ is published as

$$\omega_{\mathrm{imu}} = \omega + b_\omega + \mathcal{N}(0, \sigma_\omega^2)$$

with $\sigma_\omega = 0.002$ rad/s and $b_\omega \sim \mathcal{N}(0, 0.0012^2)$ rad/s. The bias is about 0.07 deg/s, one sigma.

**Odometry** integrates those two samples:

$$x \leftarrow x + v_{\mathrm{odom}}\cos\theta\,\Delta t,\quad y \leftarrow y + v_{\mathrm{odom}}\sin\theta\,\Delta t,\quad \theta \leftarrow \theta + \omega_{\mathrm{imu}}\,\Delta t.$$

Steering noise ($\sigma = 0.003$ rad, bias standard deviation 0.004 rad) is added to `steering_angle` only. Accelerometer noise (0.04 m/s², bias 0.02 m/s²) is on `sensors.imu.accel`. The pose integral uses wheel speed and yaw rate.

## Why the fraction stays, and the square root shrinks

A speed bias $b_v$ on a true distance $s$ reports about $s(1+b_v)$. The end error along the path is about $s b_v$, a fixed fraction. White speed noise averages down as $1/\sqrt{N}$ samples. The bias stays, so after a long run the fraction is $b_v$, usually under a couple of percent on a straight line.

A gyro bias $b_\omega$ shifts every sample by the same amount. Integrated, that is a ramp:

$$\theta(t) = \theta_{\mathrm{true}}(t) + b_\omega t + \text{averaged noise}.$$

A heading error then grows with time even when your hands are steady. Drive a long straight and watch the graph: the early gap is small, and the late gap is the bias, integrated. The drift lesson puts a path tracker on this same guess and measures what that costs. On the oval that controller's cross-track against the true centerline is about 0.18 m in the first 15 seconds and about 2.23 m after 45 seconds. Same gains. The late number is this bias.

Lidar noise stays local. A wall that was 3.20 m away is still about 3.20 m away a minute later, plus or minus 2 cm. A map plus a lidar can therefore correct a pose that odometry has walked away.

On the view, the colored line is where the car went and the blue line is odometry. The key on the view uses the same colors. The graph is that gap, live, in meters.

Note: smoothing the gyro to "take the bias out" also takes the turn out, until another sensor says which part was the turn. The particle filter later in the course is that other sensor.

## Try it

1. Drive the east straight, then keep going. At about 10 s the blue trail is still subtle. Late in the minute it should be obvious, and the graph should say so. Pause if you want to look.
2. Press Reset run and drive the same way. The peel should come back on the same side. That is seed 1 again.
3. Creep toward a wall and watch the lidar inset. The ranges jitter by centimeters. The heading does not jitter itself back onto the truth. That is the contrast.
