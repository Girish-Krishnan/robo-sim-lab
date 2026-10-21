import { clamp } from "../api";

const STORAGE_KEY = "robo-sim-lab.code-width";
const MIN_CODE = 360;
const MIN_VIEW = 320;

/** Drag handle between the 3D view and the code pane. Width is remembered. */
export function mountSplitter(splitter: HTMLElement, onChange: () => void): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw == null ? Number.NaN : Number(raw);
    if (Number.isFinite(saved)) setWidth(saved);
  } catch {
    // Private mode and blocked storage still leave the default width.
  }

  let dragging = false;

  const widthFromPointer = (clientX: number) => {
    const main = splitter.parentElement;
    if (!main) return;
    const rect = main.getBoundingClientRect();
    setWidth(rect.right - clientX, rect.width);
    onChange();
  };

  splitter.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    splitter.setPointerCapture(event.pointerId);
    splitter.classList.add("dragging");
    document.body.classList.add("splitter-drag");
    widthFromPointer(event.clientX);
  });
  splitter.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    widthFromPointer(event.clientX);
  });
  const end = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove("dragging");
    document.body.classList.remove("splitter-drag");
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
    onChange();
  };
  splitter.addEventListener("pointerup", end);
  splitter.addEventListener("pointercancel", end);
  splitter.addEventListener("keydown", (event) => {
    const current = readWidth();
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const main = splitter.parentElement?.getBoundingClientRect().width ?? 1200;
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    setWidth(current + delta, main);
    onChange();
    event.preventDefault();
  });
}

function readWidth(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--code-width");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 420;
}

function setWidth(width: number, available = Number.POSITIVE_INFINITY): void {
  const max = Number.isFinite(available) ? Math.max(MIN_CODE, available - MIN_VIEW) : 900;
  const next = Math.round(clamp(width, MIN_CODE, max));
  document.documentElement.style.setProperty("--code-width", `${next}px`);
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Ignore quota and privacy errors.
  }
}
