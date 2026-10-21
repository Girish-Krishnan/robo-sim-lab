import RAPIER from "@dimforge/rapier3d-compat";
import { ACKERMANN_BUGGY, CONTROL_DT, PHYSICS_DT, clampCommand, odomToWorld, worldToOdom, type DrawOp } from "./api";
import { solidsFor, spawnFor } from "./eval/scenarios";
import { EXAMPLES, DEFAULT_EXAMPLE } from "./editor/examples";
import { createEditor, type CodeEditor } from "./editor/editor";
import { ChaseCamera } from "./sim/camera";
import { LidarView } from "./sim/lidar-view";
import { addPhysicsGround, SimView, type GraphicsQuality } from "./sim/scene";
import { bindPropLoader } from "./sim/props";
import { bindTextureLoader } from "./sim/surfaces";
import { DebugDraw } from "./sim/debug-draw";
import { PathOverlay } from "./sim/path-overlay";
import { buildKnownMap } from "./sim/known-map";
import { referenceRoute } from "./sim/routes";
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
import { mountCourse } from "./course/shell";
import { CodeSandbox, type SandboxState } from "./sandbox/controller";
import { ConsolePanel } from "./ui/console-panel";
import { Hud, type AppMode } from "./ui/hud";
import { mountLabSplitter, mountSplitter } from "./ui/splitter";

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
  let onCodeChange: (source: string) => void = () => undefined;

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
    const drawings = new DebugDraw(view.overlay);
    let drawOps: DrawOp[] = [];
    let studentPose = { x: 0, y: 0, yaw: 0 };
    const seedInput = mustGet<HTMLInputElement>("seed");
    let noiseSeed = readSeed(seedInput);
    robot.setNoiseSeed(noiseSeed);
    let activeSpawn: SpawnPose = yard.spawn;
    robot.reset(activeSpawn);
    let paused = false;
    let simTime = 0;
    let accumulator = 0;
    let sensorAccumulator = 0;
    let kidnappedDistance = -1;
    const lidar = new LidarView(view.scene, viewport);
    const camera = new ChaseCamera(view.camera, viewport);

    const resize = () => view.resize(viewport.clientWidth, viewport.clientHeight);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);

    sandbox = new CodeSandbox({
      onCommand: (command) => {
        if (codeControls() && code.current === "running") robot.setCommand(command, 0);
      },
      onDraw: (ops) => {
        drawOps = ops;
        drawings.set(ops, activeSpawn);
        frameKidnappedCloud();
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

    let scratch = DEFAULT_EXAMPLE.source;
    editor = createEditor(mustGet("editor"), DEFAULT_EXAMPLE.source, () => runProgram(), (source) => {
      if (mode === "code") scratch = source;
      onCodeChange(source);
    });
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

    let lessonSpawn: SpawnPose | null = null;
    let lessonWorld: string | null = null;
    let lessonCodeActive = false;
    let lessonCamera: "chase" | "wide" | "overhead" | null = null;
    const codeControls = () => mode === "code" || (mode === "lessons" && lessonCodeActive);
    const handsOn = () => mode === "drive" || (mode === "lessons" && !lessonCodeActive);
    const applyLessonCamera = () => {
      if (lessonCamera === "overhead") camera.overhead(72);
      else if (lessonCamera === "wide") camera.frame(16, 0.7);
      else camera.reset();
    };
    let hintTimer = 0;
    const setHint = () => {
      window.clearTimeout(hintTimer);
      hint.classList.remove("is-faded");
      if (mode === "lessons") {
        hint.hidden = true;
        return;
      }
      hint.hidden = false;
      hint.textContent = handsOn()
        ? "WASD or arrows to drive · Space brakes · Drag to look · Scroll to zoom · R resets"
        : "Ctrl/⌘ Enter runs Python · sensors only, at 20 Hz · Drag to look around";
      hintTimer = window.setTimeout(() => hint.classList.add("is-faded"), 4000);
    };
    let mapCache: { key: string; map: ReturnType<typeof buildKnownMap> } | null = null;
    const taskMap = () => {
      const key = `${yard.id}|${activeSpawn.x.toFixed(2)}|${activeSpawn.z.toFixed(2)}|${activeSpawn.yaw.toFixed(3)}`;
      if (mapCache?.key === key) return mapCache.map;
      const map = buildKnownMap(
        solidsFor(yard.id),
        activeSpawn,
        referenceRoute(yard.id).map((point) => worldToOdom(activeSpawn, point)),
      );
      mapCache = { key, map };
      return map;
    };

    const currentSpawn = (): SpawnPose => {
      if (lessonSpawn && lessonWorld === yard.id) return lessonSpawn;
      const example = exampleSelect.value;
      if (mode === "code" && EXAMPLES.some((item) => item.id === example)) return spawnFor(yard.id, example, "scenario");
      return yard.spawn;
    };

    const frameKidnappedCloud = (force = false) => {
      if (!codeEditor.getValue().includes("UNKNOWN_START = True")) {
        if (kidnappedDistance >= 0) {
          kidnappedDistance = -1;
          applyLessonCamera();
          view.frameFog(null);
        }
        return;
      }
      const map = taskMap();
      const span = Math.max(map.width, map.height) * map.resolution;
      // Vertical fov is 48°. Sit high enough that the longer map side,
      // plus a margin, lands inside the frame.
      const wide = Math.min(190, Math.max(48, span / 0.55));
      const ellipse = [...drawOps].reverse().find((op) => op.kind === "ellipse");
      const spread = ellipse ? Math.max(ellipse.rx, ellipse.ry) : 1e9;
      // A free-space prior is tens of metres. A collapsed 2-sigma ring is about a metre,
      // and the swarm is only readable if the camera comes back in.
      const distance = spread > 6 ? wide : Math.min(26, Math.max(14, spread * 8 + 12));
      const fogDistance = spread > 6 ? wide : null;
      if (!force && Math.abs(distance - kidnappedDistance) < 0.5) return;
      kidnappedDistance = distance;
      camera.overhead(distance);
      view.frameFog(fogDistance);
    };

    const resetWorld = () => {
      if (code.current === "running" || code.current === "loading") stopProgram();
      activeSpawn = currentSpawn();
      paths.clear();
      drawOps = [];
      drawings.clear();
      simTime = 0;
      accumulator = 0;
      sensorAccumulator = 0;
      robot.reset(activeSpawn);
      applyLessonCamera();
      frameKidnappedCloud(true);
      camera.snap(robot.focus());
      if (handsOn()) applyDrive();
    };

    const resetToSeed = (seed = readSeed(seedInput)) => {
      noiseSeed = seed >>> 0;
      seedInput.value = String(noiseSeed);
      robot.setNoiseSeed(noiseSeed);
      resetWorld();
    };

    const runProgram = () => {
      if (!codeControls()) return;
      consolePanel.log("— running —", "log");
      code.run(codeEditor.getValue());
    };

    const stopProgram = () => {
      code.stop();
      drawOps = [];
      drawings.clear();
      robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), STOP_BRAKE);
    };

    const setMode = (next: AppMode) => {
      if (mode === "code" && next !== "code") scratch = codeEditor.getValue();
      const prev = mode;
      mode = next;
      const app = document.getElementById("app");
      app?.classList.remove("mode-drive", "mode-code", "mode-lessons", "code-mode", "lesson-lab");
      app?.classList.add(next === "drive" ? "mode-drive" : next === "code" ? "mode-code" : "mode-lessons");
      if (next !== "lessons") {
        lessonCodeActive = false;
        lessonCamera = null;
        app?.classList.remove("lesson-has-code");
      }
      codePanel.hidden = next === "drive";
      mustGet<HTMLButtonElement>("mode-drive").setAttribute("aria-selected", String(next === "drive"));
      mustGet<HTMLButtonElement>("mode-code").setAttribute("aria-selected", String(next === "code"));
      mustGet<HTMLButtonElement>("mode-lessons").setAttribute("aria-selected", String(next === "lessons"));
      if (next === "code" && prev !== "code") codeEditor.setValue(scratch);
      if (prev === "lessons" && next !== "lessons") {
        stopProgram();
        camera.reset();
      }
      if (next === "drive") {
        stopProgram();
        applyDrive();
      } else if (next === "code") {
        code.warmup();
        robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), STOP_BRAKE);
      } else if (prev !== "lessons") {
        robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), STOP_BRAKE);
      }
      setHint();
      requestAnimationFrame(() => {
        view.resize(viewport.clientWidth, viewport.clientHeight);
        codeEditor.relayout();
      });
    };
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
        if (codeControls()) stopProgram();
        disposeWorld(world, yard);
        yard = await mountWorld(id, RAPIER, world, view.scene, graphics);
        view.setAtmosphere(yard.atmosphere);
        worldSelect.value = id;
        activeSpawn = currentSpawn();
        paths.clear();
        drawOps = [];
        drawings.clear();
        robot.reset(activeSpawn);
        applyLessonCamera();
        frameKidnappedCloud(true);
        camera.snap(robot.focus());
        localStorage.setItem(WORLD_STORAGE_KEY, id);
        if (handsOn()) applyDrive();
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
    mountLabSplitter(mustGet("lab-split"), () => codeEditor.relayout());
    const editCode = mustGet<HTMLButtonElement>("edit-code");
    const toggleConsole = mustGet<HTMLButtonElement>("toggle-console");
    const appEl = () => document.getElementById("app");
    editCode.addEventListener("click", () => {
      const open = !appEl()?.classList.contains("lab-open");
      appEl()?.classList.toggle("lab-open", open);
      editCode.setAttribute("aria-expanded", String(open));
      editCode.textContent = open ? "Hide code" : "Edit code";
      requestAnimationFrame(() => codeEditor.relayout());
    });
    toggleConsole.addEventListener("click", () => {
      const open = !appEl()?.classList.contains("console-open");
      appEl()?.classList.toggle("console-open", open);
      toggleConsole.setAttribute("aria-expanded", String(open));
      toggleConsole.classList.toggle("is-on", open);
    });
    exampleSelect.addEventListener("change", () => {
      const example = EXAMPLES.find((item) => item.id === exampleSelect.value);
      if (!example) return;
      if (code.current === "running") stopProgram();
      codeEditor.setValue(example.source);
      scratch = example.source;
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
          codeControls() &&
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
        if (handsOn() && event.code === "KeyR" && !event.repeat) resetWorld();
        if (!handsOn()) return;
        if (event.code.startsWith("Arrow") || event.code === "Space") event.preventDefault();
        keys.add(event.code);
      },
      true,
    );
    window.addEventListener("keyup", (event) => {
      keys.delete(event.code);
    });
    window.addEventListener("blur", () => keys.clear());

    loading.hidden = true;

    mountCourse({
      setWorld: async (id) => {
        await switchWorld(id);
      },
      getWorld: () => yard.id,
      setMode,
      applyScene: (scene) => {
        lessonCodeActive = Boolean(scene?.run);
        lessonCamera = scene?.camera ?? null;
        document.getElementById("app")?.classList.toggle("lesson-has-code", lessonCodeActive);
        if (!scene) {
          setHint();
          return;
        }
        setLidarButton(scene.lidar);
        setPaths(scene.paths);
        noiseSeed = scene.seed >>> 0;
        seedInput.value = String(noiseSeed);
        robot.setNoiseSeed(noiseSeed);
        applyLessonCamera();
        if (scene.run) code.warmup();
        setHint();
      },
      setLessonSpawn: (spawn, worldId) => {
        lessonSpawn = spawn;
        lessonWorld = worldId;
      },
      resetWorld,
      setCode: (source) => {
        codeEditor.setValue(source);
        frameKidnappedCloud(true);
        camera.snap(robot.focus());
      },
      onCodeChange: (listener) => {
        onCodeChange = listener;
      },
      relayout: () => {
        view.resize(viewport.clientWidth, viewport.clientHeight);
        codeEditor.relayout();
      },
      runProgram,
    });

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
        if (!EXAMPLES.some((item) => item.id === id)) return;
        exampleSelect.value = id;
        exampleSelect.dispatchEvent(new Event("change"));
      },
      setQuality: (next) => applyQuality(next === "low" ? "low" : "high"),
      focus: () => robot.focus(),
      frameCamera: (distance, pitch) => camera.frame(distance, pitch),
    };

    view.renderer.domElement.focus({ preventScroll: true });

    let last = performance.now();
    if (window.roboSim) window.roboSim.time = () => simTime;

    const frame = (now: number) => {
      try {
        const elapsed = (now - last) / 1000;
        const frameDt = Number.isFinite(elapsed) ? Math.min(0.05, Math.max(0, elapsed)) : 0;
        last = now;
        if (!paused) {
          accumulator = Math.min(accumulator + frameDt, PHYSICS_DT * 5);
          let steps = 0;
          while (accumulator >= PHYSICS_DT && steps < 5) {
            if (handsOn()) applyDrive();
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
              sensors.task = {
                path: referenceRoute(yard.id).map((point) => worldToOdom(activeSpawn, point)),
                map: taskMap(),
              };
              studentPose = sensors.odometry.pose;
              if (codeControls()) code.offer(sensors);
              lidar.update(
                robot.lidarDebug(),
                sensors.lidar,
                codeControls() ? { ops: drawOps, pose: studentPose } : undefined,
              );
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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, .cm-content, .cm-editor"));
}
