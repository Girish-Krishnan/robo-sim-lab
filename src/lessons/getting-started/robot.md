---
title: The robot
order: 2
world: city
spawn: default
starter: none
action: drive
prerequisites: getting-started/sandbox
status: ready
---

This is a small Ackermann buggy. Four wheels: the front pair steers, the rear pair drives. Think of a car, scaled down to a wheelbase of 1.9 m, so a full-lock turn still needs several metres of room. The steering command and the angle the wheels have actually reached are two numbers while the steering is still slewing.

In the sim: both the command and the slewed wheel angle are on the readout under the view.

## Three frames you will keep meeting

The **robot frame** has x forward, y left, and z up. Positive steering is a left turn, toward +y. Yaw grows counterclockwise when you look down from above.

The **world** is the simulator's ground plane. Three.js uses Y up, so the car's height is world Y. At yaw 0 the nose points along world +Z, and the driver's left is world +X.

**Odometry** is a third frame that travels with the guess of the pose. On reset it starts at (0, 0), with +x along the direction the car was facing and +y to its left. A point on `sensors.task.path` lives here, and so do `draw` coordinates. The lidar lesson writes a ray in the mesh frame (z forward, x left). When you write a controller, stay in odometry x-forward. Forward and left are the same directions either way.

The lidar puck sits on the roof, about 0.46 m in front of the body centre and a bit over a metre off the ground. Walls, trunks, shelves, and cones reach it. A curb is too short.

## How one steer angle becomes two front wheels

A kinematic bicycle folds the two axles into a single steered wheel a distance $L$ ahead of the rear axle. With speed $v$ and steering angle $\delta$ (positive left):

$$\dot{x} = v\cos\theta,\quad \dot{y} = v\sin\theta,\quad \dot{\theta} = \frac{v}{L}\tan\delta$$

Here $\theta$ is yaw in that plane, and $L = 1.9\,\mathrm{m}$. The turning radius is about $L / \tan\delta$. Ackermann geometry then splits $\delta$ across the two front wheels so both roll around the same centre. The inner wheel takes the larger angle:

$$\tan\delta_{\mathrm{in}} = \frac{L}{R - W/2},\quad \tan\delta_{\mathrm{out}} = \frac{L}{R + W/2}$$

$W$ is the track width, 1.42 m. The number you return is the bicycle angle. The simulator does the split.

The kinematic picture assumes the tires roll where they point. This car slides a little, especially in a tight circle, so the body can crab while the wheels follow a cleaner arc. At a modest speed the radius stays close to $L/\tan\delta$. Steering is also rate-limited: a sudden full lock arrives over several control ticks. Throttle near 0 applies a small hold brake, so a return of zero is a gentle stop, a parked car with the brake kissed on.

## Try it

1. Drive a slow left circle in an open stretch and watch the steer readout catch up to the keys.
2. Come to a stop, then tap forward. The first moment of motion is the hold brake letting go.
