import type { ZaxisProject } from "@zaxis-kdp/editor-core";
import { normalizeProject } from "@zaxis-kdp/editor-core";

const REVISION_PREFIX = "zaxis-kdp:revisions:";

export interface ProjectRevision {
  id: string;
  projectId: string;
  label: string;
  createdAt: string;
  snapshot: ZaxisProject;
}

export function listRevisions(projectId: string): ProjectRevision[] {
  try {
    const raw = window.localStorage.getItem(REVISION_PREFIX + projectId);
    if (!raw) return [];
    return (JSON.parse(raw) as ProjectRevision[])
      .map((revision) => ({ ...revision, snapshot: normalizeProject(revision.snapshot) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function createRevision(project: ZaxisProject, label: string): ProjectRevision {
  const revision: ProjectRevision = {
    id: "revision-" + Math.random().toString(36).slice(2, 10),
    projectId: project.id,
    label: label.trim() || "Manual Version",
    createdAt: new Date().toISOString(),
    snapshot: normalizeProject(JSON.parse(JSON.stringify(project)) as ZaxisProject)
  };

  const revisions = listRevisions(project.id);
  revisions.unshift(revision);
  window.localStorage.setItem(
    REVISION_PREFIX + project.id,
    JSON.stringify(revisions.slice(0, 50))
  );

  return revision;
}

export function deleteRevision(projectId: string, revisionId: string) {
  const revisions = listRevisions(projectId).filter((item) => item.id !== revisionId);
  window.localStorage.setItem(REVISION_PREFIX + projectId, JSON.stringify(revisions));
}

export function clearRevisions(projectId: string) {
  window.localStorage.removeItem(REVISION_PREFIX + projectId);
}
