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

function id(prefix: string) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

export function createBlankProject(input: BlankProjectInput): ZaxisProject {
  const now = new Date().toISOString();

  return {
    id: id("project"),
    name: input.name,
    mode: input.mode ?? "kdp",
    createdAt: now,
    updatedAt: now,
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
