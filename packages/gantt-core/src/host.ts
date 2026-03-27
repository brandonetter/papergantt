import {
  buildTaskIndex,
  computeVisibleTimeWindow,
  type CameraState,
  type DependencyPath,
  type FrameScene,
  type GanttScene,
  type GanttTask,
  type TaskIndex,
} from './core';
import { normalizeConfig, resolveScene } from './config';
import { createFallbackFontAtlas, loadMsdfFontAtlas, TextLayoutEngine, type FontAtlas } from './font';
import { ModuleManager } from './module-manager';
import { PluginRuntime } from './plugin-runtime';
import { GanttRenderer } from './render';
import {
  addTask as addRuntimeTask,
  cloneTask as cloneRuntimeTask,
  deleteTask as deleteRuntimeTask,
  deleteTasks as deleteRuntimeTasks,
  exportTasks as exportRuntimeTasks,
  getTask as getRuntimeTask,
  getTasks as getRuntimeTasks,
  importTasks as importRuntimeTasks,
  updateTask as updateRuntimeTask,
} from './runtime-data';
import type {
  GanttCanvasLayer,
  GanttConfig,
  GanttExportedTask,
  GanttHostController,
  GanttInteractionMode,
  GanttInteractionState,
  GanttModule,
  GanttRuntimeImportOptions,
  GanttRuntimeTaskInput,
  GanttRuntimeTaskPatch,
  GanttSceneTransform,
  GanttTaskEditEvent,
  GanttTaskEditResolver,
  GanttTaskEditState,
  NormalizedGanttConfig,
  OverlayRenderer,
  PluginSelectionState,
  TaskStyleResolver,
  UiCommand,
} from './types';
import { createBuiltinModule } from './builtins';
import {
  animateCameraToTask,
  animateToZoomPresetId,
  createHostCameraState,
  getZoomPresetIdForVisibleWindow,
  panByScreenDelta,
  resetCamera,
  stopCameraAnimation,
  syncCanvasSize,
  zoomAt,
  ZOOM_PRESETS,
} from './host/camera';
import { createAppElements } from './host/dom';
import {
  assignTaskSelection,
  attachCanvasLayerPointerEvents,
  cancelActiveEdit,
  clearSelectionPreview,
  clearTaskSelection,
  commitActiveEdit,
  commitTaskEdits,
  dependencyFromPointer,
  hasTask,
  normalizeSelectedTaskIds,
  pickDependencyAtScreen,
  pickTaskAtScreen,
  pickTasksInScreenRect,
  previewSelectionByTaskIds,
  previewTaskEdit,
  previewTaskEdits,
  refreshSelectionReferences,
  setInteractionMode,
  setSelectionByDependencyId,
  setSelectionByScreenPoint,
  setSelectionByTaskId,
  setSelectionByTaskIds,
  taskFromPointer,
  updateHoverFromScreen,
} from './host/interaction';
import { createPluginRuntimeHostApi } from './host/plugin-api';
import {
  buildDependentsMap,
  drawFrame,
  flushDrawQueue,
  getRenderIndex,
  invalidateRenderCaches,
} from './host/render-loop';
import type { ActiveEditBatchState, CanvasLayerHitRegionRecord, HostInternals } from './host/types';

export type GanttHost = {
  dispose: () => Promise<void>;
  getController: () => GanttHostController;
};

const FONT_WEIGHT_ALIASES: Record<string, string> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

function normalizeFontWeight(weight: NormalizedGanttConfig['font']['weight']): string {
  const key = String(weight ?? 600).toLowerCase();
  return FONT_WEIGHT_ALIASES[key] ?? key;
}

function resolveMsdfManifestUrl(font: NormalizedGanttConfig['font']): string | undefined {
  const normalizedWeight = normalizeFontWeight(font.weight);
  if (font.msdfManifestUrls?.[normalizedWeight]) {
    return font.msdfManifestUrls[normalizedWeight];
  }

  const alias = Object.entries(FONT_WEIGHT_ALIASES).find(([, value]) => value === normalizedWeight)?.[0];
  if (alias && font.msdfManifestUrls?.[alias]) {
    return font.msdfManifestUrls[alias];
  }

  return font.msdfManifestUrl;
}

