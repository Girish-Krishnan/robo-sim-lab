---
title: Lidar
order: 2
world: city
spawn: default
starter: avoid
action: lab
prerequisites: getting-started/sensors
status: ready
---

The lidar is a spinning range finder in a plane about a metre off the ground. Each control tick you get one full scan: 270 beams across a 270° field of view, so the beams are about 1° apart. A roundabout and a row of lamp posts give the fan something to hit.

In the sim: city streets, with the scan drawn.

Angle 0 points forward. Positive angles point to the driver's left. The scan does not cover the rear 90°, so something directly behind the car is invisible until you yaw.

A beam that hits nothing is reported as `max_range`, 12 m. That is not a wall at 12 m. Every real controller in this course treats "equal to max range" as empty. Range noise is about 2 cm, one sigma, which is in the band of a small outdoor lidar such as a Hokuyo UST-10LX. We publish every fourth hardware angle so the browser can keep up. The field of view and the 12 m range stay.

The ray starts at the roof puck, not at the bumper. The nose of the body is about 0.7 m in front of that puck. A program that drives until the forward range is 0.2 m has already hit something.

<svg viewBox="0 0 440 250" role="img" aria-label="Lidar beam angles">
  <rect width="440" height="250" rx="12" fill="#10161a"/>
  <polygon points="220,150 250,168 190,168" fill="#2fbfa8"/>
  <line x1="220" y1="150" x2="220" y2="48" stroke="#f4f1ea" stroke-width="2"/>
  <line x1="220" y1="150" x2="120" y2="70" stroke="#9fd8cf" stroke-width="2"/>
  <line x1="220" y1="150" x2="320" y2="70" stroke="#e3a23a" stroke-width="2"/>
  <path d="M220 110 A 40 40 0 0 1 248 98" fill="none" stroke="#9fd8cf" stroke-width="1.5"/>
  <text x="196" y="36" fill="#f4f1ea" font-size="13" font-family="sans-serif">0 forward</text>
  <text x="16" y="64" fill="#9fd8cf" font-size="13" font-family="sans-serif">positive, left</text>
  <text x="300" y="64" fill="#e3a23a" font-size="13" font-family="sans-serif">negative, right</text>
  <text x="16" y="214" fill="#8e9b94" font-size="13" font-family="sans-serif">270 degree field.</text>
  <text x="16" y="234" fill="#8e9b94" font-size="13" font-family="sans-serif">The rear wedge is blank.</text>
</svg>

## From a beam to a point on the ground

Beam $i$ has angle $\alpha_i$ in the robot frame. Its direction is

$$d_x = \sin\alpha_i,\quad d_y = 0,\quad d_z = \cos\alpha_i$$

in the body, with x left, y up, z forward. If the measured range is $r$, the hit relative to the puck is $r\,(\sin\alpha_i,\, 0,\, \cos\alpha_i)$. In the odometry plane, with the car at $(x, y)$ and yaw $\theta$,

$$x_{\mathrm{hit}} = x + (0.46 + r\cos\alpha_i)\cos\theta - r\sin\alpha_i\sin\theta$$

$$y_{\mathrm{hit}} = y + (0.46 + r\cos\alpha_i)\sin\theta + r\sin\alpha_i\cos\theta$$

The 0.46 m is the puck's forward offset from the body origin. The localization lesson uses this endpoint. A beam at `max_range` has no endpoint you should trust.

The right-hand wall in the wall-follow lesson is the beam near $-\pi/2$, not $+\pi/2$. Positive is left. A controller that flips that sign orbits the wrong way and calls it a bug in the plant.

Trees and shelf uprights are thinner than the gap the car needs. One long beam between two trunks does not mean the bumper fits. The avoid example blocks a wedge about as wide as the car around each hit for that reason. Curbs, floor paint, and the start chevron are invisible. If your map or your controller expects them, it will drive through them and then be surprised by the thing behind them.

## Look at the blank wedge

Run the avoid starter and watch the inset. Find a beam at the edge of the fan and confirm the rear is empty of rays. Print the angle and range of the shortest beam once a second and watch the range fall as you approach a wall, then stick at a small number when you are close. Temporarily treat `max_range` as a real hit at 12 m, by removing the usual check, and watch the car brake for empty space.
