import { dedent, indentBody, readChunks, writeChunk } from "../editor/chunks";
import { createSliceEditor, type SliceEditor } from "../editor/slice-editor";
import type { StudentError } from "../editor/errors";
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
  setLessonSpawn: (spawn: SpawnPose | null, world: string | null, kind: string | null) => void;
  clearConsole: () => void;
  resetWorld: () => void;
  setCode: (source: string) => void;
  replaceSource: (source: string) => void;
  getCode: () => string;
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
  let indexScroll = 0;
  const slices = new Map<string, SliceEditor>();

  const clearSlices = () => {
    for (const slice of slices.values()) slice.destroy();
    slices.clear();
  };

  const parkDrive = () => {
    const drive = document.getElementById("drive-self");
    const bar = document.getElementById("try-bar");
    if (drive && bar) bar.append(drive);
  };

  const placeDrive = (manual: boolean) => {
    const drive = document.getElementById("drive-self");
    if (!drive) return;
    if (!manual) {
      drive.hidden = true;
      parkDrive();
      return;
    }
    drive.hidden = false;
    const hint = article.querySelector(".sim-hint");
    const body = article.querySelector(".lesson-body");
    if (hint) hint.insertAdjacentElement("afterend", drive);
    else if (body) body.prepend(drive);
  };

  host.onCodeChange((source) => {
    if (applying || !labId) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveLessonCode(labId as string, source), 250);
  });

  const refillChunks = () => {
    clearSlices();
    const chunks = readChunks(host.getCode());
    const lesson = labId ? lessonById(labId) : undefined;
    const program = lesson?.starter ? `${lesson.starter} program` : "program";
    for (const slot of article.querySelectorAll<HTMLElement>(".code-slot")) {
      const id = slot.dataset.chunk ?? "";
      const body = chunks.get(id);
      if (body === undefined) {
        slot.hidden = true;
        slot.replaceChildren();
        continue;
      }
      slot.hidden = false;
      const { text, indent } = dedent(body);
      const label = document.createElement("p");
      label.className = "slot-label";
      label.textContent = `${program} · ${id}`;
      const mount = document.createElement("div");
      slot.replaceChildren(label, mount);
      const slice = createSliceEditor(
        mount,
        text,
        (value) => {
          if (applying) return;
          const next = writeChunk(host.getCode(), id, indentBody(value, indent));
          applying = true;
          host.replaceSource(next);
          applying = false;
        },
        () => host.runProgram(),
      );
      slices.set(id, slice);
    }
  };

  window.addEventListener("robo-student-error", (event) => {
    const detail = (event as CustomEvent<StudentError>).detail;
    for (const [id, slice] of slices) slice.highlight(detail?.chunk === id ? detail.local : null);
  });

  document.getElementById("reset-starter")?.addEventListener("click", () => {
    const lesson = labId ? lessonById(labId) : undefined;
    if (!lesson?.starter) return;
    clearLessonCode(lesson.id);
    applying = true;
    host.setCode(starterOf(lesson));
    refillChunks();
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
      edit.textContent = "Full program";
    }
    const consoleBtn = document.getElementById("toggle-console");
    if (consoleBtn) {
      consoleBtn.setAttribute("aria-expanded", "false");
      consoleBtn.classList.remove("is-on");
    }
  };

  const showConsole = (open: boolean) => {
    const app = document.getElementById("app");
    const consoleBtn = document.getElementById("toggle-console");
    app?.classList.toggle("console-open", open);
    consoleBtn?.setAttribute("aria-expanded", String(open));
    consoleBtn?.classList.toggle("is-on", open);
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
      parkDrive();
      const parked = document.getElementById("drive-self");
      if (parked) parked.hidden = true;
      article.innerHTML = "";
      host.setLessonSpawn(null, null, null);
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
    parkDrive();
    article.innerHTML = lessonHtml(lesson);
    placeDrive(sceneFor(lesson).manual);
    const scene = sceneFor(lesson);
    host.setMode("lessons");
    host.clearConsole();
    host.setLessonSpawn(resolveSpawn(lesson), lesson.world, lesson.spawn);
    host.applyScene(scene);
    if (lesson.starter) showConsole(true);
    void openLesson(lesson, scene.run, token);
  };

  const openLesson = async (lesson: Lesson, run: boolean, token: number) => {
    if (host.getWorld() !== lesson.world) await host.setWorld(lesson.world);
    if (token !== opening) return;
    host.setLessonSpawn(resolveSpawn(lesson), lesson.world, lesson.spawn);
    if (lesson.starter) {
      applying = true;
    host.setCode(loadLessonCode(lesson.id) ?? starterOf(lesson));
    applying = false;
    refillChunks();
    showConsole(true);
    }
    host.resetWorld();
    if (run) host.runProgram();
    host.relayout();
  };

  const renderNav = (lesson: Lesson) => {
    const scroller = nav.querySelector<HTMLElement>(".lesson-index-body");
    if (scroller) indexScroll = scroller.scrollTop;
    const indexOpen = nav.querySelector("#lesson-index")?.hasAttribute("open") ?? false;
    const progress = loadProgress();
    const ready = LESSONS.filter((item) => item.status === "ready");
    const doneCount = ready.filter((item) => progress.completed.includes(item.id)).length;
    const index = lessonIndex(lesson.id);
    const prev = index > 0 ? LESSONS[index - 1] : undefined;
    const nextReady = index >= 0 ? LESSONS.slice(index + 1).find((item) => item.status === "ready") : undefined;
    const done = isCompleted(lesson.id);

    nav.innerHTML = `
      <div class="lesson-nav-row">
        <select id="lesson-module" aria-label="Module"></select>
        <select id="lesson-pick" aria-label="Lesson"></select>
      </div>
      <div class="lesson-nav-row">
        <button type="button" id="lesson-prev" ${prev ? "" : "disabled"}>Prev</button>
        <button type="button" id="lesson-next" ${nextReady ? "" : ""}>${nextReady ? "Next" : "Done"}</button>
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
      option.disabled = Boolean(module.soon);
      moduleSelect.append(option);
    }
    moduleSelect.value = lesson.moduleId;
    const fillLessons = (moduleId: string) => {
      lessonSelect.replaceChildren();
      for (const item of moduleLessons(moduleId)) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.status === "soon" ? `${item.title} (soon)` : item.title;
        option.disabled = item.status === "soon";
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
      if (nextReady) navigate({ mode: "lessons", id: nextReady.id });
      else article.querySelector(".course-complete")?.scrollIntoView({ block: "nearest" });
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
    body.scrollTop = indexScroll;
    body.addEventListener("scroll", () => {
      indexScroll = body.scrollTop;
    });
  };

  window.addEventListener("hashchange", () => show(parseRoute(location.hash)));
  if (!location.hash || location.hash === "#" || location.hash === "#/") {
    history.replaceState(null, "", "#/lesson/getting-started/sandbox");
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
      ${courseComplete(lesson)}
    </div>
  `;
}

function courseComplete(lesson: Lesson): string {
  const index = lessonIndex(lesson.id);
  const later = index >= 0 && LESSONS.slice(index + 1).some((item) => item.status === "ready");
  if (lesson.status !== "ready" || later) return "";
  return `
    <aside class="course-complete">
      <h2>Course complete</h2>
      <p>You drove the car, read the sensors, and ran a particle filter from a kidnapped start. Mapping, planning, and the later controllers are still being written. Those modules stay grey in the menu until they have a lesson.</p>
    </aside>
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
