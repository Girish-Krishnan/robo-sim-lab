---
title: Driving by hand
order: 4
world: city
spawn: default
starter: none
action: drive
prerequisites: getting-started/sensors
status: ready
---

Before writing a controller, drive the car yourself. The point is to feel the steering limit, the braking, and what the lidar actually sees.

## In plain words

W or the up arrow drives forward. S or down reverses, more gently than full forward. A or left steers left. D or right steers right. Space brakes. R resets the world when you are in drive mode. The command is the same shape the Python program returns: a steering angle and a throttle. The simulator slews the steering so it cannot jump to full lock in one frame.

Turn **Lidar** on. The inset is a top-down scan, and the 3D view draws the returns. Beams that miss stay at 12 m. The bumper sticks out in front of the lidar, so a return of about 0.7 m means the nose is already close to the hit.

## What to notice

On the city street the roundabout, the planters, and the lamp posts all show up. The curb does not. On the oval, the walls and the cones do. In the forest, trunks and the corridor fence do. In the warehouse, racks do, and the open bay is a long stretch of max-range beams.

**Paths** is worth leaving on while you drive a lap. The coloured trail is where the car went. The amber trail is where dead reckoning thinks it went. They start together and slowly disagree. That gap is the subject of the odometry and localization lessons. You cannot close it by driving more carefully. The gyro bias is sampled when the world resets.

## Try it

1. Drive a slow lap of the city block without touching a planter. Watch the lidar inset as you pass a lamp post.
2. Turn Paths on, reset the seed, and drive straight for about twenty seconds. See whether the amber trail stays under the car.
3. Switch to the oval and drive the east straight, wall on your right. That is the pose the wall-follow lesson starts from.
