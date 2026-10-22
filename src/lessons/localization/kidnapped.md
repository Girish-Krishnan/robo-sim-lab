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

A kidnapped robot was moved while it was not measuring. The odometry origin is a fresh zero in a place the robot has not recognised. The prior, the belief before any scan, is spread over free space. The car creeps until one pose owns the scan, then it drives the route.

In the sim: overhead on the oval while the cloud is wide. The Key names the same marks as the particle lesson: pink dots are particles, the yellow ring is the 2-sigma spread, the red trail is the estimate, and the blue trail is odometry.

<svg viewBox="0 0 520 250" role="img" aria-label="Two clumps of particles on the two straights of an oval. A cone retires the far clump.">
  <rect width="520" height="250" rx="12" fill="#0e1418"/>
  <rect x="70" y="50" width="380" height="150" rx="70" fill="none" stroke="#3d4a44" stroke-width="28"/>
  <rect x="130" y="86" width="260" height="78" rx="36" fill="#0e1418"/>
  <circle cx="150" cy="78" r="4" fill="#ff2bd6"/>
  <circle cx="168" cy="70" r="4" fill="#ff2bd6"/>
  <circle cx="186" cy="82" r="4" fill="#ff2bd6"/>
  <circle cx="158" cy="90" r="4" fill="#ff2bd6"/>
  <circle cx="340" cy="176" r="4" fill="#ff2bd6" opacity="0.7"/>
  <circle cx="360" cy="184" r="4" fill="#ff2bd6" opacity="0.7"/>
  <circle cx="378" cy="172" r="4" fill="#ff2bd6" opacity="0.7"/>
  <circle cx="200" cy="64" r="8" fill="#ffd24a"/>
  <text x="214" y="60" fill="#ffd24a" font-size="16" font-family="sans-serif">cone</text>
  <text x="80" y="36" fill="#f4f7f4" font-size="18" font-family="sans-serif">Two straights, one scan</text>
  <text x="24" y="214" fill="#d5ddd8" font-size="15" font-family="sans-serif">The near clump is the car.</text>
  <text x="24" y="236" fill="#d5ddd8" font-size="15" font-family="sans-serif">The far clump matches the walls until a cone does not.</text>
</svg>

`UNKNOWN_START` is true here. Most of the 720 particles start in empty space, each with a random heading. A few sit on the route at twelve headings, so one of them can land on the car. The camera stays overhead while that cloud fills the yard.

{{code:tunables}}

While the weight is spread out, the car creeps with the wall follower and a capped throttle. Pursuit starts once the best clump has about 10% of the weight, and it's on the right straight. The cloud then tightens around that pose.

On a roundabout or in the forest, one particle takes almost all of the weight at once. On the oval the best clump has about 10% of the weight, and it's on the right straight. The other straight can still explain a parked scan, so the rest of the weight stays out there for a while. The warehouse bay shares its weight for longer, so the creep lasts longer.

Going further: Augmented MCL mixes new particles back in when the scan starts fitting badly. It watches the log of the mean likelihood: the average beam likelihood, then its natural log, counted in nats. A short-term average of that log is compared with a long-term one. A drop of several nats adds random particles in empty space, at most a quarter of the cloud. A turn moves the fit by a nat or two and adds none. After the first scans the weights are cubed, so a strong particle looks stronger. The cube goes away once that particle is adopted.

The prior that spreads the first cloud, and the steer once a winner exists:

{{code:prior}}

{{code:pursue}}

## Two straights that look the same until a cone

The oval's two straights share the same wall distances, so a second clump can sit on the far straight. The cones are not copies of each other, so rolling past one retires the far clump. Until then the yellow ring stays wide even though the red estimate is already on the true straight.

On seed 1 the view holds that wide cloud for about two seconds, and the car stays still. The filter has already chosen a straight by then. When the hold ends, the pink dots jump to a clump ahead of the car on that straight, and the red estimate sits with the clump. The car creeps. After a cone, the clump slides onto the car and the ring shrinks. The starter steers at one winner, or at the wall beside the car, rather than at the average of the two clumps, which would sit in the wall between them.

## Try it

1. Run the kidnapped starter and watch the Time row. For about two seconds the car stays still, the camera stays overhead, and the pink dots cover the yard inside a large yellow ring.
2. After those two seconds the dots jump to a clump ahead of the car on the straight. The car starts to creep. After it passes a cone, that clump slides onto the car and the ring shrinks.
3. Turn on Drive it yourself and drive the straight. The cloud should gather on you as the scan changes. In the warehouse the creep lasts longer, because the first scans share their weight.
