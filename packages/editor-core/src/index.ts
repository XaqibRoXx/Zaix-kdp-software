import type { Unit } from "@zaxis-kdp/shared";

export interface Artboard {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: Unit;
  bleed: number;
  background: string;
}

export interface ZaxisProject {
  id: string;
  name: string;
  mode: "kdp" | "graphic-design";
  artboards: Artboard[];
  createdAt: string;
  updatedAt: string;
}

export interface BlankProjectInput {
  name: string;
  width: number;
  height: number;
  unit: Unit;
  mode?: "kdp" | "graphic-design";
}

export interface ResizeArtboardInput {
  width?: number;
  height?: number;
  unit?: Unit;
}

function id(prefix: string) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

function now() {
  return new Date().toISOString();
}

function touch(project: ZaxisProject, artboards: Artboard[]): ZaxisProject {
  return {
    ...project,
    artboards,
    updatedAt: now()
  };
}

export function createBlankProject(input: BlankProjectInput): ZaxisProject {
  const timestamp = now();

  return {
    id: id("project"),
    name: input.name,
    mode: input.mode ?? "kdp",
    createdAt: timestamp,
    updatedAt: timestamp,
    artboards: [
      {
        id: id("artboard"),
        name: "Artboard 1",
        width: input.width,
        height: input.height,
        unit: input.unit,
        bleed: 0,
        background: "#ffffff"
      }
    ]
  };
}

export function addArtboard(
  project: ZaxisProject,
  source?: Partial<Pick<Artboard, "width" | "height" | "unit" | "bleed" | "background">>
): ZaxisProject {
  const previous = project.artboards[project.artboards.length - 1];
  const nextNumber = project.artboards.length + 1;

  const artboard: Artboard = {
    id: id("artboard"),
    name: "Artboard " + nextNumber,
    width: source?.width ?? previous?.width ?? 7,
    height: source?.height ?? previous?.height ?? 10,
    unit: source?.unit ?? previous?.unit ?? "in",
    bleed: source?.bleed ?? previous?.bleed ?? 0,
    background: source?.background ?? previous?.background ?? "#ffffff"
  };

  return touch(project, [...project.artboards, artboard]);
}

export function duplicateArtboard(project: ZaxisProject, artboardId: string): ZaxisProject {
  const index = project.artboards.findIndex((item) => item.id === artboardId);
  if (index < 0) return project;

  const source = project.artboards[index];
  const duplicate: Artboard = {
    ...source,
    id: id("artboard"),
    name: source.name + " Copy"
  };

  const artboards = [...project.artboards];
  artboards.splice(index + 1, 0, duplicate);
  return touch(project, renumberArtboards(artboards));
}

export function deleteArtboard(project: ZaxisProject, artboardId: string): ZaxisProject {
  if (project.artboards.length <= 1) return project;
  return touch(
    project,
    renumberArtboards(project.artboards.filter((item) => item.id !== artboardId))
  );
}

export function resizeArtboard(
  project: ZaxisProject,
  artboardId: string,
  input: ResizeArtboardInput
): ZaxisProject {
  const artboards = project.artboards.map((artboard) => {
    if (artboard.id !== artboardId) return artboard;

    return {
      ...artboard,
      width: normalizeDimension(input.width ?? artboard.width),
      height: normalizeDimension(input.height ?? artboard.height),
      unit: input.unit ?? artboard.unit
    };
  });

  return touch(project, artboards);
}

export function resizeAllArtboards(project: ZaxisProject, input: ResizeArtboardInput): ZaxisProject {
  return touch(
    project,
    project.artboards.map((artboard) => ({
      ...artboard,
      width: normalizeDimension(input.width ?? artboard.width),
      height: normalizeDimension(input.height ?? artboard.height),
      unit: input.unit ?? artboard.unit
    }))
  );
}

export function moveArtboard(
  project: ZaxisProject,
  artboardId: string,
  direction: "up" | "down"
): ZaxisProject {
  const index = project.artboards.findIndex((item) => item.id === artboardId);
  if (index < 0) return project;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= project.artboards.length) return project;

  const artboards = [...project.artboards];
  [artboards[index], artboards[target]] = [artboards[target], artboards[index]];
  return touch(project, renumberArtboards(artboards));
}

function renumberArtboards(artboards: Artboard[]) {
  return artboards.map((artboard, index) => ({
    ...artboard,
    name: "Artboard " + (index + 1)
  }));
}

function normalizeDimension(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.01, Math.min(100000, value));
}

export class SnapshotHistory<TState> {
  private past: TState[] = [];
  private future: TState[] = [];

  constructor(private present: TState, private readonly maxEntries = 100) {}

  reset(state: TState) {
    this.present = state;
    this.past = [];
    this.future = [];
  }

  commit(next: TState) {
    if (Object.is(next, this.present)) return this.present;

    this.past.push(this.present);
    if (this.past.length > this.maxEntries) {
      this.past.shift();
    }

    this.present = next;
    this.future = [];
    return this.present;
  }

  undo() {
    const previous = this.past.pop();
    if (!previous) return this.present;

    this.future.push(this.present);
    this.present = previous;
    return this.present;
  }

  redo() {
    const next = this.future.pop();
    if (!next) return this.present;

    this.past.push(this.present);
    this.present = next;
    return this.present;
  }

  get current() {
    return this.present;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }
}

export interface EditorCommand<TState> {
  label: string;
  do(state: TState): TState;
  undo(state: TState): TState;
}

export class CommandHistory<TState> {
  private undoStack: EditorCommand<TState>[] = [];
  private redoStack: EditorCommand<TState>[] = [];

  execute(command: EditorCommand<TState>, state: TState) {
    const next = command.do(state);
    this.undoStack.push(command);
    this.redoStack = [];
    return next;
  }

  undo(state: TState) {
    const command = this.undoStack.pop();
    if (!command) return state;
    this.redoStack.push(command);
    return command.undo(state);
  }

  redo(state: TState) {
    const command = this.redoStack.pop();
    if (!command) return state;
    this.undoStack.push(command);
    return command.do(state);
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }
}
