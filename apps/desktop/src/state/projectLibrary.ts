import type { ZaxisProject } from "@zaxis-kdp/editor-core";
import { normalizeProject } from "@zaxis-kdp/editor-core";

const INDEX_KEY = "zaxis-kdp:projects:index";
const ACTIVE_KEY = "zaxis-kdp:projects:active";
const PROJECT_PREFIX = "zaxis-kdp:project:";

export interface ProjectSummary {
  id: string;
  name: string;
  mode: ZaxisProject["mode"];
  artboardCount: number;
  updatedAt: string;
}

export function listProjectSummaries(): ProjectSummary[] {
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectSummary[];
    return parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function loadProject(projectId: string): ZaxisProject | null {
  try {
    const raw = window.localStorage.getItem(PROJECT_PREFIX + projectId);
    if (!raw) return null;
    return normalizeProject(JSON.parse(raw) as ZaxisProject);
  } catch {
    return null;
  }
}

export function loadActiveProject(): ZaxisProject | null {
  const activeId = window.localStorage.getItem(ACTIVE_KEY);
  if (activeId) {
    const active = loadProject(activeId);
    if (active) return active;
  }

  const first = listProjectSummaries()[0];
  return first ? loadProject(first.id) : null;
}

export function saveProject(project: ZaxisProject) {
  window.localStorage.setItem(PROJECT_PREFIX + project.id, JSON.stringify(project));
  window.localStorage.setItem(ACTIVE_KEY, project.id);

  const summary: ProjectSummary = {
    id: project.id,
    name: project.name,
    mode: project.mode,
    artboardCount: project.artboards.length,
    updatedAt: project.updatedAt
  };

  const summaries = listProjectSummaries().filter((item) => item.id !== project.id);
  summaries.unshift(summary);
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(summaries));
}

export function deleteProjectFromLibrary(projectId: string) {
  window.localStorage.removeItem(PROJECT_PREFIX + projectId);

  const summaries = listProjectSummaries().filter((item) => item.id !== projectId);
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(summaries));

  if (window.localStorage.getItem(ACTIVE_KEY) === projectId) {
    const next = summaries[0]?.id;
    if (next) window.localStorage.setItem(ACTIVE_KEY, next);
    else window.localStorage.removeItem(ACTIVE_KEY);
  }
}

export function renameProjectInLibrary(project: ZaxisProject, name: string): ZaxisProject {
  const trimmed = name.trim();
  const next = {
    ...project,
    name: trimmed || project.name,
    updatedAt: new Date().toISOString()
  };
  saveProject(next);
  return next;
}
