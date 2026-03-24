import {
  DEFAULT_DISPLAY_OPTIONS,
  type FrameOptions,
  type GanttColor,
  type GanttColorInput,
  type GanttDisplayConfig,
  type NormalizedGanttDisplayConfig,
} from './core';
import { createSampleScene } from './data';
import type {
  GanttConfig,
  GanttEditCallbacks,
  GanttFontConfig,
  NormalizedGanttConfig,
  NormalizedGanttEditConfig,
  UiConfig,
  DataConfig,
  ModulesConfig,
  GanttFeatureFlags,
  PluginConfig,
  PluginSecurityPolicy,
  GanttContainerConfig,
  NormalizedGanttContainerConfig,
} from './types';

export const DEFAULT_STATUS_TEXT =
  'Use Day/Week/Month/Quarter/Year to snap scale. Drag in view mode to pan, drag in select mode to marquee-select, and drag in edit mode to move the current selection or resize a single task. Wheel to scroll. Ctrl + wheel zooms time around the cursor. Press V, S, or E to switch modes when enabled.';

export const DEFAULT_UI_CONFIG: Required<UiConfig> = {
  showHud: true,
  showInspector: true,
  showToolbar: true,
  showStatusLine: true,
  statusText: DEFAULT_STATUS_TEXT,
  title: 'WebGL2 Gantt',
};

export const DEFAULT_RENDER_OPTIONS: FrameOptions = {
  rowPitch: 28,
  barHeight: 14,
  milestoneSize: 10,
  headerHeight: 36,
  rowPadding: 6,
  labelPadding: 6,
  gridPadding: 0,
  overscanRows: 3,
  overscanPx: 180,
  renderSelectedDependencies: true,
};

export const DEFAULT_DATA_CONFIG: DataConfig = {
  type: 'sample',
  options: {},
};

export const DEFAULT_MODULES_CONFIG: { builtins: Array<'camera-controls' | 'selection' | 'hud-inspector' | 'toolbar'> } = {
  builtins: ['camera-controls', 'selection', 'hud-inspector', 'toolbar'],
};

export const DEFAULT_FEATURES: Required<GanttFeatureFlags> = {
  allowAdvancedPlugins: false,
};

export const DEFAULT_PLUGIN_SECURITY_POLICY: PluginSecurityPolicy = {};
export const DEFAULT_FONT_CONFIG: GanttFontConfig = {
  family: undefined,
  sizePx: 12,
  weight: 600,
  msdfManifestUrl: undefined,
  msdfManifestUrls: undefined,
};
export const DEFAULT_EDIT_CALLBACKS: GanttEditCallbacks = {};
export const DEFAULT_EDIT_CONFIG: NormalizedGanttEditConfig = {
  enabled: false,
  defaultMode: 'view',
  drag: {
    allowRowChange: true,
  },
  resize: {
    enabled: true,
    handleWidthPx: 12,
    minDurationDays: 1,
  },
  snap: {
    mode: 'day',
    incrementDays: 1,
  },
  callbacks: DEFAULT_EDIT_CALLBACKS,
};

export const DEFAULT_CONTAINER_CONFIG: NormalizedGanttContainerConfig = {
  width: undefined,
  height: undefined,
  minWidth: undefined,
  minHeight: undefined,
  maxWidth: undefined,
  maxHeight: undefined,
  header: {
    visible: false,
    height: 56,
  },
  footer: {
    visible: false,
    height: 56,
  },
  toolbar: {
    position: 'top',
    height: 56,
  },
};

function cloneColor(color: GanttColor): GanttColor {
  return [color[0], color[1], color[2], color[3]];
}

function clonePalette(palette: GanttColor[]): GanttColor[] {
  return palette.map((color) => cloneColor(color));
}

function normalizeRgbComponent(value: number): number {
  return value > 1 ? value / 255 : value;
}

function normalizeAlphaComponent(value: number): number {
  return value > 1 ? value / 255 : value;
}

