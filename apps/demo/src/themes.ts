import type { GanttConfig, GanttScene } from '@gantt/gantt-core';

export type DemoThemeId =
  | 'standard'
  | 'paper-light'
  | 'paper-dark'
  | 'vscode'
  | 'warm'
  | 'cool'
  | 'orchid';

export type DemoTheme = {
  id: DemoThemeId;
  label: string;
  description: string;
  className: string;
  config: Pick<GanttConfig, 'render' | 'display' | 'font' | 'container' | 'ui'>;
};

// To add a new theme:
// 1. Add a preset entry here with a unique `id`.
// 2. Add a matching `.gantt-theme--<id>` block in `themes.css`.
export const DEMO_THEMES: DemoTheme[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'The stock dark renderer treatment, kept as a preset so the theme system has a stable default anchor.',
    className: 'gantt-theme--standard',
    config: {
      font: {
        weight: 400,
        sizePx: 14,
      },
      container: {
        height: 500,
        toolbar: {
          position: 'top',
        },
      },
      ui: {
        title: 'Standard theme',
        showInspector: false,
        statusText:
          'The standard preset keeps the default renderer personality intact so other themes have a clear baseline.',
      },
    },
  },
  {
    id: 'paper-light',
    label: 'Paper Light',
    description: 'A paper-toned light theme with soft rows, rounded bars, warmer dependencies, and editorial rather than dashboard energy.',
    className: 'gantt-theme--paper-light',
    config: {
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
      },
      container: {
        height: 500,
        toolbar: {
          position: 'top',
        },
      },
      ui: {
        title: 'Paper light theme',
        showInspector: false,
        statusText:
          'Paper light uses dashed grid rhythm, a taller header, rounded bars, and warmer dependency styling.',
      },
    },
  },
  {
    id: 'paper-dark',
    label: 'Paper Dark',
    description: 'A darker parchment treatment with sepia contrast, heavier header banding, and warmer type over charred paper.',
    className: 'gantt-theme--paper-dark',
    config: {
      render: {
        barHeight: 18,
        headerHeight: 54,
        rowPitch: 31,
      },
      display: {
        canvasBackground: '#17110e',
        rows: {
          evenFill: 'rgba(44, 33, 26, 0.94)',
          oddFill: 'rgba(33, 25, 20, 0.94)',
          separatorColor: 'rgba(205, 181, 142, 0.14)',
          separatorThickness: 1,
          separatorStyle: 'solid',
        },
        grid: {
          color: 'rgba(188, 160, 120, 0.14)',
          thickness: 1,
          style: 'dashed',
          dashPx: 5,
          gapPx: 8,
        },
        tasks: {
          palette: ['#d0a15f', '#7bb7d9', '#a6c47b', '#c98f7a', '#d3c05e', '#8b9dde'],
          barRadiusPx: 8,
          textColor: '#f4e9d8',
          textShadowColor: 'rgba(9, 6, 4, 0.8)',
          selectedBoost: 1.1,
          hoveredBoost: 1.05,
          idleOpacity: 0.96,
        },
        header: {
          backgroundColor: '#2a1d16',
          borderColor: '#7e654d',
          tickColor: '#b89972',
          tickHeightPx: 12,
          textColor: '#f0dcc2',
          textSizePx: 17,
        },
        dependencies: {
          color: '#d0b182',
          hoveredColor: '#7bb7d9',
          selectedColor: '#d88d66',
          thickness: 1.5,
          hoveredThickness: 2,
          selectedThickness: 2.5,
          cornerRadiusPx: 14,
          verticalOffsetPx: 10,
          arrowLengthPx: 10,
          arrowWidthPx: 5,
        },
      },
      font: {
        weight: 700,
        sizePx: 14,
      },
      container: {
        height: 500,
        toolbar: {
          position: 'top',
        },
      },
      ui: {
        title: 'Paper dark theme',
        showInspector: false,
        statusText:
          'Paper dark keeps the editorial paper feel but moves it into a darker, sepia-weighted reading mode.',
      },
    },
  },
  {
    id: 'vscode',
    label: 'VS Code',
    description: 'A workbench-flavored preset inspired by editor chrome: restrained dark neutrals, sharp bars, and cooler accents.',
    className: 'gantt-theme--vscode',
    config: {
      render: {
        barHeight: 16,
        headerHeight: 44,
        rowPitch: 28,
      },
      display: {
        canvasBackground: '#1e1e1e',
        rows: {
          evenFill: '#252526',
          oddFill: '#1f1f1f',
          separatorColor: 'rgba(128, 128, 128, 0.18)',
          separatorThickness: 1,
          separatorStyle: 'solid',
        },
        grid: {
          color: 'rgba(88, 166, 255, 0.18)',
          thickness: 1,
          style: 'dashed',
          dashPx: 4,
          gapPx: 8,
        },
        tasks: {
          palette: ['#3794ff', '#d7ba7d', '#4ec9b0', '#c586c0', '#ce9178', '#9cdcfe'],
          barRadiusPx: 4,
          textColor: '#d4d4d4',
          textShadowColor: 'rgba(0, 0, 0, 0.72)',
          selectedBoost: 1.08,
          hoveredBoost: 1.04,
        },
        header: {
          backgroundColor: '#252526',
          borderColor: '#3c3c3c',
          tickColor: '#6a9955',
          tickHeightPx: 9,
          textColor: '#cccccc',
          textSizePx: 14,
        },
        dependencies: {
          color: '#8cdcfe',
          hoveredColor: '#4ec9b0',
          selectedColor: '#d7ba7d',
          thickness: 1.4,
          hoveredThickness: 1.9,
          selectedThickness: 2.3,
          cornerRadiusPx: 10,
          verticalOffsetPx: 9,
          arrowLengthPx: 9,
          arrowWidthPx: 4,
        },
      },
      font: {
        weight: 400,
        sizePx: 13,
      },
      container: {
        height: 500,
        toolbar: {
          position: 'top',
        },
      },
      ui: {
        title: 'VS Code theme',
        showInspector: false,
        statusText:
          'VS Code keeps the palette controlled and workbench-like: neutral rows, crisp bars, cooler grid and dependency accents.',
      },
    },
  },
  {
    id: 'warm',
    label: 'Warm',
    description: 'A sunset-leaning preset with amber grid lines, brick-red bars, and a more tactile workshop feel.',
    className: 'gantt-theme--warm',
    config: {
      render: {
        barHeight: 19,
        headerHeight: 50,
        rowPitch: 31,
      },
      display: {
        canvasBackground: '#241410',
        rows: {
          evenFill: 'rgba(58, 26, 18, 0.94)',
          oddFill: 'rgba(41, 20, 14, 0.94)',
          separatorColor: 'rgba(233, 184, 122, 0.16)',
          separatorStyle: 'dashed',
          separatorDashPx: 5,
          separatorGapPx: 8,
        },
        grid: {
          color: 'rgba(250, 203, 118, 0.18)',
          thickness: 1,
          style: 'dotted',
          dashPx: 3,
          gapPx: 9,
        },
        tasks: {
          palette: ['#f08d49', '#d94f3d', '#f2c14e', '#b56576', '#4fb286', '#d8a48f'],
          barRadiusPx: 10,
          textColor: '#fff0cf',
          textShadowColor: 'rgba(25, 9, 4, 0.82)',
        },
        header: {
          backgroundColor: '#8f422d',
          borderColor: '#f3c178',
          tickColor: '#ffe2aa',
          tickHeightPx: 12,
          textColor: '#fff6df',
          textSizePx: 16,
        },
        dependencies: {
          color: '#f3c178',
          hoveredColor: '#4fb286',
          selectedColor: '#f08d49',
          thickness: 1.8,
          hoveredThickness: 2.2,
          selectedThickness: 2.7,
          cornerRadiusPx: 16,
          verticalOffsetPx: 12,
          arrowLengthPx: 11,
          arrowWidthPx: 5,
        },
      },
      font: {
        weight: 700,
        sizePx: 14,
      },
      container: {
        height: 500,
        toolbar: {
          position: 'top',
        },
      },
      ui: {
        title: 'Warm theme',
        showInspector: false,
        statusText:
          'Warm leans into ember tones and workshop contrast, with thicker dependency lines and more tactile rhythm.',
      },
    },
  },
  {
    id: 'cool',
    label: 'Cool',
    description: 'A cooler slate-and-teal preset with glacial highlights, restrained contrast, and softer atmospheric depth.',
    className: 'gantt-theme--cool',
    config: {
      render: {
        barHeight: 18,
        headerHeight: 50,
        rowPitch: 30,
      },
      display: {
        canvasBackground: '#0f1820',
        rows: {
          evenFill: 'rgba(18, 34, 42, 0.94)',
          oddFill: 'rgba(13, 26, 34, 0.94)',
          separatorColor: 'rgba(150, 210, 220, 0.14)',
          separatorStyle: 'solid',
        },
        grid: {
          color: 'rgba(126, 187, 214, 0.2)',
          thickness: 1,
          style: 'dashed',
          dashPx: 4,
          gapPx: 10,
        },
        tasks: {
          palette: ['#68c3d4', '#4f9dff', '#7ce0b8', '#8da7ff', '#a5d7e8', '#4fb7a8'],
          barRadiusPx: 8,
          textColor: '#e6f7ff',
          textShadowColor: 'rgba(4, 9, 14, 0.78)',
        },
        header: {
          backgroundColor: '#173342',
          borderColor: '#79b8d7',
          tickColor: '#c6edf5',
          tickHeightPx: 11,
          textColor: '#ecfbff',
          textSizePx: 16,
        },
        dependencies: {
          color: '#8fe7ef',
          hoveredColor: '#7ce0b8',
          selectedColor: '#4f9dff',
          thickness: 1.6,
          hoveredThickness: 2.1,
          selectedThickness: 2.5,
          cornerRadiusPx: 14,
          verticalOffsetPx: 11,
          arrowLengthPx: 10,
          arrowWidthPx: 5,
        },
      },
      font: {
        weight: 400,
        sizePx: 14,
      },
      container: {
        height: 500,
        toolbar: {
          position: 'top',
        },
      },
      ui: {
        title: 'Cool theme',
        showInspector: false,
        statusText:
          'Cool swaps the palette toward slate, teal, and icy highlights without changing layout or interaction behavior.',
      },
    },
  },
  {
    id: 'orchid',
    label: 'Orchid',
    description: 'A louder, more theatrical preset with neon pinks, citrus arrows, dotted grid cadence, and a stage-lit header.',
    className: 'gantt-theme--orchid',
    config: {
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
      },
      container: {
        height: 520,
        toolbar: {
          position: 'top',
        },
      },
      ui: {
        title: 'Orchid theme',
        showInspector: false,
        statusText:
          'Orchid is the loud preset: dotted grid, stage-lit header, neon palette, and chunkier dependency routing.',
      },
    },
  },
];

export const DEFAULT_THEME_ID: DemoThemeId = 'paper-dark';
export const THEME_SHELL_CLASSES = DEMO_THEMES.map((theme) => theme.className);

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

export function getDemoTheme(themeId: DemoThemeId): DemoTheme {
  const theme = DEMO_THEMES.find((candidate) => candidate.id === themeId);
  if (!theme) {
    throw new Error(`Unknown demo theme: ${themeId}`);
  }
  return theme;
}

export function buildThemeConfig(
  scene: GanttScene,
  themeId: DemoThemeId,
  msdfManifestUrls: Record<string, string>,
): GanttConfig {
  const theme = getDemoTheme(themeId);
  return {
    data: {
      type: 'static',
      scene: cloneScene(scene),
    },
    render: theme.config.render,
    display: theme.config.display,
    font: {
      msdfManifestUrls,
      ...(theme.config.font ?? {}),
    },
    container: {
      height: 500,
      ...(theme.config.container ?? {}),
      toolbar: {
        position: 'top',
        ...(theme.config.container?.toolbar ?? {}),
      },
    },
    ui: {
      showInspector: false,
      ...(theme.config.ui ?? {}),
    },
  };
}
