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

The plots look noisy, and they also look biased. Those are different, and only one of them is why the oval path walks off.

## In plain words

**White noise** is a fresh random number every sample. On the lidar it is about 2 cm. On wheel speed it is about 2 cm/s. On the gyro it is about 0.002 rad/s. Averaged over a second of 20 Hz control, a lot of it shrinks.

**Bias** is drawn once when you reset and then held. Speed bias scales every metre you travel. Gyro bias turns every second into a little extra yaw. Steering bias shows up on `steering_angle` and is not integrated into the pose. If you build your own heading from $\tan(\delta)$, you put that bias back into the curvature and the amber trail will leave the oval.

The eval fixes the seed at 1 so a push to the course can be compared with the last one. **Reset seed** in the header replays the draw. A different seed is a different car, in the sensor sense, on the same track.

## The math

A speed bias $b_v$ on a true distance $s$ reports about $s(1+b_v)$. The end error is $s b_v$, a fixed fraction. For seed 1 the straight-line fraction is on the order of half a percent to a couple of percent, depending on the draw. The gate used in the eval is 5% of distance, which this model stays under.

A gyro bias $b_\omega$ is a random walk of the mean, not of the noise:

$$\theta(t) = \theta_{\mathrm{true}}(t) + b_\omega t + \text{averaged noise}.$$

Cross-track on a path tracker that trusts $\theta$ then grows with time even if the feedback law is perfect. On the oval, pure pursuit's cross-track against the true centreline is about **0.18 m in the first 15 seconds** and about **2.23 m after 45 seconds**. Same gains. The late number is the bias, integrated.

Lidar noise does not accumulate. A wall that was 3.20 m away is still about 3.20 m away a minute later, plus or minus 2 cm. That is why a map plus a lidar can correct a pose that odometry cannot.

## Intuition and pitfalls

If you low-pass the gyro to "remove the bias", you remove the turn too, unless the filter also sees another sensor. The particle filter in the localization module is that other sensor. Smoothing alone will not hold the oval.

Do not crank the bias down to make the pictures pretty. The amber trail leaving the car is the lesson. The localization module is the answer.

When you read a contact sheet or a path plot, the coloured line is truth, the amber line is odometry, and a red dot is a real contact. An empty physics pair, where the broadphase noticed two shapes but the contact had no points, is counted separately and is not a hit.

## Try it

1. Run pure pursuit on the oval for a full minute with Paths on. Note when you can first see the amber trail leave the car. It should be subtle at 10 seconds and obvious late.
2. Reset the seed and run the same program. The direction of the drift should change, or its size should. The controller source did not.
3. Add a print of the forward lidar range while you are on a straight, once a second. The number should jitter by centimetres, not walk off by metres. That is the contrast with yaw.
