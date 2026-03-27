import type {
  CameraState,
  DependencyPath,
  FrameScene,
  GanttScene,
  GanttTask,
  GlyphInstanceWriter,
  LineInstanceWriter,
  SolidInstanceWriter,
  TaskIndex,
} from '../core';
import type { FontAtlas, TextLayoutEngine } from '../font';
import type { ModuleManager } from '../module-manager';
import type { PluginRuntime } from '../plugin-runtime';
import type { GanttRenderer } from '../render';
import type {
  GanttCanvasHitRegion,
  GanttCanvasLayer,
  GanttHostController,
  GanttInteractionMode,
  GanttSceneTransform,
  GanttTaskEditEvent,
  GanttTaskEditResolver,
  GanttTaskEditState,
  NormalizedGanttConfig,
  OverlayRenderer,
  TaskStyleResolver,
  UiCommand,
} from '../types';

export type AppElements = {
  root: HTMLElement;
  surface: HTMLDivElement;
  canvas: HTMLCanvasElement;
  hud: HTMLDivElement | null;
  inspector: HTMLDivElement | null;
  toolbar: HTMLDivElement | null;
  statusLine: HTMLDivElement | null;
};

export type ZoomPreset = {
  id: string;
  label: string;
  visibleDays: number;
};

export type ActiveEditBatchState = {
  primaryTaskId: string;
  events: GanttTaskEditEvent[];
  originalTasks: GanttTask[];
  draftTasks: GanttTask[];
};

export type CanvasLayerHitRegionRecord = GanttCanvasHitRegion & {
  key: string;
  layerIndex: number;
  order: number;
};

export type CanvasLayerFrameState = {
  solids: SolidInstanceWriter;
  lines: LineInstanceWriter;
  glyphs: GlyphInstanceWriter;
  hitRegions: CanvasLayerHitRegionRecord[];
};

export type HostInternals = GanttHostController & {
  surface: HTMLDivElement;
  scene: GanttScene;
  index: TaskIndex;
  dependentsById: Map<string, GanttTask[]>;
  previewScene: GanttScene | null;
  transformedScene: GanttScene | null;
  transformedIndex: TaskIndex | null;
  config: NormalizedGanttConfig;
  atlas: FontAtlas;
  layout: TextLayoutEngine;
  gl: WebGL2RenderingContext;
  renderer: GanttRenderer;
  camera: CameraState;
  interactionMode: GanttInteractionMode;
  activeEdit: GanttTaskEditState | null;
  activeEditBatch: ActiveEditBatchState | null;
  lastTaskEditEvent: GanttTaskEditEvent | null;
  selectedTaskId: string | null;
  selectedTaskIds: string[];
  selectionPreviewTaskIds: string[] | null;
  selectionPreviewPrimaryTaskId: string | null;
  hoveredTaskId: string | null;
  selectedDependencyId: string | null;
  hoveredDependencyId: string | null;
  selectedTask: GanttTask | null;
  selectedTasks: GanttTask[];
  hoveredTask: GanttTask | null;
  selectedDependency: DependencyPath | null;
  hoveredDependency: DependencyPath | null;
  frame: FrameScene | null;
  lastFrameMs: number;
  cameraAnimationFrame: number;
  moduleManager: ModuleManager;
  cleanupCallbacks: Array<() => void>;
  taskStyleResolvers: TaskStyleResolver[];
  taskEditResolvers: GanttTaskEditResolver[];
  sceneTransforms: GanttSceneTransform[];
  canvasLayers: GanttCanvasLayer[];
  canvasHitRegions: CanvasLayerHitRegionRecord[];
  canvasHitRegionByKey: Map<string, CanvasLayerHitRegionRecord>;
  capturedCanvasRegionKeys: Map<number, string>;
  hoveredCanvasRegionKeys: Map<number, string>;
  pendingCanvasClickRegionKeys: Map<number, string>;
  overlays: OverlayRenderer[];
  uiCommands: Map<string, UiCommand>;
  pluginRuntime: PluginRuntime;
  renderRequested: boolean;
  drawing: boolean;
  disposed: boolean;
  modulesInitialized: boolean;
  registerTaskStyleResolver: (resolver: TaskStyleResolver) => () => void;
  registerOverlay: (overlay: OverlayRenderer) => () => void;
  registerSceneTransform: (transform: GanttSceneTransform) => () => void;
  registerCanvasLayer: (layer: GanttCanvasLayer) => () => void;
  registerUiCommand: (command: UiCommand) => () => void;
  registerModule: (module: import('../types').GanttModule) => () => void;
  registerTaskEditResolver: (resolver: GanttTaskEditResolver) => () => void;
  replaceCommittedScene: (scene: GanttScene) => void;
  hasTask: (taskId: string | null, index: TaskIndex) => boolean;
  normalizeSelectedTaskIds: (
    taskIds: readonly string[],
    index: TaskIndex,
    primaryTaskId?: string | null,
  ) => string[];
  assignTaskSelection: (taskIds: readonly string[], primaryTaskId?: string | null) => void;
  clearTaskSelection: () => void;
  refreshSelectionReferences: () => void;
  cloneTask: (task: GanttTask) => GanttTask;
  cloneActiveEdit: (
    edit: GanttTaskEditState | null,
    batch?: ActiveEditBatchState | null,
  ) => GanttTaskEditState | null;
  updateActiveEdit: (
    edit: GanttTaskEditState | null,
    event: GanttTaskEditEvent | null,
    batch?: ActiveEditBatchState | null,
  ) => void;
  fireEditStart: (event: GanttTaskEditEvent) => void;
  fireEditPreview: (event: GanttTaskEditEvent) => void;
  fireEditCancel: (event: GanttTaskEditEvent) => void;
};
