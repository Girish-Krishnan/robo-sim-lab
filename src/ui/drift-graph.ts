/** Live position error: how far wheel odometry has walked from the car. */

export class DriftGraph {
  private readonly wrap: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly samples: { t: number; error: number }[] = [];

  constructor(parent: HTMLElement) {
    this.wrap = document.createElement("div");
    this.wrap.id = "drift-graph";
    this.wrap.hidden = true;
    const title = document.createElement("p");
    title.textContent = "Position error (m)";
    this.canvas = document.createElement("canvas");
    this.canvas.width = 440;
    this.canvas.height = 140;
    this.canvas.setAttribute("aria-label", "Position error over time, true pose versus odometry");
    this.wrap.append(title, this.canvas);
    parent.append(this.wrap);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    this.ctx = ctx;
  }

  setVisible(on: boolean): void {
    this.wrap.hidden = !on;
    if (on) this.draw();
  }

  reset(): void {
    this.samples.length = 0;
    this.draw();
  }

  push(time: number, error: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && time - last.t < 0.15) return;
    this.samples.push({ t: time, error });
    if (this.samples.length > 400) this.samples.splice(0, this.samples.length - 400);
    if (!this.wrap.hidden) this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(10, 14, 16, 0.78)";
    ctx.fillRect(0, 0, w, h);
    const left = 36;
    const right = 12;
    const top = 10;
    const bottom = 22;
    const plotW = w - left - right;
    const plotH = h - top - bottom;
    const peak = Math.max(1, ...this.samples.map((sample) => sample.error));
    const t0 = this.samples[0]?.t ?? 0;
    const t1 = Math.max(t0 + 5, this.samples[this.samples.length - 1]?.t ?? t0 + 5);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + plotH);
    ctx.lineTo(left + plotW, top + plotH);
    ctx.stroke();
    ctx.fillStyle = "#8e9b94";
    ctx.font = "12px sans-serif";
    ctx.fillText("0", 8, top + plotH);
    ctx.fillText(peak.toFixed(1), 4, top + 10);
    ctx.fillText(`${t0.toFixed(0)}s`, left, h - 4);
    ctx.fillText(`${t1.toFixed(0)}s`, left + plotW - 24, h - 4);
    if (this.samples.length < 2) return;
    ctx.strokeStyle = "#7eb6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.samples.forEach((sample, index) => {
      const x = left + ((sample.t - t0) / (t1 - t0)) * plotW;
      const y = top + plotH - (sample.error / peak) * plotH;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
