import RAPIER from "@dimforge/rapier3d-compat";
import { ACKERMANN_BUGGY, CONTROL_DT, PHYSICS_DT, clampCommand, odomToWorld } from "./api";
import { spawnFor, type EvalExample } from "./eval/scenarios";
import { EXAMPLES, DEFAULT_EXAMPLE } from "./editor/examples";
import { createEditor, type CodeEditor } from "./editor/editor";
import { ChaseCamera } from "./sim/camera";
import { LidarView } from "./sim/lidar-view";
import { addPhysicsGround, SimView, type GraphicsQuality } from "./sim/scene";
import { bindPropLoader } from "./sim/props";
import { bindTextureLoader } from "./sim/surfaces";
import { PathOverlay } from "./sim/path-overlay";
import { AckermannBuggy, SERVICE_BRAKE, STOP_BRAKE, type SpawnPose } from "./sim/vehicle";
import {
  QUALITY_STORAGE_KEY,
  WORLD_STORAGE_KEY,
  WORLDS,
  disposeWorld,
  isWorldId,
  mountWorld,
  type SimWorld,
  type WorldId,
} from "./sim/worlds";
import { CodeSandbox, type SandboxState } from "./sandbox/controller";
import { ConsolePanel } from "./ui/console-panel";
import { Hud, type AppMode } from "./ui/hud";
import { mountSplitter } from "./ui/splitter";

