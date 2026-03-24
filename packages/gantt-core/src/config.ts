import type { FrameOptions } from './core';
import { createSampleScene } from './data';
import type {
  GanttConfig,
  GanttFontConfig,
  NormalizedGanttConfig,
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
  'Use Day/Week/Month/Quarter/Year to snap scale. Drag to pan. Wheel to scroll. Ctrl + wheel zooms time around the cursor. Click to select.';

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
  weight: 600,
  msdfManifestUrl: undefined,
  msdfManifestUrls: undefined,
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
    weight: font?.weight ?? DEFAULT_FONT_CONFIG.weight,
    msdfManifestUrl: font?.msdfManifestUrl ?? DEFAULT_FONT_CONFIG.msdfManifestUrl,
    msdfManifestUrls: font?.msdfManifestUrls ? { ...font.msdfManifestUrls } : DEFAULT_FONT_CONFIG.msdfManifestUrls,
  };
}

export function normalizeConfig(config: GanttConfig = {}): NormalizedGanttConfig {
  return {
    data: mergeDataConfig(config.data),
    render: { ...DEFAULT_RENDER_OPTIONS, ...(config.render ?? {}) },
    ui: mergeUiConfig(config.ui),
    container: mergeContainerConfig(config.container),
    font: mergeFontConfig(config.font),
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
