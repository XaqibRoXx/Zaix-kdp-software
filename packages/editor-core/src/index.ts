import type { Unit } from "@zaxis-kdp/shared";
import {
  createDefaultBookStructure,
  getPageNumberLabel,
  normalizeBookStructure,
  type BookChapter,
  type BookStructure,
  type PageNumberSettings
} from "./bookStructure";
import {
  KDP_RULES,
  calculatePaperbackCoverSize,
  createDefaultKdpSettings,
  type KdpSettings
} from "./kdpRules";

export * from "./kdpRules";
export * from "./bookStructure";

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
  skewX: number;
  skewY: number;
  flipX: boolean;
  flipY: boolean;
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
  maskType: "none" | "ellipse" | "polygon";
  maskPoints: PathPoint[];
  linkedAssetId?: string;
  linkedAssetVersion?: number;
  linkedAssetSha256?: string;
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

export interface MasterPage {
  id: string;
  name: string;
  objects: DesignObject[];
}

export interface ReusableStyle {
  id: string;
  name: string;
  kind: "character" | "paragraph" | "object";
  properties: UpdateObjectInput;
}

export interface ReusableComponent {
  id: string;
  name: string;
  objects: DesignObject[];
  sourceArtboardName?: string;
}

export interface ProjectOverrides {
  featureBackgroundRemove?: boolean;
  featurePublicSharing?: boolean;
  featureProofComments?: boolean;
  defaultShareDownload?: boolean;
  namingExportPattern?: string;
}

export interface TemplateOverlay {
  name: string;
  src: string;
  mimeType: string;
  opacity: number;
  visible: boolean;
}

export interface Artboard {
  id: string;
  name: string;
  role?: "page" | "cover";
  kind?: "standard" | "toc";
  width: number;
  height: number;
  unit: Unit;
  bleed: number;
  background: string;
  templateOverlay?: TemplateOverlay;
  masterPageId?: string;
  objects: DesignObject[];
}

export interface ZaxisProject {
  id: string;
  name: string;
  mode: "kdp" | "graphic-design";
  kdpSettings?: KdpSettings;
  bookStructure?: BookStructure;
  masterPages?: MasterPage[];
  reusableStyles?: ReusableStyle[];
  reusableComponents?: ReusableComponent[];
  projectOverrides?: ProjectOverrides;
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
  skewX?: number;
  skewY?: number;
  flipX?: boolean;
  flipY?: boolean;
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
  maskType?: "none" | "ellipse" | "polygon";
  maskPoints?: PathPoint[];
  linkedAssetId?: string;
  linkedAssetVersion?: number;
  linkedAssetSha256?: string;
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
  const firstArtboard = project.artboards[0];
  const kdpSettings =
    project.mode === "kdp"
      ? project.kdpSettings ??
        createDefaultKdpSettings(
          firstArtboard?.width ?? 6,
          firstArtboard?.height ?? 9,
          firstArtboard?.unit ?? "in"
        )
      : undefined;

