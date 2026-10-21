import { EXAMPLES } from "../editor/examples";
import type { WorldId } from "../sim/worlds";
import type { SpawnPose } from "../sim/vehicle";
import { LESSONS, MODULES, lessonById, lessonIndex, moduleLessons, resolveSpawn, sceneFor, type Lesson } from "./catalog";
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
import type { AppMode } from "../ui/hud";

export interface CourseHost {
  setWorld: (id: WorldId) => Promise<void>;
  getWorld: () => WorldId;
  setMode: (mode: AppMode) => void;
  applyScene: (scene: ReturnType<typeof sceneFor> | null) => void;
  setLessonSpawn: (spawn: SpawnPose | null, world: string | null) => void;
  resetWorld: () => void;
  setCode: (source: string) => void;
  onCodeChange: (listener: (source: string) => void) => void;
  relayout: () => void;
  runProgram: () => void;
}

interface Route {
  mode: AppMode;
  id?: string;
}

const LAST_LESSON_KEY = "robo-sim-lab.last-lesson";

export function mountCourse(host: CourseHost): void {
  const nav = document.getElementById("lesson-nav");
  const article = document.getElementById("lesson");
  const lessonChrome = document.getElementById("lesson-chrome");
  if (!nav || !article || !lessonChrome) return;

  let applying = false;
  let labId: string | null = null;
  let saveTimer = 0;
  let opening = 0;

  host.onCodeChange((source) => {
    if (applying || !labId) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveLessonCode(labId as string, source), 250);
  });

  document.getElementById("reset-starter")?.addEventListener("click", () => {
    const lesson = labId ? lessonById(labId) : undefined;
    if (!lesson?.starter) return;
    clearLessonCode(lesson.id);
    applying = true;
    host.setCode(starterOf(lesson));
    applying = false;
    host.resetWorld();
    host.runProgram();
  });

  const navigate = (route: Route) => {
    const next = routeHash(route);
    if (location.hash === next) {
      show(route);
      return;
    }
    location.hash = next;
  };

  document.getElementById("mode-drive")?.addEventListener("click", () => navigate({ mode: "drive" }));
  document.getElementById("mode-code")?.addEventListener("click", () => navigate({ mode: "code" }));
  document.getElementById("mode-lessons")?.addEventListener("click", () => {
    navigate({ mode: "lessons", id: lastLessonId() });
  });

  const collapseLab = () => {
    document.getElementById("app")?.classList.remove("lab-open", "console-open");
    const edit = document.getElementById("edit-code");
    if (edit) {
      edit.setAttribute("aria-expanded", "false");
      edit.textContent = "Edit code";
    }
    const consoleBtn = document.getElementById("toggle-console");
    if (consoleBtn) {
      consoleBtn.setAttribute("aria-expanded", "false");
      consoleBtn.classList.remove("is-on");
    }
  };

  const show = (route: Route) => {
    collapseLab();
    const lesson = route.mode === "lessons" && route.id ? lessonById(route.id) : undefined;
    if (route.mode === "lessons" && !lesson) {
      location.hash = `#/lesson/${lastLessonId()}`;
      return;
    }
    const token = ++opening;
    labId = lesson?.starter ? lesson.id : null;
    document.getElementById("reset-starter")?.toggleAttribute("hidden", !lesson?.starter);
    lessonChrome.hidden = route.mode !== "lessons";
    article.hidden = route.mode !== "lessons";

    if (!lesson) {
      article.innerHTML = "";
      host.setLessonSpawn(null, null);
      host.applyScene(null);
      host.setMode(route.mode);
      host.relayout();
      return;
    }

    markVisited(lesson.id);
    try {
      localStorage.setItem(LAST_LESSON_KEY, lesson.id);
    } catch {
      // Progress still works if storage is blocked.
    }
    renderNav(lesson);
    article.innerHTML = lessonHtml(lesson);
    const scene = sceneFor(lesson);
    host.setMode("lessons");
    host.setLessonSpawn(resolveSpawn(lesson), lesson.world);
    host.applyScene(scene);
    void openLesson(lesson, scene.run, token);
  };

  const openLesson = async (lesson: Lesson, run: boolean, token: number) => {
    if (host.getWorld() !== lesson.world) await host.setWorld(lesson.world);
    if (token !== opening) return;
    host.setLessonSpawn(resolveSpawn(lesson), lesson.world);
    if (lesson.starter) {
      applying = true;
      host.setCode(loadLessonCode(lesson.id) ?? starterOf(lesson));
      applying = false;
    }
    host.resetWorld();
    if (run) host.runProgram();
    host.relayout();
  };

  const renderNav = (lesson: Lesson) => {
    const indexOpen = nav.querySelector("#lesson-index")?.hasAttribute("open") ?? false;
    const progress = loadProgress();
    const ready = LESSONS.filter((item) => item.status === "ready");
    const doneCount = ready.filter((item) => progress.completed.includes(item.id)).length;
    const index = lessonIndex(lesson.id);
    const prev = index > 0 ? LESSONS[index - 1] : undefined;
    const next = index >= 0 && index < LESSONS.length - 1 ? LESSONS[index + 1] : undefined;
    const done = isCompleted(lesson.id);

    nav.innerHTML = `
      <div class="lesson-nav-row">
        <select id="lesson-module" aria-label="Module"></select>
        <select id="lesson-pick" aria-label="Lesson"></select>
      </div>
      <div class="lesson-nav-row">
        <button type="button" id="lesson-prev" ${prev ? "" : "disabled"}>Prev</button>
        <button type="button" id="lesson-next" ${next ? "" : "disabled"}>Next</button>
        <button type="button" id="lesson-complete" class="${done ? "is-on" : ""}">${done ? "Completed" : "Mark complete"}</button>
        <span class="lesson-progress" title="Completed lessons">${doneCount}/${ready.length}</span>
      </div>
      <details id="lesson-index" ${indexOpen ? "open" : ""}>
        <summary>All lessons</summary>
        <div class="lesson-index-body"></div>
      </details>
    `;

    const moduleSelect = nav.querySelector<HTMLSelectElement>("#lesson-module");
    const lessonSelect = nav.querySelector<HTMLSelectElement>("#lesson-pick");
    if (!moduleSelect || !lessonSelect) return;
    for (const module of MODULES) {
      const option = document.createElement("option");
      option.value = module.id;
      option.textContent = module.soon ? `${module.title} (soon)` : module.title;
      moduleSelect.append(option);
    }
    moduleSelect.value = lesson.moduleId;
    const fillLessons = (moduleId: string) => {
      lessonSelect.replaceChildren();
      for (const item of moduleLessons(moduleId)) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.status === "soon" ? `${item.title} (soon)` : item.title;
        lessonSelect.append(option);
      }
    };
    fillLessons(lesson.moduleId);
    lessonSelect.value = lesson.id;

    moduleSelect.addEventListener("change", () => {
      const first = moduleLessons(moduleSelect.value)[0];
      if (first) navigate({ mode: "lessons", id: first.id });
    });
    lessonSelect.addEventListener("change", () => {
      if (lessonSelect.value) navigate({ mode: "lessons", id: lessonSelect.value });
    });
    nav.querySelector("#lesson-prev")?.addEventListener("click", () => {
      if (prev) navigate({ mode: "lessons", id: prev.id });
    });
    nav.querySelector("#lesson-next")?.addEventListener("click", () => {
      if (next) navigate({ mode: "lessons", id: next.id });
    });
    nav.querySelector("#lesson-complete")?.addEventListener("click", () => {
      toggleCompleted(lesson.id);
      renderNav(lesson);
    });

    const body = nav.querySelector(".lesson-index-body");
    if (!body) return;
    for (const module of MODULES) {
      const block = document.createElement("section");
      const heading = document.createElement("h2");
      heading.textContent = module.title;
      block.append(heading);
      const list = document.createElement("ol");
      for (const item of moduleLessons(module.id)) {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#/lesson/${item.id}`;
        link.textContent = item.title;
        if (item.id === lesson.id) link.classList.add("is-current");
        if (progress.completed.includes(item.id)) link.classList.add("is-done");
        else if (progress.visited.includes(item.id)) link.classList.add("is-visited");
        if (item.status === "soon") link.classList.add("is-soon");
        li.append(link);
        list.append(li);
      }
      block.append(list);
      body.append(block);
    }
  };

  window.addEventListener("hashchange", () => show(parseRoute(location.hash)));
  if (!location.hash || location.hash === "#") {
    history.replaceState(null, "", "#/drive");
  }
  show(parseRoute(location.hash));
}

