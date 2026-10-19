# Robo Sim Lab

An educational robotics simulator that runs entirely in the browser. Open the page, drive an Ackermann-steered buggy around a small proving ground, or write a controller that sees only simulated sensors and watch it run in the same 3D world.

There is no backend. The site is a static Vite build.

## Quick start

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` writes the static site to `dist/`. `npm test` checks the sensor protocol, the bicycle-model odometry, and Ackermann geometry.

Drive with WASD or the arrow keys. Space brakes. Drag the view to orbit the car, scroll to zoom, and press `R` to reset. **Code** opens the editor.

## What you are looking at

The buggy is a Rapier `DynamicRayCastVehicleController`: four suspension rays, front wheels steered with Ackermann geometry, and drive torque split across the axles. The rendered world is Three.js (WebGL2) — ground plane, painted pad, gate, bollards, crates, a corridor, a ramp, perimeter walls, and trees. The chase camera follows the chassis. A toggle draws the latest planar lidar returns in the world.

Physics steps at 60 Hz. Student code runs at 20 Hz.

## Architecture

```mermaid
flowchart LR
  subgraph main [Main thread]
    View[Three.js view]
    Physics[Rapier world and vehicle]
    Sensors[Sensor models]
    Hud[HUD]
    Editor[CodeMirror]
  end
  Worker[Web Worker sandbox]
  Editor -->|source, on Run| Worker
  Physics --> Sensors
  Sensors -->|"SensorFrame only"| Worker
  Worker -->|"{ steering, throttle }"| Physics
  Physics --> View
  Physics --> Hud
```

Ground-truth pose and velocity stay on the main thread. They are used to integrate physics, to aim the camera, and to draw the HUD. The worker never imports the simulator. Before every `postMessage`, the host copies the sample through `publishSensorFrame`, which keeps a fixed set of fields and drops anything else, then `assertNoBannedKeys` rejects names such as `groundTruth`, `translation`, `linvel`, or `position`.

The worker is terminated and replaced on **Stop**, and also if a tick does not return within 400 ms (an infinite loop). `console.log` and thrown errors show up in the console panel. Top-level statements in the editor run once per **Run**; `update` is called on each tick and can close over that state.

| Path | Role |
| --- | --- |
| `src/api/` | Student-facing types, the publish/clamp gate, bicycle-model odometry, Ackermann angles, robot descriptor. No Three.js and no Rapier. |
| `src/robots/types.ts` | `SimRobot`. A new platform implements this and still speaks `SensorFrame` / `ControlCommand`. |
| `src/sim/` | World, vehicle, sensor models, camera, lidar overlay. |
| `src/sandbox/` | Worker and its host. The worker imports only `src/api`. |
| `src/editor/` | CodeMirror and the two starter programs. |
| `src/lessons` | Not a package yet. The example list in `src/editor/examples.ts` is the seed for lessons. |

### Why these libraries

- **Rapier** (`@dimforge/rapier3d-compat`) for the raycast vehicle and the lidar raycasts. The compat build inlines WASM as base64, so a static host does not need a special WASM content type.
- **Three.js `WebGLRenderer`**, not `WebGPURenderer`. Shadows and `MeshStandardMaterial` are predictable on WebGL2, including machines with no WebGPU adapter. Rendering is isolated in `src/sim/scene.ts`; swapping in `WebGPURenderer` (it already falls back to WebGL2) does not touch physics or the student API.
- **CodeMirror 6** for the editor.

Cross-origin isolation (COOP/COEP) is turned on even though this prototype's Rapier build does not need `SharedArrayBuffer`. A later Pyodide worker does. Dev and `vite preview` send the headers themselves.

## Student API

`update(sensors)` runs at 20 Hz. Return `{ steering, throttle }`.

- `steering` — radians, positive left, clamped to ±0.55.
- `throttle` — −1 … 1, positive forward, clamped to that range.

The robot frame is x forward, y left, z up. Yaw is counterclockwise from above. The wheelbase is 1.9 m (`src/api/descriptor.ts`).

```js
function update(sensors) {
  // sensors.lidar     { angles, ranges, maxRange }
  // sensors.odometry  { speed, steeringAngle, pose }
  // sensors.imu       { yawRate, accel: { x, y, z } }
  // sensors.camera    { available: false }
  // sensors.time, sensors.dt
  return { steering: 0.34, throttle: 0.5 };
}
```

`Object.keys(sensors)` is `time`, `dt`, `lidar`, `odometry`, `imu`, `camera`. There is no pose channel and no velocity channel.

### Sensors

All of these are noisy. None of them is the body's true pose.

| Channel | Contents |
| --- | --- |
| Lidar | 360 planar beams, 25 m max range, about 3.5 cm of range noise. Angle 0 is forward, positive is left. `maxRange` means no return. The ray starts at the roof puck and does not hit the chassis. |
| Wheel odometry | Rear-wheel speed and the actuator steering angle, plus noise. `pose` is a bicycle-model integral of those noisy readings. It starts at the origin on reset and drifts. It is not where the car is in the world. |
| IMU | Yaw rate about body +z, and specific force in the robot frame (about +9.81 m/s² on +z when level and still), with a bias chosen at reset and white noise. |
| Camera | Stub, `{ available: false }`. A later version can attach pixels here without changing the call shape. |

The HUD shows true forward speed next to odometry speed, and commanded steering next to the slewed actuator angle. True speed is for the person watching. It is not sent to the program.

The two editor examples are **Circle drive** (open-loop steer and throttle) and **Lidar avoid** (steer away from the nearest forward return). Ctrl/⌘ Enter runs the buffer.

## Adding a robot, Python, or a lesson

- **Another robot.** Implement `SimRobot` in `src/robots/types.ts`. Build its collider in `src/sim/`, and keep returning a `SensorFrame`. The sandbox does not change.
- **Python via Pyodide.** Swap the worker. The host already posts `{ type: "tick", id, sensors }` and expects `{ type: "result", id, command }`. Pyodide wants the COOP/COEP headers this site already sets.
- **Lessons.** Add an entry beside the examples in `src/editor/examples.ts` (id, label, source). A lesson runner can later load those by id.

## Deploy

### Cloudflare Pages

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | repository root |
| Node | 22 |

Do not set `GITHUB_PAGES`. The production base path is `/`.

`public/_headers` is copied into `dist/` and tells Cloudflare to send:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### GitHub Pages

The workflow `.github/workflows/pages.yml` builds on pushes to `main` (and on manual dispatch) and deploys with GitHub Actions. In the repo settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

The site is served at `https://<user>.github.io/robo-sim-lab/`. The workflow sets `GITHUB_PAGES=true`, which does two things:

- Vite `base` is `/robo-sim-lab/`.
- `coi-serviceworker.js` is emitted next to `index.html` and loaded from the page. GitHub Pages cannot set COOP/COEP itself; the service worker reloads once and applies them. It is not injected for Cloudflare or for local dev, where the real headers are already present (loading both will fight).

The workflow also writes `dist/.nojekyll` so GitHub does not drop `_headers` or other underscored files.
