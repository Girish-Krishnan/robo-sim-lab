---
title: The sandbox
order: 1
world: city
spawn: default
starter: none
action: sandbox
status: ready
---

This site is a small robotics course with a car you can drive, and a Python editor that drives it for you. The lessons are in the sidebar. Each one is a short reading, then a button that loads a world and a starter program into the same simulator.

## In plain words

**Sandbox**, at the top of the sidebar, is free play. Pick any world, any example, and any noise seed. A lesson does not take that away. **Open in sandbox** on a lesson only fills in that lesson's world, start pose, and code. You can still change the code, reset the seed, and turn the lidar drawing on or off.

The view is a chase camera behind the car. Drag to look, scroll to zoom, and **Reset camera** if you get lost. **Graphics** has High and Low. High is the one with the sky and the softer shadows. **Paths** draws two trails: the true path, coloured by speed, and an amber trail from wheel odometry. Those trails are for you. The program cannot read them.

## What you are looking at

The header chooses the world: city streets, the F1TENTH-style oval, a forest trail, or a warehouse. The car is the same in all of them. Physics runs at 60 Hz. When you run Python, `control(sensors)` is called at 20 Hz and must return a steering angle and a throttle.

Code you edit inside a lesson is stored in this browser. **Reset to starter** puts the lesson's program back. Visited and completed lessons are stored the same way, so a refresh keeps your place.

## Try it

1. Open the sandbox and switch between the four worlds. Notice the car stays the same size and the start pose changes.
2. Turn **Paths** on, drive a few metres, and find the coloured trail and the amber one.
3. Set **Graphics** to High, reset the camera, and confirm you can see the ground and the car together, not only the sky.