class GanttHostImpl implements GanttHostController {
  root: HTMLElement;
  private readonly surface: HTMLDivElement;
  canvas: HTMLCanvasElement;
  hud: HTMLDivElement | null;
  inspector: HTMLDivElement | null;
  toolbar: HTMLDivElement | null;
  statusLine: HTMLDivElement | null;

  private scene: GanttScene = { tasks: [], rowLabels: [], timelineStart: 0, timelineEnd: 0 };
  private index: TaskIndex = buildTaskIndex([]);
  private dependentsById = new Map<string, GanttTask[]>();
  private previewScene: GanttScene | null = null;
  private transformedScene: GanttScene | null = null;
  private transformedIndex: TaskIndex | null = null;
  private readonly config: NormalizedGanttConfig;
  private atlas: FontAtlas;
  private readonly layout: TextLayoutEngine;
  private readonly gl: WebGL2RenderingContext;
  private readonly renderer: GanttRenderer;
  private camera: CameraState;
  private interactionMode: GanttInteractionMode;
  private activeEdit: GanttTaskEditState | null = null;
  private activeEditBatch: ActiveEditBatchState | null = null;
  private lastTaskEditEvent: GanttTaskEditEvent | null = null;
  private selectedTaskId: string | null = null;
  private selectedTaskIds: string[] = [];
  private selectionPreviewTaskIds: string[] | null = null;
  private selectionPreviewPrimaryTaskId: string | null = null;
  private hoveredTaskId: string | null = null;
  private selectedDependencyId: string | null = null;
  private hoveredDependencyId: string | null = null;
  private selectedTask: GanttTask | null = null;
  private selectedTasks: GanttTask[] = [];
  private hoveredTask: GanttTask | null = null;
  private selectedDependency: DependencyPath | null = null;
  private hoveredDependency: DependencyPath | null = null;
  private frame: FrameScene | null = null;
  private lastFrameMs = 0;
  private cameraAnimationFrame = 0;
  private readonly moduleManager = new ModuleManager();
  private readonly cleanupCallbacks: Array<() => void> = [];
  private readonly taskStyleResolvers: TaskStyleResolver[] = [];
  private readonly taskEditResolvers: GanttTaskEditResolver[] = [];
  private readonly sceneTransforms: GanttSceneTransform[] = [];
  private readonly canvasLayers: GanttCanvasLayer[] = [];
  private canvasHitRegions: CanvasLayerHitRegionRecord[] = [];
  private readonly canvasHitRegionByKey = new Map<string, CanvasLayerHitRegionRecord>();
  private readonly capturedCanvasRegionKeys = new Map<number, string>();
  private readonly hoveredCanvasRegionKeys = new Map<number, string>();
  private readonly pendingCanvasClickRegionKeys = new Map<number, string>();
  private readonly overlays: OverlayRenderer[] = [];
  private readonly uiCommands = new Map<string, UiCommand>();
  private readonly pluginRuntime: PluginRuntime;
  private renderRequested = false;
  private drawing = false;
  private disposed = false;
  private modulesInitialized = false;

  constructor(root: HTMLElement, config: NormalizedGanttConfig) {
    this.config = config;
    this.atlas = createFallbackFontAtlas({
      family: this.config.font.family,
      weight: normalizeFontWeight(this.config.font.weight),
    });
    this.layout = new TextLayoutEngine(this.atlas);

    const elements = createAppElements(root, config, ZOOM_PRESETS);
    this.root = elements.root;
    this.surface = elements.surface;
    this.canvas = elements.canvas;
    this.hud = elements.hud;
    this.inspector = elements.inspector;
    this.toolbar = elements.toolbar;
    this.statusLine = elements.statusLine;

    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
    if (!gl) {
      throw new Error('WebGL2 is not available in this browser.');
    }

    this.gl = gl;
    this.renderer = new GanttRenderer(gl);
    this.camera = createHostCameraState(1280, 720, this.config.render.headerHeight, 0, false);
    this.interactionMode =
      this.config.edit.defaultMode === 'edit' && !this.config.edit.enabled
        ? 'view'
        : this.config.edit.defaultMode;
    this.canvas.dataset.mode = this.interactionMode;

    attachCanvasLayerPointerEvents(this as unknown as HostInternals);
    this.pluginRuntime = new PluginRuntime(createPluginRuntimeHostApi(this as unknown as HostInternals));
  }