function clampColorComponent(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(input: string): GanttColor | null {
  const hex = input.trim().replace(/^#/, '');
  if (![3, 4, 6, 8].includes(hex.length)) {
    return null;
  }

  const expanded = hex.length <= 4
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  const hasAlpha = expanded.length === 8;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  const a = hasAlpha ? Number.parseInt(expanded.slice(6, 8), 16) : 255;

  if ([r, g, b, a].some((value) => Number.isNaN(value))) {
    return null;
  }

  return [r / 255, g / 255, b / 255, a / 255];
}

function parseRgbColor(input: string): GanttColor | null {
  const match = input.trim().match(/^rgba?\((.+)\)$/i);
  if (!match) {
    return null;
  }

  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.length > 4 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return [
    clampColorComponent(normalizeRgbComponent(parts[0])),
    clampColorComponent(normalizeRgbComponent(parts[1])),
    clampColorComponent(normalizeRgbComponent(parts[2])),
    clampColorComponent(normalizeAlphaComponent(parts[3] ?? 1)),
  ];
}

function normalizeColorInput(input: GanttColorInput | undefined, fallback: GanttColor): GanttColor {
  if (input === undefined) {
    return cloneColor(fallback);
  }

  if (Array.isArray(input)) {
    if (input.length === 3) {
      return [
        clampColorComponent(normalizeRgbComponent(input[0])),
        clampColorComponent(normalizeRgbComponent(input[1])),
        clampColorComponent(normalizeRgbComponent(input[2])),
        1,
      ];
    }

    return [
      clampColorComponent(normalizeRgbComponent(input[0])),
      clampColorComponent(normalizeRgbComponent(input[1])),
      clampColorComponent(normalizeRgbComponent(input[2])),
      clampColorComponent(normalizeAlphaComponent(input[3])),
    ];
  }

  const parsed = parseHexColor(input) ?? parseRgbColor(input);
  if (!parsed) {
    throw new Error(`Unsupported color value: ${input}`);
  }
  return parsed;
}

function mergeDisplayConfig(display: GanttDisplayConfig | undefined): NormalizedGanttDisplayConfig {
  const defaults = DEFAULT_DISPLAY_OPTIONS;
  return {
    canvasBackground: normalizeColorInput(display?.canvasBackground, defaults.canvasBackground),
    rows: {
      evenFill: normalizeColorInput(display?.rows?.evenFill, defaults.rows.evenFill),
      oddFill: normalizeColorInput(display?.rows?.oddFill, defaults.rows.oddFill),
      separatorColor: normalizeColorInput(display?.rows?.separatorColor, defaults.rows.separatorColor),
      separatorThickness: display?.rows?.separatorThickness ?? defaults.rows.separatorThickness,
      separatorStyle: display?.rows?.separatorStyle ?? defaults.rows.separatorStyle,
      separatorDashPx: display?.rows?.separatorDashPx ?? defaults.rows.separatorDashPx,
      separatorGapPx: display?.rows?.separatorGapPx ?? defaults.rows.separatorGapPx,
    },
    grid: {
      color: normalizeColorInput(display?.grid?.color, defaults.grid.color),
      thickness: display?.grid?.thickness ?? defaults.grid.thickness,
      style: display?.grid?.style ?? defaults.grid.style,
      dashPx: display?.grid?.dashPx ?? defaults.grid.dashPx,
      gapPx: display?.grid?.gapPx ?? defaults.grid.gapPx,
    },
    tasks: {
      palette: display?.tasks?.palette
        ? display.tasks.palette.map((color) => normalizeColorInput(color, defaults.tasks.palette[0]))
        : clonePalette(defaults.tasks.palette),
      defaultFill: display?.tasks?.defaultFill === undefined
        ? defaults.tasks.defaultFill ? cloneColor(defaults.tasks.defaultFill) : null
        : normalizeColorInput(display.tasks.defaultFill, defaults.tasks.palette[0]),
      barRadiusPx: display?.tasks?.barRadiusPx ?? defaults.tasks.barRadiusPx,
      textColor: normalizeColorInput(display?.tasks?.textColor, defaults.tasks.textColor),
      textShadowColor: normalizeColorInput(display?.tasks?.textShadowColor, defaults.tasks.textShadowColor),
      selectedOpacity: display?.tasks?.selectedOpacity ?? defaults.tasks.selectedOpacity,
      hoveredOpacity: display?.tasks?.hoveredOpacity ?? defaults.tasks.hoveredOpacity,
      idleOpacity: display?.tasks?.idleOpacity ?? defaults.tasks.idleOpacity,
      selectedBoost: display?.tasks?.selectedBoost ?? defaults.tasks.selectedBoost,
      hoveredBoost: display?.tasks?.hoveredBoost ?? defaults.tasks.hoveredBoost,
    },
    header: {
      backgroundColor: normalizeColorInput(display?.header?.backgroundColor, defaults.header.backgroundColor),
      borderColor: normalizeColorInput(display?.header?.borderColor, defaults.header.borderColor),
      tickColor: normalizeColorInput(display?.header?.tickColor, defaults.header.tickColor),
      tickHeightPx: display?.header?.tickHeightPx ?? defaults.header.tickHeightPx,
      textColor: normalizeColorInput(display?.header?.textColor, defaults.header.textColor),
      textSizePx: display?.header?.textSizePx ?? defaults.header.textSizePx,
    },
    dependencies: {
      color: normalizeColorInput(display?.dependencies?.color, defaults.dependencies.color),
      selectedColor: display?.dependencies?.selectedColor === undefined
        ? defaults.dependencies.selectedColor ? cloneColor(defaults.dependencies.selectedColor) : null
        : normalizeColorInput(display.dependencies.selectedColor, defaults.dependencies.color),
      hoveredColor: display?.dependencies?.hoveredColor === undefined
        ? defaults.dependencies.hoveredColor ? cloneColor(defaults.dependencies.hoveredColor) : null
        : normalizeColorInput(display.dependencies.hoveredColor, defaults.dependencies.color),
      thickness: display?.dependencies?.thickness ?? defaults.dependencies.thickness,
      selectedThickness: display?.dependencies?.selectedThickness ?? defaults.dependencies.selectedThickness,
      hoveredThickness: display?.dependencies?.hoveredThickness ?? defaults.dependencies.hoveredThickness,
      cornerRadiusPx: display?.dependencies?.cornerRadiusPx ?? defaults.dependencies.cornerRadiusPx,
      verticalOffsetPx: display?.dependencies?.verticalOffsetPx ?? defaults.dependencies.verticalOffsetPx,
      arrowLengthPx: display?.dependencies?.arrowLengthPx ?? defaults.dependencies.arrowLengthPx,
      arrowWidthPx: display?.dependencies?.arrowWidthPx ?? defaults.dependencies.arrowWidthPx,
      showArrowheads: display?.dependencies?.showArrowheads ?? defaults.dependencies.showArrowheads,
    },
  };
}

function mergeUiConfig(ui: UiConfig | undefined): Required<UiConfig> {
  return {
    showHud: ui?.showHud ?? DEFAULT_UI_CONFIG.showHud,
    showInspector: ui?.showInspector ?? DEFAULT_UI_CONFIG.showInspector,
    showToolbar: ui?.showToolbar ?? DEFAULT_UI_CONFIG.showToolbar,
    showStatusLine: ui?.showStatusLine ?? DEFAULT_UI_CONFIG.showStatusLine,
    statusText: ui?.statusText ?? DEFAULT_UI_CONFIG.statusText,
    title: ui?.title ?? DEFAULT_UI_CONFIG.title,
  };
}

function mergeContainerConfig(container: GanttContainerConfig | undefined): NormalizedGanttContainerConfig {
  return {
    width: container?.width ?? DEFAULT_CONTAINER_CONFIG.width,
    height: container?.height ?? DEFAULT_CONTAINER_CONFIG.height,
    minWidth: container?.minWidth ?? DEFAULT_CONTAINER_CONFIG.minWidth,
    minHeight: container?.minHeight ?? DEFAULT_CONTAINER_CONFIG.minHeight,
    maxWidth: container?.maxWidth ?? DEFAULT_CONTAINER_CONFIG.maxWidth,
    maxHeight: container?.maxHeight ?? DEFAULT_CONTAINER_CONFIG.maxHeight,
    header: {
      visible: container?.header?.visible ?? DEFAULT_CONTAINER_CONFIG.header.visible,
      height: container?.header?.height ?? DEFAULT_CONTAINER_CONFIG.header.height,
    },
    footer: {
      visible: container?.footer?.visible ?? DEFAULT_CONTAINER_CONFIG.footer.visible,
      height: container?.footer?.height ?? DEFAULT_CONTAINER_CONFIG.footer.height,
    },
    toolbar: {
      position: container?.toolbar?.position ?? DEFAULT_CONTAINER_CONFIG.toolbar.position,
      height: container?.toolbar?.height ?? DEFAULT_CONTAINER_CONFIG.toolbar.height,
    },
  };
}

function mergeDataConfig(data: DataConfig | undefined): DataConfig {
  if (!data) {
    return { ...DEFAULT_DATA_CONFIG };
  }

  if (data.type === 'sample') {
    return {
      type: 'sample',
      options: { ...(data.options ?? {}) },
    };
  }

  if (data.type === 'static') {
    return {
      type: 'static',
      scene: data.scene,
    };
  }

  return {
    type: 'factory',
    create: data.create,
  };
}

function mergeModulesConfig(modules: ModulesConfig | undefined): { builtins: Array<'camera-controls' | 'selection' | 'hud-inspector' | 'toolbar'> } {
  return {
    builtins: modules?.builtins?.slice() ?? DEFAULT_MODULES_CONFIG.builtins.slice(),
  };
}

function mergeFeatures(features: GanttFeatureFlags | undefined): Required<GanttFeatureFlags> {
  return {
    allowAdvancedPlugins: features?.allowAdvancedPlugins ?? DEFAULT_FEATURES.allowAdvancedPlugins,
  };
}

function mergePlugins(plugins: PluginConfig[] | undefined): PluginConfig[] {
  return (plugins ?? []).map((plugin) => ({
    ...plugin,
    source: { ...plugin.source },
    options: plugin.options ? { ...plugin.options } : undefined,
  }));
}

function mergeFontConfig(font: GanttFontConfig | undefined): GanttFontConfig {
  return {
    family: font?.family ?? DEFAULT_FONT_CONFIG.family,
    sizePx: font?.sizePx ?? DEFAULT_FONT_CONFIG.sizePx,
    weight: font?.weight ?? DEFAULT_FONT_CONFIG.weight,
    msdfManifestUrl: font?.msdfManifestUrl ?? DEFAULT_FONT_CONFIG.msdfManifestUrl,
    msdfManifestUrls: font?.msdfManifestUrls ? { ...font.msdfManifestUrls } : DEFAULT_FONT_CONFIG.msdfManifestUrls,
  };
}

function mergeEditConfig(config: GanttConfig['edit']): NormalizedGanttEditConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_EDIT_CONFIG.enabled,
    defaultMode: config?.defaultMode ?? DEFAULT_EDIT_CONFIG.defaultMode,
    drag: {
      allowRowChange: config?.drag?.allowRowChange ?? DEFAULT_EDIT_CONFIG.drag.allowRowChange,
    },
    resize: {
      enabled: config?.resize?.enabled ?? DEFAULT_EDIT_CONFIG.resize.enabled,
      handleWidthPx: config?.resize?.handleWidthPx ?? DEFAULT_EDIT_CONFIG.resize.handleWidthPx,
      minDurationDays: config?.resize?.minDurationDays ?? DEFAULT_EDIT_CONFIG.resize.minDurationDays,
    },
    snap: {
      mode: config?.snap?.mode ?? DEFAULT_EDIT_CONFIG.snap.mode,
      incrementDays: config?.snap?.incrementDays ?? DEFAULT_EDIT_CONFIG.snap.incrementDays,
    },
    callbacks: config?.callbacks ? { ...config.callbacks } : DEFAULT_EDIT_CALLBACKS,
  };
}

export function normalizeConfig(config: GanttConfig = {}): NormalizedGanttConfig {
  return {
    data: mergeDataConfig(config.data),
    render: { ...DEFAULT_RENDER_OPTIONS, ...(config.render ?? {}) },
    display: mergeDisplayConfig(config.display),
    ui: mergeUiConfig(config.ui),
    container: mergeContainerConfig(config.container),
    font: mergeFontConfig(config.font),
    edit: mergeEditConfig(config.edit),
    plugins: mergePlugins(config.plugins),
    modules: mergeModulesConfig(config.modules),
    features: mergeFeatures(config.features),
    pluginSecurity: config.pluginSecurity ?? DEFAULT_PLUGIN_SECURITY_POLICY,
  };
}

export async function resolveScene(config: NormalizedGanttConfig['data']) {
  if (config.type === 'sample') {
    return createSampleScene(config.options);
  }

  if (config.type === 'static') {
    return config.scene;
  }

  return await config.create();
}
