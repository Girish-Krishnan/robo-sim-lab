import type { SandboxState } from "../sandbox/controller";
import type { VehicleTelemetry } from "../robots/types";

export type AppMode = "drive" | "code" | "lessons";

export class Hud {
  private readonly speed: HTMLElement;
  private readonly odom: HTMLElement;
  private readonly steerCmd: HTMLElement;
  private readonly steerAct: HTMLElement;
  private readonly throttle: HTMLElement;
  private readonly time: HTMLElement;
  private readonly mode: HTMLElement;

  constructor(root: HTMLElement) {
    root.replaceChildren();
    this.speed = row(root, "Speed");
    this.odom = row(root, "Odom");
    this.steerCmd = row(root, "Steer +left");
    this.steerAct = row(root, "Steer act");
    this.throttle = row(root, "Throttle");
    this.time = row(root, "Time");
    this.mode = row(root, "Mode");
  }

  update(telemetry: VehicleTelemetry, mode: AppMode, run: SandboxState, simTime = 0, paused = false): void {
    this.speed.textContent = `${telemetry.trueSpeed.toFixed(2)} m/s`;
    this.odom.textContent = `${telemetry.odomSpeed.toFixed(2)} m/s`;
    this.steerCmd.textContent = `${telemetry.commandedSteering.toFixed(2)} rad`;
    this.steerAct.textContent = `${telemetry.actuatorSteering.toFixed(2)} rad`;
    this.throttle.textContent = telemetry.commandedThrottle.toFixed(2);
    this.time.textContent = paused ? `${simTime.toFixed(1)} s · paused` : `${simTime.toFixed(1)} s`;
    const name = mode === "drive" ? "Drive" : mode === "lessons" ? "Lesson" : "Code";
    this.mode.textContent = mode === "drive" ? name : `${name} · ${label(run)}`;
  }
}

function row(root: HTMLElement, labelText: string): HTMLElement {
  const line = document.createElement("div");
  line.className = "hud-row";
  const name = document.createElement("span");
  name.textContent = labelText;
  const value = document.createElement("strong");
  line.append(name, value);
  root.append(line);
  return value;
}

function label(state: SandboxState): string {
  if (state === "running") return "running";
  if (state === "loading") return "loading";
  if (state === "error") return "error";
  if (state === "stopped") return "stopped";
  return "idle";
}