export async function mountApp(): Promise<void> {
  const viewport = mustGet<HTMLElement>("viewport");
  const loading = mustGet<HTMLElement>("loading");
  const loadingText = mustGet<HTMLElement>("loading-text");
  const hint = mustGet<HTMLElement>("hint");
  const codePanel = mustGet<HTMLElement>("code-panel");
  const runState = mustGet<HTMLElement>("run-state");
  const pythonStatus = mustGet<HTMLElement>("python-status");
  const exampleSelect = mustGet<HTMLSelectElement>("example");
  console.info(`[robo-sim] crossOriginIsolated: ${crossOriginIsolated}`);

  let mode: AppMode = "drive";
  const keys = new Set<string>();
  const hud = new Hud(mustGet("hud"));
  const consolePanel = new ConsolePanel(mustGet("console"));

  let sandbox: CodeSandbox | null = null;
  let editor: CodeEditor | null = null;

  const setRunState = (state: SandboxState) => {
    runState.dataset.state = state;
    runState.textContent =
      state === "running"
        ? "Running"
        : state === "loading"
          ? "Loading"
          : state === "error"
            ? "Error"
            : state === "stopped"
              ? "Stopped"
              : "Idle";
    pythonStatus.hidden = state !== "loading";
  };

  try {
    loadingText.textContent = "Loading physics…";
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = PHYSICS_DT;

    const view = new SimView(viewport);
    bindTextureLoader(view.renderer);
    bindPropLoader(view.renderer);
    void view.loadHdri().catch((error: unknown) => console.warn("[robo-sim] HDRI unavailable", error));
    const savedQuality = localStorage.getItem(QUALITY_STORAGE_KEY);
    let graphics: GraphicsQuality = savedQuality === "low" ? "low" : "high";
    view.setQuality(graphics);
    addPhysicsGround(RAPIER, world);
    const savedWorld = localStorage.getItem(WORLD_STORAGE_KEY);
    const initialWorld: WorldId = isWorldId(savedWorld) ? savedWorld : "city";
    let yard: SimWorld = await mountWorld(initialWorld, RAPIER, world, view.scene, graphics);
    view.setAtmosphere(yard.atmosphere);
    const robot = new AckermannBuggy(RAPIER, world, view.scene);
    const paths = new PathOverlay(view.scene);
    const seedInput = mustGet<HTMLInputElement>("seed");
    let noiseSeed = readSeed(seedInput);
    robot.setNoiseSeed(noiseSeed);
    let activeSpawn: SpawnPose = yard.spawn;
    robot.reset(activeSpawn);
    let paused = false;
    const lidar = new LidarView(view.scene, viewport);
    const camera = new ChaseCamera(view.camera, viewport);

    const resize = () => view.resize(viewport.clientWidth, viewport.clientHeight);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);

    sandbox = new CodeSandbox({
      onCommand: (command) => {
        if (mode === "code" && code.current === "running") robot.setCommand(command, 0);
      },
      onLog: (line, level) => consolePanel.log(line, level),
      onState: (state) => {
        setRunState(state);
        pythonStatus.hidden = state !== "loading" || (sandbox?.runtimeIsReady ?? false);
        if (state === "error") {
          robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), STOP_BRAKE);
        }
      },
    });
    const code = sandbox;

    editor = createEditor(mustGet("editor"), DEFAULT_EXAMPLE.source, () => runProgram());
    const codeEditor = editor;
    for (const example of EXAMPLES) {
      const option = document.createElement("option");
      option.value = example.id;
      option.textContent = example.label;
      exampleSelect.append(option);
    }

    const applyDrive = () => {
      const forward = keys.has("KeyW") || keys.has("ArrowUp");
      const back = keys.has("KeyS") || keys.has("ArrowDown");
      const left = keys.has("KeyA") || keys.has("ArrowLeft");
      const right = keys.has("KeyD") || keys.has("ArrowRight");
      const braking = keys.has("Space");
      const throttle = braking ? 0 : forward ? 1 : back ? -0.65 : 0;
      // Positive steering is a left turn from the driver's seat (nose toward +X at yaw 0).
      const steering = ((left ? 1 : 0) - (right ? 1 : 0)) * ACKERMANN_BUGGY.limits.maxSteering;
      robot.setCommand(
        clampCommand({ steering, throttle }, ACKERMANN_BUGGY.limits),
        braking ? SERVICE_BRAKE : 0,
      );
    };

    const currentSpawn = (): SpawnPose => {
      const example = exampleSelect.value;
      if (mode === "code" && isExample(example)) return spawnFor(yard.id, example, "scenario");
      return yard.spawn;
    };

    const resetWorld = () => {
      if (mode === "code") stopProgram();
      activeSpawn = currentSpawn();
      paths.clear();
      robot.reset(activeSpawn);
      if (mode === "drive") applyDrive();
    };

    const resetToSeed = (seed = readSeed(seedInput)) => {
      noiseSeed = seed >>> 0;
      seedInput.value = String(noiseSeed);
      robot.setNoiseSeed(noiseSeed);
      resetWorld();
    };

    const runProgram = () => {
      if (mode !== "code") return;
      consolePanel.log("— running —", "log");
      code.run(codeEditor.getValue());
    };

    const stopProgram = () => {
      code.stop();
      robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), STOP_BRAKE);
    };

    const setMode = (next: AppMode) => {
      mode = next;
      document.getElementById("app")?.classList.toggle("code-mode", next === "code");
      codePanel.hidden = next !== "code";
      mustGet<HTMLButtonElement>("mode-drive").setAttribute("aria-selected", String(next === "drive"));
      mustGet<HTMLButtonElement>("mode-code").setAttribute("aria-selected", String(next === "code"));
      hint.textContent =
        next === "drive"
          ? "WASD or arrows to drive · Space brakes · Drag to look · Scroll to zoom · R resets"
          : "Ctrl/⌘ Enter runs Python · sensors only, at 20 Hz · Drag to look around";
      if (next === "drive") {
        stopProgram();
        applyDrive();
      } else {
        robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), STOP_BRAKE);
        code.warmup();
        requestAnimationFrame(() => codeEditor.relayout());
      }
    };

    mustGet("mode-drive").addEventListener("click", () => setMode("drive"));
    mustGet("mode-code").addEventListener("click", () => setMode("code"));
    mustGet("run").addEventListener("click", () => runProgram());
    mustGet("stop").addEventListener("click", () => stopProgram());
    mustGet("reset").addEventListener("click", () => resetWorld());
    mustGet("clear-console").addEventListener("click", () => consolePanel.clear());
    mustGet("camera-reset").addEventListener("click", () => camera.reset());
    const worldSelect = mustGet<HTMLSelectElement>("world");
    for (const item of WORLDS) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      worldSelect.append(option);
    }
    worldSelect.value = yard.id;
    let switchingWorld = false;
    const switchWorld = async (id: WorldId, force = false) => {
      if (switchingWorld || (!force && id === yard.id)) return;
      switchingWorld = true;
      worldSelect.disabled = true;
      try {
        if (mode === "code") stopProgram();
        disposeWorld(world, yard);
        yard = await mountWorld(id, RAPIER, world, view.scene, graphics);
        view.setAtmosphere(yard.atmosphere);
        activeSpawn = currentSpawn();
        paths.clear();
        robot.reset(activeSpawn);
        camera.reset();
        localStorage.setItem(WORLD_STORAGE_KEY, id);
        if (mode === "drive") applyDrive();
      } finally {
        worldSelect.disabled = false;
        switchingWorld = false;
      }
    };
    worldSelect.addEventListener("change", () => {
      if (!isWorldId(worldSelect.value)) return;
      void switchWorld(worldSelect.value);
    });
    const qualitySelect = mustGet<HTMLSelectElement>("quality");
    qualitySelect.value = graphics;
    const applyQuality = async (next: GraphicsQuality) => {
      qualitySelect.value = next;
      if (next === graphics || switchingWorld) return;
      graphics = next;
      view.setQuality(next);
      view.resize(viewport.clientWidth, viewport.clientHeight);
      localStorage.setItem(QUALITY_STORAGE_KEY, next);
      await switchWorld(yard.id, true);
    };
    qualitySelect.addEventListener("change", () => {
      void applyQuality(qualitySelect.value === "low" ? "low" : "high");
    });
    const lidarButton = mustGet<HTMLButtonElement>("lidar-toggle");
    const setLidarButton = (enabled: boolean) => {
      lidar.setEnabled(enabled);
      lidarButton.setAttribute("aria-pressed", String(enabled));
      lidarButton.classList.toggle("is-on", enabled);
      lidarButton.textContent = enabled ? "Lidar on" : "Lidar off";
    };
    setLidarButton(true);
    lidarButton.addEventListener("click", () => setLidarButton(!lidar.isEnabled));
    mountSplitter(mustGet("splitter"), () => {
      view.resize(viewport.clientWidth, viewport.clientHeight);
      codeEditor.relayout();
    });
    exampleSelect.addEventListener("change", () => {
      const example = EXAMPLES.find((item) => item.id === exampleSelect.value);
      if (!example) return;
      if (code.current === "running") stopProgram();
      codeEditor.setValue(example.source);
      if (mode === "code") resetWorld();
    });
    const pathsButton = mustGet<HTMLButtonElement>("paths-toggle");
    const setPaths = (enabled: boolean) => {
      paths.setVisible(enabled);
      pathsButton.setAttribute("aria-pressed", String(enabled));
      pathsButton.classList.toggle("is-on", enabled);
      pathsButton.textContent = enabled ? "Paths on" : "Paths";
    };
    setPaths(false);
    pathsButton.addEventListener("click", () => setPaths(!paths.visible));
    mustGet("reset-seed").addEventListener("click", () => resetToSeed());

    window.addEventListener(
      "keydown",
      (event) => {
        if (
          mode === "code" &&
          event.key === "Enter" &&
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          event.stopPropagation();
          runProgram();
          return;
        }
        if (isTypingTarget(event.target)) return;
        if (mode === "drive" && event.code === "KeyR" && !event.repeat) resetWorld();
        if (mode !== "drive") return;
        if (event.code.startsWith("Arrow") || event.code === "Space") event.preventDefault();
        keys.add(event.code);
      },
      true,
    );
    window.addEventListener("keyup", (event) => {
      keys.delete(event.code);
    });
    window.addEventListener("blur", () => keys.clear());

    setMode("drive");
    loading.hidden = true;

    window.roboSim = {
      ready: true,
      resetToSeed,
      setPathOverlay: setPaths,
      pause: (next) => {
        paused = next;
      },
      teleport: (pose) => {
        activeSpawn = pose;
        robot.teleport(pose);
        camera.update(1, robot.focus());
      },
      setWorld: async (id) => {
        if (!isWorldId(id)) return;
        await switchWorld(id, true);
      },
      setExample: (id) => {
        if (!isExample(id)) return;
        exampleSelect.value = id;
        exampleSelect.dispatchEvent(new Event("change"));
      },
      setQuality: (next) => applyQuality(next === "low" ? "low" : "high"),
      focus: () => robot.focus(),
    };

    view.renderer.domElement.focus({ preventScroll: true });

    let last = performance.now();
    let accumulator = 0;
    let sensorAccumulator = 0;
    let simTime = 0;

    const frame = (now: number) => {
      try {
        const frameDt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!paused) {
          accumulator = Math.min(accumulator + frameDt, PHYSICS_DT * 5);
          let steps = 0;
          while (accumulator >= PHYSICS_DT && steps < 5) {
            if (mode === "drive") applyDrive();
            robot.preStep(PHYSICS_DT);
            world.step();
            simTime += PHYSICS_DT;
            sensorAccumulator += PHYSICS_DT;
            accumulator -= PHYSICS_DT;
            steps += 1;
            if (sensorAccumulator >= CONTROL_DT - 1e-4) {
              const sampleDt = sensorAccumulator;
              sensorAccumulator = 0;
              const sensors = robot.sampleSensors(sampleDt);
              sensors.time = simTime;
              if (mode === "code") code.offer(sensors);
              lidar.update(robot.lidarDebug(), sensors.lidar);
              const focusNow = robot.focus();
              paths.push(focusNow, robot.telemetry().trueSpeed, odomToWorld(activeSpawn, sensors.odometry.pose));
            }
          }
        }
        robot.syncVisuals();
        const focus = robot.focus();
        camera.update(frameDt, focus);
        view.followSun(focus.x, focus.z);
        hud.update(robot.telemetry(), mode, code.current);
        view.render();
      } catch (error) {
        console.error(error);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (error) {
    loading.hidden = false;
    loadingText.textContent = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function readSeed(input: HTMLInputElement): number {
  const value = Number(input.value);
  return Number.isFinite(value) ? value >>> 0 : 1;
}

function isExample(id: string): id is EvalExample {
  return id === "circle" || id === "avoid" || id === "wall";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, .cm-content, .cm-editor"));
}
