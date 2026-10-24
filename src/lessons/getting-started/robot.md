---
title: The robot
order: 2
worlds: city, track, forest, warehouse
world: city
spawn: default
starter: none
action: drive
prerequisites: getting-started/sandbox
status: ready
---

Meet the car. It is small, the front wheels steer, and the rear wheels drive. The wheelbase, the distance from the rear axle to the front axle, is 1.9 m, so even with the wheel turned all the way (full lock), a turn needs several meters of room. That length is the whole personality of the machine: it cannot spin in place, and every turn is an arc you can picture.

The steering command and the angle the wheels have actually reached are two numbers on the HUD, the readout strip under the 3D view. While those numbers differ, the wheels are still slewing: they are turning toward the angle you asked for, and they have not arrived yet.

In the sim: both the command and the wheel angle are on the readout under the view. Time is there too. Pause freezes the car and the clock.

The lidar sits on the roof, about 0.46 m ahead of the body center and a bit over a meter off the ground. Walls, trunks, shelves, and cones reach it. A curb is below the scan.

For now, just meet the car. The math gets its own lesson, The bicycle model. Throttle runs from −1 (full reverse) to 1 (full forward), and near 0 the car applies a small hold brake, so letting go of the key is a gentle stop.

## Try it

1. Drive a slow left circle in an open stretch. **Steer +left** jumps with the keys (the command, in radians, positive left). **Steer act** catches up a beat later (the angle the wheels have actually reached). That lag is the wheels slewing.
2. Come to a stop, then tap forward. The first moment of motion is the hold brake letting go. The Time row on the HUD should keep counting until you press Pause.