  return {
    ...project,
    kdpSettings,
    bookStructure: project.mode === "kdp"
      ? normalizeBookStructure(project.bookStructure)
      : project.bookStructure,
    masterPages: Array.isArray(project.masterPages) ? project.masterPages : [],
    reusableStyles: (Array.isArray(project.reusableStyles) ? project.reusableStyles : []).map((style) => ({
      ...style,
      kind: (style as unknown as { kind?: string }).kind === "text"
        ? "character"
        : style.kind
    })) as ReusableStyle[],
    reusableComponents: Array.isArray(project.reusableComponents)
      ? project.reusableComponents
      : [],
    projectOverrides: project.projectOverrides ?? {},
    artboards: project.artboards.map((artboard) => ({
      ...artboard,
      role: artboard.role ?? "page",
      kind: artboard.kind ?? "standard",
      objects: (Array.isArray(artboard.objects) ? artboard.objects : []).map((object) => {
        object = {
          ...object,
          skewX: object.skewX ?? 0,
          skewY: object.skewY ?? 0,
          flipX: object.flipX ?? false,
          flipY: object.flipY ?? false
        } as DesignObject;

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
            borderRadius: object.borderRadius ?? 0,
            maskType: object.maskType ?? "none",
            maskPoints: (Array.isArray(object.maskPoints) ? object.maskPoints : [
              { id: id("mask"), x: 0, y: 0 },
              { id: id("mask"), x: 100, y: 0 },
              { id: id("mask"), x: 100, y: 100 },
              { id: id("mask"), x: 0, y: 100 }
            ]).map((point) => ({ ...point, smooth: false }))
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
  const mode = input.mode ?? "kdp";

  return {
    id: id("project"),
    name: input.name,
    mode,
    kdpSettings: mode === "kdp" ? createDefaultKdpSettings(input.width, input.height, input.unit) : undefined,
    bookStructure: mode === "kdp" ? createDefaultBookStructure() : undefined,
    masterPages: [],
    reusableStyles: [],
    reusableComponents: [],
    projectOverrides: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    artboards: [
      {
        id: id("artboard"),
        name: "Artboard 1",
        role: "page",
        kind: "standard",
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

export function updateKdpSettings(
  project: ZaxisProject,
  input: Partial<KdpSettings>
): ZaxisProject {
  if (project.mode !== "kdp") return project;

  const current =
    project.kdpSettings ??
    createDefaultKdpSettings(
      project.artboards[0]?.width ?? 6,
      project.artboards[0]?.height ?? 9,
      project.artboards[0]?.unit ?? "in"
    );

  return {
    ...project,
    kdpSettings: {
      ...current,
      ...input
    },
    updatedAt: now()
  };
}

export function createOrUpdateKdpCoverArtboard(
  project: ZaxisProject
): { project: ZaxisProject; artboardId: string } {
  if (project.mode !== "kdp") {
    return { project, artboardId: project.artboards[0]?.id ?? "" };
  }

  const settings =
    project.kdpSettings ??
    createDefaultKdpSettings(
      project.artboards.find((item) => (item.role ?? "page") === "page")?.width ?? 6,
      project.artboards.find((item) => (item.role ?? "page") === "page")?.height ?? 9,
      project.artboards.find((item) => (item.role ?? "page") === "page")?.unit ?? "in"
    );

  const pageCount = project.artboards.filter((item) => (item.role ?? "page") === "page").length;
   const cover = calculatePaperbackCoverSize(pageCount, settings);
  const existing = project.artboards.find((item) => item.role === "cover");

  if (existing) {
    const artboards = project.artboards.map((artboard) =>
      artboard.id === existing.id
        ? {
            ...artboard,
            name: "Paperback Cover",
            role: "cover" as const,
            width: cover.widthIn,
            height: cover.heightIn,
            unit: "in" as Unit
          }
        : artboard
    );

    return {
      project: touch(project, artboards),
      artboardId: existing.id
    };
  }

  const artboardId = id("artboard");
  const coverArtboard: Artboard = {
    id: artboardId,
    name: "Paperback Cover",
    role: "cover",
    kind: "standard",
    width: cover.widthIn,
    height: cover.heightIn,
    unit: "in",
    bleed: KDP_RULES.bleedIn,
    background: "#ffffff",
    objects: []
  };

  return {
    project: touch(project, [...project.artboards, coverArtboard]),
    artboardId
  };
}

export function updatePageNumberSettings(
  project: ZaxisProject,
  input: Partial<PageNumberSettings>
): ZaxisProject {
  if (project.mode !== "kdp") return project;

  const structure = normalizeBookStructure(project.bookStructure);

  return {
    ...project,
    bookStructure: {
      ...structure,
      pageNumbers: {
        ...structure.pageNumbers,
        ...input,
        startPage: Math.max(1, Math.floor(input.startPage ?? structure.pageNumbers.startPage)),
        startNumber: Math.max(1, Math.floor(input.startNumber ?? structure.pageNumbers.startNumber))
      }
    },
    updatedAt: now()
  };
}

export function addBookChapter(
  project: ZaxisProject,
  chapter: BookChapter
): ZaxisProject {
  if (project.mode !== "kdp") return project;

  const structure = normalizeBookStructure(project.bookStructure);
  const chapters = [...structure.chapters, chapter]
    .map((item) => ({
      ...item,
      title: item.title.trim() || "Chapter",
      startPage: Math.max(1, Math.floor(item.startPage))
    }))
    .sort((a, b) => a.startPage - b.startPage);

  return {
    ...project,
    bookStructure: { ...structure, chapters },
    updatedAt: now()
  };
}

export function updateBookChapter(
  project: ZaxisProject,
  chapterId: string,
  input: Partial<Pick<BookChapter, "title" | "startPage">>
): ZaxisProject {
  if (project.mode !== "kdp") return project;

  const structure = normalizeBookStructure(project.bookStructure);

  return {
    ...project,
    bookStructure: {
      ...structure,
      chapters: structure.chapters
        .map((chapter) =>
          chapter.id === chapterId
            ? {
                ...chapter,
                title: input.title?.trim() || chapter.title,
                startPage: Math.max(1, Math.floor(input.startPage ?? chapter.startPage))
              }
            : chapter
        )
        .sort((a, b) => a.startPage - b.startPage)
    },
    updatedAt: now()
  };
}

export function deleteBookChapter(
  project: ZaxisProject,
  chapterId: string
): ZaxisProject {
  if (project.mode !== "kdp") return project;

  const structure = normalizeBookStructure(project.bookStructure);

  return {
    ...project,
    bookStructure: {
      ...structure,
      chapters: structure.chapters.filter((chapter) => chapter.id !== chapterId)
    },
    updatedAt: now()
  };
}

export function updateTocTitle(project: ZaxisProject, title: string): ZaxisProject {
  if (project.mode !== "kdp") return project;

  const structure = normalizeBookStructure(project.bookStructure);

  return {
    ...project,
    bookStructure: {
      ...structure,
      tocTitle: title.trim() || "Table of Contents"
    },
    updatedAt: now()
  };
}

export function createOrUpdateTocArtboard(
  project: ZaxisProject
): { project: ZaxisProject; artboardId: string } {
  if (project.mode !== "kdp") {
    return { project, artboardId: "" };
  }

  const structure = normalizeBookStructure(project.bookStructure);
  const existing = project.artboards.find(
    (artboard) => (artboard.role ?? "page") === "page" && artboard.kind === "toc"
  );

  if (existing) {
    const pages = project.artboards.filter((item) => (item.role ?? "page") === "page");
    const tocPageNumber = pages.findIndex((item) => item.id === existing.id) + 1;
    const objects = buildTocObjects(structure, tocPageNumber);
    const next = touch(
      project,
      project.artboards.map((artboard) =>
        artboard.id === existing.id
          ? { ...artboard, name: structure.tocTitle, objects }
          : artboard
      )
    );

    return { project: next, artboardId: existing.id };
  }

  const reference =
    project.artboards.find((item) => (item.role ?? "page") === "page") ??
    project.artboards[0];

  if (!reference) {
    return { project, artboardId: "" };
  }

  const shiftedStructure = {
    ...structure,
    chapters: structure.chapters.map((chapter) => ({
      ...chapter,
      startPage: chapter.startPage + 1
    })),
    pageNumbers: {
      ...structure.pageNumbers,
      startPage: structure.pageNumbers.startPage + 1
    }
  };

  const artboardId = id("artboard");
  const tocArtboard: Artboard = {
    id: artboardId,
    name: shiftedStructure.tocTitle,
    role: "page",
    kind: "toc",
    width: reference.width,
    height: reference.height,
    unit: reference.unit,
    bleed: reference.bleed,
    background: "#ffffff",
    objects: buildTocObjects(shiftedStructure, 1)
  };

  const firstPageIndex = project.artboards.findIndex(
    (item) => (item.role ?? "page") === "page"
  );
  const artboards = [...project.artboards];
  artboards.splice(firstPageIndex >= 0 ? firstPageIndex : 0, 0, tocArtboard);

  return {
    project: {
      ...touch(project, artboards),
      bookStructure: shiftedStructure
    },
    artboardId
  };
}

function buildTocObjects(
  structure: BookStructure,
  tocPhysicalPage: number
): DesignObject[] {
  const objects: DesignObject[] = [];
  const heading: TextObject = {
    id: id("object"),
    name: "TOC Title",
    type: "text",
    x: 12,
    y: 10,
    width: 76,
    height: 8,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
    text: structure.tocTitle,
    fontFamily: "Arial",
    fontSize: 24,
    fontWeight: 700,
    color: "#111111",
    textAlign: "center",
    lineHeight: 1.2,
    letterSpacing: 0
  };
  objects.push(heading);

  const entries = structure.chapters.slice(0, 24);

  entries.forEach((chapter, index) => {
    const y = 23 + index * 2.8;
    const logicalLabel =
      getPageNumberLabel(chapter.startPage, structure) ?? String(chapter.startPage);

    const row: TextObject = {
      id: id("object"),
      name: "TOC " + chapter.title,
      type: "text",
      x: 13,
      y,
      width: 74,
      height: 2.4,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      skewX: 0,
      skewY: 0,
      flipX: false,
      flipY: false,
      text: chapter.title + "  ................................  " + logicalLabel,
      fontFamily: "Arial",
      fontSize: 11,
      fontWeight: 400,
      color: "#222222",
      textAlign: "left",
      lineHeight: 1.15,
      letterSpacing: 0
    };

    objects.push(row);
  });

  if (structure.chapters.length === 0) {
    const empty: TextObject = {
      id: id("object"),
      name: "TOC Empty",
      type: "text",
      x: 18,
      y: 28,
      width: 64,
      height: 5,
      rotation: 0,
      opacity: 0.6,
      visible: true,
      locked: false,
      skewX: 0,
      skewY: 0,
      flipX: false,
      flipY: false,
      text: "Add chapters in KDP Book settings, then update this TOC page.",
      fontFamily: "Arial",
      fontSize: 10,
      fontWeight: 400,
      color: "#444444",
      textAlign: "center",
      lineHeight: 1.2,
      letterSpacing: 0
    };
    objects.push(empty);
  }

  // tocPhysicalPage is intentionally retained in the signature for future multi-TOC-page support.
  void tocPhysicalPage;

  return objects;
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
    role: "page",
    kind: "standard",
    width: source?.width ?? previous?.width ?? 7,
    height: source?.height ?? previous?.height ?? 10,
    unit: source?.unit ?? previous?.unit ?? "in",
    bleed: source?.bleed ?? previous?.bleed ?? 0,
    background: source?.background ?? previous?.background ?? "#ffffff",
    objects: []
  };

  return touch(project, [...project.artboards, artboard]);
}

export function setArtboardTemplateOverlay(
  project: ZaxisProject,
  artboardId: string,
  overlay?: TemplateOverlay
): ZaxisProject {
  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    templateOverlay: overlay
  }));
}

export function createMasterPageFromArtboard(
  project: ZaxisProject,
  artboardId: string,
  name: string
): ZaxisProject {
  const artboard = project.artboards.find((item) => item.id === artboardId);
  if (!artboard) return project;

  const master: MasterPage = {
    id: id("master"),
    name: name.trim() || "Master Page",
    objects: structuredClone(artboard.objects)
  };

  return {
    ...project,
    masterPages: [...(project.masterPages ?? []), master],
    updatedAt: now()
  };
}

export function applyMasterPage(
  project: ZaxisProject,
  artboardId: string,
  masterPageId: string
): ZaxisProject {
  const master = (project.masterPages ?? []).find((item) => item.id === masterPageId);
  if (!master) return project;

  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    masterPageId,
    objects: [
      ...master.objects.map((object) => ({
        ...structuredClone(object),
        id: id("object"),
        name: "[Master] " + object.name
      })),
      ...artboard.objects.filter((object) => !object.name.startsWith("[Master] "))
    ]
  }));
}

export function saveReusableComponent(
  project: ZaxisProject,
  artboardId: string,
  objectIds: string[],
  name: string
): ZaxisProject {
  const artboard = project.artboards.find((item) => item.id === artboardId);
  if (!artboard) return project;

  const ids = new Set(objectIds);
  const objects = artboard.objects
    .filter((object) => ids.has(object.id))
    .map((object) => structuredClone(object));

  if (objects.length === 0) return project;

  const component: ReusableComponent = {
    id: id("component"),
    name: name.trim() || "Reusable Component",
    sourceArtboardName: artboard.name,
    objects
  };

  return {
    ...project,
    reusableComponents: [...(project.reusableComponents ?? []), component],
    updatedAt: now()
  };
}

export function saveArtboardAsTemplate(
  project: ZaxisProject,
  artboardId: string,
  name: string
): ZaxisProject {
  const artboard = project.artboards.find((item) => item.id === artboardId);
  if (!artboard || artboard.objects.length === 0) return project;

  return saveReusableComponent(
    project,
    artboardId,
    artboard.objects.map((object) => object.id),
    name.trim() || artboard.name + " Template"
  );
}

export function insertReusableComponent(
  project: ZaxisProject,
  artboardId: string,
  componentId: string
): ZaxisProject {
  const component = (project.reusableComponents ?? []).find(
    (item) => item.id === componentId
  );
  if (!component) return project;

  return mapArtboard(project, artboardId, (artboard) => ({
    ...artboard,
    objects: [
      ...artboard.objects,
      ...component.objects.map((object) => cloneReusableObject(object))
    ]
  }));
}

export function deleteReusableComponent(
  project: ZaxisProject,
  componentId: string
): ZaxisProject {
  return {
    ...project,
    reusableComponents: (project.reusableComponents ?? []).filter(
      (item) => item.id !== componentId
    ),
    updatedAt: now()
  };
}

export function updateProjectOverrides(
  project: ZaxisProject,
  input: Partial<ProjectOverrides>
): ZaxisProject {
  return {
    ...project,
    projectOverrides: {
      ...(project.projectOverrides ?? {}),
      ...input
    },
    updatedAt: now()
  };
}

function cloneReusableObject(object: DesignObject): DesignObject {
  if (object.type === "path") {
    const cloned = structuredClone(object);
    return {
      ...cloned,
      id: id("object"),
      name: cloned.name + " Instance",
      x: Math.min(100 - cloned.width, cloned.x + 2),
      y: Math.min(100 - cloned.height, cloned.y + 2),
      locked: false,
      points: cloned.points.map((point) => ({
        ...point,
        id: id("point")
      }))
    };
  }

  if (object.type === "image") {
    const cloned = structuredClone(object);
    return {
      ...cloned,
      id: id("object"),
      name: cloned.name + " Instance",
      x: Math.min(100 - cloned.width, cloned.x + 2),
      y: Math.min(100 - cloned.height, cloned.y + 2),
      locked: false,
      maskPoints: cloned.maskPoints.map((point) => ({
        ...point,
        id: id("mask")
      }))
    };
  }

  if (object.type === "text") {
    const cloned = structuredClone(object);
    return {
      ...cloned,
      id: id("object"),
      name: cloned.name + " Instance",
      x: Math.min(100 - cloned.width, cloned.x + 2),
      y: Math.min(100 - cloned.height, cloned.y + 2),
      locked: false
    };
  }

  const cloned = structuredClone(object);
  return {
    ...cloned,
    id: id("object"),
    name: cloned.name + " Instance",
    x: Math.min(100 - cloned.width, cloned.x + 2),
    y: Math.min(100 - cloned.height, cloned.y + 2),
    locked: false
  };
}

export function saveReusableStyle(
  project: ZaxisProject,
  object: DesignObject,
  name: string,
  kind?: ReusableStyle["kind"]
): ZaxisProject {
  const resolvedKind: ReusableStyle["kind"] =
    object.type === "text"
      ? (kind === "paragraph" ? "paragraph" : "character")
      : "object";

  const properties: UpdateObjectInput =
    object.type === "text" && resolvedKind === "paragraph"
      ? {
          textAlign: object.textAlign,
          lineHeight: object.lineHeight,
          letterSpacing: object.letterSpacing
        }
      : object.type === "text"
        ? {
            fontFamily: object.fontFamily,
            fontSize: object.fontSize,
            fontWeight: object.fontWeight,
            color: object.color,
            opacity: object.opacity
          }
        : object.type === "image"
          ? { opacity: object.opacity, borderRadius: object.borderRadius }
          : object.type === "path"
            ? { fill: object.fill, stroke: object.stroke, strokeWidth: object.strokeWidth, opacity: object.opacity }
            : { fill: object.fill, stroke: object.stroke, strokeWidth: object.strokeWidth, cornerRadius: object.cornerRadius, opacity: object.opacity };

  const style: ReusableStyle = {
    id: id("style"),
    name: name.trim() || (
      resolvedKind === "paragraph"
        ? "Paragraph Style"
        : resolvedKind === "character"
          ? "Character Style"
          : "Object Style"
    ),
    kind: resolvedKind,
    properties
  };

  return {
    ...project,
    reusableStyles: [...(project.reusableStyles ?? []), style],
    updatedAt: now()
  };
}

export function applyReusableStyle(
  project: ZaxisProject,
  artboardId: string,
  objectId: string,
  styleId: string
): ZaxisProject {
  const style = (project.reusableStyles ?? []).find((item) => item.id === styleId);
  if (!style) return project;
  return updateObject(project, artboardId, objectId, style.properties);
}

export function resizeAllArtboardsWithContent(
  project: ZaxisProject,
  input: ResizeArtboardInput
): ZaxisProject {
  const source = project.artboards.find((item) => item.role !== "cover") ?? project.artboards[0];
  const nextWidth = normalizeDimension(input.width ?? source?.width ?? 1);
  const nextHeight = normalizeDimension(input.height ?? source?.height ?? 1);

  return touch(
    project,
    project.artboards.map((artboard) => {
      if (artboard.role === "cover") return artboard;

      const widthScale = artboard.width > 0 ? nextWidth / artboard.width : 1;
      const heightScale = artboard.height > 0 ? nextHeight / artboard.height : 1;
      const uniformScale = Math.min(widthScale, heightScale);

      return {
        ...artboard,
        width: nextWidth,
        height: nextHeight,
        unit: input.unit ?? artboard.unit,
        objects: artboard.objects.map((object): DesignObject => {
          if (object.type === "text") {
            return {
              ...object,
              fontSize: Math.max(1, object.fontSize * uniformScale)
            };
          }

          if (object.type === "rectangle" || object.type === "ellipse" || object.type === "path") {
            return {
              ...object,
              strokeWidth: object.strokeWidth * uniformScale
            };
          }

          return { ...object };
        })
      };
    })
  );
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
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
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
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    visible: true,
    locked: false,
    src,
    alt,
    fit: "contain",
    cropX: 50,
    cropY: 50,
    scale: 1,
    borderRadius: 0,
    maskType: "none",
    maskPoints: [
      { id: id("mask"), x: 0, y: 0 },
      { id: id("mask"), x: 100, y: 0 },
      { id: id("mask"), x: 100, y: 100 },
      { id: id("mask"), x: 0, y: 100 }
    ]
  };

  return {
    objectId,
    project: mapArtboard(project, artboardId, (artboard) => ({
      ...artboard,
      objects: [...artboard.objects, nextObject]
    }))
  };
}

export function linkImageObjectToCloudAsset(
  project: ZaxisProject,
  artboardId: string,
  objectId: string,
  input: {
    src: string;
    assetId: string;
    assetVersion: number;
    sha256: string;
    alt?: string;
  }
): ZaxisProject {
  return updateObject(project, artboardId, objectId, {
    src: input.src,
    alt: input.alt,
    linkedAssetId: input.assetId,
    linkedAssetVersion: input.assetVersion,
    linkedAssetSha256: input.sha256
  });
}

export function replaceLinkedAssetReferences(
  project: ZaxisProject,
  fromAssetId: string,
  input: {
    src: string;
    assetId: string;
    assetVersion: number;
    sha256: string;
    alt?: string;
  }
): ZaxisProject {
  return touch(
    project,
    project.artboards.map((artboard) => ({
      ...artboard,
      objects: artboard.objects.map((object) => {
        if (
          object.type !== "image" ||
          object.locked ||
          object.linkedAssetId !== fromAssetId
        ) {
          return object;
        }

        return {
          ...object,
          src: input.src,
          alt: input.alt ?? object.alt,
          linkedAssetId: input.assetId,
          linkedAssetVersion: input.assetVersion,
          linkedAssetSha256: input.sha256
        };
      })
    }))
  );
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
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
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
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
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
        skewX: normalizeSkew(input.skewX ?? object.skewX),
        skewY: normalizeSkew(input.skewY ?? object.skewY),
        flipX: input.flipX ?? object.flipX,
        flipY: input.flipY ?? object.flipY,
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
          borderRadius: Math.max(0, input.borderRadius ?? object.borderRadius),
          maskType: input.maskType ?? object.maskType,
          linkedAssetId: input.linkedAssetId ?? object.linkedAssetId,
          linkedAssetVersion: input.linkedAssetVersion ?? object.linkedAssetVersion,
          linkedAssetSha256: input.linkedAssetSha256 ?? object.linkedAssetSha256,
          maskPoints: (input.maskPoints ?? object.maskPoints).map((point) => ({
            ...point,
            x: Math.max(0, Math.min(100, point.x)),
            y: Math.max(0, Math.min(100, point.y))
          }))
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
  let pageNumber = 0;

  return artboards.map((artboard) => {
    if (artboard.role === "cover") {
      return { ...artboard, name: "Paperback Cover" };
    }

    pageNumber += 1;

    if (artboard.kind === "toc") {
      return { ...artboard, name: artboard.name || "Table of Contents" };
    }

    return {
      ...artboard,
      name: "Artboard " + pageNumber
    };
  });
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

function normalizeSkew(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-89, Math.min(89, value));
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
