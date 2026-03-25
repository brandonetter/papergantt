import './styles.css';
import './themes.css';
import {
  createGanttHost,
  type GanttConfig,
  type GanttHost,
  type GanttScene,
  type GanttTask,
} from '@gantt/gantt-core';
import { buildThemeConfig, getDemoTheme, type DemoThemeId } from './themes';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Missing application root element.');
}

const appRoot = root;
const DAY_MS = 24 * 60 * 60 * 1000;
const REPO_URL = 'https://github.com/brandonetter/webgl2-gantt';
const DEMO_CHART_HEIGHT_SCALE = 1.3;

const PAPER_LIGHT_THEME = getDemoTheme('paper-light').className;

type MountId = 'timeline-demo' | 'editing-demo' | 'json-plugin';
type SceneTaskInput = {
  id: string;
  rowIndex: number;
  startDate: string;
  endDate: string;
  label: string;
  dependencies?: string[];
  milestone?: boolean;
};

const timelineScene = createScene(
  ['Scope', 'Design', 'Build', 'QA', 'Launch', 'Review'],
  [
    { id: 'timeline-scope', rowIndex: 0, startDate: '2026-08-03', endDate: '2026-08-06', label: 'Scope' },
    { id: 'timeline-design', rowIndex: 1, startDate: '2026-08-06', endDate: '2026-08-12', label: 'Design', dependencies: ['timeline-scope'] },
    { id: 'timeline-build', rowIndex: 2, startDate: '2026-08-10', endDate: '2026-08-20', label: 'Build', dependencies: ['timeline-design'] },
    { id: 'timeline-qa', rowIndex: 3, startDate: '2026-08-18', endDate: '2026-08-24', label: 'QA', dependencies: ['timeline-build'] },
    { id: 'timeline-launch', rowIndex: 4, startDate: '2026-08-25', endDate: '2026-08-27', label: 'Launch', dependencies: ['timeline-qa'], milestone: true },
    { id: 'timeline-review', rowIndex: 5, startDate: '2026-08-28', endDate: '2026-08-29', label: 'Review', dependencies: ['timeline-launch'] },
  ],
);

const editingScene = createScene(
  ['Brief', 'Design', 'Build', 'QA', 'Release'],
  [
    { id: 'edit-brief', rowIndex: 0, startDate: '2026-09-01', endDate: '2026-09-03', label: 'Brief' },
    { id: 'edit-design', rowIndex: 1, startDate: '2026-09-03', endDate: '2026-09-08', label: 'Design', dependencies: ['edit-brief'] },
    { id: 'edit-build', rowIndex: 2, startDate: '2026-09-05', endDate: '2026-09-12', label: 'Build', dependencies: ['edit-design'] },
    { id: 'edit-qa', rowIndex: 3, startDate: '2026-09-11', endDate: '2026-09-15', label: 'QA', dependencies: ['edit-build'] },
    { id: 'edit-release', rowIndex: 4, startDate: '2026-09-16', endDate: '2026-09-18', label: 'Release', dependencies: ['edit-qa'], milestone: true },
  ],
);

const jsonPluginScene = createScene(
  ['Brief', 'Prototype', 'Legal', 'Pricing', 'QA', 'Release'],
  [
    { id: 'json-brief', rowIndex: 0, startDate: '2026-10-01', endDate: '2026-10-03', label: 'Release brief' },
    { id: 'json-prototype', rowIndex: 1, startDate: '2026-10-03', endDate: '2026-10-09', label: 'Prototype handoff', dependencies: ['json-brief'] },
    { id: 'json-legal', rowIndex: 2, startDate: '2026-10-04', endDate: '2026-10-08', label: 'Legal review', dependencies: ['json-brief'] },
    { id: 'json-pricing', rowIndex: 3, startDate: '2026-10-09', endDate: '2026-10-13', label: 'Packaging and pricing', dependencies: ['json-prototype', 'json-legal'] },
    { id: 'json-qa', rowIndex: 4, startDate: '2026-10-14', endDate: '2026-10-18', label: 'Final QA', dependencies: ['json-pricing'] },
    { id: 'json-release', rowIndex: 5, startDate: '2026-10-19', endDate: '2026-10-21', label: 'Release approval', dependencies: ['json-qa'], milestone: true },
  ],
);

