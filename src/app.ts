import RAPIER from "@dimforge/rapier3d-compat";
import { ACKERMANN_BUGGY, CONTROL_DT, PHYSICS_DT, clampCommand, odomToWorld, worldToOdom, type DrawOp } from "./api";
import { chunkOpenLine } from "./editor/chunks";
import { formatStudentError } from "./editor/errors";
import { spawnFor } from "./sim/spawns";
import { invalidPoseMessage, poseProblem, readProgramSeed, readStartPose } from "./editor/program-header";
import { BlockedAreas } from "./sim/blocked-areas";
import { EXAMPLES } from "./editor/examples";
import { BLANK_SOURCE, loadScratch, saveScratch } from "./editor/blank";
import { createEditor, type CodeEditor } from "./editor/editor";
import { ChaseCamera } from "./sim/camera";
import { LidarView } from "./sim/lidar-view";
import { addPhysicsGround, SimView, type GraphicsQuality } from "./sim/scene";
import { bindPropLoader } from "./sim/props";
import { bindTextureLoader } from "./sim/surfaces";
import { DebugDraw } from "./sim/debug-draw";
import { PathOverlay } from "./sim/path-overlay";
import { buildKnownMap } from "./sim/known-map";
import type { Solid } from "./sim/course";
import { referenceRoute } from "./sim/routes";
import { AckermannBuggy, SERVICE_BRAKE, STOP_BRAKE, type SpawnPose } from "./sim/vehicle";
import type { VehicleTelemetry } from "./robots/types";
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
import { lessonById } from "./course/catalog";
import { mountCourse } from "./course/shell";
import { CodeSandbox, type SandboxState } from "./sandbox/controller";
import { ConsolePanel } from "./ui/console-panel";
import { Hud, runBarLabel, type AppMode } from "./ui/hud";
import { DriftGraph } from "./ui/drift-graph";
import { mountLegend } from "./ui/legend";
import { mountLabSplitter, mountSplitter } from "./ui/splitter";

