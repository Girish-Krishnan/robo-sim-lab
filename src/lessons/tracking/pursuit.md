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

Pure pursuit picks a point on the path a fixed distance ahead of the pose it believes, and steers the circular arc that reaches that point. The world publishes the path on `sensors.task.path` in the odometry frame. On the oval that path is the centreline.

## In plain words

Each tick the starter finds the nearest point along the route, then walks forward until the point is at least `LOOKAHEAD` metres away. It transforms that point into the body frame of the odometry pose, computes a curvature, and converts curvature to a steering angle with the bicycle model. A small speed PID slows down when the steer is large, so the corner is slower than the straight.

The starter draws the path, the lookahead point, and the arc implied by the command. All three are in the odometry frame. While the pose is still good, the arc sits on the real car. As the gyro bias accumulates, the drawn lookahead walks off the car even though the math is the same.

There is also a short reverse if the bumper is in an obstacle and the speed is already near zero. That is a seatbelt, not the controller. The pursuit law itself does not know about lidar.

<svg viewBox="0 0 460 250" role="img" aria-label="Pure pursuit lookahead geometry">
  <rect width="460" height="250" rx="12" fill="#10161a"/>
  <path d="M40 170 C 140 160, 200 90, 420 80" fill="none" stroke="#7dcea0" stroke-width="3"/>
  <circle cx="150" cy="148" r="6" fill="#2fbfa8"/>
  <circle cx="150" cy="148" r="70" fill="none" stroke="#355850" stroke-width="1.5"/>
  <circle cx="206" cy="104" r="5" fill="#f4d03f"/>
  <line x1="150" y1="148" x2="206" y2="104" stroke="#f4d03f" stroke-width="2"/>
  <line x1="150" y1="148" x2="150" y2="78" stroke="#f4f1ea" stroke-width="1.5"/>
  <text x="158" y="124" fill="#f4f1ea" font-size="13" font-family="sans-serif">Ld</text>
  <text x="168" y="86" fill="#e3a23a" font-size="13" font-family="sans-serif">alpha</text>
  <text x="360" y="72" fill="#7dcea0" font-size="13" font-family="sans-serif">path</text>
  <text x="16" y="214" fill="#8e9b94" font-size="13" font-family="sans-serif">lookahead circle</text>
  <text x="16" y="234" fill="#8e9b94" font-size="13" font-family="sans-serif">around the rear axle</text>
</svg>

## The math

Let the lookahead point be a distance $L_d$ ahead, and let $\alpha$ be the angle between the car's heading and the line to that point. Positive $\alpha$ means the point is to the left. The arc that passes through the point has curvature

$$\kappa = \frac{2\sin\alpha}{L_d}.$$

The bicycle model turns curvature into a steering angle with $\kappa = \tan\delta / L$, so

$$\delta = \arctan\left(L \cdot \frac{2\sin\alpha}{L_d}\right).$$

$L$ is the wheelbase, 1.9 m. The starter clamps $\delta$ to the vehicle limit. In code, $\alpha = \operatorname{atan2}(y_{\mathrm{left}}, x_{\mathrm{forward}})$ after rotating the lookahead offset by the odometry yaw.

A longer $L_d$ cuts the corner and oscillates less. A shorter $L_d$ tracks tighter and oscillates more, and it amplifies yaw noise because the same heading error moves the point by $L_d \Delta\theta$ only if you are looking at the geometry of $\alpha$. For a fixed lateral miss, a short lookahead makes a larger $\alpha$.

## Intuition and pitfalls

The search for the nearest waypoint has to walk forward from the last index. On a loop, the nearest point in the whole list can be the return leg beside you, and the car will turn around. The starter only searches a window ahead.

Pure pursuit assumes the pose is the pose of the car. This pose is odometry. The next lesson is what that costs. Do not "fix" a growing cross-track by raising a gain that is not there. The curvature formula is already the exact arc.

Speed is a second loop. If you hold throttle wide open, the corner radius grows from slip and the lookahead point is behind you before the steer arrives. The bands in the starter (slower when $|\delta|$ is large) are there for that.

## Try it

1. Run the starter on the oval. You should complete a lap. Watch the yellow lookahead point stay ahead of the car at the start.
2. Set `LOOKAHEAD` to `1.4` and run again. The steering should twitch more, and the path should look tighter and less smooth.
3. Set `LOOKAHEAD` to `6` and run again. The car should cut the corners and look stable. Put `3.2` back before you leave.
