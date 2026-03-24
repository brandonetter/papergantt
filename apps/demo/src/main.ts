import './styles.css';
import './themes.css';
import {
  createGanttHost,
  createSampleScene,
  type GanttConfig,
  type GanttExportedTask,
  type GanttHost,
  type GanttScene,
  type GanttTask,
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

const DAY_MS = 24 * 60 * 60 * 1000;

type DemoSnapPresetId = 'off' | 'day' | 'week';
type RuntimeDomAction =
  | 'load-selected'
  | 'apply-adjustments'
  | 'delete-selected'
  | 'read-selected'
  | 'read-all'
  | 'export'
  | 'add-1'
  | 'add-10'
  | 'add-100'
  | 'add-1000';
type RuntimeDomEditorFieldKey = 'label' | 'shiftDays' | 'durationDelta' | 'rowDelta';
type RuntimeDomEditorFields = Record<RuntimeDomEditorFieldKey, HTMLInputElement>;
type RuntimeActivityEntry = {
  title: string;
  detail: string;
};

const SNAP_PRESETS: Array<{
  id: DemoSnapPresetId;
  label: string;
  description: string;
}> = [
  { id: 'off', label: 'Snap Off', description: 'Free drag and free resize.' },
  { id: 'day', label: '1 Day', description: 'Round edits to whole days.' },
  { id: 'week', label: '7 Day', description: 'Round edits to 7-day blocks.' },
];

const RUNTIME_TASK_ADJECTIVES = [
  'Northbound',
  'Neon',
  'Paper',
  'Signal',
  'Copper',
  'Quartz',
  'Contour',
  'Delta',
  'Echo',
  'Atlas',
];

const RUNTIME_TASK_NOUNS = [
  'handoff',
  'sweep',
  'review',
  'assembly',
  'pass',
  'tune-up',
  'handover',
  'ramp',
  'sync',
  'cutover',
];

function toUtcDaySerial(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function daySerialToIso(daySerial: number): string {
  return new Date(Math.floor(daySerial) * DAY_MS).toISOString().slice(0, 10);
}

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

function createRuntimeDomScene(): GanttScene {
  const tasks: GanttTask[] = [
    {
      id: 'kickoff',
      rowIndex: 0,
      start: toUtcDaySerial(2026, 1, 6),
      end: toUtcDaySerial(2026, 1, 9),
      label: 'Kickoff review',
    },
    {
      id: 'layout-pass',
      rowIndex: 1,
      start: toUtcDaySerial(2026, 1, 9),
      end: toUtcDaySerial(2026, 1, 14),
      label: 'Layout pass',
      dependencies: ['kickoff'],
    },
    {
      id: 'runtime-api',
      rowIndex: 2,
      start: toUtcDaySerial(2026, 1, 10),
      end: toUtcDaySerial(2026, 1, 16),
      label: 'Runtime API wiring',
      dependencies: ['kickoff'],
    },
    {
      id: 'qa-sweep',
      rowIndex: 3,
      start: toUtcDaySerial(2026, 1, 16),
      end: toUtcDaySerial(2026, 1, 20),
      label: 'QA sweep',
      dependencies: ['layout-pass', 'runtime-api'],
    },
    {
      id: 'launch-kit',
      rowIndex: 4,
      start: toUtcDaySerial(2026, 1, 21),
      end: toUtcDaySerial(2026, 1, 24),
      label: 'Launch kit',
      dependencies: ['qa-sweep'],
    },
  ];

  return {
    tasks,
    rowLabels: ['Brief', 'Design', 'Build', 'QA', 'Launch'],
    timelineStart: Math.min(...tasks.map((task) => task.start)),
    timelineEnd: Math.max(...tasks.map((task) => task.end)),
  };
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

function createRuntimeDomConfig(msdfManifestUrls: Record<string, string>): GanttConfig {
  return {
    data: {
      type: 'static',
      scene: cloneScene(createRuntimeDomScene()),
    },
    font: {
      weight: 400,
      sizePx: 14,
      msdfManifestUrls,
    },
    container: {
      height: 520,
      toolbar: {
        position: 'top',
      },
    },
    edit: createDemoEditConfig('day'),
    ui: {
      title: 'Runtime DOM API',
      showInspector: false,
      statusText:
        'Select a task, load it into the form, then add, adjust, remove, read, or export through plain DOM event handlers.',
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
            View, select, and edit modes, marquee selection, drag-move, resize handles, snapping presets, and plugin callbacks all stay visible while the themed hosts continue to prove the renderer surface.
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
                Use the icon toolbar to switch between view, select, and edit, then marquee-select tasks, move the whole selection in edit mode, resize single tasks from the handles, or switch snap presets below.
              </p>
            </div>
            <ul class="demo-note-list">
              <li>Pure <code>createGanttHost(...)</code> path with no plugins</li>
              <li>Uses edit callbacks and draft overlays from core only</li>
              <li>Press <code>V</code>, <code>S</code>, or <code>E</code> for view, select, and edit; hold <code>Shift</code> to bypass snapping mid-drag</li>
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

      <section class="demo-runtime-lab" aria-label="Runtime DOM task API">
        <div class="demo-runtime-lab__header">
          <div class="demo-runtime-lab__copy">
            <p class="demo-card__eyebrow">DOM Runtime API</p>
            <h2>Drive runtime task changes from the page itself, not from a plugin.</h2>
            <p class="demo-lede demo-lede--compact">
              The bottom section talks straight to the host controller.
              Bulk-add buttons generate new tasks one by one, and the selected-task tools let you shift timing, change duration, move rows, rename, remove, read, and export without leaving the DOM layer.
            </p>
          </div>
          <ul class="demo-note-list demo-runtime-lab__notes">
            <li>No plugin registration or module bridge is involved</li>
            <li>Bulk add actions generate random ids and labels automatically</li>
            <li>Use Load Selected to pull the current chart selection into the editor</li>
          </ul>
        </div>

        <div class="demo-runtime-lab__grid">
          <div class="demo-runtime-stack">
            <div class="demo-chart-frame demo-chart-frame--runtime">
              <div
                class="demo-chart demo-chart--runtime"
                data-demo-mount="runtime-dom"
                aria-label="Runtime DOM gantt chart"
              ></div>
            </div>

            <section class="demo-runtime-card demo-runtime-card--output" aria-label="Runtime DOM output">
              <div class="demo-runtime-meta">
                <div class="demo-runtime-stat">
                  <span class="demo-runtime-stat__label">Committed</span>
                  <strong data-runtime-summary="tasks">0 tasks</strong>
                </div>
                <div class="demo-runtime-stat">
                  <span class="demo-runtime-stat__label">Selection</span>
                  <strong data-runtime-summary="selection">Selection: none</strong>
                </div>
                <div class="demo-runtime-stat">
                  <span class="demo-runtime-stat__label">Timeline</span>
                  <strong data-runtime-summary="timeline">No tasks</strong>
                </div>
                <div class="demo-runtime-stat">
                  <span class="demo-runtime-stat__label">Last Action</span>
                  <strong data-runtime-summary="action">Waiting for a DOM action.</strong>
                </div>
              </div>
              <div class="demo-runtime-activity-shell">
                <p class="demo-runtime-output-title">Recent actions</p>
                <ul class="demo-runtime-activity" data-runtime-activity>
                  <li>Waiting for the first DOM action.</li>
                </ul>
              </div>
              <details class="demo-runtime-details" data-runtime-details>
                <summary>
                  <span data-runtime-output-title>Last payload</span>
                  <span class="demo-runtime-details__hint">Expand when you want the raw JSON</span>
                </summary>
                <pre class="demo-runtime-output" data-runtime-output>{
  "hint": "Use the DOM buttons on the right to drive runtime task changes."
}</pre>
              </details>
            </section>
          </div>

          <aside class="demo-runtime-rail">
            <section class="demo-runtime-card">
              <div class="demo-card__heading">
                <h3>Bulk add</h3>
                <p>Each click creates brand-new ids and labels, then appends tasks one by one onto the next rows and future dates.</p>
              </div>
              <div class="demo-runtime-actions demo-runtime-actions--bulk">
                <button type="button" class="demo-runtime-button demo-runtime-button--accent" data-runtime-action="add-1">Add 1 Task</button>
                <button type="button" class="demo-runtime-button demo-runtime-button--accent" data-runtime-action="add-10">Add 10 Tasks</button>
                <button type="button" class="demo-runtime-button demo-runtime-button--accent" data-runtime-action="add-100">Add 100 Tasks</button>
                <button type="button" class="demo-runtime-button demo-runtime-button--accent" data-runtime-action="add-1000">Add 1000 Tasks</button>
              </div>
              <p class="demo-runtime-hint">
                Generated tasks are committed through repeated controller calls with no artificial delay.
              </p>
            </section>

            <section class="demo-runtime-card">
              <div class="demo-card__heading">
                <h3>Selected task tools</h3>
                <p>Load the chart selection, rename it, shift it in time, stretch or shorten it, move rows, then commit the adjustment.</p>
              </div>

              <div class="demo-runtime-selection">
                <div class="demo-runtime-selection__label">Editor target</div>
                <strong class="demo-runtime-selection__id" data-runtime-selected-id>No task loaded</strong>
              </div>

              <div class="demo-runtime-form">
                <label class="demo-runtime-field demo-runtime-field--wide">
                  <span>Label</span>
                  <input type="text" data-runtime-editor-field="label" placeholder="Loaded from the selected task" />
                </label>
                <label class="demo-runtime-field">
                  <span>Shift Days</span>
                  <input type="number" step="1" value="0" data-runtime-editor-field="shiftDays" />
                </label>
                <label class="demo-runtime-field">
                  <span>Duration Delta</span>
                  <input type="number" step="1" value="0" data-runtime-editor-field="durationDelta" />
                </label>
                <label class="demo-runtime-field">
                  <span>Row Delta</span>
                  <input type="number" step="1" value="0" data-runtime-editor-field="rowDelta" />
                </label>
              </div>

              <div class="demo-runtime-actions">
                <button type="button" class="demo-runtime-button demo-runtime-button--ghost" data-runtime-action="load-selected">Load Selected</button>
                <button type="button" class="demo-runtime-button" data-runtime-action="apply-adjustments">Apply Adjustments</button>
                <button type="button" class="demo-runtime-button demo-runtime-button--ghost" data-runtime-action="read-selected">Read Selected</button>
                <button type="button" class="demo-runtime-button demo-runtime-button--danger" data-runtime-action="delete-selected">Remove Selected</button>
              </div>

              <div class="demo-runtime-actions demo-runtime-actions--secondary">
                <button type="button" class="demo-runtime-button demo-runtime-button--ghost" data-runtime-action="read-all">Read All Tasks</button>
                <button type="button" class="demo-runtime-button demo-runtime-button--ghost" data-runtime-action="export">Export Tasks</button>
              </div>
            </section>
          </aside>
        </div>
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
  const runtimeDomMount = appRoot.querySelector<HTMLElement>(
    '[data-demo-mount="runtime-dom"]',
  );
  const themePickerFrame = themePickerMount?.parentElement;
  const themeLabel = appRoot.querySelector<HTMLElement>('[data-theme-label]');
  const themeDescription = appRoot.querySelector<HTMLElement>(
    '[data-theme-description]',
  );
  const snapDescription = appRoot.querySelector<HTMLElement>('[data-snap-description]');
  const runtimeOutputTitle = appRoot.querySelector<HTMLElement>('[data-runtime-output-title]');
  const runtimeOutput = appRoot.querySelector<HTMLElement>('[data-runtime-output]');
  const runtimeDetails = appRoot.querySelector<HTMLDetailsElement>('[data-runtime-details]');
  const runtimeActivity = appRoot.querySelector<HTMLElement>('[data-runtime-activity]');
  const runtimeSelectedId = appRoot.querySelector<HTMLElement>('[data-runtime-selected-id]');
  const runtimeTaskSummary = appRoot.querySelector<HTMLElement>('[data-runtime-summary="tasks"]');
  const runtimeSelectionSummary = appRoot.querySelector<HTMLElement>('[data-runtime-summary="selection"]');
  const runtimeTimelineSummary = appRoot.querySelector<HTMLElement>('[data-runtime-summary="timeline"]');
  const runtimeActionSummary = appRoot.querySelector<HTMLElement>('[data-runtime-summary="action"]');
  const snapButtons = Array.from(
    appRoot.querySelectorAll<HTMLButtonElement>('[data-snap-preset]'),
  );
  const themeButtons = Array.from(
    appRoot.querySelectorAll<HTMLButtonElement>('[data-theme-id]'),
  );
  const runtimeActionButtons = Array.from(
    appRoot.querySelectorAll<HTMLButtonElement>('[data-runtime-action]'),
  );
  const runtimeEditorFieldElements = {
    label: appRoot.querySelector<HTMLInputElement>('[data-runtime-editor-field="label"]'),
    shiftDays: appRoot.querySelector<HTMLInputElement>('[data-runtime-editor-field="shiftDays"]'),
    durationDelta: appRoot.querySelector<HTMLInputElement>('[data-runtime-editor-field="durationDelta"]'),
    rowDelta: appRoot.querySelector<HTMLInputElement>('[data-runtime-editor-field="rowDelta"]'),
  };

  if (
    !baselineMount ||
    !pluginMount ||
    !editablePluginMount ||
    !lightMount ||
    !themePickerMount ||
    !runtimeDomMount ||
    !(themePickerFrame instanceof HTMLElement) ||
    !themeLabel ||
    !themeDescription ||
    !snapDescription ||
    !runtimeOutputTitle ||
    !runtimeOutput ||
    !runtimeDetails ||
    !runtimeActivity ||
    !runtimeSelectedId ||
    !runtimeTaskSummary ||
    !runtimeSelectionSummary ||
    !runtimeTimelineSummary ||
    !runtimeActionSummary ||
    snapButtons.length !== SNAP_PRESETS.length ||
    themeButtons.length !== DEMO_THEMES.length ||
    runtimeActionButtons.length !== 10 ||
    Object.values(runtimeEditorFieldElements).some((field) => !(field instanceof HTMLInputElement))
  ) {
    throw new Error('Missing showcase mount points.');
  }

  const themeFrame = themePickerFrame;
  const baselineMountEl = baselineMount;
  const pluginMountEl = pluginMount;
  const editablePluginMountEl = editablePluginMount;
  const lightMountEl = lightMount;
  const themePickerMountEl = themePickerMount;
  const runtimeDomMountEl = runtimeDomMount;
  const themeLabelEl = themeLabel;
  const themeDescriptionEl = themeDescription;
  const snapDescriptionEl = snapDescription;
  const runtimeOutputTitleEl = runtimeOutputTitle;
  const runtimeOutputEl = runtimeOutput;
  const runtimeDetailsEl = runtimeDetails;
  const runtimeActivityEl = runtimeActivity;
  const runtimeSelectedIdEl = runtimeSelectedId;
  const runtimeTaskSummaryEl = runtimeTaskSummary;
  const runtimeSelectionSummaryEl = runtimeSelectionSummary;
  const runtimeTimelineSummaryEl = runtimeTimelineSummary;
  const runtimeActionSummaryEl = runtimeActionSummary;
  const runtimeEditorFields = runtimeEditorFieldElements as RuntimeDomEditorFields;

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
        'Press V, S, or E for view, select, and edit. Drag in select mode to marquee-select, drag in edit mode to move the selection as a group, use handles to resize a single task, Shift disables snapping, and double-click still focuses in view mode.',
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
  let runtimeDomHost: GanttHost | null = null;
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

  function getRuntimeController() {
    if (!runtimeDomHost) {
      throw new Error('The runtime DOM demo is not ready yet.');
    }

    return runtimeDomHost.getController();
  }

  const runtimeActivityLog: RuntimeActivityEntry[] = [];

  function renderRuntimeActivity(): void {
    if (runtimeActivityLog.length === 0) {
      runtimeActivityEl.innerHTML = '<li>Waiting for the first DOM action.</li>';
      return;
    }

    runtimeActivityEl.innerHTML = runtimeActivityLog
      .map((entry) => `<li><strong>${entry.title}</strong><span>${entry.detail}</span></li>`)
      .join('');
  }

  function recordRuntimeActivity(title: string, detail: string): void {
    runtimeActivityLog.unshift({ title, detail });
    if (runtimeActivityLog.length > 8) {
      runtimeActivityLog.length = 8;
    }
    renderRuntimeActivity();
  }

  function setRuntimeOutput(title: string, payload: unknown, openDetails = true): void {
    runtimeOutputTitleEl.textContent = title;
    runtimeOutputEl.textContent = JSON.stringify(payload, null, 2);
    runtimeDetailsEl.open = openDetails;
  }

  function selectRuntimeEditorTarget(task: GanttTask): void {
    runtimeSelectedIdEl.textContent = task.id;
    runtimeEditorFields.label.value = task.label;
    runtimeEditorFields.shiftDays.value = '0';
    runtimeEditorFields.durationDelta.value = '0';
    runtimeEditorFields.rowDelta.value = '0';
  }

  function clearRuntimeEditorTarget(): void {
    runtimeSelectedIdEl.textContent = 'No task loaded';
    runtimeEditorFields.label.value = '';
    runtimeEditorFields.shiftDays.value = '0';
    runtimeEditorFields.durationDelta.value = '0';
    runtimeEditorFields.rowDelta.value = '0';
  }

  function randomItem(items: string[]): string {
    return items[Math.floor(Math.random() * items.length)];
  }

  function createNextRuntimeTaskId(): string {
    const ids = new Set(getRuntimeController().getTasks().map((task) => task.id));
    let candidate = '';

    while (!candidate || ids.has(candidate)) {
      candidate = `dom-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 5)}`;
    }

    return candidate;
  }

  function createGeneratedRuntimeTask(): {
    id: string;
    rowIndex: number;
    startDate: string;
    endDate: string;
    label: string;
  } {
    const controller = getRuntimeController();
    const tasks = controller.getTasks();
    const scene = controller.getScene();
    const nextRowIndex = tasks.reduce((maxRow, task) => Math.max(maxRow, task.rowIndex), -1) + 1;
    const nextStart = tasks.length > 0
      ? scene.timelineEnd + Math.floor(Math.random() * 2)
      : toUtcDaySerial(2026, 1, 24);
    const durationDays = 2 + Math.floor(Math.random() * 7);
    const adjective = randomItem(RUNTIME_TASK_ADJECTIVES);
    const noun = randomItem(RUNTIME_TASK_NOUNS);

    return {
      id: createNextRuntimeTaskId(),
      rowIndex: Math.max(0, nextRowIndex),
      startDate: daySerialToIso(nextStart),
      endDate: daySerialToIso(nextStart + durationDays - 1),
      label: `${adjective} ${noun} ${nextRowIndex + 1}`,
    };
  }

  function addGeneratedRuntimeTasks(count: number): GanttTask[] {
    const controller = getRuntimeController();
    const addedTasks: GanttTask[] = [];

    for (let index = 0; index < count; index += 1) {
      const generated = createGeneratedRuntimeTask();
      const task = controller.addTask({
        id: generated.id,
        rowIndex: generated.rowIndex,
        start: generated.startDate,
        end: generated.endDate,
        label: generated.label,
      });
      addedTasks.push(task);
    }

    return addedTasks;
  }

  function refreshRuntimeSummary(lastAction?: string): void {
    const controller = getRuntimeController();
    const committedTasks = controller.getTasks();
    const scene = controller.getScene();
    const selection = controller.getSelection().selectedTask;

    runtimeTaskSummaryEl.textContent = `${committedTasks.length} tasks`;
    runtimeSelectionSummaryEl.textContent = selection ? `Selection: ${selection.id}` : 'Selection: none';
    runtimeTimelineSummaryEl.textContent = committedTasks.length > 0
      ? `${daySerialToIso(scene.timelineStart)} to ${daySerialToIso(scene.timelineEnd - 1)}`
      : 'No tasks';
    if (lastAction) {
      runtimeActionSummaryEl.textContent = lastAction;
    }
  }

  function resolveRuntimeEditorTarget(): GanttTask {
    const loadedTaskId = runtimeSelectedIdEl.textContent?.trim();
    if (loadedTaskId && loadedTaskId !== 'No task loaded') {
      const loadedTask = getRuntimeController().getTask(loadedTaskId);
      if (loadedTask) {
        return loadedTask;
      }
    }

    const selectedTask = getRuntimeController().getSelection().selectedTask;
    if (selectedTask) {
      return selectedTask;
    }

    throw new Error('Load a selected task first.');
  }

  function findExportedTask(taskId: string): GanttExportedTask | null {
    return getRuntimeController().exportTasks().find((task) => task.id === taskId) ?? null;
  }

  function handleRuntimeAction(action: RuntimeDomAction): void {
    try {
      const controller = getRuntimeController();

      if (action === 'load-selected') {
        const selectedTask = controller.getSelection().selectedTask;
        if (!selectedTask) {
          throw new Error('Select a task in the runtime chart first.');
        }

        selectRuntimeEditorTarget(selectedTask);
        setRuntimeOutput('Loaded selected task', {
          action: 'loadSelected',
          task: selectedTask,
          exportedTask: findExportedTask(selectedTask.id),
        });
        recordRuntimeActivity('Loaded selected task', `${selectedTask.id} is ready for DOM adjustments.`);
        refreshRuntimeSummary(`Loaded ${selectedTask.id} into the form.`);
        return;
      }

      if (action === 'add-1' || action === 'add-10' || action === 'add-100' || action === 'add-1000') {
        const count = action === 'add-1'
          ? 1
          : action === 'add-10'
            ? 10
            : action === 'add-100'
              ? 100
              : 1000;
        const addedTasks = addGeneratedRuntimeTasks(count);
        const lastTask = addedTasks[addedTasks.length - 1];
        if (lastTask) {
          controller.setSelectionByTaskId(lastTask.id);
          controller.animateCameraToTask(lastTask);
          selectRuntimeEditorTarget(lastTask);
        }

        setRuntimeOutput(`Added ${count} generated task${count === 1 ? '' : 's'}`, {
          action: 'addGeneratedTasks',
          count,
          firstTask: addedTasks[0] ?? null,
          lastTask,
          newTotal: controller.getTasks().length,
        }, count <= 10);
        recordRuntimeActivity(`Added ${count} task${count === 1 ? '' : 's'}`, lastTask
          ? `Last generated task: ${lastTask.id} on row ${lastTask.rowIndex}.`
          : 'No task was generated.');
        refreshRuntimeSummary(`Added ${count} generated task${count === 1 ? '' : 's'}.`);
        return;
      }

      if (action === 'apply-adjustments') {
        const existingTask = resolveRuntimeEditorTarget();
        const shiftDays = Number.parseInt(runtimeEditorFields.shiftDays.value, 10) || 0;
        const durationDelta = Number.parseInt(runtimeEditorFields.durationDelta.value, 10) || 0;
        const rowDelta = Number.parseInt(runtimeEditorFields.rowDelta.value, 10) || 0;
        const proposedStart = existingTask.start + shiftDays;
        const proposedEnd = existingTask.end + shiftDays + durationDelta;
        const updatedTask = controller.updateTask(existingTask.id, {
          rowIndex: Math.max(0, existingTask.rowIndex + rowDelta),
          start: daySerialToIso(proposedStart),
          end: daySerialToIso(proposedEnd - 1),
          label: runtimeEditorFields.label.value.trim() || existingTask.label,
        });

        controller.setSelectionByTaskId(updatedTask.id);
        controller.animateCameraToTask(updatedTask);
        selectRuntimeEditorTarget(updatedTask);
        setRuntimeOutput('Adjusted task', {
          action: 'updateTask',
          shiftDays,
          durationDelta,
          rowDelta,
          task: updatedTask,
          exportedTask: findExportedTask(updatedTask.id),
        });
        recordRuntimeActivity('Adjusted task', `${updatedTask.id} moved to row ${updatedTask.rowIndex} and now spans ${updatedTask.end - updatedTask.start} days.`);
        refreshRuntimeSummary(`Adjusted ${updatedTask.id}.`);
        return;
      }

      if (action === 'delete-selected') {
        const targetTask = resolveRuntimeEditorTarget();
        const removedTask = controller.deleteTask(targetTask.id);
        clearRuntimeEditorTarget();
        setRuntimeOutput('Removed task', {
          action: 'deleteTask',
          task: removedTask,
          remainingTasks: controller.getTasks().length,
        }, false);
        recordRuntimeActivity('Removed task', `${removedTask.id} was deleted from row ${removedTask.rowIndex}.`);
        refreshRuntimeSummary(`Removed ${removedTask.id}.`);
        return;
      }

      if (action === 'read-selected') {
        const task = resolveRuntimeEditorTarget();
        selectRuntimeEditorTarget(task);
        setRuntimeOutput('Read single task', {
          action: 'getTask',
          task,
          exportedTask: findExportedTask(task.id),
        });
        recordRuntimeActivity('Read selected task', `${task.id} was read from the committed scene.`);
        refreshRuntimeSummary(`Read ${task.id}.`);
        return;
      }

      if (action === 'read-all') {
        const tasks = controller.getTasks();
        setRuntimeOutput('Read committed task list', {
          action: 'getTasks',
          count: tasks.length,
          tasks,
        }, false);
        recordRuntimeActivity('Read all tasks', `${tasks.length} committed tasks returned from getTasks().`);
        refreshRuntimeSummary('Read all committed tasks.');
        return;
      }

      const exportedTasks = controller.exportTasks();
      setRuntimeOutput('Exported normalized tasks', {
        action: 'exportTasks',
        count: exportedTasks.length,
        tasks: exportedTasks,
      }, false);
      recordRuntimeActivity('Exported tasks', `${exportedTasks.length} tasks normalized into date-string payloads.`);
      refreshRuntimeSummary('Exported normalized task payload.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeOutput('Runtime DOM API error', {
        error: message,
      });
      recordRuntimeActivity('Runtime error', message);
      refreshRuntimeSummary(`Error: ${message}`);
    }
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
    runtimeDomHost = await mountDemoHost(
      runtimeDomMountEl,
      createRuntimeDomConfig(msdfManifestUrls),
    );
    hosts.push(runtimeDomHost);
    await mountThemePreview(DEFAULT_THEME_ID);
    if (themePreviewHost) {
      hosts.push(themePreviewHost);
    }
    clearRuntimeEditorTarget();
    renderRuntimeActivity();
    runtimeDetailsEl.open = false;
    refreshRuntimeSummary();
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
    for (const button of runtimeActionButtons) {
      button.addEventListener('click', () => {
        const action = button.dataset.runtimeAction as RuntimeDomAction | undefined;
        if (!action) {
          return;
        }
        handleRuntimeAction(action);
      });
    }
    runtimeDomMountEl.addEventListener('click', () => {
      window.setTimeout(() => {
        refreshRuntimeSummary();
      }, 0);
    });
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
