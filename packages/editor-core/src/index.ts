import type { Unit } from "@zaxis-kdp/shared";

export type DesignObjectType = "text" | "rectangle" | "ellipse" | "image" | "path";

export interface DesignObjectBase {
  id: string;
  name: string;
  type: DesignObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface TextObject extends DesignObjectBase {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
}

export interface ShapeObject extends DesignObjectBase {
  type: "rectangle" | "ellipse";
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface ImageObject extends DesignObjectBase {
  type: "image";
  src: string;
  alt: string;
  fit: "contain" | "cover" | "fill";
  cropX: number;
  cropY: number;
  scale: number;
  borderRadius: number;
}

export interface PathHandle {
  x: number;
  y: number;
}

export interface PathPoint {
  id: string;
  x: number;
  y: number;
  handleIn?: PathHandle;
  handleOut?: PathHandle;
  smooth?: boolean;
}

export interface PathObject extends DesignObjectBase {
  type: "path";
  points: PathPoint[];
  closed: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export type DesignObject = TextObject | ShapeObject | ImageObject | PathObject;

export interface Artboard {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: Unit;
  bleed: number;
  background: string;
  objects: DesignObject[];
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

export interface UpdateObjectInput {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  src?: string;
  alt?: string;
  fit?: "contain" | "cover" | "fill";
  cropX?: number;
  cropY?: number;
  scale?: number;
  borderRadius?: number;
  points?: PathPoint[];
  closed?: boolean;
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

export function normalizeProject(project: ZaxisProject): ZaxisProject {
  return {
    ...project,
    artboards: project.artboards.map((artboard) => ({
      ...artboard,
      objects: (Array.isArray(artboard.objects) ? artboard.objects : []).map((object) => {
        if (object.type === "text") {
          return {
            ...object,
            lineHeight: object.lineHeight ?? 1.2,
            letterSpacing: object.letterSpacing ?? 0
          };
        }

        if (object.type === "image") {
          return {
            ...object,
            cropX: object.cropX ?? 50,
            cropY: object.cropY ?? 50,
            scale: object.scale ?? 1,
            borderRadius: object.borderRadius ?? 0
          };
        }

        if (object.type === "path") {
          return {
            ...object,
            closed: object.closed ?? false,
            points: (Array.isArray(object.points) ? object.points : []).map((point) => ({
              ...point,
              smooth: point.smooth ?? false
            }))
          };
        }

        return object;
      })
    }))
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
        background: "#ffffff",
        objects: []
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
    background: source?.background ?? previous?.background ?? "#ffffff",
    objects: []
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
    name: source.name + " Copy",
    objects: source.objects.map((object) => ({
      ...object,
      id: id("object"),
      name: object.name + " Copy"
    }))
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

export function addTextObject(project: ZaxisProject, artboardId: string): { project: ZaxisProject; objectId: string } {
  const objectId = id("object");
  const nextObject: TextObject = {
    id: objectId,
    name: "Text",
    type: "text",
    x: 12,
    y: 12,
    width: 42,
    height: 12,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    text: "Double-click to edit text",
    fontFamily: "Arial",
    fontSize: 32,
    fontWeight: 400,
    color: "#111111",
    textAlign: "left",
    lineHeight: 1.2,
    letterSpacing: 0
  };

  return {
    objectId,
    project: mapArtboard(project, artboardId, (artboard) => ({
      ...artboard,
      objects: [...artboard.objects, nextObject]
    }))
  };
}

export function addImageObject(
  project: ZaxisProject,
  artboardId: string,
  src: string,
  alt = "Pasted image"
): { project: ZaxisProject; objectId: string } {
  const objectId = id("object");
  const nextObject: ImageObject = {
    id: objectId,
    name: "Image",
    type: "image",
    x: 15,
    y: 15,
    width: 40,
    height: 40,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    src,
    alt,
    fit: "contain",
    cropX: 50,
    cropY: 50,
    scale: 1,
    borderRadius: 0
  };

  return {
    objectId,
    project: mapArtboard(project, artboardId, (artboard) => ({
      ...artboard,
      objects: [...artboard.objects, nextObject]
    }))
  };
}

export function addPathObject(
  project: ZaxisProject,
  artboardId: string
): { project: ZaxisProject; objectId: string } {
  const objectId = id("object");
  const nextObject: PathObject = {
    id: objectId,
    name: "Path",
    type: "path",
    x: 20,
    y: 20,
    width: 40,
    height: 30,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    points: [
      { id: id("point"), x: 5, y: 80, handleOut: { x: 18, y: 62 } },
      { id: id("point"), x: 50, y: 10, handleIn: { x: 35, y: 10 }, handleOut: { x: 65, y: 10 }, smooth: true },
      { id: id("point"), x: 95, y: 80, handleIn: { x: 82, y: 62 } }
    ],
    closed: false,
    fill: "transparent",
    stroke: "#00f6ac",
    strokeWidth: 2
  };

  return {
    objectId,
    project: mapArtboard(project, artboardId, (artboard) => ({
      ...artboard,
      objects: [...artboard.objects, nextObject]
    }))
  };
}

export function addShapeObject(
  project: ZaxisProject,
  artboardId: string,
  type: "rectangle" | "ellipse"
): { project: ZaxisProject; objectId: string } {
  const objectId = id("object");
  const nextObject: ShapeObject = {
    id: objectId,
    name: type === "rectangle" ? "Rectangle" : "Ellipse",
    type,
    x: 18,
    y: 18,
    width: 32,
    height: 24,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: "#00f6ac",
    stroke: "#111111",
    strokeWidth: 0,
    cornerRadius: type === "rectangle" ? 0 : 999
  };

  return {
    objectId,
    project: mapArtboard(project, artboardId, (artboard) => ({
      ...artboard,
      objects: [...artboard.objects, nextObject]
    }))
  };
}

export function deleteObject(project: ZaxisProject, artboardId: string, objectId: string): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    objects: artboard.objects.filter((object) => object.id !== objectId)
  }));
}

export function updateObject(
  project: ZaxisProject,
  artboardId: string,
  objectId: string,
  input: UpdateObjectInput
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    objects: artboard.objects.map((object) => {
      if (object.id !== objectId || object.locked) return object;

      const common = {
        ...object,
        name: input.name ?? object.name,
        x: clampPercent(input.x ?? object.x),
        y: clampPercent(input.y ?? object.y),
        width: clampSize(input.width ?? object.width),
        height: clampSize(input.height ?? object.height),
        rotation: normalizeRotation(input.rotation ?? object.rotation),
        opacity: clampOpacity(input.opacity ?? object.opacity),
        visible: input.visible ?? object.visible,
        locked: input.locked ?? object.locked
      };

      if (object.type === "text") {
        return {
          ...common,
          type: "text" as const,
          text: input.text ?? object.text,
          fontFamily: input.fontFamily ?? object.fontFamily,
          fontSize: Math.max(1, input.fontSize ?? object.fontSize),
          fontWeight: input.fontWeight ?? object.fontWeight,
          color: input.color ?? object.color,
          textAlign: input.textAlign ?? object.textAlign,
          lineHeight: Math.max(0.5, input.lineHeight ?? object.lineHeight),
          letterSpacing: input.letterSpacing ?? object.letterSpacing
        };
      }

      if (object.type === "image") {
        return {
          ...common,
          type: "image" as const,
          src: input.src ?? object.src,
          alt: input.alt ?? object.alt,
          fit: input.fit ?? object.fit,
          cropX: Math.max(0, Math.min(100, input.cropX ?? object.cropX)),
          cropY: Math.max(0, Math.min(100, input.cropY ?? object.cropY)),
          scale: Math.max(0.1, Math.min(5, input.scale ?? object.scale)),
          borderRadius: Math.max(0, input.borderRadius ?? object.borderRadius)
        };
      }

      if (object.type === "path") {
        return {
          ...common,
          type: "path" as const,
          points: (input.points ?? object.points).map((point) => ({
            ...point,
            x: Math.max(0, Math.min(100, point.x)),
            y: Math.max(0, Math.min(100, point.y)),
            handleIn: point.handleIn ? {
              x: Math.max(0, Math.min(100, point.handleIn.x)),
              y: Math.max(0, Math.min(100, point.handleIn.y))
            } : undefined,
            handleOut: point.handleOut ? {
              x: Math.max(0, Math.min(100, point.handleOut.x)),
              y: Math.max(0, Math.min(100, point.handleOut.y))
            } : undefined,
            smooth: point.smooth ?? false
          })),
          closed: input.closed ?? object.closed,
          fill: input.fill ?? object.fill,
          stroke: input.stroke ?? object.stroke,
          strokeWidth: Math.max(0, input.strokeWidth ?? object.strokeWidth)
        };
      }

      return {
        ...common,
        type: object.type,
        fill: input.fill ?? object.fill,
        stroke: input.stroke ?? object.stroke,
        strokeWidth: Math.max(0, input.strokeWidth ?? object.strokeWidth),
        cornerRadius: Math.max(0, input.cornerRadius ?? object.cornerRadius)
      };
    })
  }));
}