  async initialize(): Promise<void> {
    this.scene = await resolveScene(this.config.data);

    const manifestUrl = resolveMsdfManifestUrl(this.config.font);
    if (manifestUrl) {
      try {
        this.atlas = await loadMsdfFontAtlas(manifestUrl);
        this.layout.setAtlas(this.atlas);
      } catch (error) {
        console.warn('Failed to load MSDF font atlas, falling back to the built-in alpha atlas.', error);
      }
    }

    await this.pluginRuntime.load();
    this.scene = await this.pluginRuntime.applySceneHooks(this.scene);

    this.index = buildTaskIndex(this.scene.tasks, this.scene.rowLabels.length);
    this.dependentsById = buildDependentsMap(this.scene.tasks);

    this.camera = createHostCameraState(
      this.camera.viewportWidth,
      this.camera.viewportHeight,
      this.config.render.headerHeight,
      this.scene.timelineStart,
      this.scene.tasks.length > 0,
    );

    for (const builtinId of this.config.modules.builtins) {
      this.moduleManager.register(createBuiltinModule(builtinId));
    }

    await this.moduleManager.init({ host: this });
    this.modulesInitialized = true;

    await this.pluginRuntime.init();
    this.pluginRuntime.notifyEditModeChange(this.interactionMode);

    this.syncCanvasSize();
    this.camera = createHostCameraState(
      this.camera.viewportWidth,
      this.camera.viewportHeight,
      this.config.render.headerHeight,
      this.scene.timelineStart,
      this.scene.tasks.length > 0,
    );
    this.requestRender();
  }

  registerCleanup(callback: () => void): void {
    this.cleanupCallbacks.push(callback);
  }

  private registerTaskStyleResolver(resolver: TaskStyleResolver): () => void {
    this.taskStyleResolvers.push(resolver);
    this.requestRender();
    return () => {
      const index = this.taskStyleResolvers.indexOf(resolver);
      if (index >= 0) {
        this.taskStyleResolvers.splice(index, 1);
        this.requestRender();
      }
    };
  }

  private registerTaskEditResolver(resolver: GanttTaskEditResolver): () => void {
    this.taskEditResolvers.push(resolver);
    return () => {
      const index = this.taskEditResolvers.indexOf(resolver);
      if (index >= 0) {
        this.taskEditResolvers.splice(index, 1);
      }
    };
  }

  private registerSceneTransform(transform: GanttSceneTransform): () => void {
    this.sceneTransforms.push(transform);
    invalidateRenderCaches(this as unknown as HostInternals);
    this.requestRender();
    return () => {
      const index = this.sceneTransforms.indexOf(transform);
      if (index >= 0) {
        this.sceneTransforms.splice(index, 1);
        invalidateRenderCaches(this as unknown as HostInternals);
        this.requestRender();
      }
    };
  }

  private registerCanvasLayer(layer: GanttCanvasLayer): () => void {
    this.canvasLayers.push(layer);
    this.requestRender();
    return () => {
      const index = this.canvasLayers.indexOf(layer);
      if (index >= 0) {
        this.canvasLayers.splice(index, 1);
        this.requestRender();
      }
    };
  }

  private registerOverlay(overlay: OverlayRenderer): () => void {
    this.overlays.push(overlay);
    this.requestRender();
    return () => {
      const index = this.overlays.indexOf(overlay);
      if (index >= 0) {
        this.overlays.splice(index, 1);
      }
    };
  }

  private registerUiCommand(command: UiCommand): () => void {
    this.uiCommands.set(command.id, command);
    return () => {
      this.uiCommands.delete(command.id);
    };
  }

