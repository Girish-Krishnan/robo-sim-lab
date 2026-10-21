---
title: Wall following
order: 3
world: track
spawn: wall
starter: wall
action: lab
prerequisites: reactive/avoid
status: ready
---

Wall following steers to hold a distance from the wall on the driver's right. On the oval that wall is the inner wall of the east straight. The same program then has to survive the corner, where the wall ends for a moment and comes back on the next straight.

In the sim: the east straight, inner wall on the right, with the trails on so a lap is easy to see.

Two beams do most of the work. The beam near $-90^\circ$ measures the side distance. The beam near $-45^\circ$ sees the wall ahead of the rear axle, so the car can start turning before the side beam falls off the end. The target distance is 3.2 m, which puts the car in the lane rather than scraping the wall or driving down the middle toward the cones.

Outside a corner the car creeps, then turns, then picks the wall up again. If the bumper is in the wall, it reverses. The steering sign while reversing is the one that yaws the nose the way you want. Positive steer while going backward yaws the nose right. The starter's backup uses that.

Speed is not constant. On a long straight with the wall parallel and nothing close in front, it runs. Into a bend, or when the forward range drops, it slows. A fast car cannot start braking at the same instant the side beam loses the wall.

## Distance now, and distance a step ahead

Let $d$ be the side range and $d^\star = 3.2$ m. A lookahead correction uses the angle $\alpha$ between the side beam and the diagonal beam, so a predicted distance is

$$d_{\mathrm{future}} = d + L_{\mathrm{look}}\sin\alpha.$$

The steering law in the starter is

$$\delta = K_p (d^\star - d_{\mathrm{future}}) - K_d \alpha$$

with $K_p = 0.16$, $K_d = 0.55$, and $L_{\mathrm{look}} = 1.8$ m. The minus on the $\alpha$ term is the damping. $\alpha$ positive means the wall is opening in a way that needs a turn back toward it. Flipping that sign makes the car swing away and then lose the wall.

This is a PD law on distance. The "D" is not a filtered $\dot d$ from the last tick, because a single noisy range difference at 20 Hz is a bad derivative. The angle between two beams is a geometric stand-in for the heading error, and it is available in one scan.

The right-hand wall is negative lidar angle. If you index the $+90^\circ$ beam you are following the left wall and the gains will wind you into it. A corner is not a large distance error. The side range goes to max range because the wall ended, not because you drifted to 12 m. The starter treats "side beam lost, diagonal beam still there" as a corner, and it coasts straight for a few ticks so the rear axle reaches the turn before the steer comes in. If you react to max range as a huge error, you will steer hard at the wrong time.

The oval should complete a lap with no real contact. If you retune $K_p$ up to make the straight look tighter, check the corner before you trust it.

## Take the damping out

Run the starter on the oval. It should stay off the wall and the cones and finish a lap. Set $K_d$ to 0 and run the same straight. The car should oscillate toward and away from the wall. Swap the sign of the $K_d \alpha$ term only. The corner should throw the car off the wall. Put the minus sign back.
