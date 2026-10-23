---
title: Lidar obstacle avoidance
order: 2
worlds: forest, track
world: forest
spawn: avoid
starter: avoid
action: lab
prerequisites: models/lidar
status: ready
---

Now the car looks. Avoidance reads the scan and steers toward a gap the car actually fits through. There is no map and no path, just this sweep and the next one. Pointed into the trees, a gap follower has trunks to thread, and that is a much livelier puzzle than an empty road.

In the sim: the forest, aimed into the trees, with the lidar drawn.

<svg viewBox="0 0 520 240" role="img" aria-label="Each lidar hit blocks a wedge about as wide as the car. The starter aims at the opening that remains.">
  <rect width="520" height="240" rx="12" fill="#0e1418"/>
  <polygon points="250,180 80,56 150,40" fill="#3a2420" stroke="#e36d5c" stroke-width="2"/>
  <polygon points="250,180 330,36 420,52" fill="#3a2420" stroke="#e36d5c" stroke-width="2"/>
  <path d="M250 180 L168 38" fill="none" stroke="#7ee0d0" stroke-width="2" stroke-dasharray="5 4"/>
  <path d="M250 180 L312 34" fill="none" stroke="#7ee0d0" stroke-width="2" stroke-dasharray="5 4"/>
  <circle cx="250" cy="186" r="10" fill="#f4f7f4"/>
  <text x="230" y="214" fill="#f4f7f4" font-size="16" font-family="sans-serif">car</text>
  <text x="188" y="28" fill="#7ee0d0" font-size="16" font-family="sans-serif">open gap</text>
  <text x="78" y="48" fill="#e36d5c" font-size="16" font-family="sans-serif">hit</text>
  <text x="360" y="36" fill="#e36d5c" font-size="16" font-family="sans-serif">hit</text>
  <text x="20" y="232" fill="#d5ddd8" font-size="16" font-family="sans-serif">A hit paints a wedge of half-width HALF. The car steers into what is left.</text>
</svg>

Each hit blocks a wedge about as wide as the car, a single ray thickened until the bumper would fit. Among the openings that remain in front of the car, the starter aims at the widest one, and it slows down when the nearest forward return is close. Speed follows that nearest return, because a cone off to the side is still on the bumper's path.

If the car is boxed in, or if it has barely moved for a couple of seconds, it backs up a short way and yaws toward the clearer side, then tries again. That escape is part of the starter. The rear scan is a thin wedge, so the backup stays short.

In the forest the starter also prefers a heading that keeps it in the corridor, using the pattern of ranges. It is still reactive. `sensors.task.path` stays unread.

## A gap is an interval of angles

Let the forward beams be those with $|\alpha| < \alpha_{\max}$. The longest single range is often a crack between two trunks. A better rule treats a return $r$ at angle $\alpha$ as occupying

$$\alpha \in \big[\alpha - \arctan(w / r),\; \alpha + \arctan(w / r)\big]$$

for a half-width $w$ a bit larger than the car, and then picks the opening with the best score. The starter writes that idea as a pass over the beams.

The half-width of each wedge, in meters. `HALF` is how wide a hit is painted. It is a plain name at the top of the program.

{{code:settings}}

The helper that paints those wedges:

{{code:inflate}}

Throttle is a function of the nearest forward range $r_{\min}$. Far away, throttle is positive and modest. As $r_{\min}$ falls toward the bumper offset, throttle falls toward 0 and then toward a short reverse. One threshold would be wrong at every speed, so the starter uses a few bands.

Reactive avoidance decides from this scan alone. This lesson runs in the forest, where the car threads trunks and keeps moving. The same program on the oval treats cones as blockers and stays off them. The warehouse stays locked: those aisles are tighter than this reactive rule, and the forest and the oval are the worlds where it stays clean.

A gap on the left has positive angle, and positive steering turns left. Negating the command "to match the camera" turns into the obstacle.

## Try it

1. Run the starter in the forest. You should thread the corridor and keep moving.
2. On the oval, watch it treat cones as blockers. A one-beam gap between cones should stay closed.
3. Halve `HALF` in the settings above and run the forest again. The car should start accepting gaps it cannot fit.
