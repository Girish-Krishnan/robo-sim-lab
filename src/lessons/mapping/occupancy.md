---
title: Occupancy grids
order: 1
status: soon
world: warehouse
spawn: default
starter: none
action: sandbox
---

The warehouse around the car is the kind of building an occupancy grid is for. The map you were handed in localization was built from the simulator's solids. This lesson will build the same kind of grid from scans.

Each cell stores the log odds that it is occupied, updated by an inverse sensor model along the lidar beams. A hit raises the odds at the endpoint. The cells the beam passed through get a miss. The interesting part is doing that in the same frame as a pose that is still drifting. The starter arrives with that lesson.