  private registerModule(module: GanttModule): () => void {
    const unregister = this.moduleManager.register(module);

    if (this.modulesInitialized) {
      Promise.resolve(module.onInit?.({ host: this })).catch((error) => {
        console.error(`Module onInit failed: ${module.id}`, error);
      });
    }

    this.requestRender();

    return () => {
      Promise.resolve(module.onDispose?.({ host: this })).catch((error) => {
        console.error(`Module onDispose failed: ${module.id}`, error);
      });
      unregister();
    };
  }

  getScene(): GanttScene {
    return this.scene;
  }

  getCamera(): CameraState {
    return this.camera;
  }

  getIndex(): TaskIndex {
    return getRenderIndex(this as unknown as HostInternals);
  }

  getRenderOptions(): NormalizedGanttConfig['render'] {
    return this.config.render;
  }

  getEditConfig(): NormalizedGanttConfig['edit'] {
    return this.config.edit;
  }

  getRenderer(): unknown {
    return this.renderer;
  }

  getGl(): WebGL2RenderingContext {
    return this.gl;
  }

  getCurrentFrame(): FrameScene | null {
    return this.frame;
  }

  getLastFrameMs(): number {
    return this.lastFrameMs;
  }

  getVisibleWindow() {
    return computeVisibleTimeWindow(this.camera, 0);
  }

  getInteractionState(): GanttInteractionState {
    return {
      mode: this.interactionMode,
      activeEdit: this.cloneActiveEdit(this.activeEdit),
    };
  }

  isTaskEditPending(): boolean {
    return this.activeEdit?.status === 'committing';
  }

  requestRender(): void {
    if (this.disposed) {
      return;
    }

    invalidateRenderCaches(this as unknown as HostInternals);
    this.renderRequested = true;
    requestAnimationFrame(() => {
      void this.flushDrawQueue();
    });
  }

  setStatusText(text: string): void {
    if (this.statusLine) {
      this.statusLine.textContent = text;
    }
  }

  private applyCommittedSceneMutation<T>(mutate: () => { scene: GanttScene; result: T }): T {
    if (this.activeEdit?.status === 'committing') {
      throw new Error('Cannot mutate tasks while a task edit commit is pending.');
    }

    if (this.activeEdit?.status === 'preview') {
      this.cancelActiveEdit();
    }

    const { scene, result } = mutate();
    this.replaceCommittedScene(scene);
    this.requestRender();
    return result;
  }

  replaceCommittedScene(scene: GanttScene): void {
    this.scene = scene;
    this.index = buildTaskIndex(scene.tasks, scene.rowLabels.length);
    this.dependentsById = buildDependentsMap(scene.tasks);
    this.frame = null;
    invalidateRenderCaches(this as unknown as HostInternals);
    this.refreshSelectionReferences();
  }

  replaceScene(scene: GanttScene): void {
    this.applyCommittedSceneMutation(() => ({
      scene,
      result: undefined,
    }));
  }

  hasTask(taskId: string | null, index: TaskIndex): boolean {
    return hasTask(this as unknown as HostInternals, taskId, index);
  }

  normalizeSelectedTaskIds(
    taskIds: readonly string[],
    index: TaskIndex,
    primaryTaskId: string | null = null,
  ): string[] {
    return normalizeSelectedTaskIds(this as unknown as HostInternals, taskIds, index, primaryTaskId);
  }

  assignTaskSelection(taskIds: readonly string[], primaryTaskId: string | null = null): void {
    assignTaskSelection(this as unknown as HostInternals, taskIds, primaryTaskId);
  }

  clearTaskSelection(): void {
    clearTaskSelection(this as unknown as HostInternals);
  }

  refreshSelectionReferences(): void {
    refreshSelectionReferences(this as unknown as HostInternals);
  }

  private cloneTask(task: GanttTask): GanttTask {
    return cloneRuntimeTask(task);
  }

  private cloneActiveEdit(
    edit: GanttTaskEditState | null,
    batch: ActiveEditBatchState | null = this.activeEditBatch,
  ): GanttTaskEditState | null {
    if (!edit) {
      return null;
    }

    const originalTasks = (batch?.originalTasks ?? edit.originalTasks ?? [edit.originalTask])
      .map((task) => this.cloneTask(task));
    const draftTasks = (batch?.draftTasks ?? edit.draftTasks ?? [edit.draftTask])
      .map((task) => this.cloneTask(task));

    return {
      taskId: edit.taskId,
      taskIds: edit.taskIds?.slice() ?? draftTasks.map((task) => task.id),
      operation: edit.operation,
      originalTask: this.cloneTask(edit.originalTask),
      originalTasks,
      draftTask: this.cloneTask(edit.draftTask),
      draftTasks,
      status: edit.status,
    };
  }

