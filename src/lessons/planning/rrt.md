---
title: RRT
order: 2
status: soon
world: forest
spawn: default
starter: none
action: sandbox
---

Rapidly-exploring random trees grow a path through a place like this forest by sampling poses and steering toward them with the bicycle model. Trunks are a free-space problem: a grid of cells is a coarse description of a round obstacle.

The tree handles the car's steering limit more directly than an 8-connected grid. A pose is free or blocked, and the tree only needs that test. The starter arrives with that lesson.
