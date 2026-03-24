import {
  buildFrame,
  buildTaskIndex,
  computeVisibleTimeWindow,
  createCamera,
  panCamera,
  pickDependencyAtPoint,
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
import { createFallbackFontAtlas, loadMsdfFontAtlas, TextLayoutEngine, type FontAtlas } from './font';
import { ModuleManager } from './module-manager';
import { PluginRuntime } from './plugin-runtime';
import { GanttRenderer } from './render';
import type {
  GanttConfig,
  GanttHostController,
  GanttModule,
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
    toolbar.innerHTML = ZOOM_PRESETS.map((preset) => (
      `<button type="button" class="zoom-button" data-zoom-preset="${preset.id}">${preset.label}</button>`
    )).join('');
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
  private readonly config: NormalizedGanttConfig;
  private atlas: FontAtlas;
  private readonly layout: TextLayoutEngine;
  private readonly gl: WebGL2RenderingContext;
  private readonly renderer: GanttRenderer;
  private camera: CameraState;
  private selectedTaskId: string | null = null;
  private hoveredTaskId: string | null = null;
  private selectedDependencyId: string | null = null;
  private hoveredDependencyId: string | null = null;
  private selectedTask: GanttTask | null = null;
  private hoveredTask: GanttTask | null = null;
  private selectedDependency: DependencyPath | null = null;
  private hoveredDependency: DependencyPath | null = null;
  private frame: FrameScene | null = null;
  private lastFrameMs = 0;
  private cameraAnimationFrame = 0;
  private readonly moduleManager = new ModuleManager();
  private readonly cleanupCallbacks: Array<() => void> = [];
  private readonly taskStyleResolvers: TaskStyleResolver[] = [];
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
        getSceneSnapshot: () => this.scene,
        getCameraSnapshot: () => this.camera,
        logger: {
          info: (message, details) => console.info(message, details),
          warn: (message, details) => console.warn(message, details),
          error: (message, details) => console.error(message, details),
        },
      },
      advancedApi: {
        requestRender: () => this.requestRender(),
        getInternals: () => ({ index: this.index, renderer: this.renderer, gl: this.gl }),
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

    this.index = buildTaskIndex(this.scene.tasks);
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

  private resolveTaskStyle(task: GanttTask, selected: boolean, hovered: boolean) {
    for (let i = this.taskStyleResolvers.length - 1; i >= 0; i -= 1) {
      const style = this.taskStyleResolvers[i]({ task, selected, hovered });
      if (style) {
        return style;
      }
    }

    return null;
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
    const renderState: RenderState = {
      selectedTaskId: this.selectedTaskId,
      hoveredTaskId: this.hoveredTaskId,
      selectedDependencyId: this.selectedDependencyId,
      hoveredDependencyId: this.hoveredDependencyId,
      taskStyleResolver: ({ task, selected, hovered }) => this.resolveTaskStyle(task, selected, hovered),
    };

    this.moduleManager.beforeFrame({ host: this });

    let frame = buildFrame(
      this.scene,
      this.index,
      this.camera,
      this.atlas,
      this.layout,
      renderState,
      this.config.render,
    );

    frame = await this.pluginRuntime.applyFrameHooks(frame);

    this.renderer.render(frame, this.camera, this.atlas);
    this.frame = frame;
    this.lastFrameMs = performance.now() - start;

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
    return pickSelectedTask(this.scene, this.index, this.camera, x, y, this.config.render);
  }

  private dependencyFromPointer(x: number, y: number): DependencyPath | null {
    if (!this.frame) {
      return null;
    }
    return pickDependencyAtPoint(this.frame, this.camera, x, y, 8);
  }

  private async setSelection(task: GanttTask | null, dependency: DependencyPath | null): Promise<void> {
    this.selectedTask = task;
    this.selectedTaskId = task?.id ?? null;
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
    return this.index;
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

  getSelection(): PluginSelectionState {
    return {
      selectedTask: this.selectedTask,
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

    const task = this.index.byId.get(taskId) ?? null;
    void this.setSelection(task, null);
  }

  setSelectionByScreenPoint(x: number, y: number): void {
    const task = this.taskFromPointer(x, y);
    const dependency = task ? null : this.dependencyFromPointer(x, y);
    void this.setSelection(task, dependency);
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
