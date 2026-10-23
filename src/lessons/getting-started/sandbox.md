---
title: The sandbox
order: 1
worlds: city, track, forest, warehouse
world: city
spawn: default
starter: none
action: sandbox
status: ready
---

That car is yours to drive, crash and program. Press W and it rolls; open Code and a Python program drives it instead. Same car, same world, three ways in.

## Three ways to use the same car

**Drive** is the keyboard. W forward, S back, A and D steer, Space brakes.

**Code** opens on a short template. `control(sensors)` returns a gentle roll forward. **Browse examples** lists finished programs. If you have already typed something, the lab asks before it replaces your text. Your scratch program stays in this browser.

**Lessons** keeps the car on screen and the reading in this pane. A lesson picks the world, the start, and the drawings. When a lesson has a program, the explanation and the code share this scroll. **Run** sits on the bar at the bottom. The console opens just above it, and it opens by itself if the program throws.

## The buttons that reset something

Three controls put something back, and they put back different things.

- **Reset run**, on the bar, puts the car back at the start and runs the program you have now.
- **Reset code**, on a lesson that has a program, asks first, then throws away your edits and loads the original.
- **Reset camera** puts the view behind the car.

`SEED` at the top of a program draws the sensor bias once. Reset run replays that same number, so a lap you liked can happen again.

Drag to look around, and scroll to zoom. The **Key** on the view names the colors: the speed-tinted trail is where the car went, blue is the wheel-and-gyro guess, and the lidar inset draws the scan with amber for close hits. After the first visit the key starts folded. It stays available on every lesson that draws those overlays.

Try any world. This page works in all of them. The lessons menu at the top of this column lists them all. A lesson written for one world keeps the World menu on that world, and the note under the menu says so. A lesson that travels, like this one, invites you to switch.

## Try it

1. Drive up the street with W. Watch the lidar inset: amber dots are the close hits.
2. Open Code. The editor should be the short template. Open Browse examples, load Circle drive, and press Run.
3. Come back here and open The bicycle model. The circle program is already running, and a piece of it sits in the reading.
