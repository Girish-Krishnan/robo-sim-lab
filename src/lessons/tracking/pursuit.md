---
title: Pure pursuit
order: 1
world: track
spawn: pursuit
starter: pursuit
action: lab
prerequisites: reactive/wall
status: ready
---

Pure pursuit picks a point on the path a fixed distance ahead of the pose it believes, and steers the circular arc that reaches that point. It is how you ride a bike toward a tree you picked out ahead of you: the tree is the lookahead, and the lean is the arc that would arrive there. The world publishes the path on `sensors.task.path` in the odometry frame. On the oval that path is the centreline.

In the sim: the plan, the car, and the odometry trail are all drawn. The green line is the reference path.

Each tick the starter finds the nearest point along the route, then walks forward until the point is at least `LOOKAHEAD` metres away. It transforms that point into the body frame of the odometry pose, computes a curvature, and converts curvature to a steering angle with the bicycle model. A small speed PID slows down when the steer is large, so the corner is slower than the straight.

The starter draws the path, the lookahead point, and the arc implied by the command. All three are in the odometry frame. While the pose is still good, the arc sits on the real car. As the gyro bias accumulates, the drawn lookahead walks off the car even though the math is the same.

A short reverse runs if the bumper is in an obstacle and the speed is already near zero. That is a seatbelt. The pursuit law itself steers from the path and the pose.

<svg viewBox="0 0 480 260" role="img" aria-label="Pure pursuit lookahead: path, lookahead distance, and the angle alpha">
  <rect width="480" height="260" rx="12" fill="#10161a"/>
  <path d="M36 180 C 140 176, 200 96, 440 84" fill="none" stroke="#7dcea0" stroke-width="3"/>
  <circle cx="150" cy="162" r="6" fill="#2fbfa8"/>
  <circle cx="150" cy="162" r="78" fill="none" stroke="#355850" stroke-width="1.5" stroke-dasharray="3 3"/>
  <circle cx="214" cy="112" r="5" fill="#f4d03f"/>
  <line x1="150" y1="162" x2="214" y2="112" stroke="#f4d03f" stroke-width="2"/>
  <line x1="150" y1="162" x2="150" y2="78" stroke="#f4f1ea" stroke-width="1.5"/>
  <path d="M150 120 A 42 42 0 0 1 176 132" fill="none" stroke="#e3a23a" stroke-width="1.5"/>
  <text x="158" y="146" fill="#f4f1ea" font-size="13" font-family="sans-serif">Ld</text>
  <text x="168" y="112" fill="#e3a23a" font-size="13" font-family="sans-serif">alpha</text>
  <text x="360" y="74" fill="#7dcea0" font-size="13" font-family="sans-serif">reference path</text>
  <text x="228" y="108" fill="#f4d03f" font-size="12" font-family="sans-serif">lookahead</text>
  <text x="16" y="220" fill="#8e9b94" font-size="13" font-family="sans-serif">The dashed circle has radius Ld around the rear axle.</text>
  <text x="16" y="240" fill="#8e9b94" font-size="13" font-family="sans-serif">alpha is the heading error to the point where that circle meets the path.</text>
</svg>

## The arc that passes through the lookahead point

Let the lookahead point be a distance $L_d$ ahead, and let $\alpha$ be the angle between the car's heading and the line to that point. Positive $\alpha$ means the point is to the left. The arc that passes through the point has curvature

$$\kappa = \frac{2\sin\alpha}{L_d}.$$

The bicycle model turns curvature into a steering angle with $\kappa = \tan\delta / L$, so

$$\delta = \arctan\left(L \cdot \frac{2\sin\alpha}{L_d}\right).$$

$L$ is the wheelbase, 1.9 m. The starter clamps $\delta$ to the vehicle limit. In code, $\alpha = \operatorname{atan2}(y_{\mathrm{left}}, x_{\mathrm{forward}})$ after rotating the lookahead offset by the odometry yaw.

The loop that walks out to `LOOKAHEAD` and turns it into a steer command:

{{code:lookahead}}

A longer $L_d$ cuts the corner and oscillates less. A shorter $L_d$ tracks tighter and oscillates more, and it amplifies yaw noise because a fixed lateral miss makes a larger $\alpha$ when the lookahead is short.

The search for the nearest waypoint walks forward from the last index. On a loop, the nearest point in the whole list can be the return leg beside you, and the car will turn around. The starter only searches a window ahead.

Pure pursuit treats the pose it is given as the pose of the car. This pose is odometry. The next lesson is what that costs. The curvature formula is already the exact arc for the pose it sees.

Speed is a second loop. Wide-open throttle lets the corner radius grow from slip, and the lookahead point falls behind the steer. The bands in the starter (slower when $|\delta|$ is large) keep the arc in front of the car.

## Try it

1. Run the starter on the oval. You should complete a lap. The yellow lookahead point should stay ahead of the car at the start.
2. Set `LOOKAHEAD` to `1.4` and run again. The steering should twitch more, and the path should look tighter.
3. Set `LOOKAHEAD` to `6` and run again. The car should cut the corners and look steady. Put `3.2` back before you leave.
