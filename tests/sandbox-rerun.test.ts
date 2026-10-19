import { describe, expect, it } from "vitest";
import type { SensorFrame } from "../src/api";
import { CodeSandbox, type SandboxWorker } from "../src/sandbox/controller";
import type { HostToWorker, WorkerToHost } from "../src/sandbox/messages";

class FakeWorker implements SandboxWorker {
  onmessage: ((event: MessageEvent<WorkerToHost>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly sent: HostToWorker[] = [];
  terminated = false;

  postMessage(message: HostToWorker): void {
    this.sent.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: WorkerToHost): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerToHost>);
  }

  last(): HostToWorker {
    const message = this.sent[this.sent.length - 1];
    if (!message) throw new Error("worker received nothing");
    return message;
  }
}

function frame(extra: Record<string, unknown> = {}): SensorFrame {
  return {
    time: 1,
    dt: 0.05,
    lidar: { angles: [0], ranges: [10], maxRange: 25 },
    odometry: { speed: 1, steeringAngle: 0.1, pose: { x: 0, y: 0, yaw: 0 } },
    imu: { yawRate: 0, accel: { x: 0, y: 0, z: 9.81 } },
    camera: { available: false, width: 0, height: 0 },
    ...extra,
  } as SensorFrame;
}

function harness(tickTimeoutMs = 400) {
  const workers: FakeWorker[] = [];
  const commands: Array<{ steering: number; throttle: number }> = [];
  const logs: string[] = [];
  const states: string[] = [];
  const sandbox = new CodeSandbox(
    {
      onCommand: (command) => commands.push(command),
      onLog: (line) => logs.push(line),
      onState: (state) => states.push(state),
    },
    {
      tickTimeoutMs,
      loadTimeoutMs: 200,
      bootTimeoutMs: 200,
      workerFactory: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    },
  );
  return { sandbox, workers, commands, logs, states };
}

function boot(worker: FakeWorker): void {
  worker.emit({ type: "runtime", logs: ["Python runtime ready (NumPy loaded)."] });
}

describe("python sandbox reruns", () => {
  it("runs again after stop, reset-style stop, a new program, and a late tick", () => {
    const { sandbox, workers, commands } = harness();
    const programs = ["def control(sensors):\n    return 0.2, 0.4\n", "def control(sensors):\n    return -0.3, 0.1\n", "def control(sensors):\n    return 0.0, 0.6\n"];

    sandbox.run(programs[0]!);
    expect(sandbox.current).toBe("loading");
    const first = workers[0]!;
    expect(first.last().type).toBe("boot");
    boot(first);
    const load1 = first.last();
    expect(load1.type).toBe("load");
    if (load1.type !== "load") return;
    expect(load1.code).toBe(programs[0]);
    first.emit({ type: "ready", id: load1.id, logs: ["circle ready"] });
    expect(sandbox.current).toBe("running");

    sandbox.offer(frame({ groundTruth: { x: 9 } }));
    const tick1 = first.last();
    expect(tick1.type).toBe("tick");
    if (tick1.type !== "tick") return;
    expect(JSON.stringify(tick1.sensors).includes("groundTruth")).toBe(false);
    first.emit({ type: "result", id: tick1.id, command: { steering: 0.2, throttle: 0.4 }, logs: ["t=0"] });
    expect(commands).toEqual([{ steering: 0.2, throttle: 0.4 }]);

    sandbox.offer(frame());
    const inflight = first.last();
    expect(inflight.type).toBe("tick");
    if (inflight.type !== "tick") return;
    sandbox.stop();
    expect(sandbox.current).toBe("stopped");
    expect(first.sent.some((message) => message.type === "stop")).toBe(true);
    first.emit({
      type: "result",
      id: inflight.id,
      command: { steering: 0.9, throttle: 1 },
      logs: ["late"],
    });
    expect(commands).toEqual([{ steering: 0.2, throttle: 0.4 }]);

    sandbox.run(programs[1]!);
    expect(sandbox.current).toBe("loading");
    const load2 = first.last();
    expect(load2.type).toBe("load");
    if (load2.type !== "load") return;
    expect(load2.code).toBe(programs[1]);
    expect(load2.id).not.toBe(load1.id);
    first.emit({ type: "ready", id: load1.id, logs: ["stale ready"] });
    expect(sandbox.current).toBe("loading");
    first.emit({ type: "ready", id: load2.id, logs: ["second ready"] });
    expect(sandbox.current).toBe("running");
    sandbox.offer(frame());
    const tick2 = first.last();
    expect(tick2.type).toBe("tick");
    if (tick2.type !== "tick") return;
    first.emit({ type: "result", id: tick2.id, command: { steering: -0.3, throttle: 0.1 }, logs: ["again"] });
    expect(commands.at(-1)).toEqual({ steering: -0.3, throttle: 0.1 });

    sandbox.stop();
    sandbox.run(programs[2]!);
    const load3 = first.last();
    expect(load3.type).toBe("load");
    if (load3.type !== "load") return;
    expect(load3.code).toBe(programs[2]);
    first.emit({ type: "ready", id: load3.id, logs: [] });
    expect(sandbox.current).toBe("running");
    sandbox.offer(frame());
    const tick3 = first.last();
    if (tick3.type !== "tick") throw new Error("expected tick");
    first.emit({ type: "result", id: tick3.id, command: { steering: 0, throttle: 0.6 }, logs: ["third"] });
    expect(commands.at(-1)).toEqual({ steering: 0, throttle: 0.6 });
    expect(first.terminated).toBe(false);
  });

  it("boots a fresh worker after a timeout and accepts the next run", async () => {
    const { sandbox, workers, logs } = harness(30);
    sandbox.run("def control(sensors):\n    return 0, 0\n");
    const hung = workers[0]!;
    boot(hung);
    const load = hung.last();
    if (load.type !== "load") throw new Error("expected load");
    hung.emit({ type: "ready", id: load.id, logs: [] });
    sandbox.offer(frame());
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(sandbox.current).toBe("error");
    expect(hung.terminated).toBe(true);
    expect(logs.some((line) => line.includes("timed out"))).toBe(true);

    sandbox.run("def control(sensors):\n    return 0.1, 0.2\n");
    expect(workers.length).toBe(2);
    const next = workers[1]!;
    expect(next.last().type).toBe("boot");
    boot(next);
    const load2 = next.last();
    if (load2.type !== "load") throw new Error("expected load");
    expect(load2.code).toContain("0.1");
    next.emit({ type: "ready", id: load2.id, logs: ["back"] });
    expect(sandbox.current).toBe("running");
    sandbox.offer(frame());
    const tick = next.last();
    if (tick.type !== "tick") throw new Error("expected tick");
    next.emit({ type: "result", id: tick.id, command: { steering: 0.1, throttle: 0.2 }, logs: [] });
    expect(sandbox.current).toBe("running");
  });
});
