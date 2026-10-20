const PROGRESS_KEY = "robo-sim-lab.progress";
const CODE_PREFIX = "robo-sim-lab.lesson-code.";

export interface CourseProgress {
  visited: string[];
  completed: string[];
}

export function loadProgress(): CourseProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { visited: [], completed: [] };
    const parsed = JSON.parse(raw) as Partial<CourseProgress>;
    return {
      visited: Array.isArray(parsed.visited) ? parsed.visited.filter((id) => typeof id === "string") : [],
      completed: Array.isArray(parsed.completed) ? parsed.completed.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return { visited: [], completed: [] };
  }
}

function saveProgress(progress: CourseProgress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function markVisited(id: string): void {
  const progress = loadProgress();
  if (progress.visited.includes(id)) return;
  progress.visited.push(id);
  saveProgress(progress);
}

export function isCompleted(id: string): boolean {
  return loadProgress().completed.includes(id);
}

export function toggleCompleted(id: string): boolean {
  const progress = loadProgress();
  const done = progress.completed.includes(id);
  progress.completed = done ? progress.completed.filter((item) => item !== id) : [...progress.completed, id];
  if (!progress.visited.includes(id)) progress.visited.push(id);
  saveProgress(progress);
  return !done;
}

export function loadLessonCode(id: string): string | null {
  const value = localStorage.getItem(CODE_PREFIX + id);
  return value && value.length > 0 ? value : null;
}

export function saveLessonCode(id: string, source: string): void {
  localStorage.setItem(CODE_PREFIX + id, source);
}

export function clearLessonCode(id: string): void {
  localStorage.removeItem(CODE_PREFIX + id);
}