function lastLessonId(): string {
  try {
    const saved = localStorage.getItem(LAST_LESSON_KEY);
    if (saved && lessonById(saved)) return saved;
  } catch {
    // Fall through to the first lesson.
  }
  return LESSONS[0]?.id ?? "getting-started/sandbox";
}

function starterOf(lesson: Lesson): string {
  return EXAMPLES.find((example) => example.id === lesson.starter)?.source ?? "# This lesson has no starter code yet.\n\ndef control(sensors):\n    return 0.0, 0.0\n";
}

function lessonHtml(lesson: Lesson): string {
  const prereq = lesson.prerequisites
    .map((id) => {
      const item = lessonById(id);
      return item ? `<a href="#/lesson/${item.id}">${escapeText(item.title)}</a>` : "";
    })
    .filter((item) => item.length > 0)
    .join(", ");
  const kicker = MODULES.find((item) => item.id === lesson.moduleId)?.title ?? "";
  return `
    <div class="lesson-scroll">
      <p class="lesson-kicker">${escapeText(kicker)}${lesson.status === "soon" ? " · Coming soon" : ""}</p>
      <h1>${escapeText(lesson.title)}</h1>
      ${prereq ? `<p class="lesson-prereq">Read first: ${prereq}</p>` : ""}
      <div class="lesson-body">${renderMarkdown(lesson.markdown)}</div>
    </div>
  `;
}

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/^\//, "");
  if (path === "" || path === "sandbox" || path === "drive") return { mode: "drive" };
  if (path === "code") return { mode: "code" };
  const match = path.match(/^lesson\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\/lab)?$/);
  if (!match) return { mode: "drive" };
  return { mode: "lessons", id: `${match[1]}/${match[2]}` };
}

function routeHash(route: Route): string {
  if (route.mode === "code") return "#/code";
  if (route.mode === "lessons" && route.id) return `#/lesson/${route.id}`;
  return "#/drive";
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
