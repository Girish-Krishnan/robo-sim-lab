---
title: Driving by hand
order: 4
worlds: city, track, forest, warehouse
world: city
spawn: default
starter: none
action: drive
prerequisites: getting-started/sensors
status: ready
---

Take the wheel. Before any controller exists, feel what this car can do. The keys send the same pair a Python program returns: a steering angle and a throttle. Tap D and watch the wheels swing over a beat later. Real steering takes time to turn too.

W or the up arrow drives forward. S or down reverses, more gently than full forward. A or left steers left. D or right steers right. Space brakes. R does the same as Reset run while you are driving by hand.

## What a return of 0.7 m means

The lidar inset is a top-down scan, and the 3D view draws the same returns as beams. Empty beams stay at 12 m. Amber in the inset means a close hit. The bumper sticks out in front of the lidar puck on the roof, so a return of about 0.7 m means the nose is already at the thing it saw.

On the city street the roundabout, the planters, and the lamp posts all return hits. The lidar is about a meter off the ground, so the curb is below the scan and never returns one. On the oval the walls and the cones are tall enough, and both show up in the inset. In the forest, trunks and the corridor fence do. In the warehouse, the racks do, and the open bay is a long stretch of max-range beams.

## The two trails

The colored trail is where the car went. The blue trail is where dead reckoning (adding up wheel speed and gyro turns, with no landmarks) thinks it went. They start together and slowly separate. That gap is the subject of the odometry and localization lessons. Drive gently and the two trails stay close. This page has no program, so the bias comes from seed 1, and Reset run replays it.

## Try it

1. Drive a slow lap of the city block clear of the planters, and watch the inset as you pass a lamp post.
2. Drive straight for about twenty seconds. See whether the blue trail stays under the car. Reset run and do it again. The peel should come back the same way.
3. Switch to the oval and drive the east straight with the wall on your right. That is the pose the wall-follow lesson starts from.
