import {
  buildFrame,
  buildTaskIndex,
  computeVisibleTimeWindow,
  createCamera,
  panCamera,
  pickDependencyAtPoint,
  pickTasksInScreenRect as pickTasksInScreenRectCore,
  pickTaskAtPoint,
  resizeCamera,
  taskWorldRect,
  worldToScreen,
  zoomCameraAt,
  type CameraState,
  type DependencyPath,
  type FrameScene,
  type GanttScene,
  type GanttTask,
  type RenderState,
  type TaskIndex,
} from './core';
import { normalizeConfig, resolveScene } from './config';
import { createTaskEditEvent, replaceTaskInScene, replaceTasksInScene } from './edit';
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
  GanttConfig,
  GanttExportedTask,
  GanttHostController,
  GanttInteractionMode,
  GanttInteractionState,
  GanttModule,
  GanttRuntimeImportOptions,
  GanttRuntimeTaskInput,
  GanttRuntimeTaskPatch,
  GanttTaskEditEvent,
  GanttTaskEditResolver,
  GanttTaskEditState,
  NormalizedGanttConfig,
  OverlayRenderer,
  PluginSelectionState,
  TaskStyleResolver,
  UiCommand,
  GanttContainerDimension,
} from './types';
import { createBuiltinModule } from './builtins';

export type GanttHost = {
  dispose: () => Promise<void>;
  getController: () => GanttHostController;
};

type AppElements = {
  root: HTMLElement;
  surface: HTMLDivElement;
  canvas: HTMLCanvasElement;
  hud: HTMLDivElement | null;
  inspector: HTMLDivElement | null;
  toolbar: HTMLDivElement | null;
  statusLine: HTMLDivElement | null;
};

type ZoomPreset = {
  id: string;
  label: string;
  visibleDays: number;
};

type ActiveEditBatchState = {
  primaryTaskId: string;
  events: GanttTaskEditEvent[];
  originalTasks: GanttTask[];
  draftTasks: GanttTask[];
};

const ZOOM_PRESETS: ZoomPreset[] = [
  { id: 'day', label: 'Day', visibleDays: 1 },
  { id: 'week', label: 'Week', visibleDays: 7 },
  { id: 'month', label: 'Month', visibleDays: 28 },
  { id: 'quarter', label: 'Quarter', visibleDays: 84 },
  { id: 'year', label: 'Year', visibleDays: 336 },
];

const DEFAULT_HOME_VISIBLE_DAYS = 28;
const DEFAULT_HOME_LEAD_DAYS = 3;
const FONT_WEIGHT_ALIASES: Record<string, string> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

function getInteractionModeLabel(mode: GanttInteractionMode): string {
  switch (mode) {
    case 'edit':
      return 'Edit';
    case 'select':
      return 'Select';
    default:
      return 'View';
  }
}

