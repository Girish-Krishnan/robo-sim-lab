---
title: The bicycle model
order: 1
world: track
spawn: circle
starter: circle
action: lab
prerequisites: getting-started/robot
status: ready
---

Hold the wheel at a fixed angle and the car draws a circle. The rear axle rolls straight ahead in its own frame. The front axle is steered by an angle $\delta$. A constant $\delta$ is that circle, the way a shopping trolley with the front wheels locked traces one radius around a car park.

In the sim: a fixed steer on an open pad, with the coloured trail showing the circle.

Positive $\delta$ is a left turn. The car sits on the west side of the pad, nose along the pad, so a left circle stays in the grass, the infield, the meadow, or the open warehouse bay.

<svg viewBox="0 0 480 270" role="img" aria-label="Top view of the bicycle model with wheelbase L and turning radius R">
  <rect width="480" height="270" rx="12" fill="#10161a"/>
  <circle cx="150" cy="168" r="4" fill="#9fd8cf"/>
  <text x="96" y="156" fill="#9fd8cf" font-size="13" font-family="sans-serif">centre</text>
  <line x1="150" y1="168" x2="292" y2="168" stroke="#9fd8cf" stroke-width="1.5"/>
  <text x="200" y="160" fill="#9fd8cf" font-size="14" font-family="sans-serif">R</text>
  <path d="M292 168 A 142 142 0 0 1 250 70" fill="none" stroke="#355850" stroke-width="8" stroke-linecap="round"/>
  <line x1="292" y1="168" x2="250" y2="96" stroke="#f4f1ea" stroke-width="3"/>
  <line x1="236" y1="78" x2="262" y2="58" stroke="#f4d03f" stroke-width="3"/>
  <text x="258" y="128" fill="#f4f1ea" font-size="14" font-family="sans-serif">L</text>
  <text x="268" y="54" fill="#f4d03f" font-size="13" font-family="sans-serif">steer</text>
  <text x="16" y="28" fill="#e7eeea" font-size="14" font-family="sans-serif">Fixed steer, one radius</text>
  <text x="16" y="232" fill="#8e9b94" font-size="13" font-family="sans-serif">White bar: rear axle to front axle, the wheelbase L.</text>
  <text x="16" y="252" fill="#8e9b94" font-size="13" font-family="sans-serif">Yellow bar: steered front axle. R = L / tan(steer).</text>
</svg>

## Why the rear axle is the reference point

The rear axle only rolls. Its velocity lies along the heading, and the yaw rate is whatever the front wheels demand. With rear-axle speed $v$ and yaw $\theta$ measured from the x axis:

$$\dot{x} = v\cos\theta,\quad \dot{y} = v\sin\theta,\quad \dot{\theta} = \frac{v}{L}\tan\delta$$

The curvature is $\kappa = \tan\delta / L$, and the radius is $R = 1/|\kappa|$. For the starter, $\delta = 0.34$ rad and $L = 1.9$ m, so

$$R = \frac{1.9}{\tan 0.34} \approx 5.4\,\mathrm{m}.$$

A larger $|\delta|$ is a tighter circle, until the steering hits its stop. Speed leaves the radius alone in this kinematic model. On this car, speed does change the path, because the tires run out of lateral force and the body slides. The circle starter uses a modest throttle so the trail stays close to that 5.4 m.

The running program is that constant command. Change the first number and the radius changes with it.

{{code:drive}}

## One step of the motion model

Over a short time $\Delta t$ a discrete step is

$$x \leftarrow x + v\cos\theta\,\Delta t,\quad y \leftarrow y + v\sin\theta\,\Delta t,\quad \theta \leftarrow \theta + \frac{v}{L}\tan\delta\,\Delta t.$$

Later lessons call this a motion model. The real car adds three small effects the formula leaves out: the command is held between 20 Hz ticks, the steering slews, and the tires slip. The body can sit a few tenths of a metre inside or outside the kinematic circle.

The amber odometry trail is a different integral. Its heading comes from the gyro. A steering bias is reported on `steering_angle` and stays out of the pose. Folding that bias into the heading would walk one lap of the oval tens of metres off the car.

Note: the formula has $\tan\delta$ in the denominator of $R$. A bigger steer angle is a smaller circle, which is the opposite of how the steering wheel feels in your hands. The wheel asks for angle. The road answers with radius.

## Try it

1. Run the starter. The coloured trail should be a circle of roughly 5 m radius. The HUD steer row should sit near 0.34 rad once the actuator catches up.
2. Change `0.34` to `0.2` in the block above and run again. The circle should get larger, close to $1.9/\tan 0.2$.
3. Put the throttle up to `0.8` with the original steer. The path should stop being a clean circle. That extra radius is slip.