function toUtcDaySerial(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T00:00:00Z`).getTime() / DAY_MS);
}

function createScene(rowLabels: string[], tasks: SceneTaskInput[]): GanttScene {
  const normalizedTasks: GanttTask[] = tasks.map((task) => ({
    id: task.id,
    rowIndex: task.rowIndex,
    start: toUtcDaySerial(task.startDate),
    end: toUtcDaySerial(task.endDate) + 1,
    label: task.label,
    dependencies: task.dependencies?.slice(),
    milestone: task.milestone,
  }));

  return {
    tasks: normalizedTasks,
    rowLabels: rowLabels.slice(),
    timelineStart: Math.min(...normalizedTasks.map((task) => task.start)),
    timelineEnd: Math.max(...normalizedTasks.map((task) => task.end)),
  };
}

function expandScene(scene: GanttScene, options: { copies: number; dayOffset: number; labelSuffixes: string[] }): GanttScene {
  const baseRows = scene.rowLabels.length;
  const tasks: GanttTask[] = [];
  const rowLabels: string[] = [];

  for (let copyIndex = 0; copyIndex < options.copies; copyIndex += 1) {
    const suffix = options.labelSuffixes[copyIndex] ?? ` ${copyIndex + 1}`;
    const taskIdPrefix = `copy-${copyIndex + 1}`;
    const taskIdMap = new Map<string, string>();
    const rowOffset = copyIndex * baseRows;
    const dateOffset = copyIndex * options.dayOffset;

    scene.tasks.forEach((task) => {
      const nextId = `${taskIdPrefix}-${task.id}`;
      taskIdMap.set(task.id, nextId);
      tasks.push({
        ...task,
        id: nextId,
        rowIndex: task.rowIndex + rowOffset,
        start: task.start + dateOffset,
        end: task.end + dateOffset,
        label: `${task.label}${suffix}`,
        dependencies: task.dependencies?.slice(),
      });
    });

    scene.rowLabels.forEach((label) => {
      rowLabels.push(`${label}${suffix}`);
    });

    tasks.forEach((task) => {
      if (!task.id.startsWith(taskIdPrefix)) {
        return;
      }

      const sourceTask = scene.tasks.find((candidate) => `${taskIdPrefix}-${candidate.id}` === task.id);
      if (!sourceTask?.dependencies?.length) {
        return;
      }

      task.dependencies = sourceTask.dependencies.map((dependency) => taskIdMap.get(dependency) ?? dependency);
    });
  }

  return {
    tasks,
    rowLabels,
    timelineStart: Math.min(...tasks.map((task) => task.start)),
    timelineEnd: Math.max(...tasks.map((task) => task.end)),
  };
}

function fontUrl(path: string): string {
  return new URL(path, window.location.href).href;
}

function pluginUrl(path: string): string {
  return new URL(path, window.location.href).href;
}

function demoMsdfManifestUrls() {
  return {
    400: fontUrl('./fonts/atkinson-hyperlegible-400-msdf.json'),
    700: fontUrl('./fonts/atkinson-hyperlegible-700-msdf.json'),
  };
}

function createEditConfig(defaultMode: 'view' | 'select' | 'edit'): GanttConfig['edit'] {
  return {
    enabled: true,
    defaultMode,
    drag: { allowRowChange: true },
    resize: { enabled: true, handleWidthPx: 14, minDurationDays: 1 },
    snap: { mode: 'day' },
    callbacks: {
      onTaskEditCommit: async (event) => ({
        ...event.proposedTask,
        dependencies: event.proposedTask.dependencies?.slice(),
      }),
    },
  };
}

function tallerDemoHeight(height: number): number {
  return Math.round(height * DEMO_CHART_HEIGHT_SCALE);
}

function createDemoConfig(
  scene: GanttScene,
  themeId: DemoThemeId,
  msdfManifestUrls: Record<string, string>,
  options: {
    title: string;
    height: number;
    defaultMode: 'view' | 'select' | 'edit';
    plugins?: GanttConfig['plugins'];
    statusText?: string;
  },
): GanttConfig {
  const base = buildThemeConfig(scene, themeId, msdfManifestUrls);

  return {
    ...base,
    container: {
      ...base.container,
      height: options.height,
      toolbar: {
        position: 'top',
        ...base.container?.toolbar,
      },
    },
    edit: createEditConfig(options.defaultMode),
    ui: {
      ...base.ui,
      title: options.title,
      showHud: false,
      showInspector: false,
      showToolbar: true,
      showStatusLine: true,
      statusText: options.statusText ?? '',
    },
    plugins: options.plugins,
  };
}

function buildPage(): string {
  return `
    <main class="landing-page">
      <header class="landing-topbar reveal">
        <a class="landing-brand" href="#top" aria-label="PaperGantt home">
          <span class="landing-brand__mark">G</span>
          <span class="landing-brand__copy">
            <strong>PaperGantt</strong>
          </span>
        </a>
        <a class="landing-button landing-button--ghost" href="${REPO_URL}" target="_blank" rel="noreferrer">View Source</a>
      </header>

      <section class="hero-block reveal" id="top" style="--delay: 80ms;">
        <div class="hero-copy">
          <p class="hero-kicker">Open source WebGL2 gantt library</p>
          <h1>PaperGantt</h1>
        </div>
      </section>

      <section class="demo-section reveal" id="timeline" style="--delay: 140ms;">
        <div class="demo-copy">
          <p class="section-label">Timeline</p>
          <h2>Navigate the schedule.</h2>
          <p>Starts in view mode. Mousewheel zoom. Drag to pan. Stay on the timeline.</p>
        </div>
        <div class="demo-frame demo-frame--light ${PAPER_LIGHT_THEME}">
          <div class="demo-chart demo-chart--themed" data-demo-mount="timeline-demo" aria-label="Timeline demo"></div>
        </div>
      </section>

      <section class="demo-section demo-section--reverse reveal" id="editing" style="--delay: 200ms;">
        <div class="demo-copy">
          <p class="section-label">Editing</p>
          <h2>Edit inline.</h2>
          <p>Starts in edit mode. Resize bars, move work, and commit changes on the chart.</p>
        </div>
        <div class="demo-frame demo-frame--light ${PAPER_LIGHT_THEME}">
          <div class="demo-chart demo-chart--themed" data-demo-mount="editing-demo" aria-label="Editing demo"></div>
        </div>
      </section>

      <section class="demo-section reveal" id="plugins" style="--delay: 260ms;">
        <div class="demo-copy">
          <p class="section-label">Extensibility</p>
          <h2>Extend the core.</h2>
          <p>Custom modules add behavior without changing the renderer or the data model.</p>
        </div>
        <div class="demo-frame demo-frame--light ${getDemoTheme('standard').className}">
          <div class="demo-chart demo-chart--themed" data-demo-mount="json-plugin" aria-label="JSON plugin demo"></div>
        </div>
      </section>
    </main>
  `;
}

function getMount(id: MountId): HTMLElement {
  const element = appRoot.querySelector(`[data-demo-mount="${id}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing mount for "${id}".`);
  }
  return element;
}

