---
title: Kidnapped start
order: 5
world: track
spawn: mcl-global
starter: mcl-global
action: lab
prerequisites: localization/pf-pursuit
status: ready
---

A kidnapped robot was moved while its eyes were shut. The odometry origin is a fresh zero in a place the robot has yet to recognise. The prior is spread over free space. The car creeps until one pose owns the scan, then it drives the route. It is the difference between "I started in the garage" and "I woke up in the building."

In the sim: overhead on the oval until the cloud collapses onto the car. The key names the cloud, the yellow ring, and the trails.

`UNKNOWN_START` in the kidnapped starter is true. Most of the 720 particles are free cells with a random heading. A minority sit on the known route at twelve headings. A few hundred uniform poses leave gaps in $x$, $y$, and yaw, so a route lattice is there so that some particle can land on the car. The camera frames the known map from above, because a chase camera behind the bumper shows the bumper, and the cloud fills the yard.

Each particle is a saturated magenta dot, about 8 px, with a dark outline and a heading tick of about 28 cm. The yellow ellipse is the 2-sigma contour of the cloud. While that ellipse is still the size of the yard, the camera stays overhead. Once it tightens onto the car, the camera comes in.

While the weight is spread out, the car creeps with the right-wall follower from the wall lesson. The gains are the same. The throttle is capped, so the car stays slow while the guess is still a guess. Pursuit starts once the best particle holds about a tenth of the weight: the cloud is replaced by a tight tracking cloud around that pose, and the rest of the minute is the same pure pursuit as the known-start filter.

On the city roundabout and in the forest that peak is there on the first scans, almost all of the weight on one particle. On the oval the best particle holds about a tenth, because the other straight still explains a parked scan. That tenth is already the true straight on this route, known to the width of the corridor. The warehouse bay is flatter still. The peak stays near a few percent until the car has rolled, so the creep continues and pursuit waits.

Augmented MCL keeps a short-term and a long-term average of the log of the mean likelihood. When the recent scans fit worse than the filter has been used to, the short-term average falls first and the resample mixes in random free-space particles, at most a quarter of the cloud. A full replacement on a small dip is how a symmetric aisle flips to the other copy of itself. If the published pose has left the route, the wall follower takes the wheel again.

**Drive it yourself** is the kidnapped experiment with your hands on the wheel. Click the view, then drive. The cloud should tighten onto the car as the scan picks up a corner, a cone, or the end of a straight. The filter is the same sensor-only pipeline, running in the worker while you steer.

The prior that spreads the first cloud:

{{code:prior}}

Once a winner exists, this is the steer it follows:

{{code:pursue}}

## A prior, and the signal that injects new particles

The belief starts as free space plus a route lattice. The free part is

$$x^{[i]} \sim \mathrm{Uniform}(\mathcal{F}),\quad \theta^{[i]} \sim \mathrm{Uniform}(-\pi, \pi).$$

The lattice puts the remaining particles on the path vertices at twelve headings. After the first scans the weights are cubed, which is a way to see whether one particle owns the cloud. After that particle is adopted, the cube goes away.

Let $\bar\ell_t$ be the log of the average beam likelihood, so the particles that fit dominate it. Two smoothers track it:

$$\ell_{\mathrm{slow}} \leftarrow \ell_{\mathrm{slow}} + \alpha_{\mathrm{slow}}(\bar\ell_t - \ell_{\mathrm{slow}}),$$

$$\ell_{\mathrm{fast}} \leftarrow \ell_{\mathrm{fast}} + \alpha_{\mathrm{fast}}(\bar\ell_t - \ell_{\mathrm{fast}}),$$

with $\alpha_{\mathrm{slow}} \ll \alpha_{\mathrm{fast}}$. A drop of several nats injects new free-space particles. A turn moves $\bar\ell_t$ by a nat or two and injects nothing. The normalized weights always average $1/N$, so they are the wrong signal for "the scan suddenly fits badly."

The yellow ellipse is the 2-sigma contour of the weighted covariance. A cloud that still covers the yard draws a large ellipse. After the collapse it sits on the car.

## Two straights that look the same until a cone

The oval has two straights with the same wall distances. A scan taken while parked matches both, so the weight stays split until something breaks the symmetry. The cones and the crates sit on the outer lanes, and they are mirrored poorly. The best particle on the first scans is already one straight. Rolling past a cone is what retires the other one. Along the straight, parallel walls are quiet about distance travelled. The cones speak. The Bayes lesson's one-dimensional search slides the whole cloud along the route tangent until those short edges agree with the scan.

On the oval the cloud tightens in the first second: the yellow ring shrinks under half a metre and the estimate stays on the car. A long straight wall is quiet about distance travelled. A cone changes the scan as you roll past it, and that is what pulls the estimate along the straight.

The warehouse aisles are even less distinct at the first scan. Collapsing immediately adopts a particle that shares the weight with many others, and pursuit of that particle drives into the racks. Waiting for a peak, while the wall follower creeps, is what turns the minute into a lap.

The mean of two modes lies in the wall between them. The starter steers at one winner, or at the wall beside the car.

## Try it

1. Run the kidnapped starter. The first frame should be hundreds of magenta dots across the free space, with a large yellow ellipse. The camera is overhead, and it comes in once the ellipse tightens.
2. On the oval, look for a second clump on the far straight at the start. After the car passes a cone, the along-track error should come down. The known-start filter on this oval ends in the same band.
3. Turn on Drive it yourself, click the view, and drive yourself along the straight. The cloud should collapse onto you as the scan changes. Switch to the warehouse and the creep lasts longer, because the first scans share their weight.
