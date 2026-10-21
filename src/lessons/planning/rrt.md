---
title: RRT
order: 2
status: soon
world: forest
spawn: default
starter: none
action: sandbox
---

Rapidly-exploring random trees grow a path through a place like this forest by sampling poses and steering toward them with the bicycle model. The trees are the free-space problem: a grid of cells is a poor description of trunks.

They handle non-holonomic motion better than an 8-connected grid. They do not know the map is a grid, only that a pose is free or blocked. There is no starter yet.
