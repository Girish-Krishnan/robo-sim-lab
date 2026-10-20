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

A kidnapped robot was moved while it was not looking. The odometry origin is no longer a hint. The prior is spread over free space, and the view pulls back so that cloud is on screen. The car creeps until one pose owns the scan, then it drives the route.

## In plain words

`UNKNOWN_START` in the kidnapped starter is true. Most of the 720 particles are free cells with a random heading. A minority sit on the known route at twelve headings. A few hundred uniform poses do not cover $x$, $y$, and yaw, so a route lattice is there so that some particle can land on the car. Nothing reads the true pose. The camera frames the known map from above for this lesson, because a chase camera behind the bumper cannot show a cloud that fills the yard.

Each particle is a saturated magenta dot, about 8 px, with a dark outline and a heading tick of about 28 cm. The marks are drawn after the scene's color grade, so they stay magenta on asphalt, grass, and dirt. The yellow ellipse is the 2-sigma contour of the cloud. While that ellipse is still the size of the yard, the camera stays overhead. Once it tightens onto the car, the camera comes in so the swarm and the ring stay readable.

While no particle holds much of the weight, the car creeps with the right-wall follower from the wall lesson. The gains are the same. Only the throttle is capped, so the car does not sprint an open straight on a guess. Pursuit starts once the best particle holds about a tenth of the weight: the cloud is replaced by a tight tracking cloud around that pose, and the rest of the minute is the same pure pursuit as the known-start filter.

On the city roundabout and in the forest that peak is there on the first scans, almost all of the weight on one particle. On the oval the best particle holds about a tenth, because the other straight still explains a parked scan. That tenth is already the true straight on this route; it is not a pose known to a decimetre. The warehouse bay is flatter still. The peak stays near a few percent until the car has rolled, so the creep continues and pursuit waits.

Augmented MCL keeps a short-term and a long-term average of the log of the mean likelihood. When the recent scans fit worse than the filter has been used to, the short-term average falls first and the resample mixes in random free-space particles, at most a quarter of the cloud. A full replacement on a small dip is how a symmetric aisle flips to the other copy of itself. If the published pose has left the route, the wall follower takes the wheel again.

## The math

The belief starts as free space plus a route lattice. The free part is

$$x^{[i]} \sim \mathrm{Uniform}(\mathcal{F}),\quad \theta^{[i]} \sim \mathrm{Uniform}(-\pi, \pi).$$

The lattice puts the remaining particles on the path vertices at twelve headings. After the first scans the weights are cubed, which is only a way to see whether one particle owns the cloud. It is not used once that particle has been adopted.

Let $\bar\ell_t$ be the log of the average beam likelihood, the arithmetic mean, so the particles that fit dominate it. Two smoothers track it:

$$\ell_{\mathrm{slow}} \leftarrow \ell_{\mathrm{slow}} + \alpha_{\mathrm{slow}}(\bar\ell_t - \ell_{\mathrm{slow}}),$$

$$\ell_{\mathrm{fast}} \leftarrow \ell_{\mathrm{fast}} + \alpha_{\mathrm{fast}}(\bar\ell_t - \ell_{\mathrm{fast}}),$$

with $\alpha_{\mathrm{slow}} \ll \alpha_{\mathrm{fast}}$. A drop of several nats injects new free-space particles. A turn moves $\bar\ell_t$ by a nat or two and injects nothing. The normalized weights always average $1/N$ and cannot be this signal.

The yellow ellipse is the 2-sigma contour of the weighted covariance. A cloud that still covers the yard draws a large ellipse. After the collapse it sits on the car.

## Intuition and pitfalls

The oval has two straights with the same wall distances. A scan taken while parked matches both, so the weight stays split and a confident cloud at the first frame would be a coin flip. The starter does not pretend otherwise. The cones and the crates sit on the outer lanes, and they are not mirrored. The best particle on the first scans is already one straight; rolling past a cone is what would kill the other one if the weight were still shared. Along the straight, parallel walls do not observe distance travelled. The estimate first holds under half a metre, then the along-track error grows to about the same size as the known-start filter on this oval, a little over a metre at the end of the minute. That is the sensor, not a second copy of the car.

The warehouse aisles are even less distinct at the first scan. Collapsing immediately adopts a particle that does not own the cloud, and pursuit of that particle drives into the racks. Waiting until a peak appears, while the wall follower creeps, is the difference between a lap and a contact.

Creeping is safer than sitting for the whole minute. It is also how you hit a wall if you pursue the mean of two modes. That mean lies in the wall between them. The starter steers at one winner, or at the wall beside the car, and never at the average of both.

## Try it

1. Run the kidnapped starter. The first frame should be hundreds of magenta dots across the free space, with a large yellow ellipse. The camera is overhead for that frame, and it comes in once the ellipse tightens.
2. On the oval, look for a second clump on the far straight at the start. The ellipse tightens once one straight owns the weight. The along-track error does not go to zero, and the known-start filter on this same oval does not either.
3. Switch to the warehouse. The creep lasts longer than on the oval, because the first scans do not have a peak. Pursuit starts after one appears.
