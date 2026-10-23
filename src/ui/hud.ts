import type { SandboxState } from "../sandbox/controller";
import type { VehicleTelemetry } from "../robots/types";

export type AppMode = "drive" | "code" | "lessons";

export class Hud {
  private readonly root: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly odom: HTMLElement;
  private readonly steerCmd: HTMLElement;
  private readonly steerAct: HTMLElement;
  private readonly throttle: HTMLElement;
  private readonly time: HTMLElement;
  private readonly mode: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    root.replaceChildren();
    this.speed = row(root, "Speed");
    this.odom = row(root, "Odom", true);
    this.steerCmd = row(root, "Steer +left");
    this.steerAct = row(root, "Steer act", true);
    this.throttle = row(root, "Throttle", true);
    this.time = row(root, "Time");
    this.mode = row(root, "Mode", true);
  }

  update(
    telemetry: VehicleTelemetry,
    mode: AppMode,
    run: SandboxState,
    simTime = 0,
    paused = false,
    sampling = true,
    handsOn = false,
  ): void {
    this.root.classList.toggle("is-paused", paused);
    this.speed.textContent = `${telemetry.trueSpeed.toFixed(2)} m/s`;
    this.odom.textContent = `${displayedOdom(telemetry.odomSpeed, telemetry.trueSpeed, sampling).toFixed(2)} m/s`;
    this.steerCmd.textContent = `${telemetry.commandedSteering.toFixed(2)} rad`;
    this.steerAct.textContent = `${telemetry.actuatorSteering.toFixed(2)} rad`;
    this.throttle.textContent = telemetry.commandedThrottle.toFixed(2);
    this.time.textContent = paused ? `${simTime.toFixed(1)} s · paused` : `${simTime.toFixed(1)} s`;
    const moving = Math.abs(telemetry.trueSpeed) > 0.15 || Math.abs(telemetry.commandedThrottle) > 0.05;
    this.mode.textContent = modeLabel(mode, run, paused, handsOn, moving);
  }
}

function row(root: HTMLElement, labelText: string, fold = false): HTMLElement {
  const line = document.createElement("div");
  line.className = fold ? "hud-row hud-fold" : "hud-row";
  const name = document.createElement("span");
  name.textContent = labelText;
  const value = document.createElement("strong");
  line.append(name, value);
  root.append(line);
  return value;
}

/**
 * Wheel speed is only refreshed while a program is being fed scans.
 * Once the car has halted, the last reading would sit beside Speed 0.
 */
export function displayedOdom(odomSpeed: number, trueSpeed: number, sampling: boolean): number {
  if (!sampling && Math.abs(trueSpeed) < 0.05) return 0;
  return odomSpeed;
}

/** Hands-on lessons say Driving while the car is moving, not Stopped. */
export function modeLabel(mode: AppMode, run: SandboxState, paused: boolean, handsOn: boolean, moving: boolean): string {
  if (paused) return "paused";
  if (mode === "drive") return "Drive";
  if (mode === "lessons" && handsOn) return moving ? "Lesson · driving" : "Lesson · ready";
  const name = mode === "lessons" ? "Lesson" : "Code";
  return `${name} · ${label(run)}`;
}

export function runBarLabel(state: SandboxState, paused: boolean, handsOn: boolean, moving: boolean): string {
  if (paused) return "Paused";
  if (handsOn) return moving ? "Driving" : "Ready";
  if (state === "running") return "Running";
  if (state === "loading") return "Loading";
  if (state === "error") return "Error";
  if (state === "stopped") return "Stopped";
  return "Idle";
}

function label(state: SandboxState): string {
  if (state === "running") return "running";
  if (state === "loading") return "loading";
  if (state === "error") return "error";
  if (state === "stopped") return "stopped";
  return "idle";
}