  private updateActiveEdit(
    edit: GanttTaskEditState | null,
    event: GanttTaskEditEvent | null,
    batch: ActiveEditBatchState | null = null,
  ): void {
    this.activeEdit = edit;
    this.activeEditBatch = batch;
    this.lastTaskEditEvent = event;
    invalidateRenderCaches(this as unknown as HostInternals);
    this.refreshSelectionReferences();
    this.requestRender();
  }

  private fireEditStart(event: GanttTaskEditEvent): void {
    this.config.edit.callbacks.onTaskEditStart?.(event);
    this.pluginRuntime.notifyTaskEditStart(event);
  }

  private fireEditPreview(event: GanttTaskEditEvent): void {
    this.config.edit.callbacks.onTaskEditPreview?.(event);
    this.pluginRuntime.notifyTaskEditPreview(event);
  }

  private fireEditCancel(event: GanttTaskEditEvent): void {
    this.config.edit.callbacks.onTaskEditCancel?.(event);
    this.pluginRuntime.notifyTaskEditCancel(event);
  }

  private async flushDrawQueue(): Promise<void> {
    await flushDrawQueue(this as unknown as HostInternals);
  }

  private async drawFrame(): Promise<void> {
    await drawFrame(this as unknown as HostInternals);
  }

  getTask(taskId: string): GanttTask | null {
    return getRuntimeTask(this.scene, taskId);
  }

  getTasks(): GanttTask[] {
    return getRuntimeTasks(this.scene);
  }

  addTask(input: GanttRuntimeTaskInput, options?: GanttRuntimeImportOptions): GanttTask {
    return this.applyCommittedSceneMutation(() => {
      const result = addRuntimeTask(this.scene, input, options);
      return {
        scene: result.scene,
        result: result.task,
      };
    });
  }

  updateTask(taskId: string, patch: GanttRuntimeTaskPatch, options?: GanttRuntimeImportOptions): GanttTask {
    return this.applyCommittedSceneMutation(() => {
      const result = updateRuntimeTask(this.scene, taskId, patch, options);
      return {
        scene: result.scene,
        result: result.task,
      };
    });
  }

  deleteTask(taskId: string): GanttTask {
    return this.applyCommittedSceneMutation(() => {
      const result = deleteRuntimeTask(this.scene, taskId);
      return {
        scene: result.scene,
        result: result.task,
      };
    });
  }

  deleteTasks(taskIds: string[]): GanttTask[] {
    return this.applyCommittedSceneMutation(() => {
      const result = deleteRuntimeTasks(this.scene, taskIds);
      return {
        scene: result.scene,
        result: result.tasks,
      };
    });
  }

  importTasks(
    inputs: GanttRuntimeTaskInput[],
    options?: GanttRuntimeImportOptions,
  ): { added: GanttTask[]; updated: GanttTask[] } {
    return this.applyCommittedSceneMutation(() => {
      const result = importRuntimeTasks(this.scene, inputs, options);
      return {
        scene: result.scene,
        result: {
          added: result.added,
          updated: result.updated,
        },
      };
    });
  }

  exportTasks(): GanttExportedTask[] {
    return exportRuntimeTasks(this.scene);
  }

  getSelection(): PluginSelectionState {
    return {
      selectedTask: this.selectedTask,
      selectedTasks: this.selectedTasks.slice(),
      hoveredTask: this.hoveredTask,
      selectedDependency: this.selectedDependency,
      hoveredDependency: this.hoveredDependency,
    };
  }

  setSelectionByTaskId(taskId: string | null): void {
    setSelectionByTaskId(this as unknown as HostInternals, taskId);
  }

  setSelectionByDependencyId(dependencyId: string | null): void {
    setSelectionByDependencyId(this as unknown as HostInternals, dependencyId);
  }

