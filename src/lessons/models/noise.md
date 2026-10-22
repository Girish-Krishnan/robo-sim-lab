---
title: Noise and bias
order: 5
world: track
spawn: pursuit
starter: pursuit
action: lab
prerequisites: models/imu
status: ready
---

The plots look jittery, and they also look slowly wrong. Those are two different animals. White noise is a fresh coin flip every sample. Bias is one coin flip at the start of the run, then held, so the late error is that single draw, grown up.

In the sim: pure pursuit on the oval, seed 1. The late amber trail is that held bias.

**White noise** is a fresh random number every sample. On the lidar it is about 2 cm. On wheel speed it is about 2 cm/s. On the gyro it is about 0.002 rad/s. Averaged over a second of 20 Hz control, a lot of it shrinks.

**Bias** is drawn once when you reset and then held. Speed bias scales every metre you travel. Gyro bias turns every second into a little extra yaw. Steering bias shows up on `steering_angle` and stays out of the pose. A heading you build from $\tan(\delta)$ puts that bias back into the curvature, and the amber trail leaves the oval.

**Reset seed** replays the same draw. A different number in the seed box is a different car, in the sensor sense, on the same track.

## Each sensor, written as an equation

Each sensor has a white-noise term, redrawn every sample, and some have a bias drawn once per reset from the seed. The camera is reserved: `sensors.camera.available` is false, and there is no image model yet.

**Lidar.** A hit at true range $r$ is reported as

$$z = \mathrm{clip}(r + \mathcal{N}(0, \sigma_r^2),\; 0.05,\; r_{\max}),\quad \sigma_r = 0.02\,\mathrm{m}.$$

That is a 2 cm Gaussian. Beams that miss stay at $r_{\max} = 12$ m. The noise stays the same size at every range in this model.

**Wheel speed.** The true rear-wheel speed $v$ is published as

$$v_{\mathrm{odom}} = v(1 + b_v) + \mathcal{N}(0, \sigma_v^2)$$

with $\sigma_v = 0.02$ m/s and $b_v \sim \mathcal{N}(0, 0.012^2)$. The 0.012 is a 1.2% scale bias, drawn once and then held, so it stretches every metre by the same fraction.

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

Cross-track on a path tracker that trusts $\theta$ then grows with time even when the feedback law is steady. On the oval, pure pursuit's cross-track against the true centreline is about **0.18 m in the first 15 seconds** and about **2.23 m after 45 seconds**. Same gains. The late number is the bias, integrated.

Lidar noise stays local. A wall that was 3.20 m away is still about 3.20 m away a minute later, plus or minus 2 cm. A map plus a lidar can therefore correct a pose that odometry has walked away.

The program below is the pursuit law riding that drifting pose. The amber trail leaving the car is the lesson the gains are there to show.

{{code:lookahead}}

On the view, the coloured line is where the car went and the amber line is odometry. The key in the corner uses the same colours.

Note: smoothing the gyro to "take the bias out" also takes the turn out, until another sensor says which part was the turn. The particle filter later in the course is that other sensor.

## Try it

1. Run pure pursuit on the oval for a full minute. The amber trail should be subtle at 10 seconds and obvious late.
2. Reset the seed and run the same program. The direction of the drift should change, or its size should. The controller source stayed put.
3. Print the forward lidar range once a second on a straight. The number should jitter by centimetres. That is the contrast with yaw.
