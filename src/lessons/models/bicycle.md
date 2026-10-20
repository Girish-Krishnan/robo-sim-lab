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

The circle example holds a constant steering angle and a constant throttle. That is the bicycle model with the inputs frozen, which makes the geometry easy to see.

## In plain words

Imagine the car as two axles. The rear axle only rolls forward. The front axle is steered by an angle $\delta$. If $\delta$ stays constant and the tires do not slide, the car drives a circle whose centre is off to one side of the rear axle.

Positive $\delta$ is a left turn. On this spawn the car sits on the west side of an open pad, nose pointing along the pad, so a left circle stays in the grass, the infield, the meadow, or the open warehouse bay.

<svg viewBox="0 0 440 230" role="img" aria-label="Top view of the bicycle model">
  <rect x="0" y="0" width="440" height="230" rx="12" fill="#10161a"/>
  <path d="M70 150 C 70 70, 210 40, 300 90" fill="none" stroke="#355850" stroke-width="10" stroke-linecap="round"/>
  <circle cx="168" cy="118" r="3" fill="#e7eeea"/>
  <line x1="168" y1="118" x2="250" y2="78" stroke="#9fd8cf" stroke-width="2"/>
  <line x1="150" y1="132" x2="186" y2="104" stroke="#f4f1ea" stroke-width="3"/>
  <line x1="232" y1="92" x2="268" y2="64" stroke="#f4d03f" stroke-width="3"/>
  <path d="M210 96 l28 -14" stroke="#f4d03f" stroke-width="2" fill="none"/>
  <text x="168" y="146" fill="#9fd8cf" font-size="13" font-family="sans-serif">L</text>
  <text x="248" y="58" fill="#f4d03f" font-size="13" font-family="sans-serif">delta</text>
  <text x="40" y="40" fill="#e7eeea" font-size="13" font-family="sans-serif">left turn, nose along the arc</text>
  <text x="300" y="180" fill="#8e9b94" font-size="13" font-family="sans-serif">rear axle is white, front axle is yellow</text>
</svg>

## The math

With rear-axle speed $v$ and yaw $\theta$ measured from the x axis:

$$\dot{x} = v\cos\theta,\quad \dot{y} = v\sin\theta,\quad \dot{\theta} = \frac{v}{L}\tan\delta$$

The curvature is $\kappa = \tan\delta / L$, and the radius is $R = 1/|\kappa|$. For the starter, $\delta = 0.34$ rad and $L = 1.9$ m, so

$$R = \frac{1.9}{\tan 0.34} \approx 5.4\,\mathrm{m}.$$

Over a short time $\Delta t$ a discrete step is

$$x \leftarrow x + v\cos\theta\,\Delta t,\quad y \leftarrow y + v\sin\theta\,\Delta t,\quad \theta \leftarrow \theta + \frac{v}{L}\tan\delta\,\Delta t.$$

That integration is what a motion model does later. The real car is not this exact. The command is held between 20 Hz ticks, the steering slews, and the tires slip, so the body can sit a few tenths of a metre inside or outside the kinematic circle.

## Intuition and pitfalls

A larger $|\delta|$ is a tighter circle, until the steering limit. It is not a larger radius. People mix that up because the steering wheel feels like "more turn" and the radius formula has $\tan\delta$ in the denominator.

Speed does not change the radius in the kinematic model. It does change it on this car, because lateral force saturates and the body slides. The circle starter uses a modest throttle for that reason.

The amber odometry trail is not this bicycle. Heading there comes from the gyro, not from $\tan\delta$. A steering bias is reported on `steering_angle` and is not integrated. If it were, one lap of the oval would walk tens of metres off the car.

## Try it

1. Run the starter on the oval infield. Turn Paths on. The coloured trail should be a circle of roughly 5 m radius.
2. Change `0.34` to `0.2` and run again. The circle should get larger, close to $1.9/\tan 0.2$.
3. Put the throttle up to `0.8` with the original steer. The path should stop being a clean circle. That is slip, which the bicycle model does not have.
