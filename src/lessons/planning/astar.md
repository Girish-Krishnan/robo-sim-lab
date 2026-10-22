---
title: A star
order: 1
status: soon
world: warehouse
spawn: default
starter: none
action: sandbox
---

A* on an occupancy grid finds a shortest path around the shelves to a goal cell. The racks in this warehouse are the obstacles that search has to route around.

The path it returns is the kind of polyline `sensors.task.path` already is, so pure pursuit can drive it. The lesson will be the heuristic, and how grid cost and the car's turning radius ask for different paths. The starter arrives with that lesson.
