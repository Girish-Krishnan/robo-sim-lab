---
title: SLAM
order: 2
status: soon
world: warehouse
spawn: default
starter: none
action: sandbox
---

Simultaneous localization and mapping drops the known floor plan. The aisles in front of the car would have to be discovered, not looked up.

A particle filter can carry a small map in each particle (FastSLAM), or a pose graph can tie scans together after the fact. Both need a map you can update inside the 20 Hz budget, which is why this is not a starter yet.
