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

const LAB_KEY = "robo-sim-lab.lab-editor";
const MIN_EDITOR = 120;
const MIN_ARTICLE = 240;

/** Drag handle between the lesson article and the expanded editor. */
export function mountLabSplitter(splitter: HTMLElement, onChange: () => void): void {
  try {
    const raw = localStorage.getItem(LAB_KEY);
    const saved = raw == null ? Number.NaN : Number(raw);
    if (Number.isFinite(saved)) document.documentElement.style.setProperty("--lab-editor", `${Math.round(saved)}px`);
  } catch {
    // Keep the CSS default.
  }

  let dragging = false;
  const heightFromPointer = (clientY: number) => {
    const panel = splitter.closest("#code-panel");
    const article = document.getElementById("lesson");
    if (!panel || !article) return;
    const panelRect = panel.getBoundingClientRect();
    const articleTop = article.getBoundingClientRect().top;
    const below = trailingHeight();
    const next = clamp(panelRect.bottom - below - clientY, MIN_EDITOR, Math.max(MIN_EDITOR, panelRect.bottom - articleTop - MIN_ARTICLE - below));
    document.documentElement.style.setProperty("--lab-editor", `${Math.round(next)}px`);
    try {
      localStorage.setItem(LAB_KEY, String(Math.round(next)));
    } catch {
      // Ignore quota and privacy errors.
    }
    onChange();
  };

  splitter.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    splitter.setPointerCapture(event.pointerId);
    splitter.classList.add("dragging");
    document.body.classList.add("splitter-drag", "splitter-drag-row");
    heightFromPointer(event.clientY);
  });
  splitter.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    heightFromPointer(event.clientY);
  });
  const end = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove("dragging");
    document.body.classList.remove("splitter-drag", "splitter-drag-row");
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
    onChange();
  };
  splitter.addEventListener("pointerup", end);
  splitter.addEventListener("pointercancel", end);
  splitter.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const panel = splitter.closest("#code-panel");
    const article = document.getElementById("lesson");
    const current = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lab-editor"));
    const base = Number.isFinite(current) ? current : 200;
    const room = panel && article
      ? panel.getBoundingClientRect().bottom - article.getBoundingClientRect().top - MIN_ARTICLE - trailingHeight()
      : 520;
    const next = Math.round(clamp(base + (event.key === "ArrowUp" ? 24 : -24), MIN_EDITOR, Math.max(MIN_EDITOR, Math.min(520, room))));
    document.documentElement.style.setProperty("--lab-editor", `${next}px`);
    try {
      localStorage.setItem(LAB_KEY, String(next));
    } catch {
      // Ignore quota and privacy errors.
    }
    onChange();
    event.preventDefault();
  });
}

function trailingHeight(): number {
  const bar = document.getElementById("try-bar")?.getBoundingClientRect().height ?? 40;
  const open = document.getElementById("app")?.classList.contains("console-open") ?? false;
  const consoleHeight = open ? (document.querySelector(".console-wrap")?.getBoundingClientRect().height ?? 112) : 0;
  return bar + consoleHeight + 8;
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
