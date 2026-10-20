import { EXAMPLES } from "../editor/examples";
import type { WorldId } from "../sim/worlds";
import type { SpawnPose } from "../sim/vehicle";
import { LESSONS, MODULES, lessonById, lessonIndex, moduleLessons, resolveSpawn, type Lesson } from "./catalog";
import { renderMarkdown } from "./markdown";
import {
  clearLessonCode,
  isCompleted,
  loadLessonCode,
  loadProgress,
  markVisited,
  saveLessonCode,
  toggleCompleted,
} from "./progress";

export interface CourseHost {
  setWorld: (id: WorldId) => Promise<void>;
  setMode: (mode: "drive" | "code") => void;
  setPaused: (paused: boolean) => void;
  setLessonSpawn: (spawn: SpawnPose | null, world: string | null) => void;
  resetWorld: () => void;
  setCode: (source: string) => void;
  onCodeChange: (listener: (source: string) => void) => void;
  relayout: () => void;
}

interface Route {
  kind: "sandbox" | "lesson";
  id?: string;
  lab?: boolean;
}

export function mountCourse(host: CourseHost): void {
  const toc = document.getElementById("toc");
  const stage = document.getElementById("stage");
  const article = document.getElementById("lesson");
  const shell = document.getElementById("shell");
  if (!toc || !stage || !article || !shell) return;

  let applying = false;
  let labId: string | null = null;
  let saveTimer = 0;

  host.onCodeChange((source) => {
    if (applying || !labId) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveLessonCode(labId as string, source), 250);
  });

  const resetButton = document.getElementById("reset-starter");
  resetButton?.addEventListener("click", () => {
    const lesson = labId ? lessonById(labId) : undefined;
    if (!lesson) return;
    clearLessonCode(lesson.id);
    applying = true;
    host.setCode(starterOf(lesson));
    applying = false;
  });

  document.getElementById("toc-toggle")?.addEventListener("click", () => {
    shell.classList.toggle("toc-open");
  });

  const renderToc = (active: string | null) => {
    const progress = loadProgress();
    const sandboxCurrent = active === null;
    toc.innerHTML = `
      <a class="toc-sandbox${sandboxCurrent ? " is-current" : ""}" href="#/sandbox">Sandbox</a>
      <p class="toc-note">Free play. Any world, any example.</p>
    `;
    for (const module of MODULES) {
      const block = document.createElement("section");
      block.className = "toc-module";
      const heading = document.createElement("h2");
      heading.textContent = module.title;
      if (module.soon) {
        const badge = document.createElement("span");
        badge.className = "soon";
        badge.textContent = "Soon";
        heading.append(badge);
      }
      block.append(heading);
      const list = document.createElement("ol");
      for (const lesson of moduleLessons(module.id)) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#/lesson/${lesson.id}`;
        link.textContent = lesson.title;
        if (lesson.id === active) link.classList.add("is-current");
        if (progress.completed.includes(lesson.id)) link.classList.add("is-done");
        else if (progress.visited.includes(lesson.id)) link.classList.add("is-visited");
        if (lesson.status === "soon") link.classList.add("is-soon");
        item.append(link);
        list.append(item);
      }
      block.append(list);
      toc.append(block);
    }
  };

  const show = (route: Route) => {
    const lesson = route.kind === "lesson" && route.id ? lessonById(route.id) : undefined;
    if (route.kind === "lesson" && !lesson) {
      location.hash = "#/sandbox";
      return;
    }
    shell.classList.remove("toc-open");
    stage.classList.toggle("is-sandbox", route.kind === "sandbox");
    stage.classList.toggle("is-read", route.kind === "lesson" && !route.lab);
    stage.classList.toggle("is-lab", route.kind === "lesson" && Boolean(route.lab));
    document.getElementById("app")?.classList.toggle("lesson-lab", Boolean(route.lab && lesson?.action === "lab"));
    labId = route.lab && lesson ? lesson.id : null;
    resetButton?.toggleAttribute("hidden", !(route.lab && lesson?.starter));

    if (!lesson) {
      article.hidden = true;
      article.innerHTML = "";
      host.setPaused(false);
      host.setLessonSpawn(null, null);
      renderToc(null);
      host.relayout();
      return;
    }

    markVisited(lesson.id);
    article.hidden = false;
    article.innerHTML = lessonHtml(lesson, Boolean(route.lab));
    bindLesson(lesson, Boolean(route.lab));
    renderToc(lesson.id);

    if (!route.lab) {
      host.setPaused(true);
      host.relayout();
      return;
    }

    host.setPaused(false);
    void openLab(lesson);
  };

  const openLab = async (lesson: Lesson) => {
    const spawn = resolveSpawn(lesson);
    host.setLessonSpawn(spawn, lesson.world);
    await host.setWorld(lesson.world);
    host.setLessonSpawn(spawn, lesson.world);
    host.resetWorld();
    if (lesson.action === "drive" || lesson.action === "sandbox") {
      host.setMode("drive");
    } else {
      applying = true;
      host.setCode(loadLessonCode(lesson.id) ?? starterOf(lesson));
      applying = false;
      host.setMode("code");
    }
    host.relayout();
  };

  const bindLesson = (lesson: Lesson, lab: boolean) => {
    article.querySelector("[data-open]")?.addEventListener("click", () => {
      if (lesson.action === "sandbox") location.hash = "#/sandbox";
      else location.hash = `#/lesson/${lesson.id}/lab`;
    });
    article.querySelector("[data-complete]")?.addEventListener("click", (event) => {
      const done = toggleCompleted(lesson.id);
      const button = event.currentTarget as HTMLButtonElement;
      button.textContent = done ? "Completed" : "Mark complete";
      button.classList.toggle("is-on", done);
      renderToc(lesson.id);
    });
    article.querySelector("[data-focus]")?.addEventListener("click", () => {
      stage.classList.toggle("sim-focus");
      host.relayout();
    });
    if (lab) article.querySelector("[data-focus]")?.removeAttribute("hidden");
  };

  window.addEventListener("hashchange", () => show(parseRoute(location.hash)));
  if (!location.hash || location.hash === "#") {
    history.replaceState(null, "", "#/lesson/getting-started/sandbox");
  }
  show(parseRoute(location.hash));
}

