---
title: Model predictive control
order: 2
status: soon
world: track
spawn: pursuit
starter: none
action: sandbox
---

Model predictive control writes the next second of steering and speed as one optimization. The bicycle model is the constraint. The path is the cost. On this oval that path is the centreline pure pursuit already tracks.

The problem can respect the steering rate and the speed limit together. It also has to fit in the same 20 Hz tick. The starter arrives when that fit is honest.
