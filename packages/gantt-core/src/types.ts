import type {
  CameraState,
  ViewWindow,
  FrameOptions,
  GanttDisplayConfig,
  FrameScene,
  GanttScene,
  GanttTask,
  NormalizedGanttDisplayConfig,
  TaskIndex,
  DependencyPath,
} from './core';
import type { SampleOptions } from './data';

export const GANTT_PLUGIN_API_VERSION = '1.0.0';

export type TaskStyleOverride = {
  fill?: [number, number, number, number];
  emphasis?: number;
};

export type TaskStyleResolver = (input: {
  task: GanttTask;
  selected: boolean;
  hovered: boolean;
}) => TaskStyleOverride | null | undefined;

export type OverlayRenderer = (input: {
  root: HTMLElement;
  frame: FrameScene;
  camera: CameraState;
}) => void;

export type UiCommand = {
  id: string;
  label?: string;
  run: () => void;
};

export type GanttPluginCapability = 'advanced-api';

export type GanttPluginMeta = {
  id: string;
  version: string;
  apiRange: string;
  capabilities?: GanttPluginCapability[];
};

export type PluginSelectionState = {
  selectedTask: GanttTask | null;
  hoveredTask: GanttTask | null;
  selectedDependency: DependencyPath | null;
  hoveredDependency: DependencyPath | null;
};

export type GanttPluginInstance = {
  onInit?: () => void | Promise<void>;
  onSceneBuild?: (scene: GanttScene) => void | GanttScene | Promise<void | GanttScene>;
  onFrameBuild?: (frame: FrameScene) => void | FrameScene | Promise<void | FrameScene>;
  onSelectionChange?: (selection: PluginSelectionState) => void | Promise<void>;
  onDispose?: () => void | Promise<void>;
};

export type GanttAdvancedApi = {
  requestRender: () => void;
  getInternals: () => {
    index: TaskIndex;
    renderer: unknown;
    gl: WebGL2RenderingContext;
  };
};

export type GanttSafeApi = {
  registerTaskStyleResolver: (resolver: TaskStyleResolver) => () => void;
  registerOverlay: (overlay: OverlayRenderer) => () => void;
  registerUiCommand: (command: UiCommand) => () => void;
  registerModule: (module: GanttModule) => () => void;
  getSceneSnapshot: () => Readonly<GanttScene>;
  getCameraSnapshot: () => Readonly<CameraState>;
  logger: {
    info: (message: string, details?: unknown) => void;
    warn: (message: string, details?: unknown) => void;
    error: (message: string, details?: unknown) => void;
  };
};

export type GanttPluginContext = {
  safe: GanttSafeApi;
  advanced?: GanttAdvancedApi;
  pluginConfig: PluginConfig;
};

export type GanttPlugin = {
  meta: GanttPluginMeta;
  create: (context: GanttPluginContext) => GanttPluginInstance | Promise<GanttPluginInstance>;
};

export type PluginSourceEsm = {
  type: 'esm';
  url: string;
  exportName?: string;
};

export type PluginSourceUmd = {
  type: 'umd';
  url: string;
  global: string;
};

export type PluginSourceConfig = PluginSourceEsm | PluginSourceUmd;

export type PluginConfig = {
  source: PluginSourceConfig;
  enabled?: boolean;
  allowAdvanced?: boolean;
  idHint?: string;
  options?: Record<string, unknown>;
};

export type PluginSecurityPolicy = {
  canLoadSource?: (source: PluginSourceConfig) => boolean;
};

export type DataConfig =
  | { type: 'sample'; options?: SampleOptions }
  | { type: 'static'; scene: GanttScene }
  | { type: 'factory'; create: () => GanttScene | Promise<GanttScene> };

export type UiConfig = {
  showHud?: boolean;
  showInspector?: boolean;
  showToolbar?: boolean;
  showStatusLine?: boolean;
  statusText?: string;
  title?: string;
};

export type GanttContainerDimension = number | string;

export type GanttContainerRegionConfig = {
  visible?: boolean;
  height?: number;
};

export type GanttContainerToolbarConfig = {
  position?: 'top' | 'bottom';
  height?: number;
};

export type GanttContainerConfig = {
  width?: GanttContainerDimension;
  height?: GanttContainerDimension;
  minWidth?: GanttContainerDimension;
  minHeight?: GanttContainerDimension;
  maxWidth?: GanttContainerDimension;
  maxHeight?: GanttContainerDimension;
  header?: GanttContainerRegionConfig;
  footer?: GanttContainerRegionConfig;
  toolbar?: GanttContainerToolbarConfig;
};