function starterOf(lesson: Lesson): string {
  return EXAMPLES.find((example) => example.id === lesson.starter)?.source ?? "# This lesson has no starter code yet.\n\ndef control(sensors):\n    return 0.0, 0.0\n";
}

function lessonHtml(lesson: Lesson, lab: boolean): string {
  const index = lessonIndex(lesson.id);
  const prev = index > 0 ? LESSONS[index - 1] : undefined;
  const next = index >= 0 && index < LESSONS.length - 1 ? LESSONS[index + 1] : undefined;
  const prereq = lesson.prerequisites
    .map((id) => {
      const item = lessonById(id);
      return item ? `<a href="#/lesson/${item.id}">${escapeText(item.title)}</a>` : "";
    })
    .filter((item) => item.length > 0)
    .join(", ");
  const done = isCompleted(lesson.id);
  const openLabel =
    lesson.status === "soon"
      ? ""
      : lesson.action === "sandbox"
        ? "Open the sandbox"
        : lesson.action === "drive"
          ? "Drive this world"
          : "Open in sandbox";
  return `
    <div class="lesson-scroll">
      <p class="lesson-kicker">${escapeText(MODULES.find((item) => item.id === lesson.moduleId)?.title ?? "")}${lesson.status === "soon" ? " · Coming soon" : ""}</p>
      <h1>${escapeText(lesson.title)}</h1>
      ${prereq ? `<p class="lesson-prereq">Read first: ${prereq}</p>` : ""}
      <div class="lesson-body">${lesson.status === "soon" ? renderMarkdown(lesson.markdown) : renderMarkdown(lesson.markdown)}</div>
      <div class="lesson-actions">
        ${openLabel ? `<button type="button" class="primary" data-open>${openLabel}</button>` : ""}
        <button type="button" data-complete class="${done ? "is-on" : ""}">${done ? "Completed" : "Mark complete"}</button>
        ${lab ? `<button type="button" data-focus>Hide reading</button>` : ""}
      </div>
      <nav class="lesson-pager" aria-label="Lesson">
        ${prev ? `<a href="#/lesson/${prev.id}">← ${escapeText(prev.title)}</a>` : "<span></span>"}
        ${next ? `<a href="#/lesson/${next.id}">${escapeText(next.title)} →</a>` : "<span></span>"}
      </nav>
    </div>
  `;
}

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/^\//, "");
  if (path === "" || path === "sandbox") return { kind: "sandbox" };
  const match = path.match(/^lesson\/([a-z0-9-]+)\/([a-z0-9-]+)(\/lab)?$/);
  if (!match) return { kind: "sandbox" };
  return { kind: "lesson", id: `${match[1]}/${match[2]}`, lab: Boolean(match[3]) };
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
