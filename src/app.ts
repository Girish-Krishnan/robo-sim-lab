import RAPIER from "@dimforge/rapier3d-compat";
import { ACKERMANN_BUGGY, CONTROL_DT, clampCommand } from "./api";
import { EXAMPLES, DEFAULT_EXAMPLE } from "./editor/examples";
import { createEditor, type CodeEditor } from "./editor/editor";
import { ChaseCamera } from "./sim/camera";
import { addCourse } from "./sim/course";
import { LidarView } from "./sim/lidar-view";
import { addGround, SimView } from "./sim/scene";
import { AckermannBuggy } from "./sim/vehicle";
import { CodeSandbox, type SandboxState } from "./sandbox/controller";
import { ConsolePanel } from "./ui/console-panel";
import { Hud, type AppMode } from "./ui/hud";

const PHYSICS_DT = 1 / 60;

export async function mountApp(): Promise<void> {
  const viewport = mustGet<HTMLElement>("viewport");
  const loading = mustGet<HTMLElement>("loading");
  const loadingText = mustGet<HTMLElement>("loading-text");
  const hint = mustGet<HTMLElement>("hint");
  const codePanel = mustGet<HTMLElement>("code-panel");
  const runState = mustGet<HTMLElement>("run-state");
  const exampleSelect = mustGet<HTMLSelectElement>("example");
  const isoBadge = mustGet<HTMLElement>("iso-badge");

  isoBadge.textContent = crossOriginIsolated ? "Isolated" : "Not isolated";
  isoBadge.classList.toggle("ok", crossOriginIsolated);

  let mode: AppMode = "drive";
  const keys = new Set<string>();
  const hud = new Hud(mustGet("hud"));
  const consolePanel = new ConsolePanel(mustGet("console"));

  let sandbox: CodeSandbox | null = null;
  let editor: CodeEditor | null = null;

  const setRunState = (state: SandboxState) => {
    runState.dataset.state = state;
    runState.textContent =
      state === "running" ? "Running" : state === "error" ? "Error" : state === "stopped" ? "Stopped" : "Idle";
  };

  try {
    loadingText.textContent = "Loading physics…";
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = PHYSICS_DT;

    const view = new SimView(viewport);
    addGround(RAPIER, world, view.scene);
    addCourse(RAPIER, world, view.scene);
    const robot = new AckermannBuggy(RAPIER, world, view.scene);
    const lidar = new LidarView(view.scene);
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
      onState: setRunState,
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
      const forward = keys.has("w") || keys.has("arrowup");
      const back = keys.has("s") || keys.has("arrowdown");
      const left = keys.has("a") || keys.has("arrowleft");
      const right = keys.has("d") || keys.has("arrowright");
      const braking = keys.has(" ");
      const throttle = braking ? 0 : forward ? 1 : back ? -0.65 : 0;
      const steering = ((left ? 1 : 0) - (right ? 1 : 0)) * ACKERMANN_BUGGY.limits.maxSteering;
      robot.setCommand(clampCommand({ steering, throttle }, ACKERMANN_BUGGY.limits), braking ? 80 : 0);
    };

    const resetWorld = () => {
      robot.reset();
      if (mode === "drive") applyDrive();
    };

    const runProgram = () => {
      consolePanel.log("— running —", "log");
      code.run(codeEditor.getValue());
    };

    const stopProgram = () => {
      code.stop();
      robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), 40);
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
          : "Program runs at 20 Hz on sensor data only · Drag to look around";
      if (next === "drive") {
        stopProgram();
        applyDrive();
      } else {
        robot.setCommand(clampCommand({ steering: 0, throttle: 0 }, ACKERMANN_BUGGY.limits), 40);
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
    const lidarButton = mustGet<HTMLButtonElement>("lidar-toggle");
    lidarButton.addEventListener("click", () => {
      const enabled = !lidar.isEnabled;
      lidar.setEnabled(enabled);
      lidarButton.setAttribute("aria-pressed", String(enabled));
      lidarButton.classList.toggle("off", !enabled);
    });
    exampleSelect.addEventListener("change", () => {
      const example = EXAMPLES.find((item) => item.id === exampleSelect.value);
      if (!example) return;
      if (code.current === "running") stopProgram();
      codeEditor.setValue(example.source);
    });

    window.addEventListener("keydown", (event) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (mode === "drive" && (key === "r" || event.code === "KeyR") && !event.repeat) resetWorld();
      if (mode !== "drive") return;
      if (event.key.startsWith("Arrow") || event.key === " ") event.preventDefault();
      keys.add(key);
    });
    window.addEventListener("keyup", (event) => {
      keys.delete(event.key.toLowerCase());
    });
    window.addEventListener("blur", () => keys.clear());

    setMode("drive");
    loading.hidden = true;

    view.renderer.domElement.focus({ preventScroll: true });

    let last = performance.now();
    let accumulator = 0;
    let sensorAccumulator = 0;
    let simTime = 0;

    const frame = (now: number) => {
      try {
        const frameDt = Math.min(0.05, (now - last) / 1000);
        last = now;
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
            lidar.update(robot.lidarDebug());
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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, .cm-content, .cm-editor"));
}