export type GanttModuleContext = {
  host: GanttHostController;
};

export type GanttModule = {
  id: string;
  onInit?: (context: GanttModuleContext) => void | Promise<void>;
  onBeforeFrame?: (context: GanttModuleContext) => void;
  onAfterFrame?: (context: GanttModuleContext, frame: FrameScene) => void;
  onDispose?: (context: GanttModuleContext) => void | Promise<void>;
};

export type ModulesConfig = {
  builtins?: Array<'camera-controls' | 'selection' | 'hud-inspector' | 'toolbar'>;
};

export type GanttFeatureFlags = {
  allowAdvancedPlugins?: boolean;
};

export type GanttFontWeight = number | `${number}` | 'regular' | 'medium' | 'semibold' | 'bold';

export type GanttFontConfig = {
  family?: string;
  sizePx?: number;
  weight?: GanttFontWeight;
  msdfManifestUrl?: string;
  msdfManifestUrls?: Record<string, string>;
};

export type GanttConfig = {
  data?: DataConfig;
  render?: Partial<FrameOptions>;
  display?: GanttDisplayConfig;
  ui?: UiConfig;
  container?: GanttContainerConfig;
  font?: GanttFontConfig;
  plugins?: PluginConfig[];
  modules?: ModulesConfig;
  features?: GanttFeatureFlags;
  pluginSecurity?: PluginSecurityPolicy;
};

export type NormalizedGanttContainerConfig = {
  width?: GanttContainerDimension;
  height?: GanttContainerDimension;
  minWidth?: GanttContainerDimension;
  minHeight?: GanttContainerDimension;
  maxWidth?: GanttContainerDimension;
  maxHeight?: GanttContainerDimension;
  header: Required<GanttContainerRegionConfig>;
  footer: Required<GanttContainerRegionConfig>;
  toolbar: Required<GanttContainerToolbarConfig>;
};

export type NormalizedGanttConfig = {
  data: DataConfig;
  render: FrameOptions;
  display: NormalizedGanttDisplayConfig;
  ui: Required<UiConfig>;
  container: NormalizedGanttContainerConfig;
  font: GanttFontConfig;
  plugins: PluginConfig[];
  modules: { builtins: Array<'camera-controls' | 'selection' | 'hud-inspector' | 'toolbar'> };
  features: Required<GanttFeatureFlags>;
  pluginSecurity: PluginSecurityPolicy;
};

export type GanttHostController = {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  hud: HTMLDivElement | null;
  inspector: HTMLDivElement | null;
  toolbar: HTMLDivElement | null;
  statusLine: HTMLDivElement | null;
  getScene: () => GanttScene;
  getCamera: () => CameraState;
  getIndex: () => TaskIndex;
  getRenderer: () => unknown;
  getGl: () => WebGL2RenderingContext;
  getCurrentFrame: () => FrameScene | null;
  getLastFrameMs: () => number;
  getVisibleWindow: () => ViewWindow;
  requestRender: () => void;
  setStatusText: (text: string) => void;
  registerCleanup: (callback: () => void) => void;
  getSelection: () => PluginSelectionState;
  setSelectionByTaskId: (taskId: string | null) => void;
  setSelectionByScreenPoint: (x: number, y: number) => void;
  updateHoverFromScreen: (x: number, y: number) => void;
  pickTaskAtScreen: (x: number, y: number) => GanttTask | null;
  pickDependencyAtScreen: (x: number, y: number) => DependencyPath | null;
  stopCameraAnimation: () => void;
  syncCanvasSize: () => void;
  panByScreenDelta: (dx: number, dy: number) => void;
  zoomAt: (zoomFactor: number, anchorX: number, anchorY: number) => void;
  resetCamera: () => void;
  animateToZoomPresetId: (presetId: string) => void;
  animateCameraToTask: (task: GanttTask) => void;
  getZoomPresetIdForVisibleWindow: () => string | null;
  getZoomPresets: () => Array<{ id: string; label: string; visibleDays: number }>;
};

export type LoadedPlugin = {
  definition: GanttPlugin;
  config: PluginConfig;
};

export type PluginLoadError = {
  pluginHint: string;
  source: PluginSourceConfig;
  error: unknown;
};
