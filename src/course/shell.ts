import { dedent, indentBody, readChunks, writeChunk } from "../editor/chunks";
import { createSliceEditor, type SliceEditor } from "../editor/slice-editor";
import type { StudentError } from "../editor/errors";
import { EXAMPLES } from "../editor/examples";
import { WORLDS, type WorldId } from "../sim/worlds";
import type { SpawnPose } from "../sim/vehicle";
import { LESSONS, MODULES, lessonById, lessonIndex, moduleLessons, resolveSpawn, sceneFor, type Lesson } from "./catalog";
import { renderMarkdown } from "./markdown";
import {
  clearLessonCode,
  isCompleted,
  loadLessonCode,
  loadProgress,
  markCompleted,
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
  setLessonWorlds: (ids: WorldId[] | null) => void;
  clearConsole: () => void;
  resetWorld: () => void;
  setCode: (source: string) => void;
  replaceSource: (source: string) => void;
  getCode: () => string;
  onCodeChange: (listener: (source: string) => void) => void;
  relayout: () => void;
  runProgram: () => void;
  scatterGuesses: () => void;
}

interface Route {
  mode: AppMode;
  id?: string;
}

const LAST_LESSON_KEY = "robo-sim-lab.last-lesson";

export async function mountCourse(host: CourseHost): Promise<void> {
  const nav = document.getElementById("lesson-nav");
  const article = document.getElementById("lesson");
  const lessonChrome = document.getElementById("lesson-chrome");
  if (!nav || !article || !lessonChrome) return;
  const lessonToast = document.createElement("p");
  lessonToast.id = "lesson-toast";
  lessonToast.hidden = true;
  lessonChrome.append(lessonToast);
  let toastTimer = 0;
  const flashLesson = (text: string) => {
    lessonToast.textContent = text;
    lessonToast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      lessonToast.hidden = true;
    }, 2400);
  };

  let applying = false;
  let labId: string | null = null;
  let saveTimer = 0;
  let opening = 0;
  let tocOpen = true;
  const openModules = new Set<string>();
  let tocReady = false;
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
    if (!window.confirm("Reset this lesson's code? Your edits will be discarded.")) return;
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

  const show = (route: Route): Promise<void> | void => {
    collapseLab();
    const lesson = route.mode === "lessons" && route.id ? lessonById(route.id) : undefined;
    if (route.mode === "lessons" && !lesson) {
      location.hash = `#/lesson/${lastLessonId()}`;
      return;
    }
    document.getElementById("app")?.classList.toggle("soon-lesson", lesson?.status === "soon");
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
      host.setLessonWorlds(null);
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
    host.setLessonWorlds(lesson.worlds);
    renderNav(lesson);
    parkDrive();
    article.innerHTML = lessonHtml(lesson);
    article.scrollTop = 0;
    requestAnimationFrame(() => {
      article.scrollTop = 0;
    });
    article.querySelector("#scatter-guesses")?.addEventListener("click", () => host.scatterGuesses());
    placeDrive(sceneFor(lesson).manual);
    const scene = sceneFor(lesson);
    host.setMode("lessons");
    host.clearConsole();
    host.setLessonSpawn(resolveSpawn(lesson), lesson.world, lesson.spawn);
    host.applyScene(scene);
    return openLesson(lesson, scene.run, token);
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
    }
    host.resetWorld();
    if (run) host.runProgram();
    host.relayout();
  };

  const renderNav = (lesson: Lesson) => {
    const toggleNow = nav.querySelector("#toc-toggle");
    if (toggleNow) {
      tocOpen = toggleNow.getAttribute("aria-expanded") === "true";
      openModules.clear();
      for (const details of nav.querySelectorAll<HTMLDetailsElement>("details.toc-module")) {
        if (details.open && details.dataset.module) openModules.add(details.dataset.module);
      }
    }
    if (!tocReady) {
      openModules.add(lesson.moduleId);
      tocReady = true;
    }
    openModules.add(lesson.moduleId);
    const progress = loadProgress();
    const ready = LESSONS.filter((item) => item.status === "ready");
    const doneCount = ready.filter((item) => progress.completed.includes(item.id)).length;
    const index = lessonIndex(lesson.id);
    const soon = lesson.status === "soon";
    const prev = index > 0 ? [...LESSONS.slice(0, index)].reverse().find((item) => item.status === "ready") : undefined;
    const nextReady = index >= 0 ? LESSONS.slice(index + 1).find((item) => item.status === "ready") : undefined;
    const done = isCompleted(lesson.id);

    nav.replaceChildren();
    const bar = document.createElement("div");
    bar.className = "toc-bar";
    const toggle = document.createElement("button");
    toggle.id = "toc-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(tocOpen));
    toggle.setAttribute("aria-controls", "toc-panel");
    toggle.textContent = tocOpen ? "Hide lessons" : "Lessons";
    toggle.title = "Show or hide the table of contents";
    const current = document.createElement("span");
    current.className = "toc-current";
    current.textContent = lesson.title;
    const count = document.createElement("span");
    count.className = "lesson-progress";
    count.textContent = `${doneCount} of ${ready.length}`;
    count.title = `${doneCount} of ${ready.length} lessons done`;
    const prevBtn = document.createElement("button");
    prevBtn.id = "lesson-prev";
    prevBtn.type = "button";
    prevBtn.textContent = "Prev";
    prevBtn.disabled = !prev;
    const nextBtn = document.createElement("button");
    nextBtn.id = "lesson-next";
    nextBtn.type = "button";
    nextBtn.textContent = "Next";
    nextBtn.disabled = soon || !nextReady;
    const completeBtn = document.createElement("button");
    completeBtn.id = "lesson-complete";
    completeBtn.type = "button";
    completeBtn.className = done ? "toc-done" : "";
    completeBtn.textContent = done ? "Done" : "Mark done";
    completeBtn.setAttribute("aria-pressed", String(done));
    completeBtn.disabled = soon;
    bar.append(toggle, current, count, prevBtn, nextBtn, completeBtn);
    const panel = document.createElement("nav");
    panel.id = "toc-panel";
    panel.setAttribute("aria-label", "Lessons");
    panel.hidden = !tocOpen;
    for (const module of MODULES) {
      const details = document.createElement("details");
      details.className = "toc-module";
      details.dataset.module = module.id;
      details.open = openModules.has(module.id);
      const summary = document.createElement("summary");
      const summaryText = document.createElement("span");
      summaryText.textContent = module.soon ? `${module.title}` : module.title;
      const summaryMeta = document.createElement("span");
      summaryMeta.className = "toc-meta";
      const lessons = moduleLessons(module.id);
      const moduleDone = lessons.filter((item) => progress.completed.includes(item.id)).length;
      summaryMeta.textContent = module.soon ? "soon" : `${moduleDone}/${lessons.length}`;
      summary.append(summaryText, summaryMeta);
      details.append(summary);
      const list = document.createElement("ol");
      for (const item of lessons) {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#/lesson/${item.id}`;
        if (progress.completed.includes(item.id)) {
          const mark = document.createElement("span");
          mark.className = "toc-check";
          mark.textContent = "✓";
          mark.setAttribute("aria-hidden", "true");
          link.append(mark);
          link.setAttribute("aria-label", `${item.title}, done`);
        }
        link.append(document.createTextNode(item.title));
        if (item.id === lesson.id) {
          link.classList.add("is-current");
          link.setAttribute("aria-current", "page");
        }
        if (progress.completed.includes(item.id)) link.classList.add("is-done");
        else if (progress.visited.includes(item.id)) link.classList.add("is-visited");
        if (item.status === "soon") {
          link.classList.add("is-soon");
          link.setAttribute("aria-disabled", "true");
          const badge = document.createElement("span");
          badge.className = "toc-soon";
          badge.textContent = "soon";
          link.append(badge);
          link.addEventListener("click", (event) => event.preventDefault());
        }
        li.append(link);
        list.append(li);
      }
      details.append(list);
      details.addEventListener("toggle", () => {
        if (details.open) openModules.add(module.id);
        else openModules.delete(module.id);
      });
      panel.append(details);
    }
    const note = document.createElement("p");
    note.className = "lesson-world-note";
    note.textContent = worldNote(lesson);
    note.hidden = lesson.worlds.length < 2;
    nav.append(bar, panel, note);

    toggle.addEventListener("click", () => {
      tocOpen = !tocOpen;
      toggle.setAttribute("aria-expanded", String(tocOpen));
      toggle.textContent = tocOpen ? "Hide lessons" : "Lessons";
      panel.hidden = !tocOpen;
    });
    prevBtn.addEventListener("click", () => {
      if (prev) navigate({ mode: "lessons", id: prev.id });
    });
    nextBtn.addEventListener("click", () => {
      if (lesson.status === "soon" || !nextReady) return;
      if (lesson.status === "ready") markCompleted(lesson.id);
      navigate({ mode: "lessons", id: nextReady.id });
    });
    completeBtn.addEventListener("click", () => {
      if (lesson.status === "soon") return;
      toggleCompleted(lesson.id);
      renderNav(lesson);
      fillProgressCard(lesson);
      const marked = isCompleted(lesson.id);
      flashLesson(marked ? "Marked complete" : "Marked open");
      const card = article.querySelector<HTMLElement>(".course-complete");
      if (marked && card) {
        const delta = card.getBoundingClientRect().top - article.getBoundingClientRect().top;
        article.scrollTop += delta - 8;
      }
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...panel.querySelectorAll<HTMLElement>("summary, a")].filter((item) => {
        if (item.tagName === "SUMMARY") return true;
        return item.closest("details")?.open === true;
      });
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (index < 0) return;
      event.preventDefault();
      items[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
    });
  };

  const fillProgressCard = (lesson: Lesson) => {
    const scroll = article.querySelector(".lesson-scroll");
    if (!scroll) return;
    scroll.querySelector(".course-complete")?.remove();
    const html = progressCard(lesson, loadProgress().completed);
    if (html) scroll.insertAdjacentHTML("beforeend", html);
  };

  window.addEventListener("hashchange", () => show(parseRoute(location.hash)));
  if (!location.hash || location.hash === "#" || location.hash === "#/") {
    history.replaceState(null, "", "#/lesson/getting-started/sandbox");
  }
  const pending = show(parseRoute(location.hash));
  if (pending) await pending;
}

