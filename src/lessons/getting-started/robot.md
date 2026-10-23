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

This is a small car. The front wheels steer and the rear wheels drive. The wheelbase, the distance from the rear axle to the front axle, is 1.9 m, so a full-lock turn still needs several meters of room.

The steering command and the angle the wheels have actually reached are two numbers on the HUD. While those numbers differ, the wheels are still slewing: they are turning toward the angle you asked for, and they have not arrived yet.

In the sim: both the command and the wheel angle are on the readout under the view. Time is there too. Pause freezes the car and the clock.

The lidar sits on the roof, about 0.46 m ahead of the body center and a bit over a meter off the ground. Walls, trunks, shelves, and cones reach it. A curb is below the scan.

The bicycle lesson writes the turn as one equation and names the coordinate frames. This lesson is only the car you are driving. Throttle near 0 applies a small hold brake, so letting go of the key is a gentle stop.

## Try it

1. Drive a slow left circle in an open stretch and watch the steer readout catch up to the keys. That lag is the wheels slewing.
2. Come to a stop, then tap forward. The first moment of motion is the hold brake letting go. The Time row on the HUD should keep counting until you press Pause.
