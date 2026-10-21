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

Dead reckoning is the name for the pose you have been using. You start from a known pose, and you add up motion. You never look outside. When the motion measurement is biased, the pose is wrong, and every later addition is wrong in the new wrong frame. The oval pursuit program is running again so that pose is on screen, amber trail and all.

On reset, the known pose is the origin of the odometry frame, which really is where the car is. That gift expires. After that, `sensors.odometry.pose` is only the integral of wheel speed and yaw rate. The path tracker believed it, and on the oval the true cross-track grew from about 0.18 m to about 2.23 m.

Localization puts the outside world back in. This module gives you a map the way a building gives a robot a floor plan: walls in the same frame as the odometry, not a GPS fix of the car. The lidar is the measurement. The filter's job is a pose you can hand to pure pursuit instead of the raw integral.

You still do not get the true pose. The eval measures your estimate against the truth after the run. Your program never sees that comparison.

## One pose, then a distribution

Dead reckoning is the motion model with the noise set to zero and no measurement update:

$$x_t = f(x_{t-1}, u_t)$$

where $u_t$ is the odometry delta $(v, \omega)$ or, equivalently, the change in the odometry pose. The Bayes filter below replaces that with a distribution. A particle filter represents the distribution with a cloud of guesses. The weighted mean of the cloud is the pose pursuit will use.

If the cloud starts as a tight blob at the origin, you are doing **tracking**: you know roughly where you began, and you refuse to let the bias walk you off. If the cloud starts spread over the free cells of the map, you are doing **global localization**: you do not know the start, and the first scans have to pick a place. The kidnapped starter is that second problem. The pursuit starter is the first, which is the one that should flatten the oval's cross-track curve.

Knowing the map is not cheating. A floor plan is not the robot's state. The banned list is still the true pose, the true velocity, and the physics handles. `sensors.task.map` is allowed because a person could have built it yesterday.

The map's corner is called `corner`, not origin. "Origin" in this codebase means a pose someone tried to smuggle into the sample, and the publisher drops it. The map is in the odometry frame at reset. Particle $(0, 0)$ is the true start only because both frames were zeroed together. A tracking filter may start there. A global filter should not put every particle there and call itself lost.

## The map is not a pose

Re-run pure pursuit on the oval and name what is being integrated, and what is not being measured. In the console, print `sensors.task.map.resolution`, `map.width`, `map.height`, and `len(map.segments)`. You should see a grid and a list of wall edges. You should not see a pose. Print `map.corner` and confirm it is a pair of coordinates, not a field named origin.
