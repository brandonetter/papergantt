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
  const paperLightTheme = getDemoTheme('paper-light');
  const defaultTheme = getDemoTheme(DEFAULT_THEME_ID);

  return `
    <main class="demo-page">
      <section class="demo-hero">
        <div class="demo-hero__copy">
          <p class="demo-eyebrow">Gantt Core Showcase</p>
          <h1>Four gantt renders with themes split cleanly into config and CSS.</h1>
          <p class="demo-lede">
            The demo page now acts as a display-system test bench.
            Each gantt gets a full horizontal section so layout, plugin behavior, and theming can be compared without squeezing everything into a single lab card.
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
            <strong>Baseline, plugin, paper preset, and theme picker</strong>
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
                It gives the page a clean "this is the engine by itself" reference point.
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
              <div
                class="demo-chart demo-chart--plugin"
                data-demo-mount="plugin"
                aria-label="Plugin-enabled gantt chart"
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
                The third section isolates the paper-light theme as a fixed reference.
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
                The fourth section turns the new theme presets into an interaction surface.
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
  const themePickerMount = root.querySelector<HTMLElement>(
    '[data-demo-mount="theme-picker"]',
  );
  const themePickerFrame = themePickerMount?.parentElement;
  const themeLabel = root.querySelector<HTMLElement>('[data-theme-label]');
  const themeDescription = root.querySelector<HTMLElement>(
    '[data-theme-description]',
  );
  const themeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-theme-id]'),
  );

  if (
    !baselineMount ||
    !pluginMount ||
    !lightMount ||
    !themePickerMount ||
    !(themePickerFrame instanceof HTMLElement) ||
    !themeLabel ||
    !themeDescription ||
    themeButtons.length !== DEMO_THEMES.length
  ) {
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
      msdfManifestUrls,
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
      msdfManifestUrls,
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

  const hosts: GanttHost[] = [];
  let themePreviewHost: GanttHost | null = null;
  let themeRenderToken = 0;

  function setThemeButtonState(activeThemeId: DemoThemeId, busy: boolean): void {
    for (const button of themeButtons) {
      const themeId = button.dataset.themeId as DemoThemeId;
      const active = themeId === activeThemeId;
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = busy;
    }
  }

  function applyThemeShell(themeId: DemoThemeId): void {
    themePickerFrame.classList.remove(...THEME_SHELL_CLASSES);
    themePickerFrame.classList.add(getDemoTheme(themeId).className);
  }

  async function mountThemePreview(themeId: DemoThemeId): Promise<void> {
    const token = ++themeRenderToken;
    const theme = getDemoTheme(themeId);

    themeLabel.textContent = theme.label;
    themeDescription.textContent = theme.description;
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
      themePickerMount,
      buildThemeConfig(sharedScene, themeId, msdfManifestUrls),
    );
    if (token !== themeRenderToken) {
      await nextHost.dispose();
      return;
    }

    themePreviewHost = nextHost;
    setThemeButtonState(themeId, false);
  }

  try {
    hosts.push(await mountDemoHost(baselineMount, baseConfig));
    hosts.push(await mountDemoHost(pluginMount, pluginConfig));
    hosts.push(
      await mountDemoHost(
        lightMount,
        buildThemeConfig(sharedScene, 'paper-light', msdfManifestUrls),
      ),
    );
    await mountThemePreview(DEFAULT_THEME_ID);
    if (themePreviewHost) {
      hosts.push(themePreviewHost);
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
