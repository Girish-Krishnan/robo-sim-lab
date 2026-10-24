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

Someone picked the robot up and set it down somewhere else. A kidnapped robot was moved while it was not measuring. The odometry origin is a fresh zero in a place the robot has not recognized. The prior, the belief before any scan, is spread over free space.

In the sim, the camera stays overhead and the view holds that first cloud for 2 s. The car stays still during the hold. On seed 1 the guesses are already on the car when the hold ends, and the car then drives the route. When the hold ends, the car pulls away and is cruising at about 4 m/s by 4 s. The key on the view names the marks: pink dots are particles, the yellow ring is the 2-sigma spread, the red trail is the estimate, and the blue trail is odometry.

<svg viewBox="0 0 520 260" role="img" aria-label="A wide prior, then a tight clump on a drawn car after the two second hold.">
  <rect width="520" height="260" rx="12" fill="#0e1418"/>
  <rect x="70" y="48" width="380" height="140" rx="70" fill="none" stroke="#3d4a44" stroke-width="28"/>
  <rect x="130" y="82" width="260" height="72" rx="36" fill="#0e1418"/>
  <circle cx="90" cy="150" r="3" fill="#ff2bd6" opacity="0.35"/>
  <circle cx="250" cy="40" r="3" fill="#ff2bd6" opacity="0.35"/>
  <circle cx="430" cy="120" r="3" fill="#ff2bd6" opacity="0.35"/>
  <circle cx="300" cy="200" r="3" fill="#ff2bd6" opacity="0.35"/>
  <circle cx="140" cy="188" r="3" fill="#ff2bd6" opacity="0.35"/>
  <circle cx="390" cy="56" r="3" fill="#ff2bd6" opacity="0.35"/>
  <g aria-hidden="true">
    <rect x="148" y="34" width="10" height="6" rx="1" fill="#1a1e22"/>
    <rect x="184" y="34" width="10" height="6" rx="1" fill="#1a1e22"/>
    <rect x="148" y="58" width="10" height="6" rx="1" fill="#1a1e22"/>
    <rect x="184" y="58" width="10" height="6" rx="1" fill="#1a1e22"/>
    <rect x="152" y="38" width="40" height="22" rx="5" fill="#d7e2dc"/>
    <rect x="176" y="44" width="12" height="10" rx="2" fill="#8aa0b4"/>
  </g>
  <circle cx="168" cy="46" r="3.2" fill="#ff2bd6"/>
  <circle cx="178" cy="52" r="3.2" fill="#ff2bd6"/>
  <circle cx="186" cy="44" r="3.2" fill="#ff2bd6"/>
  <circle cx="174" cy="56" r="3.2" fill="#ff2bd6"/>
  <text x="24" y="28" fill="#f4f7f4" font-size="18" font-family="sans-serif">Prior first, then the car</text>
  <text x="24" y="222" fill="#d5ddd8" font-size="15" font-family="sans-serif">Faint dots are the wide prior. The car is the light body on the straight.</text>
  <text x="24" y="244" fill="#d5ddd8" font-size="15" font-family="sans-serif">After the hold the guesses sit on the car, and the car drives.</text>
</svg>

`UNKNOWN_START` is true here. Most of the 720 particles start in empty space, each with a random yaw. A few sit on the route at twelve yaws (every 30°), so one of them can land on the car. The camera stays overhead while that cloud fills the world.

{{code:settings}}

On a roundabout or in the forest, one guess matches the walls and the others fade. On the oval, the two long straights look the same to the lidar, so the best guess is only a modest favorite and a second clump can linger. On other seeds the cloud can lock onto the wrong straight for a while; a corner usually settles it. The warehouse keeps several guesses alive until the car moves. The hold is the same either way, and the cloud can stay broad after it.

<details class="going-further">
<summary>Going further</summary>
<p>When the scan stops fitting the map, the filter sprinkles fresh guesses into empty space, and never more than about a quarter of the cloud. It compares a short average of the beam fit with a longer average of the same score. A real mismatch drops that score hard. A turn only wobbles it, and adds no new guesses. Early on, the weights are cubed so one good guess can stand out. Once one guess wins (holds about a tenth of the weight), that cube goes away.</p>
</details>

The prior that spreads the first cloud, and the steer once a winner exists:

{{code:kidnapped_cloud}}

{{code:pursue}}

## What the two seconds are for

The view freezes the first wide drawing for 2 s so you can see the prior, while the filter keeps scoring. When the hold ends, the drawing catches up: the dots are on the car, the ring is tight, and the car drives the route. Until one guess clearly wins, the starter creeps along the nearest wall with the wall-follow law from the reactive module. Then it switches to pursuit on the winner, rather than steering at an average that would sit in the infield.

## Try it

1. Run the kidnapped starter and watch the Time row. For the hold, the speed stays 0, the camera stays overhead, and the pink dots cover the world. That hold is the prior.
2. When the hold ends, the dots sit on the car and the ring tightens. By about 4 s the car is cruising.
3. Turn on Drive it yourself. Drive-it-yourself speed is capped near 3 m/s. The cloud keeps scoring the scan. In the warehouse the weight can stay shared for longer.