function renderInteractionModeIcon(mode: GanttInteractionMode): string {
  switch (mode) {
    case 'edit':
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4.75L19 9.75 14.25 5 4 15.25V20Z" />
          <path d="M12.5 6.75 17.25 11.5" />
        </svg>
      `;
    case 'select':
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="1.5" stroke-dasharray="2.5 2.5" />
        </svg>
      `;
    default:
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.5 12.5v-3a2.5 2.5 0 0 1 5 0v5.5" />
          <path d="M12.5 12.5v-4a2.5 2.5 0 0 1 5 0V15" />
          <path d="M7.5 12.5V8.75a2.25 2.25 0 0 0-4.5 0V15.5a5.5 5.5 0 0 0 5.5 5.5H13" />
          <path d="M13 21h1.5a5.5 5.5 0 0 0 5.5-5.5v-2a2.5 2.5 0 0 0-5 0" />
        </svg>
      `;
  }
}

function renderInteractionModeButton(mode: GanttInteractionMode): string {
  const label = getInteractionModeLabel(mode);
  return `
    <button
      type="button"
      class="zoom-button mode-button"
      data-interaction-mode="${mode}"
      aria-label="${label}"
      aria-pressed="false"
      title="${label}"
    >
      <span class="toolbar-button__icon" aria-hidden="true">${renderInteractionModeIcon(mode)}</span>
      <span class="toolbar-button__label">${label}</span>
    </button>
  `;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
}

function toCssDimension(value: GanttContainerDimension | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'number' ? `${value}px` : value;
}

function configureSlot(element: HTMLDivElement, height: number): void {
  const size = `${height}px`;
  element.style.boxSizing = 'border-box';
  element.style.height = size;
  element.style.minHeight = size;
  element.style.maxHeight = size;
  element.style.flex = `0 0 ${size}`;
}

function applyContainerDimensions(root: HTMLElement, config: NormalizedGanttConfig['container']): void {
  root.style.boxSizing = 'border-box';
  root.style.position = 'relative';
  root.style.display = 'block';
  root.style.width = toCssDimension(config.width) ?? '';
  root.style.height = toCssDimension(config.height) ?? '';
  root.style.minWidth = toCssDimension(config.minWidth) ?? '';
  root.style.minHeight = toCssDimension(config.minHeight) ?? '';
  root.style.maxWidth = toCssDimension(config.maxWidth) ?? '';
  root.style.maxHeight = toCssDimension(config.maxHeight) ?? '';
}

function createAppElements(root: HTMLElement, config: NormalizedGanttConfig): AppElements {
  root.innerHTML = '';
  root.classList.add('gantt-root');
  applyContainerDimensions(root, config.container);

  const canvas = createElement('canvas', 'gantt-canvas');
  const shell = createElement('div', 'gantt-shell');
  const surface = createElement('div', 'gantt-surface');

  shell.style.display = 'flex';
  shell.style.flexDirection = 'column';
  shell.style.width = '100%';
  shell.style.height = '100%';
  shell.style.minHeight = '0';

  surface.style.position = 'relative';
  surface.style.flex = '1 1 auto';
  surface.style.minHeight = '0';

  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const hud = config.ui.showHud ? createElement('div', 'hud') : null;
  const inspector = config.ui.showInspector ? createElement('div', 'inspector') : null;
  const toolbar = config.ui.showToolbar ? createElement('div', 'zoom-toolbar') : null;
  const statusLine = config.ui.showStatusLine ? createElement('div', 'status-line') : null;
  const headerSlot = config.container.header.visible ? createElement('div', 'gantt-header-slot') : null;
  const footerSlot = config.container.footer.visible ? createElement('div', 'gantt-footer-slot') : null;

  if (toolbar) {
    const modeButtons = [
      renderInteractionModeButton('view'),
      renderInteractionModeButton('select'),
      ...(config.edit.enabled ? [renderInteractionModeButton('edit')] : []),
    ].join('');
    const modeControls = modeButtons.length > 0
      ? `
        <div class="toolbar-group toolbar-group--mode">
          ${modeButtons}
        </div>
        <div class="toolbar-divider" aria-hidden="true"></div>
      `
      : '';
    const zoomControls = ZOOM_PRESETS.map((preset) => (
      `<button type="button" class="zoom-button" data-zoom-preset="${preset.id}">${preset.label}</button>`
    )).join('');
    toolbar.innerHTML = `
      ${modeControls}
      <div class="toolbar-group toolbar-group--zoom">
        ${zoomControls}
      </div>
    `;
  }

  if (hud) {
    hud.innerHTML = `
      <div class="hud-title">${config.ui.title}</div>
      <div class="hud-grid">
        <div>Rows</div><div data-field="rows">0</div>
        <div>Tasks</div><div data-field="tasks">0</div>
        <div>Glyphs</div><div data-field="glyphs">0</div>
        <div>Lines</div><div data-field="lines">0</div>
        <div>Frame</div><div data-field="frame">0.0ms</div>
        <div>Camera</div><div data-field="camera">0, 0</div>
      </div>
    `;
  }

  if (inspector) {
    inspector.innerHTML = `
      <div class="panel-title">Selection</div>
      <div data-field="selection" class="inspector-empty">No task selected</div>
    `;
  }

  if (statusLine) {
    statusLine.textContent = config.ui.statusText;
  }

  if (headerSlot) {
    configureSlot(headerSlot, config.container.header.height);
    headerSlot.style.display = 'flex';
    headerSlot.style.alignItems = 'center';
  }

  if (footerSlot) {
    configureSlot(footerSlot, config.container.footer.height);
    footerSlot.style.display = 'flex';
    footerSlot.style.alignItems = 'center';
  }

  surface.append(canvas);
  if (hud) {
    surface.append(hud);
  }
  if (inspector) {
    surface.append(inspector);
  }
  if (statusLine && !footerSlot) {
    surface.append(statusLine);
  }

  if (headerSlot) {
    shell.append(headerSlot);
  }

  if (toolbar) {
    const toolbarSlot = createElement('div', 'gantt-toolbar-slot');
    configureSlot(toolbarSlot, config.container.toolbar.height);
    toolbarSlot.style.display = 'flex';
    toolbarSlot.style.alignItems = 'center';
    toolbarSlot.style.justifyContent = 'center';
    toolbarSlot.append(toolbar);
    if (config.container.toolbar.position === 'top') {
      shell.append(toolbarSlot);
    }
    shell.append(surface);
    if (config.container.toolbar.position === 'bottom') {
      shell.append(toolbarSlot);
    }
  } else {
    shell.append(surface);
  }

  if (statusLine && footerSlot) {
    footerSlot.append(statusLine);
  }

  if (footerSlot) {
    shell.append(footerSlot);
  }

  root.append(shell);

  return { root, surface, canvas, hud, inspector, toolbar, statusLine };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function findClosestZoomPreset(visibleDays: number): string | null {
  let closest: ZoomPreset | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const preset of ZOOM_PRESETS) {
    const distance = Math.abs(Math.log(visibleDays / preset.visibleDays));
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = preset;
    }
  }

  return bestDistance <= 0.32 ? closest?.id ?? null : null;
}

function resolvePresetZoomX(boundsWidthDays: number, availableWidthPx: number): number {
  return availableWidthPx / Math.max(1, boundsWidthDays);
}

function createHostCameraState(
  viewportWidth: number,
  viewportHeight: number,
  headerHeight: number,
  timelineStart: number,
  hasTasks: boolean,
): CameraState {
  return {
    ...createCamera(viewportWidth, viewportHeight),
    scrollX: hasTasks ? timelineStart - DEFAULT_HOME_LEAD_DAYS : 0,
    scrollY: -headerHeight,
    zoomX: clamp(viewportWidth / DEFAULT_HOME_VISIBLE_DAYS, 0.15, 768),
  };
}

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

function pickSelectedTask(
  scene: GanttScene,
  index: TaskIndex,
  camera: CameraState,
  x: number,
  y: number,
  options: NormalizedGanttConfig['render'],
): GanttTask | null {
  return pickTaskAtPoint(scene, index, camera, x, y, {
    rowPitch: options.rowPitch,
    barHeight: options.barHeight,
  });
}

function collectFocusTasks(
  task: GanttTask,
  byId: Map<string, GanttTask>,
  dependentsById: Map<string, GanttTask[]>,
): GanttTask[] {
  const tasks = new Map<string, GanttTask>();
  tasks.set(task.id, task);

  for (const dependencyId of task.dependencies ?? []) {
    const dependency = byId.get(dependencyId);
    if (dependency) {
      tasks.set(dependency.id, dependency);
    }
  }

  for (const dependent of dependentsById.get(task.id) ?? []) {
    tasks.set(dependent.id, dependent);
  }

  return Array.from(tasks.values());
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
  private effectiveScene: GanttScene | null = null;
  private effectiveIndex: TaskIndex | null = null;
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

    const elements = createAppElements(root, config);
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

    this.pluginRuntime = new PluginRuntime({
      config: this.config,
      logger: {
        info: (message, details) => console.info(message, details),
        warn: (message, details) => console.warn(message, details),
        error: (message, details) => console.error(message, details),
      },
      safeApi: {
        registerTaskStyleResolver: (resolver) => this.registerTaskStyleResolver(resolver),
        registerOverlay: (overlay) => this.registerOverlay(overlay),
        registerUiCommand: (command) => this.registerUiCommand(command),
        registerModule: (module) => this.registerModule(module),
        registerTaskEditResolver: (resolver) => this.registerTaskEditResolver(resolver),
        getSceneSnapshot: () => this.scene,
        getTask: (taskId) => this.getTask(taskId),
        getTasks: () => this.getTasks(),
        addTask: (input, options) => this.addTask(input, options),
        updateTask: (taskId, patch, options) => this.updateTask(taskId, patch, options),
        deleteTask: (taskId) => this.deleteTask(taskId),
        deleteTasks: (taskIds) => this.deleteTasks(taskIds),
        importTasks: (inputs, options) => this.importTasks(inputs, options),
        exportTasks: () => this.exportTasks(),
        getCameraSnapshot: () => this.camera,
        getInteractionState: () => this.getInteractionState(),
        setInteractionMode: (mode) => this.setInteractionMode(mode),
        logger: {
          info: (message, details) => console.info(message, details),
          warn: (message, details) => console.warn(message, details),
          error: (message, details) => console.error(message, details),
        },
      },
      advancedApi: {
        requestRender: () => this.requestRender(),
        getInternals: () => ({ index: this.getRenderIndex(), renderer: this.renderer, gl: this.gl }),
      },
    });
  }

  async initialize(): Promise<void> {
    const scene = await resolveScene(this.config.data);
    this.scene = scene;

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
    this.dependentsById = this.buildDependentsMap(this.scene.tasks);

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

  private buildDependentsMap(tasks: GanttTask[]): Map<string, GanttTask[]> {
    const dependentsById = new Map<string, GanttTask[]>();
    for (const task of tasks) {
      for (const dependencyId of task.dependencies ?? []) {
        const dependents = dependentsById.get(dependencyId);
        if (dependents) {
          dependents.push(task);
        } else {
          dependentsById.set(dependencyId, [task]);
        }
      }
    }
    return dependentsById;
  }

  private invalidateEffectiveScene(): void {
    this.effectiveScene = null;
    this.effectiveIndex = null;
  }

  private getRenderScene(): GanttScene {
    if (!this.activeEdit) {
      return this.scene;
    }

    if (!this.effectiveScene) {
      const draftTasks = this.activeEditBatch?.draftTasks ?? [this.activeEdit.draftTask];
      this.effectiveScene = replaceTasksInScene(this.scene, draftTasks);
    }

    return this.effectiveScene;
  }

  private getRenderIndex(): TaskIndex {
    if (!this.activeEdit) {
      return this.index;
    }

    if (!this.effectiveIndex) {
      const scene = this.getRenderScene();
      this.effectiveIndex = buildTaskIndex(scene.tasks, scene.rowLabels.length);
    }

    return this.effectiveIndex;
  }

  private hasTask(taskId: string | null, index: TaskIndex): boolean {
    return taskId !== null && index.byId.has(taskId);
  }

  private normalizeSelectedTaskIds(
    taskIds: readonly string[],
    index: TaskIndex,
    primaryTaskId: string | null = null,
  ): string[] {
    const nextTaskIds: string[] = [];
    const seen = new Set<string>();

    const appendTaskId = (taskId: string | null) => {
      if (!taskId || seen.has(taskId) || !index.byId.has(taskId)) {
        return;
      }

      seen.add(taskId);
      nextTaskIds.push(taskId);
    };

    appendTaskId(primaryTaskId);
    for (const taskId of taskIds) {
      appendTaskId(taskId);
    }

    return nextTaskIds;
  }

  private assignTaskSelection(taskIds: readonly string[], primaryTaskId: string | null = null): void {
    const index = this.getRenderIndex();
    this.selectedTaskIds = this.normalizeSelectedTaskIds(taskIds, index, primaryTaskId);
    this.selectedTasks = this.selectedTaskIds
      .map((taskId) => index.byId.get(taskId) ?? null)
      .filter((task): task is GanttTask => task !== null);
    this.selectedTask = this.selectedTasks[0] ?? null;
    this.selectedTaskId = this.selectedTask?.id ?? null;
    this.selectedDependency = null;
    this.selectedDependencyId = null;
  }

  private clearTaskSelection(): void {
    this.selectedTaskIds = [];
    this.selectedTasks = [];
    this.selectedTaskId = null;
    this.selectedTask = null;
  }

  private refreshSelectionReferences(): void {
    const index = this.getRenderIndex();
    this.selectedTaskIds = this.normalizeSelectedTaskIds(this.selectedTaskIds, index, this.selectedTaskId);
    this.selectedTasks = this.selectedTaskIds
      .map((taskId) => index.byId.get(taskId) ?? null)
      .filter((task): task is GanttTask => task !== null);
    this.selectedTask = this.selectedTasks[0] ?? null;
    this.selectedTaskId = this.selectedTask?.id ?? null;

    if (this.selectionPreviewTaskIds !== null) {
      this.selectionPreviewTaskIds = this.normalizeSelectedTaskIds(
        this.selectionPreviewTaskIds,
        index,
        this.selectionPreviewPrimaryTaskId,
      );
      this.selectionPreviewPrimaryTaskId = this.selectionPreviewTaskIds[0] ?? null;
    }

    if (this.hasTask(this.hoveredTaskId, index)) {
      this.hoveredTask = index.byId.get(this.hoveredTaskId as string) ?? null;
    } else {
      this.hoveredTaskId = null;
      this.hoveredTask = null;
    }

    if (this.selectedDependencyId) {
      this.selectedDependency = this.frame?.dependencyPaths.find((path) => path.id === this.selectedDependencyId) ?? null;
      if (!this.selectedDependency) {
        this.selectedDependencyId = null;
      }
    }

    if (this.hoveredDependencyId) {
      this.hoveredDependency = this.frame?.dependencyPaths.find((path) => path.id === this.hoveredDependencyId) ?? null;
      if (!this.hoveredDependency) {
        this.hoveredDependencyId = null;
      }
    }
  }

  private replaceCommittedScene(scene: GanttScene): void {
    this.scene = scene;
    this.index = buildTaskIndex(scene.tasks, scene.rowLabels.length);
    this.dependentsById = this.buildDependentsMap(scene.tasks);
    this.frame = null;
    this.invalidateEffectiveScene();
    this.refreshSelectionReferences();
  }

  private cloneTask(task: GanttTask): GanttTask {
    return cloneRuntimeTask(task);
  }

  private cloneActiveEdit(edit: GanttTaskEditState | null): GanttTaskEditState | null {
    if (!edit) {
      return null;
    }

    return {
      taskId: edit.taskId,
      operation: edit.operation,
      originalTask: this.cloneTask(edit.originalTask),
      draftTask: this.cloneTask(edit.draftTask),
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
    this.invalidateEffectiveScene();
    this.refreshSelectionReferences();
    this.requestRender();
  }

  private resolveTaskEditEvent(event: GanttTaskEditEvent): GanttTaskEditEvent | null {
    let nextTask = event.proposedTask;
    let resolved = createTaskEditEvent({
      operation: event.operation,
      originalTask: event.originalTask,
      proposedTask: nextTask,
      previousDraftTask: event.previousDraftTask,
      pointer: event.pointer,
      snap: event.snap,
    });

    for (let i = this.taskEditResolvers.length - 1; i >= 0; i -= 1) {
      const candidate = this.taskEditResolvers[i](resolved);
      if (candidate === false) {
        return null;
      }
      if (candidate) {
        nextTask = candidate;
        resolved = createTaskEditEvent({
          operation: event.operation,
          originalTask: event.originalTask,
          proposedTask: nextTask,
          previousDraftTask: resolved.previousDraftTask,
          pointer: event.pointer,
          snap: event.snap,
        });
      }
    }

    return resolved;
  }

  private resolveTaskEditEvents(events: GanttTaskEditEvent[]): GanttTaskEditEvent[] | null {
    const resolvedEvents: GanttTaskEditEvent[] = [];

    for (const event of events) {
      const resolved = this.resolveTaskEditEvent(event);
      if (!resolved) {
        return null;
      }
      resolvedEvents.push(resolved);
    }

    return resolvedEvents;
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

  private resolveTaskStyle(task: GanttTask, selected: boolean, hovered: boolean) {
    for (let i = this.taskStyleResolvers.length - 1; i >= 0; i -= 1) {
      const style = this.taskStyleResolvers[i]({ task, selected, hovered });
      if (style) {
        return style;
      }
    }

    return null;
  }

  private getRenderSelectedTaskIds(): string[] {
    return this.selectionPreviewTaskIds ?? this.selectedTaskIds;
  }

  private getRenderPrimarySelectedTaskId(): string | null {
    return this.selectionPreviewTaskIds !== null
      ? this.selectionPreviewPrimaryTaskId
      : this.selectedTaskId;
  }

  private async flushDrawQueue(): Promise<void> {
    if (this.drawing || this.disposed) {
      return;
    }

    this.drawing = true;

    while (this.renderRequested && !this.disposed) {
      this.renderRequested = false;
      await this.drawFrame();
    }

    this.drawing = false;
  }

  private async drawFrame(): Promise<void> {
    const start = performance.now();
    const scene = this.getRenderScene();
    const index = this.getRenderIndex();
    const renderSelectedTaskIds = this.getRenderSelectedTaskIds();
    const renderState: RenderState = {
      selectedTaskId: this.getRenderPrimarySelectedTaskId(),
      selectedTaskIds: renderSelectedTaskIds,
      hoveredTaskId: this.hoveredTaskId,
      selectedDependencyId: this.selectionPreviewTaskIds !== null ? null : this.selectedDependencyId,
      hoveredDependencyId: this.hoveredDependencyId,
      interactionMode: this.interactionMode,
      activeEdit: this.activeEdit
        ? {
            ...this.activeEdit,
            originalTasks: this.activeEditBatch?.originalTasks ?? [this.activeEdit.originalTask],
            draftTasks: this.activeEditBatch?.draftTasks ?? [this.activeEdit.draftTask],
          }
        : null,
      editAffordances: {
        enabled: this.config.edit.enabled,
        handleWidthPx: this.config.edit.resize.handleWidthPx,
        resizeEnabled: this.config.edit.resize.enabled,
      },
      taskStyleResolver: ({ task, selected, hovered }) => this.resolveTaskStyle(task, selected, hovered),
    };

    this.moduleManager.beforeFrame({ host: this });

    let frame = buildFrame(
      scene,
      index,
      this.camera,
      this.atlas,
      this.layout,
      renderState,
      this.config.render,
      this.config.font,
      this.config.display,
    );

    frame = await this.pluginRuntime.applyFrameHooks(frame);

    this.renderer.render(frame, this.camera, this.atlas, this.config.display);
    this.frame = frame;
    this.lastFrameMs = performance.now() - start;
    this.refreshSelectionReferences();

    this.moduleManager.afterFrame({ host: this }, frame);

    for (const overlay of this.overlays) {
      try {
        overlay({
          root: this.surface,
          frame,
          camera: this.camera,
        });
      } catch (error) {
        console.error('Overlay renderer failed', error);
      }
    }
  }

  private taskFromPointer(x: number, y: number): GanttTask | null {
    return pickSelectedTask(this.getRenderScene(), this.getRenderIndex(), this.camera, x, y, this.config.render);
  }

  private dependencyFromPointer(x: number, y: number): DependencyPath | null {
    if (!this.frame) {
      return null;
    }
    return pickDependencyAtPoint(this.frame, this.camera, x, y, 8);
  }

  private async setSelection(task: GanttTask | null, dependency: DependencyPath | null): Promise<void> {
    this.clearSelectionPreview();
    if (task) {
      this.assignTaskSelection([task.id], task.id);
    } else {
      this.clearTaskSelection();
    }
    this.selectedDependency = dependency;
    this.selectedDependencyId = dependency?.id ?? null;
    this.requestRender();

    await this.pluginRuntime.notifySelection(this.getSelection());
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
    return this.getRenderIndex();
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

  replaceScene(scene: GanttScene): void {
    this.applyCommittedSceneMutation(() => ({
      scene,
      result: undefined,
    }));
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
    if (!taskId) {
      void this.setSelection(null, null);
      return;
    }

    const task = this.getRenderIndex().byId.get(taskId) ?? null;
    void this.setSelection(task, null);
  }

  setSelectionByTaskIds(taskIds: string[], primaryTaskId?: string | null): void {
    this.clearSelectionPreview();
    this.assignTaskSelection(taskIds, primaryTaskId ?? taskIds[0] ?? null);
    this.requestRender();
    void this.pluginRuntime.notifySelection(this.getSelection());
  }

  setSelectionByScreenPoint(x: number, y: number): void {
    const task = this.taskFromPointer(x, y);
    const dependency = task ? null : this.dependencyFromPointer(x, y);
    void this.setSelection(task, dependency);
  }

  previewSelectionByTaskIds(taskIds: string[], primaryTaskId?: string | null): void {
    const nextTaskIds = this.normalizeSelectedTaskIds(
      taskIds,
      this.getRenderIndex(),
      primaryTaskId ?? taskIds[0] ?? null,
    );

    this.selectionPreviewTaskIds = nextTaskIds;
    this.selectionPreviewPrimaryTaskId = nextTaskIds[0] ?? null;
    this.requestRender();
  }

  clearSelectionPreview(): void {
    if (this.selectionPreviewTaskIds === null && this.selectionPreviewPrimaryTaskId === null) {
      return;
    }

    this.selectionPreviewTaskIds = null;
    this.selectionPreviewPrimaryTaskId = null;
    this.requestRender();
  }

  setInteractionMode(mode: GanttInteractionMode): void {
    const nextMode = mode === 'edit' && !this.config.edit.enabled ? 'view' : mode;
    if (nextMode === this.interactionMode) {
      return;
    }

    if (this.activeEdit?.status === 'preview' && nextMode !== 'edit') {
      this.cancelActiveEdit();
    }

    this.interactionMode = nextMode;
    this.canvas.dataset.mode = this.interactionMode;
    if (nextMode !== 'select') {
      this.clearSelectionPreview();
    }
    this.requestRender();
    this.pluginRuntime.notifyEditModeChange(this.interactionMode);
  }

  cancelActiveEdit(): void {
    if (!this.activeEdit || this.activeEdit.status !== 'preview') {
      return;
    }

    const events = this.activeEditBatch?.events ?? (this.lastTaskEditEvent ? [this.lastTaskEditEvent] : []);
    this.updateActiveEdit(null, null, null);
    for (const event of events) {
      this.fireEditCancel(event);
    }
  }

  previewTaskEdit(event: GanttTaskEditEvent): GanttTaskEditEvent | null {
    const resolvedEvents = this.previewTaskEdits([event]);
    return resolvedEvents?.[0] ?? null;
  }

  previewTaskEdits(events: GanttTaskEditEvent[]): GanttTaskEditEvent[] | null {
    if (!this.config.edit.enabled || this.activeEdit?.status === 'committing') {
      return null;
    }

    if (events.length === 0) {
      return null;
    }

    const resolvedEvents = this.resolveTaskEditEvents(events);
    if (!resolvedEvents) {
      return null;
    }

    const primaryTaskId = events[0]?.taskId ?? resolvedEvents[0]?.taskId ?? null;
    const primaryEvent = resolvedEvents.find((candidate) => candidate.taskId === primaryTaskId) ?? resolvedEvents[0];
    if (!primaryEvent) {
      return null;
    }

    const isStarting = !this.activeEdit;
    const nextEdit: GanttTaskEditState = {
      taskId: primaryEvent.taskId,
      operation: primaryEvent.operation,
      originalTask: this.cloneTask(primaryEvent.originalTask),
      draftTask: this.cloneTask(primaryEvent.proposedTask),
      status: 'preview',
    };
    const batch: ActiveEditBatchState = {
      primaryTaskId: primaryEvent.taskId,
      events: resolvedEvents.map((candidate) => createTaskEditEvent({
        operation: candidate.operation,
        originalTask: candidate.originalTask,
        proposedTask: candidate.proposedTask,
        previousDraftTask: candidate.previousDraftTask,
        pointer: candidate.pointer,
        snap: candidate.snap,
      })),
      originalTasks: resolvedEvents.map((candidate) => this.cloneTask(candidate.originalTask)),
      draftTasks: resolvedEvents.map((candidate) => this.cloneTask(candidate.proposedTask)),
    };

    this.clearSelectionPreview();
    this.selectedTaskIds = resolvedEvents.map((candidate) => candidate.taskId);
    this.selectedTaskId = primaryEvent.taskId;
    this.selectedDependency = null;
    this.selectedDependencyId = null;
    this.updateActiveEdit(nextEdit, primaryEvent, batch);

    if (isStarting) {
      for (const resolvedEvent of resolvedEvents) {
        this.fireEditStart(resolvedEvent);
      }
    }
    for (const resolvedEvent of resolvedEvents) {
      this.fireEditPreview(resolvedEvent);
    }
    return resolvedEvents;
  }

  async commitActiveEdit(event?: GanttTaskEditEvent | null): Promise<boolean> {
    return this.commitTaskEdits(event ? [event] : null);
  }

  async commitTaskEdits(events?: GanttTaskEditEvent[] | null): Promise<boolean> {
    const activeEdit = this.activeEdit;
    const commitEvents = events ?? this.activeEditBatch?.events ?? (this.lastTaskEditEvent ? [this.lastTaskEditEvent] : null);
    if (!activeEdit || !commitEvents || commitEvents.length === 0) {
      return false;
    }

    const resolvedEvents = this.resolveTaskEditEvents(commitEvents);
    if (!resolvedEvents) {
      this.updateActiveEdit(null, null, null);
      for (const commitEvent of commitEvents) {
        this.fireEditCancel(commitEvent);
      }
      return false;
    }
    const primaryEvent = resolvedEvents.find((candidate) => candidate.taskId === activeEdit.taskId) ?? resolvedEvents[0];
    if (!primaryEvent) {
      return false;
    }

    this.activeEdit = {
      taskId: primaryEvent.taskId,
      operation: primaryEvent.operation,
      originalTask: this.cloneTask(primaryEvent.originalTask),
      draftTask: this.cloneTask(primaryEvent.proposedTask),
      status: 'committing',
    };
    this.activeEditBatch = {
      primaryTaskId: primaryEvent.taskId,
      events: resolvedEvents.map((candidate) => createTaskEditEvent({
        operation: candidate.operation,
        originalTask: candidate.originalTask,
        proposedTask: candidate.proposedTask,
        previousDraftTask: candidate.previousDraftTask,
        pointer: candidate.pointer,
        snap: candidate.snap,
      })),
      originalTasks: resolvedEvents.map((candidate) => this.cloneTask(candidate.originalTask)),
      draftTasks: resolvedEvents.map((candidate) => this.cloneTask(candidate.proposedTask)),
    };
    this.lastTaskEditEvent = primaryEvent;
    this.invalidateEffectiveScene();
    this.requestRender();
    for (const resolvedEvent of resolvedEvents) {
      this.pluginRuntime.notifyTaskEditCommit(resolvedEvent);
    }

    try {
      const appliedTasks: GanttTask[] = [];
      for (const resolvedEvent of resolvedEvents) {
        const result = this.config.edit.callbacks.onTaskEditCommit
          ? await this.config.edit.callbacks.onTaskEditCommit(resolvedEvent)
          : resolvedEvent.proposedTask;
        if (result === false) {
          this.updateActiveEdit(null, null, null);
          for (const cancelEvent of resolvedEvents) {
            this.fireEditCancel(cancelEvent);
          }
          return false;
        }

        appliedTasks.push(this.cloneTask({
          ...result,
          id: resolvedEvent.taskId,
        }));
      }

      this.replaceCommittedScene(replaceTasksInScene(this.scene, appliedTasks));
      this.assignTaskSelection(appliedTasks.map((task) => task.id), primaryEvent.taskId);
      this.updateActiveEdit(null, null, null);
      return true;
    } catch {
      this.updateActiveEdit(null, null, null);
      for (const cancelEvent of resolvedEvents) {
        this.fireEditCancel(cancelEvent);
      }
      return false;
    }
  }

  updateHoverFromScreen(x: number, y: number): void {
    const nextTask = this.taskFromPointer(x, y);
    const nextDependency = nextTask ? null : this.dependencyFromPointer(x, y);
    const nextHoverId = nextTask?.id ?? null;
    const nextDependencyId = nextDependency?.id ?? null;

    if (nextHoverId === this.hoveredTaskId && nextDependencyId === this.hoveredDependencyId) {
      return;
    }

    this.hoveredTask = nextTask;
    this.hoveredTaskId = nextHoverId;
    this.hoveredDependency = nextDependency;
    this.hoveredDependencyId = nextDependencyId;
    this.requestRender();
  }

  pickTaskAtScreen(x: number, y: number): GanttTask | null {
    return this.taskFromPointer(x, y);
  }

  pickTasksInScreenRect(x0: number, y0: number, x1: number, y1: number): GanttTask[] {
    return pickTasksInScreenRectCore(
      this.getRenderScene(),
      this.getRenderIndex(),
      this.camera,
      x0,
      y0,
      x1,
      y1,
      {
        rowPitch: this.config.render.rowPitch,
        barHeight: this.config.render.barHeight,
      },
    );
  }

  pickDependencyAtScreen(x: number, y: number): DependencyPath | null {
    return this.dependencyFromPointer(x, y);
  }

  stopCameraAnimation(): void {
    if (this.cameraAnimationFrame !== 0) {
      cancelAnimationFrame(this.cameraAnimationFrame);
      this.cameraAnimationFrame = 0;
    }
  }

  syncCanvasSize(): void {
    const rect = this.surface.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.camera = resizeCamera(this.camera, width, height);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.requestRender();
  }

  panByScreenDelta(dx: number, dy: number): void {
    this.camera = panCamera(this.camera, dx, dy);
    this.requestRender();
  }

  zoomAt(zoomFactor: number, anchorX: number, anchorY: number): void {
    this.camera = zoomCameraAt(this.camera, zoomFactor, anchorX, anchorY);
    this.requestRender();
  }

  resetCamera(): void {
    this.stopCameraAnimation();
    this.camera = createHostCameraState(
      this.camera.viewportWidth,
      this.camera.viewportHeight,
      this.config.render.headerHeight,
      this.scene.timelineStart,
      this.scene.tasks.length > 0,
    );
    this.requestRender();
  }

  animateToZoomPresetId(presetId: string): void {
    const preset = ZOOM_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) {
      return;
    }

    this.stopCameraAnimation();
    const startZoomX = this.camera.zoomX;
    const targetZoomX = this.camera.viewportWidth / preset.visibleDays;
    const anchorX = this.camera.viewportWidth * 0.5;
    const anchorY = this.camera.viewportHeight * 0.5;
    const startedAt = performance.now();
    const durationMs = 220;

    const tick = (now: number) => {
      const t = clamp((now - startedAt) / durationMs, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const desiredZoomX = startZoomX + (targetZoomX - startZoomX) * eased;
      const zoomFactor = desiredZoomX / this.camera.zoomX;
      this.camera = zoomCameraAt(this.camera, zoomFactor, anchorX, anchorY);
      this.requestRender();

      if (t < 1) {
        this.cameraAnimationFrame = requestAnimationFrame(tick);
      } else {
        this.cameraAnimationFrame = 0;
      }
    };

    this.cameraAnimationFrame = requestAnimationFrame(tick);
  }

  animateCameraToTask(task: GanttTask): void {
    this.stopCameraAnimation();
    const focusTasks = collectFocusTasks(task, this.index.byId, this.dependentsById);
    const focusRects = focusTasks.map((focusTask) => taskWorldRect(focusTask, this.config.render.rowPitch, this.config.render.barHeight));
    const minX = Math.min(...focusRects.map((rect) => rect.x));
    const maxX = Math.max(...focusRects.map((rect) => rect.x + rect.w));
    const minY = Math.min(...focusRects.map((rect) => rect.y));
    const maxY = Math.max(...focusRects.map((rect) => rect.y + rect.h));
    const boundsWidth = Math.max(1, maxX - minX);
    const horizontalMarginPx = Math.min(220, Math.max(72, this.camera.viewportWidth * 0.14));
    const availableWidthPx = Math.max(120, this.camera.viewportWidth - horizontalMarginPx * 2);
    const targetZoomX = resolvePresetZoomX(boundsWidth, availableWidthPx);
    const bodyCenterScreenX = this.camera.viewportWidth * 0.5;
    const bodyCenterScreenY = this.config.render.headerHeight + Math.max(0, this.camera.viewportHeight - this.config.render.headerHeight) * 0.5;
    const startCamera = { ...this.camera };
    const targetCenterX = minX + boundsWidth * 0.5;
    const targetCenterY = minY + (maxY - minY) * 0.5;
    const [startTaskScreenX, startTaskScreenY] = worldToScreen(this.camera, targetCenterX, targetCenterY);
    const zoomedCamera = zoomCameraAt(
      this.camera,
      targetZoomX / this.camera.zoomX,
      bodyCenterScreenX,
      bodyCenterScreenY,
    );
    const startedAt = performance.now();
    const travelPx = Math.hypot(
      bodyCenterScreenX - startTaskScreenX,
      bodyCenterScreenY - startTaskScreenY,
    );
    const zoomChange = Math.abs(Math.log(Math.max(0.001, zoomedCamera.zoomX / Math.max(0.001, startCamera.zoomX))));
    const durationMs = clamp(220 + travelPx * 0.18 + zoomChange * 140, 220, 560);

    const tick = (now: number) => {
      const t = clamp((now - startedAt) / durationMs, 0, 1);
      const eased = easeInOutCubic(t);
      const zoomX = startCamera.zoomX + (zoomedCamera.zoomX - startCamera.zoomX) * eased;
      const zoomY = startCamera.zoomY + (zoomedCamera.zoomY - startCamera.zoomY) * eased;
      const taskScreenX = startTaskScreenX + (bodyCenterScreenX - startTaskScreenX) * eased;
      const taskScreenY = startTaskScreenY + (bodyCenterScreenY - startTaskScreenY) * eased;
      this.camera = {
        ...this.camera,
        zoomX,
        zoomY,
        scrollX: targetCenterX - taskScreenX / zoomX,
        scrollY: targetCenterY - taskScreenY / zoomY,
      };
      this.requestRender();

      if (t < 1) {
        this.cameraAnimationFrame = requestAnimationFrame(tick);
      } else {
        this.cameraAnimationFrame = 0;
      }
    };

    this.cameraAnimationFrame = requestAnimationFrame(tick);
  }

  getZoomPresetIdForVisibleWindow(): string | null {
    const visibleWindow = computeVisibleTimeWindow(this.camera, 0);
    const visibleDays = Math.max(1, visibleWindow.end - visibleWindow.start);
    return findClosestZoomPreset(visibleDays);
  }

  getZoomPresets(): Array<{ id: string; label: string; visibleDays: number }> {
    return ZOOM_PRESETS;
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.stopCameraAnimation();

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
