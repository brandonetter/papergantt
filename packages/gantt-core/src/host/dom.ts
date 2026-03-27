import type { GanttContainerDimension, GanttInteractionMode, NormalizedGanttConfig } from '../types';
import type { AppElements, ZoomPreset } from './types';

function getInteractionModeLabel(mode: GanttInteractionMode): string {
  switch (mode) {
    case 'edit':
      return 'Edit';
    case 'select':
      return 'Select';
    default:
      return 'View';
  }
}

function renderInteractionModeIcon(mode: GanttInteractionMode): string {
  switch (mode) {
    case 'edit':
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4.75L19 9.75 14.25 5 4 15.25V20Z" />
          <path d="M12.5 6.75 17.25 11.5" />
        </svg>
      `;
    case 'select':
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="1.5" stroke-dasharray="2.5 2.5" />
        </svg>
      `;
    default:
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.5 12.5v-3a2.5 2.5 0 0 1 5 0v5.5" />
          <path d="M12.5 12.5v-4a2.5 2.5 0 0 1 5 0V15" />
          <path d="M7.5 12.5V8.75a2.25 2.25 0 0 0-4.5 0V15.5a5.5 5.5 0 0 0 5.5 5.5H13" />
          <path d="M13 21h1.5a5.5 5.5 0 0 0 5.5-5.5v-2a2.5 2.5 0 0 0-5 0" />
        </svg>
      `;
  }
}

function renderInteractionModeButton(mode: GanttInteractionMode): string {
  const label = getInteractionModeLabel(mode);
  return `
    <button
      type="button"
      class="zoom-button mode-button"
      data-interaction-mode="${mode}"
      aria-label="${label}"
      aria-pressed="false"
      title="${label}"
    >
      <span class="toolbar-button__icon" aria-hidden="true">${renderInteractionModeIcon(mode)}</span>
      <span class="toolbar-button__label">${label}</span>
    </button>
  `;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
}

function toCssDimension(value: GanttContainerDimension | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'number' ? `${value}px` : value;
}

function configureSlot(element: HTMLDivElement, height: number): void {
  const size = `${height}px`;
  element.style.boxSizing = 'border-box';
  element.style.height = size;
  element.style.minHeight = size;
  element.style.maxHeight = size;
  element.style.flex = `0 0 ${size}`;
}

function applyContainerDimensions(root: HTMLElement, config: NormalizedGanttConfig['container']): void {
  root.style.boxSizing = 'border-box';
  root.style.position = 'relative';
  root.style.display = 'block';
  root.style.width = toCssDimension(config.width) ?? '';
  root.style.height = toCssDimension(config.height) ?? '';
  root.style.minWidth = toCssDimension(config.minWidth) ?? '';
  root.style.minHeight = toCssDimension(config.minHeight) ?? '';
  root.style.maxWidth = toCssDimension(config.maxWidth) ?? '';
  root.style.maxHeight = toCssDimension(config.maxHeight) ?? '';
}

export function createAppElements(
  root: HTMLElement,
  config: NormalizedGanttConfig,
  zoomPresets: readonly ZoomPreset[],
): AppElements {
  root.innerHTML = '';
  root.classList.add('gantt-root');
  applyContainerDimensions(root, config.container);

  const canvas = createElement('canvas', 'gantt-canvas');
  const shell = createElement('div', 'gantt-shell');
  const surface = createElement('div', 'gantt-surface');

  shell.style.display = 'flex';
  shell.style.flexDirection = 'column';
  shell.style.width = '100%';
  shell.style.height = '100%';
  shell.style.minHeight = '0';

  surface.style.position = 'relative';
  surface.style.flex = '1 1 auto';
  surface.style.minHeight = '0';

  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const hud = config.ui.showHud ? createElement('div', 'hud') : null;
  const inspector = config.ui.showInspector ? createElement('div', 'inspector') : null;
  const toolbar = config.ui.showToolbar ? createElement('div', 'zoom-toolbar') : null;
  const statusLine = config.ui.showStatusLine ? createElement('div', 'status-line') : null;
  const headerSlot = config.container.header.visible ? createElement('div', 'gantt-header-slot') : null;
  const footerSlot = config.container.footer.visible ? createElement('div', 'gantt-footer-slot') : null;

  if (toolbar) {
    const modeButtons = [
      renderInteractionModeButton('view'),
      renderInteractionModeButton('select'),
      ...(config.edit.enabled ? [renderInteractionModeButton('edit')] : []),
    ].join('');
    const modeControls = modeButtons.length > 0
      ? `
        <div class="toolbar-group toolbar-group--mode">
          ${modeButtons}
        </div>
        <div class="toolbar-divider" aria-hidden="true"></div>
      `
      : '';
    const zoomControls = zoomPresets.map((preset) => (
      `<button type="button" class="zoom-button" data-zoom-preset="${preset.id}">${preset.label}</button>`
    )).join('');
    toolbar.innerHTML = `
      ${modeControls}
      <div class="toolbar-group toolbar-group--zoom">
        ${zoomControls}
      </div>
    `;
  }

  if (hud) {
    hud.innerHTML = `
      <div class="hud-title">${config.ui.title}</div>
      <div class="hud-grid">
        <div>Rows</div><div data-field="rows">0</div>
        <div>Tasks</div><div data-field="tasks">0</div>
        <div>Glyphs</div><div data-field="glyphs">0</div>
        <div>Lines</div><div data-field="lines">0</div>
        <div>Frame</div><div data-field="frame">0.0ms</div>
        <div>Camera</div><div data-field="camera">0, 0</div>
      </div>
    `;
  }

  if (inspector) {
    inspector.innerHTML = `
      <div class="panel-title">Selection</div>
      <div data-field="selection" class="inspector-empty">No task selected</div>
    `;
  }

  if (statusLine) {
    statusLine.textContent = config.ui.statusText;
  }

  if (headerSlot) {
    configureSlot(headerSlot, config.container.header.height);
    headerSlot.style.display = 'flex';
    headerSlot.style.alignItems = 'center';
  }

  if (footerSlot) {
    configureSlot(footerSlot, config.container.footer.height);
    footerSlot.style.display = 'flex';
    footerSlot.style.alignItems = 'center';
  }

  surface.append(canvas);
  if (hud) {
    surface.append(hud);
  }
  if (inspector) {
    surface.append(inspector);
  }
  if (statusLine && !footerSlot) {
    surface.append(statusLine);
  }

  if (headerSlot) {
    shell.append(headerSlot);
  }

  if (toolbar) {
    const toolbarSlot = createElement('div', 'gantt-toolbar-slot');
    configureSlot(toolbarSlot, config.container.toolbar.height);
    toolbarSlot.style.display = 'flex';
    toolbarSlot.style.alignItems = 'center';
    toolbarSlot.style.justifyContent = 'center';
    toolbarSlot.append(toolbar);
    if (config.container.toolbar.position === 'top') {
      shell.append(toolbarSlot);
    }
    shell.append(surface);
    if (config.container.toolbar.position === 'bottom') {
      shell.append(toolbarSlot);
    }
  } else {
    shell.append(surface);
  }

  if (statusLine && footerSlot) {
    footerSlot.append(statusLine);
  }

  if (footerSlot) {
    shell.append(footerSlot);
  }

  root.append(shell);

  return { root, surface, canvas, hud, inspector, toolbar, statusLine };
}
