---
title: SLAM
order: 2
status: soon
world: warehouse
spawn: default
starter: none
action: sandbox
---

Simultaneous localization and mapping builds the floor plan while it drives. The aisles in front of the car would be discovered from the scan, scan by scan.

A particle filter can carry a small map in each particle (FastSLAM), or a pose graph can tie scans together after the fact. Both need a map you can update inside the 20 Hz budget. The starter arrives once that update fits.