  setSelectionByTaskIds(taskIds: string[], primaryTaskId?: string | null): void {
    setSelectionByTaskIds(this as unknown as HostInternals, taskIds, primaryTaskId);
  }

  setSelectionByScreenPoint(x: number, y: number): void {
    setSelectionByScreenPoint(this as unknown as HostInternals, x, y);
  }

  previewSelectionByTaskIds(taskIds: string[], primaryTaskId?: string | null): void {
    previewSelectionByTaskIds(this as unknown as HostInternals, taskIds, primaryTaskId);
  }

  clearSelectionPreview(): void {
    clearSelectionPreview(this as unknown as HostInternals);
  }

  setInteractionMode(mode: GanttInteractionMode): void {
    setInteractionMode(this as unknown as HostInternals, mode);
  }

  cancelActiveEdit(): void {
    cancelActiveEdit(this as unknown as HostInternals);
  }

  previewTaskEdit(event: GanttTaskEditEvent): GanttTaskEditEvent | null {
    return previewTaskEdit(this as unknown as HostInternals, event);
  }

  previewTaskEdits(events: GanttTaskEditEvent[]): GanttTaskEditEvent[] | null {
    return previewTaskEdits(this as unknown as HostInternals, events);
  }

  async commitActiveEdit(event?: GanttTaskEditEvent | null): Promise<boolean> {
    return commitActiveEdit(this as unknown as HostInternals, event);
  }

  async commitTaskEdits(events?: GanttTaskEditEvent[] | null): Promise<boolean> {
    return commitTaskEdits(this as unknown as HostInternals, events);
  }

  updateHoverFromScreen(x: number, y: number): void {
    updateHoverFromScreen(this as unknown as HostInternals, x, y);
  }

  pickTaskAtScreen(x: number, y: number): GanttTask | null {
    return pickTaskAtScreen(this as unknown as HostInternals, x, y);
  }

  pickTasksInScreenRect(x0: number, y0: number, x1: number, y1: number): GanttTask[] {
    return pickTasksInScreenRect(this as unknown as HostInternals, x0, y0, x1, y1);
  }

  pickDependencyAtScreen(x: number, y: number): DependencyPath | null {
    return pickDependencyAtScreen(this as unknown as HostInternals, x, y);
  }

  stopCameraAnimation(): void {
    stopCameraAnimation(this as unknown as HostInternals);
  }

  syncCanvasSize(): void {
    syncCanvasSize(this as unknown as HostInternals);
  }

  panByScreenDelta(dx: number, dy: number): void {
    panByScreenDelta(this as unknown as HostInternals, dx, dy);
  }

  zoomAt(zoomFactor: number, anchorX: number, anchorY: number): void {
    zoomAt(this as unknown as HostInternals, zoomFactor, anchorX, anchorY);
  }

  resetCamera(): void {
    resetCamera(this as unknown as HostInternals);
  }

  animateToZoomPresetId(presetId: string): void {
    animateToZoomPresetId(this as unknown as HostInternals, presetId);
  }

  animateCameraToTask(task: GanttTask): void {
    animateCameraToTask(this as unknown as HostInternals, task);
  }

  getZoomPresetIdForVisibleWindow(): string | null {
    return getZoomPresetIdForVisibleWindow(this as unknown as HostInternals);
  }

  getZoomPresets(): Array<{ id: string; label: string; visibleDays: number }> {
    return ZOOM_PRESETS;
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    stopCameraAnimation(this as unknown as HostInternals);

    for (const callback of [...this.cleanupCallbacks].reverse()) {
      try {
        callback();
      } catch (error) {
        console.error('Cleanup callback failed', error);
      }
    }

    await this.moduleManager.dispose({ host: this });
    await this.pluginRuntime.dispose();

    this.root.innerHTML = '';
  }
}

export async function createGanttHost(root: HTMLElement, config: GanttConfig = {}): Promise<GanttHost> {
  const normalized = normalizeConfig(config);
  const host = new GanttHostImpl(root, normalized);
  await host.initialize();

  return {
    dispose: () => host.dispose(),
    getController: () => host,
  };
}
