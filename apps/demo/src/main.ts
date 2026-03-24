import './styles.css';
import {
  createGanttHost,
  createSampleScene,
  type GanttConfig,
  type GanttHost,
  type GanttScene,
} from '@gantt/gantt-core';

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
          <h1>Four gantt renders, each tuned for a different visual language.</h1>
          <p class="demo-lede">
            The demo page now acts as a display-system test bench.
            Each gantt gets a full horizontal section so layout, plugin behavior, and render styling can be compared without squeezing them into a single lab card.
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
            <strong>Baseline, plugin, light mode, and wild mode</strong>
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

        <article class="demo-band demo-band--light">
          <div class="demo-band__copy demo-band__copy--light">
            <p class="demo-card__eyebrow">Display Config</p>
            <div class="demo-card__heading">
              <h2>Light mode stress test</h2>
              <p>
                The third section exists to exercise the new display surface.
                It swaps the dark renderer treatment for a paper-toned light mode with rounded bars, custom grid styling, warmer arrows, and a taller header.
              </p>
            </div>
            <ul class="demo-note-list">
              <li>Uses declarative <code>display</code> config instead of plugin shaders</li>
              <li>Tests bar radius, grid styling, header colors, text color, and dependency tuning</li>
              <li>Keeps the same scene data so visual differences are attributable to config only</li>
            </ul>
          </div>
          <div class="demo-band__visual">
            <div class="demo-chart-frame demo-chart-frame--light">
              <div class="demo-chart demo-chart--light" data-demo-mount="light" aria-label="Light mode gantt chart"></div>
            </div>
          </div>
        </article>

        <article class="demo-band demo-band--wild demo-band--reverse">
          <div class="demo-band__copy demo-band__copy--wild">
            <p class="demo-card__eyebrow">Wild Config</p>
            <div class="demo-card__heading">
              <h2>High-contrast neon stress test</h2>
              <p>
                The fourth section pushes the display system harder.
                It keeps the same data and interaction model, but swaps in louder colors, dotted grid rhythm, chunkier arrows, taller rows, and a much more theatrical header treatment.
              </p>
            </div>
            <ul class="demo-note-list">
              <li>Exercises aggressive color palette and radius choices</li>
              <li>Uses dotted grid and heavier dependency routing</li>
              <li>Shows that display config can get weird without any plugin shader hooks</li>
            </ul>
          </div>
          <div class="demo-band__visual">
            <div class="demo-chart-frame demo-chart-frame--wild">
              <div class="demo-chart demo-chart--wild" data-demo-mount="wild" aria-label="Wild styling gantt chart"></div>
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
  root.innerHTML = buildPage(sharedScene);

  const baselineMount = root.querySelector<HTMLElement>(
    '[data-demo-mount="baseline"]',
  );
  const pluginMount = root.querySelector<HTMLElement>(
    '[data-demo-mount="plugin"]',
  );
  const lightMount = root.querySelector<HTMLElement>(
    '[data-demo-mount="light"]',
  );
  const wildMount = root.querySelector<HTMLElement>(
    '[data-demo-mount="wild"]',
  );

  if (!baselineMount || !pluginMount || !lightMount || !wildMount) {
    throw new Error('Missing showcase mount points.');
  }

  const baseConfig: GanttConfig = {
    data: {
      type: 'static',
      scene: cloneScene(sharedScene),
    },
    font: {
      weight: 400,
      sizePx: 14,
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
      statusText:
        'Drag to pan, wheel to scroll, ctrl + wheel zooms time. Double-click a task to focus it.',
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
      statusText:
        'The plugin badge is rendered inside the chart host and updates from safe runtime hooks.',
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

  const lightConfig: GanttConfig = {
    data: {
      type: 'static',
      scene: cloneScene(sharedScene),
    },
    render: {
      barHeight: 18,
      headerHeight: 52,
      rowPitch: 30,
    },
    display: {
      canvasBackground: '#f4eee3',
      rows: {
        evenFill: '#fffaf1',
        oddFill: '#f3eadc',
        separatorColor: 'rgba(112, 91, 64, 0.18)',
        separatorThickness: 1,
        separatorStyle: 'solid',
      },
      grid: {
        color: 'rgba(102, 84, 62, 0.18)',
        thickness: 1,
        style: 'dashed',
        dashPx: 5,
        gapPx: 7,
      },
      tasks: {
        palette: ['#2f7ec9', '#d68a31', '#5ea774', '#8470d1', '#c95f45', '#4f9aa8'],
        barRadiusPx: 9,
        textColor: '#1d1b19',
        textShadowColor: 'rgba(255, 250, 240, 0.72)',
        selectedBoost: 1.08,
        hoveredBoost: 1.04,
        idleOpacity: 0.94,
        hoveredOpacity: 0.98,
        selectedOpacity: 1,
      },
      header: {
        backgroundColor: '#fbf4e8',
        borderColor: '#cdbb9f',
        tickColor: '#b89f7a',
        tickHeightPx: 11,
        textColor: '#6c5435',
        textSizePx: 16,
      },
      dependencies: {
        color: '#8b7355',
        hoveredColor: '#2f7ec9',
        selectedColor: '#c95f45',
        thickness: 1.35,
        hoveredThickness: 1.9,
        selectedThickness: 2.4,
        cornerRadiusPx: 12,
        verticalOffsetPx: 10,
        arrowLengthPx: 10,
        arrowWidthPx: 5,
        showArrowheads: true,
      },
    },
    font: {
      weight: 400,
      sizePx: 14,
      msdfManifestUrls: demoMsdfManifestUrls(),
    },
    container: {
      height: 500,
      toolbar: {
        position: 'top',
      },
    },
    ui: {
      title: 'Light mode config',
      showInspector: false,
      statusText:
        'This instance is a display-config test: dashed grid, taller header, rounded bars, and warmer dependency styling.',
    },
  };

  const wildConfig: GanttConfig = {
    data: {
      type: 'static',
      scene: cloneScene(sharedScene),
    },
    render: {
      barHeight: 20,
      headerHeight: 60,
      rowPitch: 34,
    },
    display: {
      canvasBackground: '#130716',
      rows: {
        evenFill: 'rgba(34, 11, 48, 0.95)',
        oddFill: 'rgba(16, 22, 46, 0.94)',
        separatorColor: 'rgba(255, 118, 179, 0.22)',
        separatorThickness: 1.25,
        separatorStyle: 'dotted',
        separatorDashPx: 3,
        separatorGapPx: 8,
      },
      grid: {
        color: 'rgba(122, 249, 255, 0.22)',
        thickness: 1.15,
        style: 'dotted',
        dashPx: 3,
        gapPx: 10,
      },
      tasks: {
        palette: ['#ff5a90', '#ffd84f', '#6effc4', '#67d7ff', '#ff8b3d', '#b18cff'],
        barRadiusPx: 12,
        textColor: '#fff3d1',
        textShadowColor: 'rgba(20, 0, 20, 0.68)',
        selectedBoost: 1.16,
        hoveredBoost: 1.08,
        idleOpacity: 0.95,
        hoveredOpacity: 0.98,
        selectedOpacity: 1,
      },
      header: {
        backgroundColor: '#ff4f88',
        borderColor: '#ffe15a',
        tickColor: '#fff4bc',
        tickHeightPx: 14,
        textColor: '#180314',
        textSizePx: 18,
      },
      dependencies: {
        color: '#ffe15a',
        hoveredColor: '#7bf9ff',
        selectedColor: '#ff7c6b',
        thickness: 2.1,
        hoveredThickness: 2.7,
        selectedThickness: 3.2,
        cornerRadiusPx: 18,
        verticalOffsetPx: 14,
        arrowLengthPx: 12,
        arrowWidthPx: 6,
        showArrowheads: true,
      },
    },
    font: {
      weight: 700,
      sizePx: 15,
      msdfManifestUrls: demoMsdfManifestUrls(),
    },
    container: {
      height: 520,
      toolbar: {
        position: 'top',
      },
    },
    ui: {
      title: 'Wild mode config',
      showInspector: false,
      statusText:
        'This instance intentionally goes loud: neon palette, dotted grid, oversized header, and heavier dependency arrows.',
    },
  };

  const hosts: GanttHost[] = [];

  try {
    hosts.push(await mountDemoHost(baselineMount, baseConfig));
    hosts.push(await mountDemoHost(pluginMount, pluginConfig));
    hosts.push(await mountDemoHost(lightMount, lightConfig));
    hosts.push(await mountDemoHost(wildMount, wildConfig));
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