export async function mountApp(): Promise<void> {
  document.getElementById("app")?.classList.add("is-booting");
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

  let paused = false;
  const setRunState = (state: SandboxState) => {
    if (paused) {
      runState.dataset.state = "paused";
      runState.textContent = "Paused";
      return;
    }
    runState.dataset.state = state;
    runState.textContent = runBarLabel(state, false, false, false);
    pythonStatus.hidden = state !== "loading";
  };

  try {
    loadingText.textContent = "Loading physics…";
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = PHYSICS_DT;

    const view = new SimView(viewport);
    view.renderer.domElement.tabIndex = 0;
    const driveHint = mustGet<HTMLElement>("drive-hint");
    const legend = mountLegend(mustGet("legend"));
    let driveSelf = false;
    let simArmed = false;
    const armSim = () => {
      simArmed = true;
      view.renderer.domElement.focus({ preventScroll: true });
      driveHint.classList.toggle("is-armed", true);
      refreshDriveHint();
    };
    viewport.addEventListener("pointerdown", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("#legend, #drive-hint")) return;
      if (driveSelf) armSim();
    });
    let refreshDriveHint = () => {};
    bindTextureLoader(view.renderer);
    bindPropLoader(view.renderer);
    void view.loadHdri().catch((error: unknown) => console.warn("[robo-sim] HDRI unavailable", error));
    const savedQuality = localStorage.getItem(QUALITY_STORAGE_KEY);
    let graphics: GraphicsQuality = savedQuality === "low" ? "low" : "high";
    view.setQuality(graphics);
    addPhysicsGround(RAPIER, world);
    const initialWorld = bootWorld();
    let yard: SimWorld = await mountWorld(initialWorld, RAPIER, world, view.scene, graphics);
    view.setAtmosphere(yard.atmosphere);
    const robot = new AckermannBuggy(RAPIER, world, view.scene);
    const paths = new PathOverlay(view.scene);
    const blocked = new BlockedAreas(view.scene);
    const driftGraph = new DriftGraph(viewport);
    let showGraph = false;
    const drawings = new DebugDraw(view.overlay);
    let drawOps: DrawOp[] = [];
    let heldPrior: DrawOp[] | null = null;
    let priorHoldUntil = -1;
    let studentPose = { x: 0, y: 0, yaw: 0 };
    let noiseSeed = 1;
    robot.setNoiseSeed(noiseSeed);
    let activeSpawn: SpawnPose = yard.spawn;
    robot.reset(activeSpawn);
    let pausedView: VehicleTelemetry | null = null;
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

    let consoleByUser = false;
    const setConsoleOpen = (open: boolean) => {
      document.getElementById("app")?.classList.toggle("console-open", open);
      const consoleBtn = document.getElementById("toggle-console");
      consoleBtn?.setAttribute("aria-expanded", String(open));
      consoleBtn?.classList.toggle("is-on", open);
    };
    const openConsole = () => setConsoleOpen(true);
    sandbox = new CodeSandbox({
      onCommand: (command) => {
        if (driveSelf && simArmed) return;
        // The kidnapped prior is held on screen for two seconds. The filter
        // keeps scoring, and the car stays put unless the learner is driving.
        if (trackCloud && (priorHoldUntil < 0 || simTime < priorHoldUntil)) {
          robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), STOP_BRAKE);
          return;
        }
        if (codeControls() && code.current === "running") robot.setCommand(command, 0);
      },
      onDraw: (ops) => {
        if (trackCloud && priorHoldUntil < 0) priorHoldUntil = simTime + 2;
        if (trackCloud && simTime < priorHoldUntil) {
          if (!heldPrior) heldPrior = ops;
          drawOps = heldPrior;
          drawings.set(heldPrior, activeSpawn);
          frameKidnappedCloud();
          return;
        }
        heldPrior = null;
        drawOps = ops;
        drawings.set(ops, activeSpawn);
        frameKidnappedCloud();
      },
      onLog: (line, level) => {
        if (level === "error") {
          const formatted = formatStudentError(line, editor?.getValue() ?? "");
          consolePanel.log(formatted.text, "error");
          editor?.highlightLine(formatted.chunk ? null : formatted.line);
          window.dispatchEvent(new CustomEvent("robo-student-error", { detail: formatted }));
          openConsole();
          return;
        }
        consolePanel.log(line, level);
        const status = line.trim() === "— running —" || line.includes("Python runtime ready");
        if (line.trim() && !status) openConsole();
      },
      onState: (state) => {
        setRunState(state);
        pythonStatus.hidden = state !== "loading" || (sandbox?.runtimeIsReady ?? false);
        if (state === "error") {
          robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), STOP_BRAKE);
        }
      },
    });
    const code = sandbox;
    code.warmup();

    let scratch = loadScratch();
    editor = createEditor(mustGet("editor"), scratch, () => runProgram(), (source) => {
      if (mode === "code") {
        scratch = source;
        saveScratch(source);
      }
      onCodeChange(source);
    });
    const codeEditor = editor;
    const scratchOption = document.createElement("option");
    scratchOption.value = "";
    scratchOption.textContent = "Scratch";
    exampleSelect.append(scratchOption);
    for (const example of EXAMPLES) {
      const option = document.createElement("option");
      option.value = example.id;
      option.textContent = example.label;
      exampleSelect.append(option);
    }
    exampleSelect.value = "";

    const LESSON_DRIVE_CAP = 3;
    const applyDrive = () => {
      const forward = keys.has("KeyW") || keys.has("ArrowUp");
      const back = keys.has("KeyS") || keys.has("ArrowDown");
      const left = keys.has("KeyA") || keys.has("ArrowLeft");
      const right = keys.has("KeyD") || keys.has("ArrowRight");
      const braking = keys.has("Space");
      let throttle = braking ? 0 : forward ? 1 : back ? -0.65 : 0;
      let brake = braking ? SERVICE_BRAKE : 0;
      // Lesson self-drive stays near 3 m/s. Full throttle reaches 8 m/s and tips the car.
      if (mode === "lessons" && driveSelf && !braking && forward) {
        const speed = robot.telemetry().trueSpeed;
        if (speed >= LESSON_DRIVE_CAP) {
          throttle = 0;
          brake = 1.4;
        } else if (speed > LESSON_DRIVE_CAP - 0.7) throttle = 0.16;
        else throttle = 0.5;
      }
      // Positive steering is a left turn from the driver's seat (nose toward +X at yaw 0).
      const steering = ((left ? 1 : 0) - (right ? 1 : 0)) * ACKERMANN_BUGGY.limits.maxSteering;
      robot.setCommand(clampCommand({ steering, throttle }, ACKERMANN_BUGGY.limits), brake);
    };

    let lessonSpawn: SpawnPose | null = null;
    let lessonWorld: string | null = null;
    let lessonSpawnKind: string | null = null;
    let lessonCodeActive = false;
    let lessonCamera: "chase" | "wide" | "overhead" | null = null;
    const codeControls = () => mode === "code" || (mode === "lessons" && lessonCodeActive);
    const handsOn = () => mode === "drive" || (mode === "lessons" && !lessonCodeActive);
    const applyLessonCamera = () => {
      if (lessonCamera === "overhead") camera.overhead(72);
      else if (yard.id === "warehouse" && lessonCamera !== "wide" && robot.focus().z < 2) {
        // Open bay: sit beside and behind the car, under no roof, with sky in frame.
        camera.frame(14, 0.32, 1.05);
      } else if (lessonCamera === "wide") camera.frame(16, 0.7);
      else camera.reset();
    };
    let hintTimer = 0;
    const setHint = () => {
      window.clearTimeout(hintTimer);
      hint.classList.remove("is-faded");
      if (paused) {
        hint.hidden = true;
        // The badge and the Time row already say paused. The toast is for the person at the wheel.
        driveHint.hidden = !driveSelf;
        if (driveSelf) driveHint.textContent = "Paused, press Resume";
        return;
      }
      if ((mode === "lessons" && !driveSelf) || driveSelf) {
        hint.hidden = true;
        if (!driveSelf) driveHint.hidden = true;
        if (driveSelf) {
          driveHint.hidden = false;
          driveHint.textContent = simArmed
            ? mode === "lessons"
              ? "Driving · speed stays near 3 m/s"
              : "Driving · the filter still scores"
            : "Press a drive key to take the wheel";
        }
        return;
      }
      hint.hidden = false;
      hint.textContent = handsOn()
          ? "WASD or arrows to drive · Space brakes · Drag to look · Scroll to zoom · R resets"
          : "Ctrl/⌘ Enter runs Python · sensors only, at 20 Hz · Drag to look around";
      if (!driveSelf) hintTimer = window.setTimeout(() => hint.classList.add("is-faded"), 4000);
    };
    refreshDriveHint = setHint;
    let mapCache: { key: string; map: ReturnType<typeof buildKnownMap> } | null = null;
    let solidsReady: ((world: WorldId) => Solid[]) | null = null;
    const emptyMap = (): ReturnType<typeof buildKnownMap> => ({
      resolution: 0.5,
      corner: { x: 0, y: 0 },
      width: 1,
      height: 1,
      field: "AA==",
      segments: [],
      stamp: 0,
    });
    const solidsPromise = import("./eval/scenarios").then((mod) => {
      solidsReady = mod.solidsFor;
      mapCache = null;
    });
    const taskMap = () => {
      const key = `${yard.id}|${activeSpawn.x.toFixed(2)}|${activeSpawn.z.toFixed(2)}|${activeSpawn.yaw.toFixed(3)}`;
      if (mapCache?.key === key) return mapCache.map;
      if (!solidsReady) return mapCache?.map ?? emptyMap();
      const map = buildKnownMap(
        solidsReady(yard.id),
        activeSpawn,
        referenceRoute(yard.id).map((point) => worldToOdom(activeSpawn, point)),
      );
      mapCache = { key, map };
      return map;
    };

    const currentSpawn = (): SpawnPose => {
      if (mode === "lessons" && lessonSpawnKind) {
        if (lessonWorld === yard.id && lessonSpawn) return lessonSpawn;
        if (lessonSpawnKind === "default") return yard.spawn;
        return spawnFor(yard.id, lessonSpawnKind, "scenario");
      }
      const example = exampleSelect.value;
      if (mode === "code" && EXAMPLES.some((item) => item.id === example)) return spawnFor(yard.id, example, "scenario");
      return yard.spawn;
    };

    let poseWarning: string | null = null;
    const placeFromCode = (source = codeEditor.getValue()): SpawnPose => {
      noiseSeed = readProgramSeed(source);
      robot.setNoiseSeed(noiseSeed);
      const parsed = readStartPose(source, yard.id);
      if (!parsed) {
        poseWarning = null;
        return currentSpawn();
      }
      const problem = poseProblem(solidsReady?.(yard.id) ?? [], parsed.x, parsed.y);
      if (!problem) {
        poseWarning = null;
        return { x: parsed.x, y: 0.84, z: parsed.y, yaw: (parsed.heading * Math.PI) / 180 };
      }
      const fallback = currentSpawn();
      const kind = mode === "lessons" && lessonSpawnKind ? "lesson" : mode === "code" && exampleSelect.value ? "example" : "world";
      poseWarning = invalidPoseMessage(parsed.x, parsed.y, problem, kind);
      return fallback;
    };

    let trackCloud = false;
    const frameKidnappedCloud = (force = false) => {
      if (!trackCloud) {
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
      // A free-space prior is tens of meters. A collapsed 2-sigma ring is about a meter,
      // and the swarm is only readable if the camera comes back in.
      const distance = spread > 6 ? wide : Math.min(26, Math.max(14, spread * 8 + 12));
      const fogDistance = spread > 6 ? wide : null;
      if (!force && Math.abs(distance - kidnappedDistance) < 0.5) return;
      kidnappedDistance = distance;
      camera.overhead(distance);
      view.frameFog(fogDistance);
    };

    const runBanner = mustGet<HTMLElement>("run-banner");
    const showStopped = (message = "Program stopped. Press Run.") => {
      runBanner.textContent = message;
      runBanner.hidden = false;
    };
    const hideStopped = () => {
      runBanner.hidden = true;
    };
    const parkAtCodedStart = (source?: string) => {
      activeSpawn = placeFromCode(source);
      paths.clear();
      driftGraph.reset();
      drawOps = [];
      heldPrior = null;
      priorHoldUntil = -1;
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
    const showPoseWarning = () => {
      if (!poseWarning) return;
      consolePanel.log(poseWarning, "error");
      openConsole();
    };

    const resetWorld = (rerun = false, source?: string) => {
      const wasRunning = code.current === "running" || code.current === "loading";
      if (wasRunning) stopProgram();
      const shouldRun = source !== undefined || (rerun && wasRunning);
      if (shouldRun && (codeControls() || driveSelf)) {
        runProgram(source);
        return;
      }
      parkAtCodedStart(source);
      showPoseWarning();
      if (wasRunning && (codeControls() || driveSelf)) showStopped();
    };

    const resetToSeed = () => {
      resetWorld(true);
    };

    const manualDrive = () => driveSelf && simArmed;
    const runProgram = (source?: string) => {
      if (!codeControls() && !driveSelf) return;
      if (code.current === "running" || code.current === "loading") stopProgram();
      hideStopped();
      parkAtCodedStart(source);
      if (trackCloud) {
        heldPrior = null;
        priorHoldUntil = -1;
      }
      consolePanel.clear();
      if (!consoleByUser) setConsoleOpen(false);
      consolePanel.log("— running —", "log");
      showPoseWarning();
      editor?.highlightLine(null);
      window.dispatchEvent(new CustomEvent("robo-student-error", { detail: { text: "", line: null, chunk: null, local: null } }));
      code.run(source ?? codeEditor.getValue());
    };
    const scatterGuesses = () => {
      const source = codeEditor.getValue().replace(/TRACK_SPREAD\s*=\s*[0-9.]+/, "TRACK_SPREAD = 3.5");
      if (source === codeEditor.getValue()) return;
      // The wider cloud belongs at the start, on the car. Leave the editor at 0.25.
      resetWorld(true, source);
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
      if (next === "lessons") consoleByUser = false;
      hideStopped();
      const app = document.getElementById("app");
      app?.classList.remove("mode-drive", "mode-code", "mode-lessons", "code-mode", "lesson-lab");
      app?.classList.add(next === "drive" ? "mode-drive" : next === "code" ? "mode-code" : "mode-lessons");
      if (next !== "lessons") {
        lessonCodeActive = false;
        lessonCamera = null;
        trackCloud = next === "code" && exampleSelect.value === "mcl-global";
        driveSelf = false;
        simArmed = false;
        driveHint.hidden = true;
        app?.classList.remove("lesson-has-code");
        legend.show(null);
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
      if (next === "drive") stopProgram();
      robot.halt();
      if (next === "drive") applyDrive();
      else if (next === "code") {
        code.warmup();
        publishCodeLegend();
      }
      setHint();
      requestAnimationFrame(() => {
        view.resize(viewport.clientWidth, viewport.clientHeight);
        codeEditor.relayout();
      });
    };
    mustGet("run").addEventListener("click", () => runProgram());
    mustGet("stop").addEventListener("click", () => stopProgram());
    mustGet("reset").addEventListener("click", () => resetWorld(true));
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
      simTime = 0;
      accumulator = 0;
      sensorAccumulator = 0;
      heldPrior = null;
      priorHoldUntil = -1;
      try {
        const wasRunning = code.current === "running" || code.current === "loading";
        if (codeControls()) stopProgram();
        disposeWorld(world, yard);
        yard = await mountWorld(id, RAPIER, world, view.scene, graphics);
        view.setAtmosphere(yard.atmosphere);
        worldSelect.value = id;
        activeSpawn = placeFromCode();
        paths.clear();
        driftGraph.reset();
        if (blocked.visible) blocked.rebuild(RAPIER, world);
        drawOps = [];
        heldPrior = null;
        priorHoldUntil = -1;
        drawings.clear();
        simTime = 0;
        accumulator = 0;
        sensorAccumulator = 0;
        robot.reset(activeSpawn);
        applyLessonCamera();
        frameKidnappedCloud(true);
        camera.snap(robot.focus());
        localStorage.setItem(WORLD_STORAGE_KEY, id);
        if (handsOn()) applyDrive();
        if (wasRunning && (codeControls() || driveSelf)) runProgram();
        else if (wasRunning && (codeControls() || driveSelf)) showStopped();
        else hideStopped();
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
      if (mode === "code") publishCodeLegend();
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
      editCode.textContent = open ? "Hide full program" : "Full program";
      requestAnimationFrame(() => {
        codeEditor.relayout();
        requestAnimationFrame(() => {
          if (!open) return;
          const slot = document.querySelector<HTMLElement>("#lesson .code-slot:not([hidden])");
          const id = slot?.dataset.chunk;
          const line = id ? chunkOpenLine(codeEditor.getValue(), id) : null;
          if (line) codeEditor.revealLine(line);
        });
      });
    });
    toggleConsole.addEventListener("click", () => {
      consoleByUser = !appEl()?.classList.contains("console-open");
      setConsoleOpen(consoleByUser);
    });
    const legendForExample = (id: string): { lidar: boolean; paths: boolean; particles: boolean; route: boolean } | null => {
      if (id === "mcl" || id === "mcl-global") return { lidar: true, paths: true, particles: true, route: true };
      if (id === "pursuit") return { lidar: false, paths: true, particles: false, route: true };
      if (id === "circle") return { lidar: false, paths: true, particles: false, route: false };
      if (id === "avoid" || id === "wall") return { lidar: true, paths: false, particles: false, route: false };
      return null;
    };
    const publishCodeLegend = () => {
      if (mode !== "code") return;
      const spec = legendForExample(exampleSelect.value);
      if (!spec && !lidar.isEnabled && !paths.visible) {
        legend.show(null);
        return;
      }
      legend.show({
        lidar: Boolean(spec?.lidar) || lidar.isEnabled,
        paths: Boolean(spec?.paths) || paths.visible,
        particles: Boolean(spec?.particles),
        route: Boolean(spec?.route),
      });
    };
    const browser = mustGet<HTMLElement>("example-browser");
    const exampleList = mustGet<HTMLElement>("example-list");
    const confirmBox = mustGet<HTMLElement>("example-confirm");
    const confirmName = mustGet<HTMLElement>("example-confirm-name");
    let pendingExample = "";
    const loadExample = (id: string) => {
      const example = EXAMPLES.find((item) => item.id === id);
      if (!example) return;
      if (code.current === "running") stopProgram();
      exampleSelect.value = id;
      codeEditor.setValue(example.source);
      scratch = example.source;
      saveScratch(scratch);
      browser.hidden = true;
      confirmBox.hidden = true;
      browseButton.setAttribute("aria-expanded", "false");
      trackCloud = id === "mcl-global";
      publishCodeLegend();
      if (mode === "code") resetWorld();
    };
    for (const example of EXAMPLES) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<strong>${example.label}</strong><span>${example.blurb}</span>`;
      button.addEventListener("click", () => {
        const current = codeEditor.getValue().trim();
        const same = current === example.source.trim() || current === BLANK_SOURCE.trim();
        if (same) {
          loadExample(example.id);
          return;
        }
        pendingExample = example.id;
        confirmName.textContent = example.label;
        confirmBox.hidden = false;
      });
      item.append(button);
      exampleList.append(item);
    }
    const browseButton = mustGet<HTMLButtonElement>("browse-examples");
    const placeExampleBrowser = () => {
      const anchor = browseButton.getBoundingClientRect();
      const margin = 10;
      const panel = codePanel.getBoundingClientRect();
      const width = Math.min(440, Math.max(260, panel.width - 20), window.innerWidth - margin * 2);
      const left = Math.min(Math.max(margin, anchor.left), Math.max(margin, window.innerWidth - width - margin));
      const spaceBelow = window.innerHeight - anchor.bottom - margin;
      const spaceAbove = anchor.top - margin;
      const cap = Math.min(520, Math.max(160, window.innerHeight - margin * 2));
      browser.style.left = `${Math.round(left)}px`;
      browser.style.width = `${Math.round(width)}px`;
      browser.style.right = "auto";
      // Under the button when the panel is tall. On a short window the list
      // floats in the viewport so more than a couple of cards are visible.
      if (spaceBelow >= 280) {
        const maxH = Math.min(cap, spaceBelow - 6);
        browser.style.top = `${Math.round(anchor.bottom + 6)}px`;
        browser.style.maxHeight = `${Math.round(maxH)}px`;
      } else if (spaceAbove >= 240) {
        const maxH = Math.min(cap, spaceAbove - 8);
        browser.style.top = `${Math.round(anchor.top - 6 - maxH)}px`;
        browser.style.maxHeight = `${Math.round(maxH)}px`;
      } else {
        browser.style.top = `${margin}px`;
        browser.style.maxHeight = `${Math.round(cap)}px`;
      }
    };
    browseButton.addEventListener("click", () => {
      browser.hidden = !browser.hidden;
      confirmBox.hidden = true;
      browseButton.setAttribute("aria-expanded", String(!browser.hidden));
      if (!browser.hidden) {
        browser.scrollTop = 0;
        placeExampleBrowser();
      }
    });
    window.addEventListener("resize", () => {
      if (!browser.hidden) placeExampleBrowser();
    });
    codePanel.addEventListener("scroll", () => {
      if (!browser.hidden) placeExampleBrowser();
    });
    document.addEventListener("pointerdown", (event) => {
      if (browser.hidden) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (browser.contains(target) || browseButton.contains(target)) return;
      browser.hidden = true;
      confirmBox.hidden = true;
      browseButton.setAttribute("aria-expanded", "false");
    });
    mustGet("example-confirm-yes").addEventListener("click", () => {
      if (pendingExample) loadExample(pendingExample);
    });
    mustGet("example-confirm-no").addEventListener("click", () => {
      confirmBox.hidden = true;
      pendingExample = "";
    });
    const driveButton = mustGet<HTMLButtonElement>("drive-self");
    const setDriveSelf = (on: boolean) => {
      driveSelf = on;
      driveButton.setAttribute("aria-pressed", String(on));
      driveButton.classList.toggle("is-on", on);
      driveButton.textContent = on ? "You are driving" : "Drive it yourself";
      driveHint.hidden = !on;
      if (on) armSim();
      else {
        simArmed = false;
        driveHint.classList.remove("is-armed");
        setHint();
      }
      if (on && code.current !== "running" && code.current !== "loading") runProgram();
    };
    driveButton.addEventListener("click", () => setDriveSelf(!driveSelf));
    const pathsButton = mustGet<HTMLButtonElement>("paths-toggle");
    const setPaths = (enabled: boolean) => {
      paths.setVisible(enabled);
      pathsButton.setAttribute("aria-pressed", String(enabled));
      pathsButton.classList.toggle("is-on", enabled);
      pathsButton.textContent = enabled ? "Paths on" : "Paths off";
      if (mode === "code") publishCodeLegend();
    };
    setPaths(false);
    pathsButton.addEventListener("click", () => setPaths(!paths.visible));
    const blockedButton = mustGet<HTMLButtonElement>("blocked-toggle");
    const setBlocked = (on: boolean) => {
      if (on) blocked.rebuild(RAPIER, world);
      blocked.setVisible(on);
      blockedButton.setAttribute("aria-pressed", String(on));
      blockedButton.classList.toggle("is-on", on);
      blockedButton.textContent = on ? "Blocked on" : "Blocked off";
    };
    blockedButton.addEventListener("click", () => setBlocked(!blocked.visible));
    const pauseButton = mustGet<HTMLButtonElement>("pause");
    const setPaused = (next: boolean) => {
      if (next && !paused) {
        const live = robot.telemetry();
        pausedView = {
          ...live,
          commandedSteering: live.actuatorSteering,
          commandedThrottle: 0,
        };
      }
      if (!next) pausedView = null;
      paused = next;
      pauseButton.setAttribute("aria-pressed", String(next));
      pauseButton.textContent = next ? "Resume" : "Pause";
      pauseButton.title = next ? "Resume physics and the control program" : "Pause physics and the control program";
      setRunState(code.current);
      setHint();
    };
    pauseButton.addEventListener("click", () => setPaused(!paused));

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
        if (driveSelf && !simArmed && DRIVE_KEYS.has(event.code)) armSim();
        const driving = handsOn() || manualDrive();
        if (handsOn() && event.code === "KeyR" && !event.repeat) resetWorld();
        if (!driving) return;
        if (event.code.startsWith("Arrow") || event.code === "Space") event.preventDefault();
        keys.add(event.code);
      },
      true,
    );
    window.addEventListener("keyup", (event) => {
      keys.delete(event.code);
    });
    window.addEventListener("blur", () => keys.clear());

    await solidsPromise;
    await mountCourse({
      setWorld: async (id) => {
        await switchWorld(id);
      },
      getWorld: () => yard.id,
      setMode,
      applyScene: (scene) => {
        lessonCodeActive = Boolean(scene?.run);
        lessonCamera = scene?.camera ?? null;
        trackCloud = scene?.camera === "overhead";
        heldPrior = null;
        priorHoldUntil = -1;
        drawOps = [];
        drawings.clear();
        code.invalidateDraws();
        hideStopped();
        if (!lessonCodeActive && (code.current === "running" || code.current === "loading")) stopProgram();
        document.getElementById("app")?.classList.toggle("lesson-has-code", lessonCodeActive);
        if (!scene) {
          driveSelf = false;
          driveButton.hidden = true;
          driveHint.hidden = true;
          legend.show(null);
          showGraph = false;
          driftGraph.setVisible(false);
          setHint();
          return;
        }
        driveSelf = false;
        simArmed = false;
        driveButton.hidden = !scene.manual;
        driveButton.classList.remove("is-on");
        driveButton.setAttribute("aria-pressed", "false");
        driveButton.textContent = "Drive it yourself";
        driveHint.hidden = true;
        legend.show({
          lidar: scene.lidar,
          paths: scene.paths,
          particles: scene.particles,
          route: scene.route,
        });
        setLidarButton(scene.lidar);
        setPaths(scene.paths);
        showGraph = scene.graph;
        driftGraph.setVisible(scene.graph);
        driftGraph.reset();
        applyLessonCamera();
        if (scene.run) code.warmup();
        setHint();
      },
      setLessonSpawn: (spawn, worldId, kind) => {
        lessonSpawn = spawn;
        lessonWorld = worldId;
        lessonSpawnKind = kind;
      },
      setLessonWorlds: (ids) => {
        const labels = (ids ?? []).map((id) => WORLDS.find((item) => item.id === id)?.label ?? id);
        const why = labels.length ? `This lesson is written for ${labels.join(" and ")}.` : "";
        for (const option of worldSelect.options) {
          const allowed = !ids || ids.includes(option.value as WorldId);
          option.disabled = !allowed;
          option.title = allowed ? "" : why;
        }
        worldSelect.title = ids && ids.length === 1 ? why : "Switch the world. A running program starts again.";
      },
      clearConsole: () => consolePanel.clear(),
      resetWorld,
      setCode: (source) => {
        codeEditor.setValue(source);
        frameKidnappedCloud(true);
        camera.snap(robot.focus());
      },
      replaceSource: (source) => {
        codeEditor.setValue(source);
      },
      getCode: () => codeEditor.getValue(),
      onCodeChange: (listener) => {
        onCodeChange = listener;
      },
      relayout: () => {
        view.resize(viewport.clientWidth, viewport.clientHeight);
        codeEditor.relayout();
      },
      runProgram,
      scatterGuesses,
    });
    loading.hidden = true;
    document.getElementById("app")?.classList.remove("is-booting");

    window.roboSim = {
      ready: true,
      resetToSeed,
      setPathOverlay: setPaths,
      pause: (next) => {
        setPaused(next);
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
        loadExample(id);
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
            if (handsOn() || manualDrive()) applyDrive();
            robot.preStep(PHYSICS_DT);
            world.step();
            // The kidnapped prior is a 2 s hold on the Time row. Python may
            // still be loading the program, so the clock stays at 0 until
            // that first cloud is on screen. Physics still steps. A stopped
            // or failed run does not pin the clock.
            const pinningPrior = trackCloud && priorHoldUntil < 0 && (code.current === "loading" || code.current === "running");
            if (!pinningPrior) simTime += PHYSICS_DT;
            sensorAccumulator += PHYSICS_DT;
            accumulator -= PHYSICS_DT;
            steps += 1;
            if (sensorAccumulator >= CONTROL_DT - 1e-4) {
              // Sampling draws the seeded lidar. Doing that before the
              // program can see the frame burns the spawn scan, and the
              // first likelihood then locks onto another pose on the straight.
              const feed = !codeControls() || (code.current === "running" && taskMap().width >= 2);
              if (!feed) {
                sensorAccumulator = CONTROL_DT - PHYSICS_DT;
                continue;
              }
              const sampleDt = sensorAccumulator;
              sensorAccumulator = 0;
              const sensors = robot.sampleSensors(sampleDt);
              sensors.time = simTime;
              sensors.task = {
                path: referenceRoute(yard.id).map((point) => worldToOdom(activeSpawn, point)),
                map: taskMap(),
              };
              studentPose = sensors.odometry.pose;
              // A 1×1 placeholder map is not the yard. The filter would lock
              // a pose on it and then refuse to jump onto the real map.
              if (codeControls() && sensors.task.map.width >= 2) code.offer(sensors);
              const widePrior = drawOps.some((op) => op.kind === "ellipse" && Math.max(op.rx, op.ry) > 6);
              const insetOps = widePrior ? drawOps.filter((op) => op.kind !== "points") : drawOps;
              lidar.update(
                robot.lidarDebug(),
                sensors.lidar,
                codeControls() ? { ops: insetOps, pose: studentPose } : undefined,
              );
              const focusNow = robot.focus();
              const odomPoint = odomToWorld(activeSpawn, sensors.odometry.pose);
              paths.push(focusNow, robot.telemetry().trueSpeed, odomPoint);
              if (showGraph) driftGraph.push(simTime, Math.hypot(focusNow.x - odomPoint.x, focusNow.z - odomPoint.z));
            }
          }
        }
        robot.syncVisuals();
        const focus = robot.focus();
        camera.update(frameDt, focus);
        view.followSun(focus.x, focus.z);
        const sampling = !codeControls() || code.current === "running";
        const live = pausedView ?? robot.telemetry();
        const moving = Math.abs(live.trueSpeed) > 0.15 || Math.abs(live.commandedThrottle) > 0.05;
        if (!paused && handsOn()) {
          runState.dataset.state = moving ? "running" : "idle";
          runState.textContent = runBarLabel(code.current, false, true, moving);
        }
        hud.update(live, mode, code.current, simTime, paused, sampling, handsOn());
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

function bootWorld(): WorldId {
  const path = location.hash.replace(/^#/, "").replace(/^\//, "");
  const match = path.match(/^lesson\/([a-z0-9-]+)\/([a-z0-9-]+)/);
  if (match) {
    const lesson = lessonById(`${match[1]}/${match[2]}`);
    if (lesson) return lesson.world;
  }
  if (!path) return "city";
  const saved = localStorage.getItem(WORLD_STORAGE_KEY);
  return isWorldId(saved) ? saved : "city";
}

const DRIVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, .cm-content, .cm-editor"));
}
