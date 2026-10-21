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

This is a small Ackermann buggy: four wheels, the front pair steered, the rear pair driven. It is not a skid-steer robot and it is not a 30 cm F1TENTH car. The wheelbase is 1.9 m, so the turning circle is several metres. The HUD under the view shows the steering command and the angle the wheels have actually reached. They are not the same number while the steering is still slewing.

## Three frames you will keep meeting

The **robot frame** has x forward, y left, and z up. Positive steering is a left turn, toward +y. Yaw is counterclockwise when you look down from above.

The **world** is the simulator's ground plane. Three.js uses Y up, so the car's height is world Y. At yaw 0 the nose points along world +Z, and the driver's left is world +X.

**Odometry** is a third frame. On reset it starts at (0, 0), with +x along the direction the car was facing and +y to its left. It is not the world frame. A point on `sensors.task.path` lives here, and so do `draw` coordinates.

The mesh and the lidar ray use one more convention: z forward, x left, y up, which is how the 3D view is built. Forward and left are the same directions as in the bicycle model. The letter that means forward is not. The lidar lesson writes the ray in that mesh frame. Stay in odometry x-forward when you write a controller.

The lidar puck is on the roof, about 0.46 m in front of the body centre, a bit over a metre off the ground. Curbs are too short for it. Walls, trunks, shelves, and cones are not.

## How the command becomes two front wheels

A kinematic bicycle rolls the two axles into one steered wheel a distance $L$ ahead of the rear axle. With speed $v$ and steering angle $\delta$ (positive left):

$$\dot{x} = v\cos\theta,\quad \dot{y} = v\sin\theta,\quad \dot{\theta} = \frac{v}{L}\tan\delta$$

Here $\theta$ is yaw in the same plane, and $L = 1.9\,\mathrm{m}$. The turning radius is about $L / \tan\delta$. Ackermann geometry then splits $\delta$ across the two front wheels so both roll around that centre. The inner wheel gets the larger angle:

$$\tan\delta_{\mathrm{in}} = \frac{L}{R - W/2},\quad \tan\delta_{\mathrm{out}} = \frac{L}{R + W/2}$$

$W$ is the track width, 1.42 m. The command you return is the bicycle angle, not the two wheel angles. The simulator does the split.

The bicycle model does not know about tire slip. This car does slip a little, especially in a tight circle, so the body can crab while the wheels point along a cleaner arc. Do not expect a perfect $L/\tan\delta$ circle at high speed. Steering is also rate-limited. Asking for a sudden full lock does not happen in one control tick. Throttle near 0 applies a small hold brake, so "do nothing" is not quite neutral.

## Feel it before the equations

Drive a slow left circle, then a right one. Left is A or the left arrow. Stop with Space and notice the car settles instead of rolling. After the bicycle-model lesson, compare the radius you just drove with $L/\tan\delta$.
