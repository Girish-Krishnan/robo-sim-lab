---
title: Dead reckoning recap
order: 1
world: track
spawn: pursuit
starter: pursuit
action: lab
prerequisites: tracking/drift
status: ready
---

Watch the blue trail peel away from the car. That's dead reckoning: add up wheel speed and yaw rate, never look at a wall, and a tiny bias grows with every meter.

In the sim: pursuit on the oval. The blue trail is that integral. The key on the view names the trails. This lesson does not hand you the wheel. The program keeps driving.

On reset, the known pose is the origin of the odometry frame, which really is where the car is. That gift expires. The path tracker believed the integral, and on the oval the true cross-track grew from about 0.18 m to about 2.23 m.

Localization puts the building back in the problem. This module gives you a map the way a building gives a robot a floor plan: walls in the same frame as the odometry. The lidar is the measurement. The filter's job is a pose you can hand to pure pursuit in place of the raw integral.

The program sees the map, the scan, and the odometry delta. The true pose stays with the simulator.

The pursuit block below is still steering from the raw integral. The next lessons replace the pose it reads.

{{code:pursuit_steer}}

## One pose, then a distribution

Dead reckoning is the motion model with the noise set to zero and with the measurement left for the next step:

$$x_t = f(x_{t-1}, u_t)$$

where $u_t$ is the odometry delta $(v, \omega)$, the change in the odometry pose. The Bayes filter below replaces that single pose with a distribution. A particle filter represents the distribution with a cloud of guesses. The weighted mean of the cloud is the pose pursuit will use.

If the cloud starts as a tight blob at the origin, you are **tracking**: you know roughly where you began, and you refuse to let the bias walk you off. If the cloud starts spread over the free cells of the map, you are doing **global localization**: the first scans have to pick a place. The kidnapped starter is that second problem. The pursuit starter is the first, which is the one that flattens the oval's cross-track curve.

A floor plan is a description of the building. The robot's state is still the pose. `sensors.task.map` is allowed because a person could have surveyed it yesterday. The map's corner is called `corner`. The map is in the odometry frame at reset. Particle $(0, 0)$ is the true start because both frames were zeroed together. A tracking filter may start there. A global filter spreads its particles across the free cells.

## Try it

1. Re-run pure pursuit on the oval and name what is being integrated: wheel speed and yaw rate.
2. In the console, print `sensors.task.map.resolution`, `map.width`, `map.height`, and `len(map.segments)`. You should see a grid and a list of wall edges.
3. Print `map.corner` and confirm it is a pair of coordinates.
