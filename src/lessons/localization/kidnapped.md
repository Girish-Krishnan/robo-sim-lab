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

A kidnapped robot was moved while it was not looking. The odometry origin is no longer a hint. The prior is spread over free space. The car creeps until one pose owns the scan, then it drives the route.

In the sim: overhead on the oval until the cloud collapses onto the car.

`UNKNOWN_START` in the kidnapped starter is true. Most of the 720 particles are free cells with a random heading. A minority sit on the known route at twelve headings. A few hundred uniform poses do not cover $x$, $y$, and yaw, so a route lattice is there so that some particle can land on the car. Nothing reads the true pose. The camera frames the known map from above, because a chase camera behind the bumper cannot show a cloud that fills the yard.

Each particle is a saturated magenta dot, about 8 px, with a dark outline and a heading tick of about 28 cm. The marks are drawn after the scene's color grade, so they stay magenta on asphalt, grass, and dirt. The yellow ellipse is the 2-sigma contour of the cloud. While that ellipse is still the size of the yard, the camera stays overhead. Once it tightens onto the car, the camera comes in so the swarm and the ring stay readable.

While no particle holds much of the weight, the car creeps with the right-wall follower from the wall lesson. The gains are the same. Only the throttle is capped, so the car does not sprint an open straight on a guess. Pursuit starts once the best particle holds about a tenth of the weight: the cloud is replaced by a tight tracking cloud around that pose, and the rest of the minute is the same pure pursuit as the known-start filter.

On the city roundabout and in the forest that peak is there on the first scans, almost all of the weight on one particle. On the oval the best particle holds about a tenth, because the other straight still explains a parked scan. That tenth is already the true straight on this route; it is not a pose known to a decimetre. The warehouse bay is flatter still. The peak stays near a few percent until the car has rolled, so the creep continues and pursuit waits.

Augmented MCL keeps a short-term and a long-term average of the log of the mean likelihood. When the recent scans fit worse than the filter has been used to, the short-term average falls first and the resample mixes in random free-space particles, at most a quarter of the cloud. A full replacement on a small dip is how a symmetric aisle flips to the other copy of itself. If the published pose has left the route, the wall follower takes the wheel again.

## A prior, and the signal that injects new particles

The belief starts as free space plus a route lattice. The free part is

$$x^{[i]} \sim \mathrm{Uniform}(\mathcal{F}),\quad \theta^{[i]} \sim \mathrm{Uniform}(-\pi, \pi).$$

The lattice puts the remaining particles on the path vertices at twelve headings. After the first scans the weights are cubed, which is only a way to see whether one particle owns the cloud. It is not used once that particle has been adopted.

Let $\bar\ell_t$ be the log of the average beam likelihood, the arithmetic mean, so the particles that fit dominate it. Two smoothers track it:

$$\ell_{\mathrm{slow}} \leftarrow \ell_{\mathrm{slow}} + \alpha_{\mathrm{slow}}(\bar\ell_t - \ell_{\mathrm{slow}}),$$

$$\ell_{\mathrm{fast}} \leftarrow \ell_{\mathrm{fast}} + \alpha_{\mathrm{fast}}(\bar\ell_t - \ell_{\mathrm{fast}}),$$

with $\alpha_{\mathrm{slow}} \ll \alpha_{\mathrm{fast}}$. A drop of several nats injects new free-space particles. A turn moves $\bar\ell_t$ by a nat or two and injects nothing. The normalized weights always average $1/N$ and cannot be this signal.

The yellow ellipse is the 2-sigma contour of the weighted covariance. A cloud that still covers the yard draws a large ellipse. After the collapse it sits on the car.

## Two straights that look the same until a cone

The oval has two straights with the same wall distances. A scan taken while parked matches both, so the weight stays split and a confident cloud at the first frame would be a coin flip. The starter does not pretend otherwise. The cones and the crates sit on the outer lanes, and they are not mirrored. The best particle on the first scans is already one straight; rolling past a cone is what would kill the other one if the weight were still shared. Along the straight, parallel walls do not observe distance travelled. The cones do. The Bayes lesson's one-dimensional search slides the whole cloud along the route tangent until those short edges agree with the scan. On seed 1 the kidnapped cloud meets the convergence test at 0.5 s: 2-sigma position radius under 0.5 m, heading sigma under 10°, and the estimate under 0.5 m, held for a second. It ends the minute near 0.29 m. The known-start filter on this same oval ends near 0.38 m. Without the cones in the likelihood, that minute ended a little over a metre, which was the wheel-speed bias integrated along a flat corridor.

The warehouse aisles are even less distinct at the first scan. Collapsing immediately adopts a particle that does not own the cloud, and pursuit of that particle drives into the racks. Waiting until a peak appears, while the wall follower creeps, is the difference between a lap and a contact.

Creeping is safer than sitting for the whole minute. It is also how you hit a wall if you pursue the mean of two modes. That mean lies in the wall between them. The starter steers at one winner, or at the wall beside the car, and never at the average of both.

## An overhead cloud, then a tight one

Run the kidnapped starter. The first frame should be hundreds of magenta dots across the free space, with a large yellow ellipse. The camera is overhead for that frame, and it comes in once the ellipse tightens. On the oval, look for a second clump on the far straight at the start. The ellipse tightens once one straight owns the weight. After the car passes a cone, the along-track error should come down. It does not have to sit on zero. The known-start filter on this same oval ends in the same band. Switch to the warehouse. The creep lasts longer than on the oval, because the first scans do not have a peak. Pursuit starts after one appears.
