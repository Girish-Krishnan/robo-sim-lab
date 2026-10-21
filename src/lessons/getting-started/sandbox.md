---
title: The sandbox
order: 1
world: city
spawn: default
starter: none
action: sandbox
status: ready
---

The car in the middle of the window is the course. Drive, Code, and Lessons, in the header, are three ways to use that same view. The pane on the right is either closed, a Python editor, or the lesson you are reading.

## Three modes, one simulator

**Drive** is the keyboard. The right pane stays out of the way. **Code** opens a free-form editor: pick an example, press Run, and read the console underneath. **Lessons** keeps the car on screen and loads this pane. Each lesson sets the world, the start pose, the seed, and the overlays that make its point. If it has a program, that program sits at the bottom of the pane under Try it, and Run uses the same console as Code mode.

A lesson does not lock the header. You can still change the world, the graphics quality, the lidar drawing, the path trails, and the noise seed. What you cannot do from Python is read the true pose. The program sees sensors only.

## The view, the trails, and what is saved

Drag to look around the car, scroll to zoom, and use **Reset camera** if the chase rig ends up in the sky. **Graphics** has High and Low. High is the one with the sky and the softer shadows.

**Paths** draws two trails for you, not for the program. The coloured trail is where the car went, tinted by speed. The amber trail is wheel odometry. They start together and then disagree. That gap is a later lesson.

Physics runs at 60 Hz. When a program is running, `control(sensors)` is called at 20 Hz and must return a steering angle and a throttle. Code you edit inside a lesson is stored in this browser, and so are visited and completed marks. **Reset to starter** puts the lesson's program back. A refresh keeps your place.
