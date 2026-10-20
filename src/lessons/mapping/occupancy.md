---
title: Occupancy grids
order: 1
status: soon
world: warehouse
spawn: default
starter: none
action: sandbox
---

Coming soon. An occupancy grid is the map you were handed in the localization module, built from scans instead of from the simulator's solids. Each cell stores the log odds that it is occupied, updated by an inverse sensor model along the lidar beams. The hard part is doing that in the same frame as a pose that is still drifting.
