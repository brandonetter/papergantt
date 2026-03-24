import './styles.css';
import './themes.css';
import {
  createGanttHost,
  createSampleScene,
  type GanttConfig,
  type GanttHost,
  type GanttScene,
} from '@gantt/gantt-core';
import {
  DEMO_THEMES,
  DEFAULT_THEME_ID,
  THEME_SHELL_CLASSES,
  buildThemeConfig,
  getDemoTheme,
  type DemoThemeId,
} from './themes';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Missing application root element.');
}

const appRoot = root;

const SAMPLE_OPTIONS = {
  seed: 24,
  orderCount: 56,
};

type DemoSnapPresetId = 'off' | 'day' | 'week';

const SNAP_PRESETS: Array<{
  id: DemoSnapPresetId;
  label: string;
  description: string;
}> = [
  { id: 'off', label: 'Snap Off', description: 'Free drag and free resize.' },
  { id: 'day', label: '1 Day', description: 'Round edits to whole days.' },
  { id: 'week', label: '7 Day', description: 'Round edits to 7-day blocks.' },
];

function cloneScene(scene: GanttScene): GanttScene {
  return {
    tasks: scene.tasks.map((task) => ({
      ...task,
      dependencies: task.dependencies?.slice(),
    })),
    rowLabels: scene.rowLabels.slice(),
    timelineStart: scene.timelineStart,
    timelineEnd: scene.timelineEnd,
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatSpanDays(scene: GanttScene): string {
  return `${formatNumber(Math.max(0, scene.timelineEnd - scene.timelineStart))} days`;
}

function pluginUrl(path: string): string {
  return new URL(path, window.location.href).href;
}

function fontUrl(path: string): string {
  return new URL(path, window.location.href).href;
}

function demoMsdfManifestUrls() {
  return {
    400: fontUrl('./fonts/atkinson-hyperlegible-400-msdf.json'),
    700: fontUrl('./fonts/atkinson-hyperlegible-700-msdf.json'),
  };
}

function createDemoEditConfig(snapPreset: DemoSnapPresetId): GanttConfig['edit'] {
  return {
    enabled: true,
    defaultMode: 'view',
    drag: {
      allowRowChange: true,
    },
    resize: {
      enabled: true,
      handleWidthPx: 14,
      minDurationDays: 1,
    },
    snap: snapPreset === 'off'
      ? { mode: 'off' }
      : snapPreset === 'week'
        ? { mode: 'increment', incrementDays: 7 }
        : { mode: 'day' },
    callbacks: {
      onTaskEditCommit: async (event) => ({
        ...event.proposedTask,
        dependencies: event.proposedTask.dependencies?.slice(),
      }),
    },
  };
}

function buildPage(scene: GanttScene): string {
  const paperLightTheme = getDemoTheme('paper-light');
  const defaultTheme = getDemoTheme(DEFAULT_THEME_ID);

  return `
    <main class="demo-page">
      <section class="demo-hero">
        <div class="demo-hero__copy">
          <p class="demo-eyebrow">Gantt Core Showcase</p>
          <h1>Editable gantt rendering, plugin hooks, and theme presets in one surface.</h1>
          <p class="demo-lede">
            The page now doubles as an interaction bench.
            View mode, edit mode, drag-move, resize handles, snapping presets, and plugin callbacks all stay visible while the themed hosts continue to prove the renderer surface.
          </p>
        </div>
        <div class="demo-stats" aria-label="Dataset summary">
          <div class="demo-stat">
            <span class="demo-stat__label">Tasks</span>
            <strong>${formatNumber(scene.tasks.length)}</strong>
          </div>
          <div class="demo-stat">
            <span class="demo-stat__label">Rows</span>
            <strong>${formatNumber(scene.rowLabels.length)}</strong>
          </div>
          <div class="demo-stat">
            <span class="demo-stat__label">Timeline</span>
            <strong>${formatSpanDays(scene)}</strong>
          </div>
          <div class="demo-stat">
            <span class="demo-stat__label">Display API</span>
            <strong>Baseline, safe plugin, editable plugin, paper preset, and theme picker</strong>
          </div>
        </div>
      </section>

      <section class="demo-showcase" aria-label="Renderer comparison">
        <article class="demo-band demo-band--baseline">
          <div class="demo-band__copy">
            <p class="demo-card__eyebrow">Baseline</p>
            <div class="demo-card__heading">
              <h2>Core editor controls</h2>
              <p>
                This section is the stock host with the new editing runtime turned on.
                Use the built-in View/Edit toggle, then drag tasks, resize them from the handles, or switch snap presets below.
              </p>
            </div>
            <ul class="demo-note-list">
              <li>Pure <code>createGanttHost(...)</code> path with no plugins</li>
              <li>Uses edit callbacks and draft overlays from core only</li>
              <li>Press <code>E</code> to toggle edit mode and <code>Shift</code> to bypass snapping mid-drag</li>
            </ul>
            <div class="demo-snap-picker" aria-label="Baseline snap presets">
              ${SNAP_PRESETS.map((preset) => (
                `<button type="button" class="theme-chip demo-snap-chip" data-snap-preset="${preset.id}" data-active="${preset.id === 'day' ? 'true' : 'false'}" aria-pressed="${preset.id === 'day' ? 'true' : 'false'}">${preset.label}</button>`
              )).join('')}
            </div>
            <p class="theme-picker__detail" data-snap-description>${SNAP_PRESETS.find((preset) => preset.id === 'day')?.description}</p>
          </div>
          <div class="demo-band__visual">
            <div class="demo-chart-frame">
              <div class="demo-chart" data-demo-mount="baseline" aria-label="Baseline gantt chart"></div>
            </div>
          </div>
        </article>

        <article class="demo-band demo-band--plugin demo-band--reverse">
          <div class="demo-band__copy demo-band__copy--accent">
            <p class="demo-card__eyebrow">Plugin</p>
            <div class="demo-card__heading">
              <h2>Safe plugin enabled</h2>
              <p>
                The second section uses the safe plugin API for edit-aware behavior.
                Its badge now tracks mode changes and edit lifecycle events while a resolver adjusts draft edits before commit.
              </p>
            </div>
            <ul class="demo-note-list">
              <li>Loads the safe plugin from <code>public/plugins</code></li>
              <li>Styles selection and hover through plugin hooks</li>
              <li>Uses a task edit resolver and lifecycle callbacks from the safe API</li>
              <li>Runs on a weekly snap preset to make the resolver behavior obvious</li>
            </ul>
          </div>
          <div class="demo-band__visual">
            <div class="demo-chart-frame">
              <div
                class="demo-chart demo-chart--plugin"
                data-demo-mount="plugin"
                aria-label="Plugin-enabled gantt chart"
              ></div>
            </div>
          </div>
        </article>

        <article class="demo-band demo-band--editable">
          <div class="demo-band__copy demo-band__copy--accent">
            <p class="demo-card__eyebrow">Editable API</p>
            <div class="demo-card__heading">
              <h2>Commit log with undo</h2>
              <p>
                This new plugin treats edit commits as structured data.
                Each committed move or resize is rendered as JSON in-chart, and the plugin can restore the previous committed task state with one undo button.
              </p>
            </div>
            <ul class="demo-note-list">
              <li>Loads a second plugin from <code>public/plugins</code></li>
              <li>Shows before/after commit payloads plus computed change deltas as JSON</li>
              <li>Uses a plugin module to access the host controller for undo</li>
              <li>Replays the previous committed task state through <code>replaceScene(...)</code></li>
            </ul>
          </div>
          <div class="demo-band__visual">
            <div class="demo-chart-frame">
              <div
                class="demo-chart demo-chart--editable-plugin"
                data-demo-mount="editable-plugin"
                aria-label="Editable API plugin gantt chart"
              ></div>
            </div>
          </div>
        </article>

        <article class="demo-band demo-band--light">
          <div class="demo-band__copy demo-band__copy--light">
            <p class="demo-card__eyebrow">Theme Preset</p>
            <div class="demo-card__heading">
              <h2>Paper light</h2>
              <p>
                The paper-light section isolates the theme preset as a fixed reference.
                It keeps the renderer calm, editorial, and tactile without relying on any plugin-specific behavior.
              </p>
            </div>
            <ul class="demo-note-list">
              <li>Uses the same preset entry from <code>themes.ts</code> as the live picker</li>
              <li>Uses the same shell class from <code>themes.css</code> as the live picker</li>
              <li>Keeps the same scene data so differences remain purely visual</li>
            </ul>
          </div>
          <div class="demo-band__visual">
            <div class="demo-chart-frame demo-chart-frame--themed ${paperLightTheme.className}">
              <div
                class="demo-chart demo-chart--themed"
                data-demo-mount="light"
                aria-label="Light mode gantt chart"
              ></div>
            </div>
          </div>
        </article>

        <article class="demo-band demo-band--reverse demo-band--theme-picker">
          <div class="demo-band__copy demo-band__copy--theme-picker">
            <p class="demo-card__eyebrow">Theme Picker</p>
            <div class="demo-card__heading">
              <h2>Live preset switching</h2>
              <p>
                The theme picker section turns the new presets into an interaction surface.
                Pick a visual language and the chart below remounts with that preset so the differences stay honest to the actual runtime config.
              </p>
            </div>
            <div class="theme-picker" aria-label="Chart theme picker">
              ${DEMO_THEMES.map((theme) => (
                `<button type="button" class="theme-chip" data-theme-id="${theme.id}" data-active="${theme.id === DEFAULT_THEME_ID ? 'true' : 'false'}" aria-pressed="${theme.id === DEFAULT_THEME_ID ? 'true' : 'false'}">${theme.label}</button>`
              )).join('')}
            </div>
            <p class="theme-picker__current" data-theme-label>${defaultTheme.label}</p>
            <p class="theme-picker__detail" data-theme-description>${defaultTheme.description}</p>
            <ul class="demo-note-list">
              <li>Includes standard, paper-light, paper-dark, VS Code, warm, cool, and orchid presets</li>
              <li>Uses the same data and interaction model for every theme</li>
              <li>Add a new theme by pairing one preset in <code>themes.ts</code> with one class in <code>themes.css</code></li>
            </ul>
          </div>
          <div class="demo-band__visual">
            <div class="demo-chart-frame demo-chart-frame--themed ${defaultTheme.className}">
              <div
                class="demo-chart demo-chart--themed"
                data-demo-mount="theme-picker"
                aria-label="Theme preview gantt chart"
              ></div>
            </div>
          </div>
        </article>
      </section>
    </main>
  `;
}

async function mountDemoHost(
  target: HTMLElement,
  config: GanttConfig,
): Promise<GanttHost> {
  const host = await createGanttHost(target, config);
  host.getController().animateToZoomPresetId('month');
  return host;
}

async function boot(): Promise<void> {
  const sharedScene = createSampleScene(SAMPLE_OPTIONS);
  const msdfManifestUrls = demoMsdfManifestUrls();
  appRoot.innerHTML = buildPage(sharedScene);

  const baselineMount = appRoot.querySelector<HTMLElement>(
    '[data-demo-mount="baseline"]',
  );
  const pluginMount = appRoot.querySelector<HTMLElement>(
    '[data-demo-mount="plugin"]',
  );
  const editablePluginMount = appRoot.querySelector<HTMLElement>(
    '[data-demo-mount="editable-plugin"]',
  );
  const lightMount = appRoot.querySelector<HTMLElement>(
    '[data-demo-mount="light"]',
  );
  const themePickerMount = appRoot.querySelector<HTMLElement>(
    '[data-demo-mount="theme-picker"]',
  );
  const themePickerFrame = themePickerMount?.parentElement;
  const themeLabel = appRoot.querySelector<HTMLElement>('[data-theme-label]');
  const themeDescription = appRoot.querySelector<HTMLElement>(
    '[data-theme-description]',
  );
  const snapDescription = appRoot.querySelector<HTMLElement>('[data-snap-description]');
  const snapButtons = Array.from(
    appRoot.querySelectorAll<HTMLButtonElement>('[data-snap-preset]'),
  );
  const themeButtons = Array.from(
    appRoot.querySelectorAll<HTMLButtonElement>('[data-theme-id]'),
  );

  if (
    !baselineMount ||
    !pluginMount ||
    !editablePluginMount ||
    !lightMount ||
    !themePickerMount ||
    !(themePickerFrame instanceof HTMLElement) ||
    !themeLabel ||
    !themeDescription ||
    !snapDescription ||
    snapButtons.length !== SNAP_PRESETS.length ||
    themeButtons.length !== DEMO_THEMES.length
  ) {
    throw new Error('Missing showcase mount points.');
  }

  const themeFrame = themePickerFrame;
  const baselineMountEl = baselineMount;
  const pluginMountEl = pluginMount;
  const editablePluginMountEl = editablePluginMount;
  const lightMountEl = lightMount;
  const themePickerMountEl = themePickerMount;
  const themeLabelEl = themeLabel;
  const themeDescriptionEl = themeDescription;
  const snapDescriptionEl = snapDescription;

  const buildBaseConfig = (snapPreset: DemoSnapPresetId): GanttConfig => ({
    data: {
      type: 'static',
      scene: cloneScene(sharedScene),
    },
    font: {
      weight: 400,
      sizePx: 14,
      msdfManifestUrls,
    },
    container: {
      height: 500,
      toolbar: {
        position: 'top',
      },
    },
    edit: createDemoEditConfig(snapPreset),
    ui: {
      title: 'Core editor',
      showInspector: false,
      statusText:
        'Press E for edit mode. Drag to move, use handles to resize, Shift disables snapping, and double-click still focuses in view mode.',
    },
  });

  const pluginConfig: GanttConfig = {
    data: {
      type: 'static',
      scene: cloneScene(sharedScene),
    },
    font: {
      weight: 700,
      msdfManifestUrls,
    },
    container: {
      height: 500,
      toolbar: {
        position: 'top',
      },
    },
    edit: createDemoEditConfig('week'),
    ui: {
      title: 'Safe plugin active',
      showInspector: false,
      statusText:
        'This host runs edit callbacks plus a safe plugin resolver. Weekly snapping is enabled by default here.',
    },
    plugins: [
      {
        source: {
          type: 'esm',
          url: pluginUrl('./plugins/safe-plugin.mjs'),
        },
        idHint: 'demo-safe-style',
        options: {
          badgeLabel: 'Safe Plugin Active',
          accentColor: '#66d1ff',
        },
      },
    ],
  };

  const editablePluginConfig: GanttConfig = {
    data: {
      type: 'static',
      scene: cloneScene(sharedScene),
    },
    font: {
      weight: 700,
      msdfManifestUrls,
    },
    container: {
      height: 560,
      toolbar: {
        position: 'top',
      },
    },
    edit: createDemoEditConfig('day'),
    ui: {
      title: 'Editable API plugin',
      showInspector: false,
      statusText:
        'Switch to Edit mode, move or resize a task, then inspect the JSON panel and use Undo Last Change to roll back the most recent commit.',
    },
    plugins: [
      {
        source: {
          type: 'esm',
          url: pluginUrl('./plugins/editable-commit-log-plugin.mjs'),
        },
        idHint: 'demo-editable-commit-log',
        options: {
          panelLabel: 'Editable API Commit Log',
          accentColor: '#ff9a5c',
          maxCommits: 5,
        },
      },
    ],
  };

  const hosts: GanttHost[] = [];
  let baselineHost: GanttHost | null = null;
  let themePreviewHost: GanttHost | null = null;
  let themeRenderToken = 0;
  let activeSnapPreset: DemoSnapPresetId = 'day';

  function setThemeButtonState(activeThemeId: DemoThemeId, busy: boolean): void {
    for (const button of themeButtons) {
      const themeId = button.dataset.themeId as DemoThemeId;
      const active = themeId === activeThemeId;
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = busy;
    }
  }

  function setSnapButtonState(activePresetId: DemoSnapPresetId, busy: boolean): void {
    for (const button of snapButtons) {
      const presetId = button.dataset.snapPreset as DemoSnapPresetId;
      const active = presetId === activePresetId;
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = busy;
    }
    snapDescriptionEl.textContent = SNAP_PRESETS.find((preset) => preset.id === activePresetId)?.description ?? '';
  }

  function applyThemeShell(themeId: DemoThemeId): void {
    themeFrame.classList.remove(...THEME_SHELL_CLASSES);
    themeFrame.classList.add(getDemoTheme(themeId).className);
  }

  async function mountBaselinePreview(snapPreset: DemoSnapPresetId): Promise<void> {
    activeSnapPreset = snapPreset;
    setSnapButtonState(snapPreset, true);
    const previousHost = baselineHost;
    baselineHost = null;
    if (previousHost) {
      await previousHost.dispose();
    }

    baselineHost = await mountDemoHost(
      baselineMountEl,
      buildBaseConfig(snapPreset),
    );
    setSnapButtonState(snapPreset, false);
  }

  async function mountThemePreview(themeId: DemoThemeId): Promise<void> {
    const token = ++themeRenderToken;
    const theme = getDemoTheme(themeId);

    themeLabelEl.textContent = theme.label;
    themeDescriptionEl.textContent = theme.description;
    applyThemeShell(themeId);
    setThemeButtonState(themeId, true);

    const previousHost = themePreviewHost;
    themePreviewHost = null;
    if (previousHost) {
      await previousHost.dispose();
    }
    if (token !== themeRenderToken) {
      return;
    }

    const nextHost = await mountDemoHost(
      themePickerMountEl,
      {
        ...buildThemeConfig(sharedScene, themeId, msdfManifestUrls),
        edit: createDemoEditConfig('day'),
      },
    );
    if (token !== themeRenderToken) {
      await nextHost.dispose();
      return;
    }

    themePreviewHost = nextHost;
    setThemeButtonState(themeId, false);
  }

  try {
    await mountBaselinePreview(activeSnapPreset);
    hosts.push(await mountDemoHost(pluginMountEl, pluginConfig));
    hosts.push(await mountDemoHost(editablePluginMountEl, editablePluginConfig));
    hosts.push(
      await mountDemoHost(
        lightMountEl,
        {
          ...buildThemeConfig(sharedScene, 'paper-light', msdfManifestUrls),
          edit: createDemoEditConfig('day'),
        },
      ),
    );
    await mountThemePreview(DEFAULT_THEME_ID);
    if (themePreviewHost) {
      hosts.push(themePreviewHost);
    }
    for (const button of snapButtons) {
      button.addEventListener('click', () => {
        const presetId = button.dataset.snapPreset as DemoSnapPresetId | undefined;
        if (!presetId || presetId === activeSnapPreset) {
          return;
        }
        void mountBaselinePreview(presetId);
      });
    }
    for (const button of themeButtons) {
      button.addEventListener('click', () => {
        const themeId = button.dataset.themeId as DemoThemeId | undefined;
        if (!themeId) {
          return;
        }
        void mountThemePreview(themeId);
      });
    }
  } catch (error) {
    const activeBaselineHost = baselineHost as { dispose: () => Promise<void> } | null;
    await activeBaselineHost?.dispose();
    await Promise.allSettled(hosts.map((host) => host.dispose()));
    throw error;
  }
}

boot().catch((error) => {
  console.error(error);
  appRoot.innerHTML = `
    <main class="demo-page">
      <section class="demo-error">
        <p class="demo-eyebrow">Boot Failure</p>
        <h1>Failed to render the demo showcase.</h1>
        <p>Open the console for the full stack trace.</p>
      </section>
    </main>
  `;
});
