import { normalizeConfig } from '@gantt/gantt-core';

describe('config normalization', () => {
  it('applies defaults that match the legacy runtime behavior', () => {
    const config = normalizeConfig({});

    expect(config.render.rowPitch).toBe(28);
    expect(config.render.barHeight).toBe(14);
    expect(config.render.headerHeight).toBe(36);
    expect(config.ui.showHud).toBe(true);
    expect(config.ui.showInspector).toBe(true);
    expect(config.ui.showToolbar).toBe(true);
    expect(config.ui.showStatusLine).toBe(true);
    expect(config.font.sizePx).toBe(12);
    expect(config.container.toolbar.position).toBe('top');
    expect(config.container.toolbar.height).toBe(56);
    expect(config.container.header.visible).toBe(false);
    expect(config.container.footer.visible).toBe(false);
    expect(config.modules.builtins).toEqual(['camera-controls', 'selection', 'hud-inspector', 'toolbar']);
  });

  it('merges explicit overrides', () => {
    const config = normalizeConfig({
      ui: {
        showHud: false,
      },
      render: {
        rowPitch: 44,
      },
      container: {
        width: 800,
        height: 300,
        footer: {
          visible: true,
          height: 48,
        },
        toolbar: {
          position: 'bottom',
          height: 64,
        },
      },
    });

    expect(config.ui.showHud).toBe(false);
    expect(config.ui.showInspector).toBe(true);
    expect(config.render.rowPitch).toBe(44);
    expect(config.render.barHeight).toBe(14);
    expect(config.container.width).toBe(800);
    expect(config.container.height).toBe(300);
    expect(config.container.footer.visible).toBe(true);
    expect(config.container.footer.height).toBe(48);
    expect(config.container.toolbar.position).toBe('bottom');
    expect(config.container.toolbar.height).toBe(64);
  });

  it('preserves font weight and per-weight manifest mappings', () => {
    const config = normalizeConfig({
      font: {
        family: 'Atkinson Hyperlegible',
        sizePx: 16,
        weight: 700,
        msdfManifestUrls: {
          400: '/fonts/atkinson-hyperlegible-400-msdf.json',
          700: '/fonts/atkinson-hyperlegible-700-msdf.json',
        },
      },
    });

    expect(config.font.family).toBe('Atkinson Hyperlegible');
    expect(config.font.sizePx).toBe(16);
    expect(config.font.weight).toBe(700);
    expect(config.font.msdfManifestUrls).toEqual({
      400: '/fonts/atkinson-hyperlegible-400-msdf.json',
      700: '/fonts/atkinson-hyperlegible-700-msdf.json',
    });
  });

  it('normalizes display config colors and nested styling overrides', () => {
    const config = normalizeConfig({
      display: {
        canvasBackground: '#f4eee3',
        rows: {
          evenFill: [255, 250, 241],
          separatorColor: 'rgba(112, 91, 64, 0.18)',
          separatorStyle: 'dashed',
        },
        tasks: {
          barRadiusPx: 9,
          textColor: '#1d1b19',
        },
        header: {
          textSizePx: 16,
        },
        dependencies: {
          showArrowheads: false,
          cornerRadiusPx: 12,
        },
      },
    });

    expect(config.display.canvasBackground).toEqual([0.9568627450980393, 0.9333333333333333, 0.8901960784313725, 1]);
    expect(config.display.rows.evenFill).toEqual([1, 0.9803921568627451, 0.9450980392156862, 1]);
    expect(config.display.rows.separatorStyle).toBe('dashed');
    expect(config.display.tasks.barRadiusPx).toBe(9);
    expect(config.display.tasks.textColor).toEqual([0.11372549019607843, 0.10588235294117647, 0.09803921568627451, 1]);
    expect(config.display.header.textSizePx).toBe(16);
    expect(config.display.dependencies.showArrowheads).toBe(false);
    expect(config.display.dependencies.cornerRadiusPx).toBe(12);
  });
});
