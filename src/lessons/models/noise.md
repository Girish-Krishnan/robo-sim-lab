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

The plots look noisy, and they also look biased. Those are different, and only one of them is why the oval path walks off. This lesson runs pure pursuit with the path trails on, seed 1, so the late amber trail is the bias and not a fresh draw.

**White noise** is a fresh random number every sample. On the lidar it is about 2 cm. On wheel speed it is about 2 cm/s. On the gyro it is about 0.002 rad/s. Averaged over a second of 20 Hz control, a lot of it shrinks.

**Bias** is drawn once when you reset and then held. Speed bias scales every metre you travel. Gyro bias turns every second into a little extra yaw. Steering bias shows up on `steering_angle` and is not integrated into the pose. If you build your own heading from $\tan(\delta)$, you put that bias back into the curvature and the amber trail will leave the oval.

The eval fixes the seed at 1 so a push to the course can be compared with the last one. **Reset seed** in the header replays the draw. A different seed is a different car, in the sensor sense, on the same track.

## Each sensor, written as an equation

Each sensor has a white-noise term, redrawn every sample, and some have a bias drawn once per reset from the seed. The camera is not one of them. `sensors.camera.available` is false, and there is no image model yet.

**Lidar.** A hit at true range $r$ is reported as

$$z = \mathrm{clip}(r + \mathcal{N}(0, \sigma_r^2),\; 0.05,\; r_{\max}),\quad \sigma_r = 0.02\,\mathrm{m}.$$

That is a 2 cm Gaussian. Beams that miss are left at $r_{\max} = 12$ m and are not given a fake hit. The noise does not grow with range in this model.

**Wheel speed.** The true rear-wheel speed $v$ is published as

$$v_{\mathrm{odom}} = v(1 + b_v) + \mathcal{N}(0, \sigma_v^2)$$

with $\sigma_v = 0.02$ m/s and $b_v \sim \mathcal{N}(0, 0.012^2)$. The 0.012 is a 1.2% scale bias. It is drawn once and then held, so it stretches every metre by the same fraction.

**Gyro.** The true yaw rate $\omega$ is published as

$$\omega_{\mathrm{imu}} = \omega + b_\omega + \mathcal{N}(0, \sigma_\omega^2)$$

with $\sigma_\omega = 0.002$ rad/s and $b_\omega \sim \mathcal{N}(0, 0.0012^2)$ rad/s. The bias is about 0.07 deg/s, one sigma.

**Odometry** integrates those two samples and nothing else:

$$x \leftarrow x + v_{\mathrm{odom}}\cos\theta\,\Delta t,\quad y \leftarrow y + v_{\mathrm{odom}}\sin\theta\,\Delta t,\quad \theta \leftarrow \theta + \omega_{\mathrm{imu}}\,\Delta t.$$

Steering noise ($\sigma = 0.003$ rad, bias standard deviation 0.004 rad) is added to `steering_angle` only. It is not inside this integral. Accelerometer noise (0.04 m/s², bias 0.02 m/s²) is on `sensors.imu.accel` and is not integrated either.

## Why the fraction stays, and the square root shrinks

A speed bias $b_v$ on a true distance $s$ reports about $s(1+b_v)$. The end error along the path is about $s b_v$, a fixed fraction. White speed noise averages down as $1/\sqrt{N}$ samples. The bias does not, so after a long run the fraction is $b_v$, not a random walk. For seed 1 the straight-line fraction is on the order of half a percent to a couple of percent, depending on the draw. The gate used in the eval is 5% of distance, which this model stays under.

A gyro bias $b_\omega$ shifts every sample by the same amount. Integrated, that is a ramp, not a random walk of the noise:

$$\theta(t) = \theta_{\mathrm{true}}(t) + b_\omega t + \text{averaged noise}.$$

Cross-track on a path tracker that trusts $\theta$ then grows with time even if the feedback law is perfect. On the oval, pure pursuit's cross-track against the true centreline is about **0.18 m in the first 15 seconds** and about **2.23 m after 45 seconds**. Same gains. The late number is the bias, integrated.

Lidar noise does not accumulate. A wall that was 3.20 m away is still about 3.20 m away a minute later, plus or minus 2 cm. That is why a map plus a lidar can correct a pose that odometry cannot.

If you low-pass the gyro to "remove the bias", you remove the turn too, unless the filter also sees another sensor. The particle filter in the localization module is that other sensor. Smoothing alone will not hold the oval. Do not crank the bias down to make the pictures pretty. The amber trail leaving the car is the lesson.

When you read a contact sheet or a path plot, the coloured line is truth, the amber line is odometry, and a red dot is a real contact. An empty physics pair, where the broadphase noticed two shapes but the contact had no points, is counted separately and is not a hit.

## See the late trail, then change only the seed

Run pure pursuit on the oval for a full minute. The amber trail should be subtle at 10 seconds and obvious late. Reset the seed and run the same program. The direction of the drift should change, or its size should. The controller source did not. Add a print of the forward lidar range while you are on a straight, once a second. The number should jitter by centimetres, not walk off by metres. That is the contrast with yaw.