export function alignObject(
  project: ZaxisProject,
  artboardId: string,
  objectId: string,
  alignment: "left" | "center" | "right" | "top" | "middle" | "bottom"
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    objects: artboard.objects.map((object) => {
      if (object.id !== objectId || object.locked) return object;

      if (alignment === "left") return { ...object, x: 0 };
      if (alignment === "center") return { ...object, x: Math.max(0, (100 - object.width) / 2) };
      if (alignment === "right") return { ...object, x: Math.max(0, 100 - object.width) };
      if (alignment === "top") return { ...object, y: 0 };
      if (alignment === "middle") return { ...object, y: Math.max(0, (100 - object.height) / 2) };
      return { ...object, y: Math.max(0, 100 - object.height) };
    })
  }));
}

export function fitObjectInsideArtboard(
  project: ZaxisProject,
  artboardId: string,
  objectId: string
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    objects: artboard.objects.map((object) => {
      if (object.id !== objectId || object.locked) return object;

      const width = Math.min(100, object.width);
      const height = Math.min(100, object.height);
      const x = Math.max(0, Math.min(object.x, 100 - width));
      const y = Math.max(0, Math.min(object.y, 100 - height));
      return { ...object, width, height, x, y };
    })
  }));
}

export function addPathPoint(
  project: ZaxisProject,
  artboardId: string,
  objectId: string
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    objects: artboard.objects.map((object) => {
      if (object.id !== objectId || object.type !== "path" || object.locked) return object;

      const last = object.points[object.points.length - 1];
      const nextPoint: PathPoint = {
        id: id("point"),
        x: Math.max(0, Math.min(100, (last?.x ?? 50) + 10)),
        y: Math.max(0, Math.min(100, (last?.y ?? 50) + 10))
      };

      return { ...object, points: [...object.points, nextPoint] };
    })
  }));
}

