const MAX_LINES = 250;

export class ConsolePanel {
  constructor(private readonly root: HTMLElement) {}

  clear(): void {
    this.root.replaceChildren();
  }

  log(line: string, level: "log" | "error"): void {
    const row = document.createElement("div");
    row.className = level === "error" ? "log-error" : "log-line";
    row.textContent = line;
    this.root.append(row);
    while (this.root.childElementCount > MAX_LINES) {
      this.root.firstElementChild?.remove();
    }
    const nearBottom = this.root.scrollHeight - this.root.scrollTop - this.root.clientHeight < 48;
    if (nearBottom) this.root.scrollTop = this.root.scrollHeight;
  }
}
