import RAPIER from "@dimforge/rapier3d-compat";
import { ACKERMANN_BUGGY, CONTROL_DT, PHYSICS_DT, clampCommand, odomToWorld, worldToOdom, type DrawOp } from "./api";
import { chunkOpenLine } from "./editor/chunks";
import { formatStudentError } from "./editor/errors";
import { spawnFor } from "./sim/spawns";
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
import { mountCourse } from "./course/shell";
import { CodeSandbox, type SandboxState } from "./sandbox/controller";
import { ConsolePanel } from "./ui/console-panel";
import { Hud, type AppMode } from "./ui/hud";
import { mountLegend } from "./ui/legend";
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
    const savedWorld = localStorage.getItem(WORLD_STORAGE_KEY);
    const initialWorld: WorldId = isWorldId(savedWorld) ? savedWorld : "city";
    let yard: SimWorld = await mountWorld(initialWorld, RAPIER, world, view.scene, graphics);
    view.setAtmosphere(yard.atmosphere);
    const robot = new AckermannBuggy(RAPIER, world, view.scene);
    const paths = new PathOverlay(view.scene);
    const drawings = new DebugDraw(view.overlay);
    let drawOps: DrawOp[] = [];
    let heldPrior: DrawOp[] | null = null;
    let priorHoldUntil = -1;
    let studentPose = { x: 0, y: 0, yaw: 0 };
    const seedInput = mustGet<HTMLInputElement>("seed");
    let noiseSeed = readSeed(seedInput);
    robot.setNoiseSeed(noiseSeed);
    let activeSpawn: SpawnPose = yard.spawn;
    robot.reset(activeSpawn);
    let paused = false;
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
      if ((mode === "lessons" && !driveSelf) || driveSelf) {
        hint.hidden = true;
        if (driveSelf) {
          driveHint.hidden = false;
          driveHint.textContent = simArmed
            ? "You are driving. WASD or arrows, Space brakes. The filter still scores the scan."
            : "Press a drive key to take the wheel. WASD or arrows, Space brakes.";
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
    void import("./eval/scenarios").then((mod) => {
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
      // A free-space prior is tens of metres. A collapsed 2-sigma ring is about a metre,
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
    const resetWorld = (rerun = false) => {
      const wasRunning = code.current === "running" || code.current === "loading";
      if (wasRunning) stopProgram();
      activeSpawn = currentSpawn();
      paths.clear();
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
      if (rerun && wasRunning && (codeControls() || driveSelf)) runProgram();
      else if (wasRunning && (codeControls() || driveSelf)) showStopped();
    };

    const resetToSeed = (seed = readSeed(seedInput)) => {
      noiseSeed = seed >>> 0;
      seedInput.value = String(noiseSeed);
      robot.setNoiseSeed(noiseSeed);
      resetWorld(true);
    };

    const manualDrive = () => driveSelf && simArmed;
    const runProgram = () => {
      if (!codeControls() && !driveSelf) return;
      hideStopped();
      if (trackCloud) {
        heldPrior = null;
        priorHoldUntil = -1;
      }
      consolePanel.clear();
      if (!consoleByUser) setConsoleOpen(false);
      consolePanel.log("— running —", "log");
      editor?.highlightLine(null);
      window.dispatchEvent(new CustomEvent("robo-student-error", { detail: { text: "", line: null, chunk: null, local: null } }));
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
      if (next === "drive") {
        stopProgram();
        applyDrive();
      } else if (next === "code") {
        code.warmup();
        publishCodeLegend();
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
        activeSpawn = currentSpawn();
        paths.clear();
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
    mustGet("browse-examples").addEventListener("click", () => {
      browser.hidden = !browser.hidden;
      confirmBox.hidden = true;
    });
    document.addEventListener("pointerdown", (event) => {
      if (browser.hidden) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (browser.contains(target) || mustGet("browse-examples").contains(target)) return;
      browser.hidden = true;
      confirmBox.hidden = true;
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
    mustGet("reset-seed").addEventListener("click", () => resetToSeed());
    seedInput.addEventListener("change", () => resetToSeed());
    seedInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      resetToSeed();
    });
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
        noiseSeed = scene.seed >>> 0;
        seedInput.value = String(noiseSeed);
        robot.setNoiseSeed(noiseSeed);
        applyLessonCamera();
        if (scene.run) code.warmup();
        setHint();
      },
      setLessonSpawn: (spawn, worldId, kind) => {
        lessonSpawn = spawn;
        lessonWorld = worldId;
        lessonSpawnKind = kind;
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
    });

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
        hud.update(pausedView ?? robot.telemetry(), mode, code.current, simTime, paused);
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