export function deletePathPoint(
  project: ZaxisProject,
  artboardId: string,
  objectId: string,
  pointId: string
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    objects: artboard.objects.map((object) => {
      if (object.id !== objectId || object.type !== "path" || object.locked || object.points.length <= 2) {
        return object;
      }

      return {
        ...object,
        points: object.points.filter((point) => point.id !== pointId)
      };
    })
  }));
}

export function distributeObjects(
  project: ZaxisProject,
  artboardId: string,
  axis: "horizontal" | "vertical"
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => {
    const movable = artboard.objects
      .filter((object) => object.visible && !object.locked)
      .slice()
      .sort((a, b) => axis === "horizontal" ? a.x - b.x : a.y - b.y);

    if (movable.length < 3) return artboard;

    const first = movable[0];
    const last = movable[movable.length - 1];
    const firstCenter = axis === "horizontal"
      ? first.x + first.width / 2
      : first.y + first.height / 2;
    const lastCenter = axis === "horizontal"
      ? last.x + last.width / 2
      : last.y + last.height / 2;
    const step = (lastCenter - firstCenter) / (movable.length - 1);

    const updates = new Map<string, number>();
    movable.forEach((object, index) => {
      const center = firstCenter + step * index;
      const position = axis === "horizontal"
        ? center - object.width / 2
        : center - object.height / 2;
      updates.set(object.id, position);
    });

    return {
      ...artboard,
      objects: artboard.objects.map((object) => {
        const next = updates.get(object.id);
        if (next === undefined) return object;
        return axis === "horizontal"
          ? { ...object, x: Math.max(0, Math.min(100 - object.width, next)) }
          : { ...object, y: Math.max(0, Math.min(100 - object.height, next)) };
      })
    };
  });
}

export function setObjectLocked(
  project: ZaxisProject,
  artboardId: string,
  objectId: string,
  locked: boolean
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    objects: artboard.objects.map((object) =>
      object.id === objectId ? { ...object, locked } : object
    )
  }));
}

export function setObjectVisible(
  project: ZaxisProject,
  artboardId: string,
  objectId: string,
  visible: boolean
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    objects: artboard.objects.map((object) =>
      object.id === objectId ? { ...object, visible } : object
    )
  }));
}

export function moveObjectLayer(
  project: ZaxisProject,
  artboardId: string,
  objectId: string,
  direction: "up" | "down"
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => {
    const index = artboard.objects.findIndex((object) => object.id === objectId);
    if (index < 0) return artboard;

    const target = direction === "up" ? index + 1 : index - 1;
    if (target < 0 || target >= artboard.objects.length) return artboard;

    const objects = [...artboard.objects];
    [objects[index], objects[target]] = [objects[target], objects[index]];
    return { ...artboard, objects };
  });
}

function mapArtboard(
  project: ZaxisProject,
  artboardId: string,
  mapper: (artboard: Artboard) => Artboard
): ZaxisProject {
  return touch(
    project,
    project.artboards.map((artboard) => artboard.id === artboardId ? mapper(artboard) : artboard)
  );
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

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function clampSize(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(100, value));
}

function clampOpacity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function normalizeRotation(value: number) {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
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
