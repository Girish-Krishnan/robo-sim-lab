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

Wall following steers to hold a distance from the wall on the driver's right. On the oval that wall is the inner wall of the east straight. The same program then has to survive the corner, where the wall ends for a moment and comes back on the next straight. It is the same habit as walking a corridor with your shoulder a constant distance from the wall: you feel the gap now, and you also feel whether you are aimed into the plaster.

In the sim: the east straight, inner wall on the right, with the trails on so a lap is easy to see.

Two beams do most of the work. The beam near $-90^\circ$ measures the side distance. The beam near $-45^\circ$ sees the wall ahead of the rear axle, so the car can start turning before the side beam falls off the end. The target distance is 3.2 m, which puts the car in the lane.

Outside a corner the car creeps, then turns, then picks the wall up again. If the bumper is in the wall, it reverses. Positive steer while going backward yaws the nose right, because yaw rate flips with the sign of speed. The starter's backup uses that.

Speed follows the situation. On a long straight with the wall parallel and nothing close in front, the car runs. Into a bend, or when the forward range drops, it slows. A fast car that waits until the side beam loses the wall has already missed the turn.

The side beam and the diagonal beam come from one small helper. Centre $-90^\circ$ is the right-hand wall.

{{code:beams}}

<svg viewBox="0 0 480 250" role="img" aria-label="Wall-follow error: side distance, target gap, and the angle alpha">
  <rect width="480" height="250" rx="12" fill="#10161a"/>
  <line x1="70" y1="36" x2="70" y2="210" stroke="#9aa7a0" stroke-width="8"/>
  <text x="16" y="28" fill="#9aa7a0" font-size="13" font-family="sans-serif">wall</text>
  <polygon points="210,150 250,168 190,168" fill="#2fbfa8"/>
  <line x1="70" y1="158" x2="210" y2="158" stroke="#e3a23a" stroke-width="2"/>
  <line x1="70" y1="90" x2="220" y2="140" stroke="#9fd8cf" stroke-width="2"/>
  <line x1="130" y1="40" x2="130" y2="210" stroke="#355850" stroke-width="1" stroke-dasharray="4 3"/>
  <text x="78" y="150" fill="#e3a23a" font-size="13" font-family="sans-serif">d</text>
  <text x="96" y="36" fill="#8e9b94" font-size="12" font-family="sans-serif">target 3.2 m</text>
  <text x="228" y="120" fill="#9fd8cf" font-size="18" font-family="sans-serif">α</text>
  <text x="16" y="232" fill="#d5ddd8" font-size="15" font-family="sans-serif">d is the −90° beam. α comes from comparing it with the −45° beam.</text>
</svg>

## Distance now, and distance a step ahead

Let $d$ be the side range and $d^\star = 3.2$ m. A lookahead correction uses the angle $\alpha$ between the side beam and the diagonal beam, so a predicted distance is

$$d_{\mathrm{future}} = d + L_{\mathrm{look}}\sin\alpha.$$

The steering law in the starter is

$$\delta = K_p (d^\star - d_{\mathrm{future}}) - K_d \alpha$$

with $K_p = 0.16$, $K_d = 0.55$, and $L_{\mathrm{look}} = 1.8$ m. The minus on the $\alpha$ term is the damping. $\alpha$ positive means the wall is opening, and the steer turns back toward it.

These three lines are that error. `future` is the distance the car will have if it holds this heading for `LOOK` metres.

{{code:error}}

The numbers in that law:

{{code:tunables}}

And the line that turns them into a steering command. $K_d$ is the damping gain on $\alpha$. $K_p$ is the gain on the distance error.

{{code:steer}}

This is a PD law on distance. The derivative is the angle between two beams, available in one scan, which is steadier than a noisy range difference at 20 Hz.

The right-hand wall is a negative lidar angle. The $+90^\circ$ beam is the left wall, and the same gains wind you into it. At a corner the side range jumps to max range because the wall ended. The starter treats "side beam lost, diagonal beam still there" as a corner, and it coasts for a few ticks so the rear axle reaches the turn before the steer comes in.

The oval should complete a lap with the car clear of the wall. If you raise $K_p$ to tighten the straight, check the corner before you trust the new gain.

## Try it

1. Run the starter on the oval. It should stay off the wall and the cones and finish a lap.
2. In the tunables block, set `KD` to `0` and run the same straight. The car should wander toward and away from the wall.
3. In the steer block, change `- KD * alpha` to `+ KD * alpha`. The corner should throw the car off the wall. Put the minus sign back.