function worldNote(lesson: Lesson): string {
  const label = (id: string) => WORLDS.find((world) => world.id === id)?.label ?? id;
  const home = label(lesson.world);
  const others = lesson.worlds.filter((id) => id !== lesson.world).map(label);
  if (others.length === 0) return "";
  return `This lesson also runs in ${others.join(", ")}. Pick one from World. The numbers in the text are for ${home}.`;
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
      ${progressCard(lesson, loadProgress().completed)}
    </div>
  `;
}

/** End-of-course card. It lives on the last ready lesson, and only congratulates a finished set. */
export function progressCard(lesson: Lesson, completed: readonly string[]): string {
  const index = lessonIndex(lesson.id);
  const later = index >= 0 && LESSONS.slice(index + 1).some((item) => item.status === "ready");
  if (lesson.status !== "ready" || later) return "";
  const ready = LESSONS.filter((item) => item.status === "ready");
  const open = ready.filter((item) => !completed.includes(item.id));
  if (open.length === 0) {
    return `
    <aside class="course-complete">
      <h2>Course complete</h2>
      <p>You drove the car, read the sensors, and ran a particle filter from a kidnapped start. Mapping, planning, and the later controllers are still being written. Those modules stay gray in the menu until they have a lesson.</p>
    </aside>
  `;
  }
  const noun = open.length === 1 ? "lesson" : "lessons";
  const links = open
    .map((item) => `<li><a href="#/lesson/${item.id}">${escapeText(item.title)}</a></li>`)
    .join("");
  return `
    <aside class="course-complete lessons-open">
      <h2>${open.length} ${noun} still open</h2>
      <ul>${links}</ul>
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
