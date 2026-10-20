---
title: Model predictive control
order: 2
status: soon
world: track
spawn: pursuit
starter: none
action: sandbox
---

Coming soon. MPC writes the next second of steering and speed as an optimization, with the bicycle model as the constraint and the path as the cost. It can respect the steering rate and the speed limit in one problem. It has to fit in the same 20 Hz tick, which is the reason it is not a copy-paste starter.
