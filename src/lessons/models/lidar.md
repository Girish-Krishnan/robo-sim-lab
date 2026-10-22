---
title: Lidar
order: 2
world: track
spawn: avoid
starter: avoid
action: lab
prerequisites: getting-started/sensors
status: ready
---

The lidar is a spinning range finder in a plane about a metre off the ground. Each control tick you get one full scan: 270 beams across a 270° field of view, so the beams are about 1° apart. On the oval the inner wall and the cones give the fan something solid to hit.

In the sim: the oval, with the avoid program running and the scan drawn. The corner inset is the same scan from above. Amber dots are the close hits.

Angle 0 points forward. Positive angles point to the driver's left. The rear 90° is a blank wedge, so something directly behind the car stays invisible until you yaw.

A beam that hits nothing is reported as `max_range`, 12 m. Treat "equal to max range" as empty air. Every real controller in this course does. Range noise is about 2 cm, one sigma, in the band of a small outdoor lidar such as a Hokuyo UST-10LX. We publish every fourth hardware angle so the browser can keep up. The field of view and the 12 m range stay.

The ray starts at the roof puck. The nose of the body is about 0.7 m in front of that puck, so a program that drives until the forward range is 0.2 m has already arrived.

<svg viewBox="0 0 480 250" role="img" aria-label="Lidar beam angles, forward zero and a blank rear wedge">
  <rect width="480" height="250" rx="12" fill="#10161a"/>
  <polygon points="240,156 268,176 212,176" fill="#2fbfa8"/>
  <line x1="240" y1="156" x2="240" y2="42" stroke="#f4f1ea" stroke-width="2"/>
  <line x1="240" y1="156" x2="132" y2="64" stroke="#9fd8cf" stroke-width="2"/>
  <line x1="240" y1="156" x2="348" y2="64" stroke="#e3a23a" stroke-width="2"/>
  <path d="M240 112 A 44 44 0 0 1 272 96" fill="none" stroke="#9fd8cf" stroke-width="1.5"/>
  <text x="214" y="30" fill="#f4f1ea" font-size="13" font-family="sans-serif">0 forward</text>
  <text x="16" y="58" fill="#9fd8cf" font-size="13" font-family="sans-serif">positive, left</text>
  <text x="318" y="58" fill="#e3a23a" font-size="13" font-family="sans-serif">negative, right</text>
  <path d="M196 196 A 70 70 0 0 0 284 196" fill="none" stroke="#5c6b66" stroke-width="8" stroke-linecap="round"/>
  <text x="16" y="214" fill="#8e9b94" font-size="13" font-family="sans-serif">270 degree fan. The grey arc is the rear wedge with no beams.</text>
  <text x="16" y="234" fill="#8e9b94" font-size="13" font-family="sans-serif">A hit at max range is empty air, kept at 12 m.</text>
</svg>

## From a beam to a point on the ground

Beam $i$ has angle $\alpha_i$ in the robot frame. Its direction is

$$d_x = \sin\alpha_i,\quad d_y = 0,\quad d_z = \cos\alpha_i$$

in the body, with x left, y up, z forward. If the measured range is $r$, the hit relative to the puck is $r\,(\sin\alpha_i,\, 0,\, \cos\alpha_i)$. In the odometry plane, with the car at $(x, y)$ and yaw $\theta$,

$$x_{\mathrm{hit}} = x + (0.46 + r\cos\alpha_i)\cos\theta - r\sin\alpha_i\sin\theta$$

$$y_{\mathrm{hit}} = y + (0.46 + r\cos\alpha_i)\sin\theta + r\sin\alpha_i\cos\theta$$

The 0.46 m is the puck's forward offset from the body origin. The localization lessons use this endpoint. A beam at `max_range` has no endpoint worth trusting.

The right-hand wall in the wall-follow lesson is the beam near $-\pi/2$. Positive is left. A controller that flips that sign orbits the other way.

Trees and shelf uprights are thinner than the gap the car needs. One long beam between two trunks can be a crack the bumper will never fit. The avoid program paints a wedge about as wide as the car around each hit, then looks for an opening in what remains.

Here is that helper. `wide` is the scan after each return has blocked its neighbours.

{{code:inflate}}

Curbs, floor paint, and the start chevron sit below the scan plane. A map or a controller that expects them will drive over the paint and meet the wall behind it.

## Try it

1. Run the avoid starter and watch the inset. Find a beam at the edge of the fan and confirm the rear is empty of rays.
2. Print the angle and range of the shortest beam once a second. The range should fall as you approach a wall, then sit at a small number when you are close.
3. Temporarily treat `max_range` as a real hit at 12 m and watch the car brake for empty space. Put the check back.
