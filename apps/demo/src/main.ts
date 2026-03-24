import './styles.css';
import { createGanttHost, createSampleScene, type GanttConfig, type GanttHost, type GanttScene } from '@gantt/gantt-core';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Missing application root element.');
}

const SAMPLE_OPTIONS = {
  seed: 24,
  orderCount: 56,
};

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

function buildPage(scene: GanttScene): string {
  return `
    <main class="demo-page">
      <section class="demo-hero">
        <div class="demo-hero__copy">
          <p class="demo-eyebrow">Gantt Core Showcase</p>
          <h1>Two gantt renders, each with its own horizontal stage.</h1>
          <p class="demo-lede">
            The demo page now reads as a guided walkthrough instead of a side-by-side lab bench.
            Each gantt gets a full horizontal section, with narrative copy alternating left and right so the chart stays the hero.
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
            <span class="demo-stat__label">Plugin Asset</span>
            <strong>ESM safe plugin</strong>
          </div>
        </div>
      </section>

      <section class="demo-showcase" aria-label="Renderer comparison">
        <article class="demo-band demo-band--baseline">
          <div class="demo-band__copy">
            <p class="demo-card__eyebrow">Baseline</p>
            <div class="demo-card__heading">
              <h2>Core renderer only</h2>
              <p>
                This first section is the plain host: camera, selection, HUD, toolbar, and the stock render path.
                It gives the page a clean “this is the engine by itself” reference point.
              </p>
            </div>
            <ul class="demo-note-list">
              <li>Pure <code>createGanttHost(...)</code> render path</li>
              <li>Shared sample scene for direct visual comparison</li>
              <li>Each chart gets its own full-width narrative band</li>
            </ul>
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
                The second section keeps the chart large, but shifts the explanation to the opposite side.
                That makes the plugin differences feel editorial rather than cramped into a second card.
              </p>
            </div>
            <ul class="demo-note-list">
              <li>Loads the safe plugin from <code>public/plugins</code></li>
              <li>Styles selection and hover through plugin hooks</li>
              <li>Renders a live overlay badge inside the chart surface</li>
            </ul>
          </div>
          <div class="demo-band__visual">
            <div class="demo-chart-frame">
              <div class="demo-chart demo-chart--plugin" data-demo-mount="plugin" aria-label="Plugin-enabled gantt chart"></div>
            </div>
          </div>
        </article>
      </section>
    </main>
  `;
}

async function mountDemoHost(target: HTMLElement, config: GanttConfig): Promise<GanttHost> {
  const host = await createGanttHost(target, config);
  host.getController().animateToZoomPresetId('month');
  return host;
}

async function boot(): Promise<void> {
  const sharedScene = createSampleScene(SAMPLE_OPTIONS);
  root.innerHTML = buildPage(sharedScene);

  const baselineMount = root.querySelector<HTMLElement>('[data-demo-mount="baseline"]');
  const pluginMount = root.querySelector<HTMLElement>('[data-demo-mount="plugin"]');

  if (!baselineMount || !pluginMount) {
    throw new Error('Missing showcase mount points.');
  }

  const baseConfig: GanttConfig = {
    data: {
      type: 'static',
      scene: cloneScene(sharedScene),
    },
    font: {
      weight: 400,
      msdfManifestUrls: demoMsdfManifestUrls(),
    },
    container: {
      height: 500,
      toolbar: {
        position: 'top',
      },
    },
    ui: {
      title: 'Core only',
      showInspector: false,
      statusText: 'Drag to pan, wheel to scroll, ctrl + wheel zooms time. Double-click a task to focus it.',
    },
  };

  const pluginConfig: GanttConfig = {
    data: {
      type: 'static',
      scene: cloneScene(sharedScene),
    },
    font: {
      weight: 700,
      msdfManifestUrls: demoMsdfManifestUrls(),
    },
    container: {
      height: 500,
      toolbar: {
        position: 'top',
      },
    },
    ui: {
      title: 'Safe plugin active',
      showInspector: false,
      statusText: 'The plugin badge is rendered inside the chart host and updates from safe runtime hooks.',
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

  const hosts: GanttHost[] = [];

  try {
    hosts.push(await mountDemoHost(baselineMount, baseConfig));
    hosts.push(await mountDemoHost(pluginMount, pluginConfig));
  } catch (error) {
    await Promise.allSettled(hosts.map((host) => host.dispose()));
    throw error;
  }
}

boot().catch((error) => {
  console.error(error);
  root.innerHTML = `
    <main class="demo-page">
      <section class="demo-error">
        <p class="demo-eyebrow">Boot Failure</p>
        <h1>Failed to render the demo showcase.</h1>
        <p>Open the console for the full stack trace.</p>
      </section>
    </main>
  `;
});
