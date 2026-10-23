---
title: The bicycle model
order: 1
worlds: city, track, forest, warehouse
world: track
spawn: circle
starter: circle
action: lab
prerequisites: getting-started/robot
status: ready
---

Hold the wheel at a fixed angle and the car draws a circle. The rear axle rolls straight ahead in its own frame. The front axle is steered by an angle $\delta$. A constant $\delta$ is that circle, the way a shopping trolley with the front wheels locked traces one radius around a car park.

In the sim: a fixed steer on an open pad, with the colored trail showing the circle. Positive $\delta$ is a left turn, and the car starts on that circle so the lap stays on the open pad.

<svg viewBox="0 0 560 340" role="img" aria-label="Top view: turn center, radius R, wheelbase L perpendicular to R, and steer angle delta">
  <rect width="560" height="340" rx="12" fill="#0e1418"/>
  <circle cx="78" cy="214" r="7" fill="#ffd24a"/>
  <text x="16" y="252" fill="#ffd24a" font-size="16" font-family="sans-serif">turn center</text>
  <line x1="78" y1="214" x2="300" y2="214" stroke="#7ee0d0" stroke-width="3"/>
  <line x1="300" y1="94" x2="78" y2="214" stroke="#7ee0d0" stroke-width="2" stroke-dasharray="7 6"/>
  <text x="168" y="202" fill="#7ee0d0" font-size="20" font-family="sans-serif">R</text>
  <path d="M300 214 A 222 222 0 0 1 300 40" fill="none" stroke="#2a4a44" stroke-width="10"/>
  <rect x="262" y="70" width="76" height="160" rx="16" fill="none" stroke="#f4f7f4" stroke-width="3"/>
  <rect x="248" y="200" width="12" height="28" rx="2" fill="#f4f7f4"/>
  <rect x="340" y="200" width="12" height="28" rx="2" fill="#f4f7f4"/>
  <line x1="300" y1="214" x2="300" y2="94" stroke="#f4f7f4" stroke-width="4"/>
  <text x="308" y="160" fill="#f4f7f4" font-size="20" font-family="sans-serif">L</text>
  <g transform="rotate(-28 300 94)">
    <rect x="274" y="80" width="12" height="28" rx="2" fill="#ffd24a"/>
    <rect x="314" y="80" width="12" height="28" rx="2" fill="#ffd24a"/>
  </g>
  <path d="M300 70 A 24 24 0 0 1 284 86" fill="none" stroke="#ffd24a" stroke-width="3"/>
  <text x="246" y="64" fill="#ffd24a" font-size="20" font-family="sans-serif">δ</text>
  <text x="364" y="220" fill="#c9d4ce" font-size="16" font-family="sans-serif">rear axle</text>
  <text x="392" y="88" fill="#ffd24a" font-size="16" font-family="sans-serif">front wheels</text>
  <text x="16" y="32" fill="#f4f7f4" font-size="18" font-family="sans-serif">L is perpendicular to R</text>
  <text x="16" y="300" fill="#d5ddd8" font-size="16" font-family="sans-serif">White bar: wheelbase L, rear axle up to the front axle.</text>
  <text x="16" y="324" fill="#d5ddd8" font-size="16" font-family="sans-serif">Teal bar: turning radius R. Dashed: front axle to the turn center.</text>
</svg>

## Why the rear axle is the reference point

The rear axle only rolls. Its velocity lies along the heading, and the yaw rate is whatever the front wheels demand. With rear-axle speed $v$ and yaw $\theta$ measured from the x axis:

$$\dot{x} = v\cos\theta,\quad \dot{y} = v\sin\theta,\quad \dot{\theta} = \frac{v}{L}\tan\delta$$

The curvature is $\kappa = \tan\delta / L$, and the radius is $R = 1/|\kappa|$. For the starter, $\delta = 0.34$ rad and $L = 1.9$ m, so

$$R = \frac{1.9}{\tan 0.34} \approx 5.4\,\mathrm{m}.$$

A larger $|\delta|$ is a tighter circle, until the steering hits its stop. Speed leaves the radius alone in this kinematic model. On this car, speed does change the path, because the tires run out of lateral force and the body slides. The circle starter uses a modest throttle so the trail stays close to that 5.4 m.

The running program is that constant command. Change the first number and the radius changes with it.

{{code:control}}

## One step of the motion model

Over a short time $\Delta t$ a discrete step is

$$x \leftarrow x + v\cos\theta\,\Delta t,\quad y \leftarrow y + v\sin\theta\,\Delta t,\quad \theta \leftarrow \theta + \frac{v}{L}\tan\delta\,\Delta t.$$

Later lessons call this a motion model. The real car adds three small effects the formula leaves out: the command is held between 20 Hz ticks, the steering slews, and the tires slip. The body can sit a few tenths of a meter inside or outside the kinematic circle.

The blue odometry trail is a different integral. Its heading comes from the gyro. A steering bias is reported on `steering_angle` and stays out of the pose. Folding that bias into the heading would walk one lap of the oval tens of meters off the car.

Three frames show up from here on. The **robot frame** has x forward, y left, and z up. Positive steering is a left turn. The **world** is the ground plane: at yaw 0 the nose points along +Z and the driver's left is +X. **Odometry** starts at the origin on reset, with +x along the heading the car had then. `sensors.task.path` and `draw` live there. The host places those drawings with the spawn transform, the shift from that origin onto the map. Stay in the odometry frame when you write a controller.

Ackermann geometry splits the one bicycle angle across the two front wheels so both roll around the same center. The inner wheel takes the larger angle. The number you return is the bicycle angle. The simulator does the split. The track width is 1.42 m.

Note: $R = L / \tan\delta$, so $\tan\delta$ sits in the denominator. A bigger steer angle is a smaller circle. That matches the wheel: more steer, tighter turn. The wheel asks for an angle. The road answers with a radius.

## Try it

1. Run the starter. The colored trail should be a circle of roughly 5 m radius. The HUD steer row should sit near 0.34 rad once the actuator catches up.
2. Change `0.34` to `0.2` in the block above and run again. The circle should get larger, close to $1.9/\tan 0.2$.
3. Put the throttle up to `0.8` with the original steer. The path should stop being a clean circle. That extra radius is slip.