function createTimelineConfig(msdfManifestUrls: Record<string, string>): GanttConfig {
  return createDemoConfig(
    expandScene(timelineScene, {
      copies: 3,
      dayOffset: 16,
      labelSuffixes: [' A', ' B', ' C'],
    }),
    'paper-light',
    msdfManifestUrls,
    {
    title: 'Timeline view',
    height: tallerDemoHeight(408),
    defaultMode: 'view',
    statusText: 'View mode. Mousewheel zoom and drag to pan.',
    },
  );
}

function createEditingConfig(msdfManifestUrls: Record<string, string>): GanttConfig {
  return createDemoConfig(
    expandScene(editingScene, {
      copies: 3,
      dayOffset: 14,
      labelSuffixes: [' A', ' B', ' C'],
    }),
    'paper-light',
    msdfManifestUrls,
    {
    title: 'Editing demo',
    height: tallerDemoHeight(426),
    defaultMode: 'edit',
    statusText: 'Edit mode. Resize bars, move work, commit changes.',
    },
  );
}

function createPluginConfig(msdfManifestUrls: Record<string, string>): GanttConfig {
  return createDemoConfig(
    expandScene(jsonPluginScene, {
      copies: 3,
      dayOffset: 15,
      labelSuffixes: [' A', ' B', ' C'],
    }),
    'standard',
    msdfManifestUrls,
    {
    title: 'Extensibility demo',
    height: tallerDemoHeight(438),
    defaultMode: 'view',
    statusText: 'Extensions add behavior without changing the core.',
    plugins: [
      {
        source: {
          type: 'esm',
          url: pluginUrl('./plugins/editable-commit-log-plugin.mjs'),
        },
        idHint: 'json-plugin',
        options: {
          panelLabel: 'Extension module',
          accentColor: '#d57a35',
          maxCommits: 4,
        },
      },
    ],
    },
  );
}

async function mountDemo(target: HTMLElement, config: GanttConfig): Promise<GanttHost> {
  return createGanttHost(target, config);
}

async function boot(): Promise<void> {
  appRoot.innerHTML = buildPage();

  const msdfManifestUrls = demoMsdfManifestUrls();
  const hosts: GanttHost[] = [];

  try {
    hosts.push(await mountDemo(getMount('timeline-demo'), createTimelineConfig(msdfManifestUrls)));
    hosts.push(await mountDemo(getMount('editing-demo'), createEditingConfig(msdfManifestUrls)));
    hosts.push(await mountDemo(getMount('json-plugin'), createPluginConfig(msdfManifestUrls)));
  } catch (error) {
    await Promise.allSettled(hosts.map((host) => host.dispose()));
    throw error;
  }
}

boot().catch((error) => {
  console.error(error);
  appRoot.innerHTML = `
    <main class="landing-page">
      <section class="demo-error">
        <h1>PaperGantt</h1>
      </section>
    </main>
  `;
});
