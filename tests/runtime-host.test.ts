import { vi } from 'vitest';
import type { GanttScene } from '@gantt/gantt-core';

const pluginRuntimeState = vi.hoisted(() => ({
  instances: [] as Array<{ hostApi: { safeApi: Record<string, unknown> } }>,
}));

vi.mock('../packages/gantt-core/src/font', () => ({
  createFallbackFontAtlas: () => ({
    lineHeight: 16,
    ascender: 12,
    descender: 4,
    glyphs: new Map(),
    kernings: new Map(),
  }),
  loadMsdfFontAtlas: vi.fn(),
  TextLayoutEngine: class {
    constructor(private atlas: unknown) {}

    setAtlas(atlas: unknown) {
      this.atlas = atlas;
    }
  },
}));

vi.mock('../packages/gantt-core/src/render', () => ({
  GanttRenderer: class {
    render() {}
  },
}));

vi.mock('../packages/gantt-core/src/plugin-runtime', () => ({
  PluginRuntime: class {
    constructor(public readonly hostApi: { safeApi: Record<string, unknown> }) {
      pluginRuntimeState.instances.push(this);
    }

    async load() {}

    async init() {}

    async applySceneHooks(scene: GanttScene) {
      return scene;
    }

    async applyFrameHooks(frame: unknown) {
      return frame;
    }

    async notifySelection() {}

    notifyEditModeChange() {}

    notifyTaskEditStart() {}

    notifyTaskEditPreview() {}

    notifyTaskEditCommit() {}

    notifyTaskEditCancel() {}

    async dispose() {}
  },
}));

import { createGanttHost } from '../packages/gantt-core/src/host';

type FakeStyle = Record<string, string>;

class FakeClassList {
  private readonly tokens = new Set<string>();

  add(...tokens: string[]) {
    for (const token of tokens) {
      this.tokens.add(token);
    }
  }

  remove(...tokens: string[]) {
    for (const token of tokens) {
      this.tokens.delete(token);
    }
  }

  toggle(token: string, force?: boolean) {
    if (force === true || (!this.tokens.has(token) && force !== false)) {
      this.tokens.add(token);
      return true;
    }

    this.tokens.delete(token);
    return false;
  }
}

class FakeElement {
  className = '';
  textContent: string | null = null;
  style: FakeStyle = {};
  dataset: Record<string, string> = {};
  classList = new FakeClassList();
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  private html = '';

  constructor(readonly tagName: string) {}

  set innerHTML(value: string) {
    this.html = value;
    if (value === '') {
      this.children = [];
    }
  }

  get innerHTML() {
    return this.html;
  }

  append(...children: FakeElement[]) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  remove() {
    if (!this.parentElement) {
      return;
    }

    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  getBoundingClientRect() {
    return {
      width: 960,
      height: 480,
    };
  }
}

class FakeCanvasElement extends FakeElement {
  width = 0;
  height = 0;

  constructor() {
    super('canvas');
  }

  getContext(type: string) {
    if (type !== 'webgl2') {
      return null;
    }

    return {
      viewport: () => undefined,
    };
  }
}

function installFakeDom() {
  const document = {
    createElement(tagName: string) {
      return tagName === 'canvas' ? new FakeCanvasElement() : new FakeElement(tagName);
    },
  };

  Object.assign(globalThis, {
    document,
    window: {
      devicePixelRatio: 1,
    },
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  });
}

function clearFakeDom() {
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).requestAnimationFrame;
  delete (globalThis as Record<string, unknown>).cancelAnimationFrame;
}

function makeScene(): GanttScene {
  return {
    rowLabels: ['Row 1', 'Row 2'],
    timelineStart: 10,
    timelineEnd: 20,
    tasks: [
      { id: 'a', rowIndex: 0, start: 10, end: 12, label: 'Task A' },
      { id: 'b', rowIndex: 1, start: 14, end: 18, label: 'Task B', dependencies: ['a'] },
    ],
  };
}

async function createHost() {
  const root = new FakeElement('div');
  const host = await createGanttHost(root as unknown as HTMLElement, {
    data: {
      type: 'static',
      scene: makeScene(),
    },
    ui: {
      showHud: false,
      showInspector: false,
      showToolbar: false,
      showStatusLine: false,
      title: 'Runtime Host Test',
      statusText: '',
    },
    modules: {
      builtins: [],
    },
    edit: {
      enabled: true,
      defaultMode: 'edit',
    },
  });

  return host;
}

describe('runtime task host controller', () => {
  beforeEach(() => {
    pluginRuntimeState.instances.length = 0;
    installFakeDom();
  });

  afterEach(() => {
    clearFakeDom();
  });

  it('wires runtime task methods on the controller and safe plugin API', async () => {
    const host = await createHost();
    const controller = host.getController();
    const safeApi = pluginRuntimeState.instances[0]?.hostApi.safeApi;

    expect(typeof controller.addTask).toBe('function');
    expect(typeof controller.updateTask).toBe('function');
    expect(typeof controller.deleteTask).toBe('function');
    expect(typeof controller.importTasks).toBe('function');
    expect(typeof controller.exportTasks).toBe('function');
    expect(typeof safeApi?.addTask).toBe('function');
    expect(typeof safeApi?.deleteTask).toBe('function');
    expect(typeof safeApi?.exportTasks).toBe('function');

    const added = controller.addTask({
      id: 'c',
      rowIndex: 3,
      start: '2026-01-10',
      end: '2026-01-11',
      label: 'Task C',
    });
    const updated = controller.updateTask('c', {
      label: 'Task C Updated',
    });
    const imported = controller.importTasks([
      {
        id: 'a',
        rowIndex: 2,
        start: '2026-01-12',
        end: '2026-01-12',
        label: 'Task A Updated',
      },
      {
        id: 'd',
        rowIndex: 4,
        start: '2026-01-15',
        end: '2026-01-17',
        label: 'Task D',
      },
    ]);

    expect(added.end - added.start).toBe(2);
    expect(updated.label).toBe('Task C Updated');
    expect(imported.updated.map((task) => task.id)).toEqual(['a']);
    expect(imported.added.map((task) => task.id)).toEqual(['d']);
    expect(controller.getTasks().map((task) => task.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(controller.exportTasks().map((task) => task.id)).toEqual(['b', 'a', 'c', 'd']);

    await host.dispose();
  });

  it('reads committed tasks only and clears task and dependency selection on delete', async () => {
    const host = await createHost();
    const controller = host.getController();
    const controllerState = controller as unknown as {
      activeEdit: unknown;
      selectedDependencyId: string | null;
      selectedDependency: unknown;
      frame: unknown;
    };

    controller.setSelectionByTaskId('a');
    controllerState.selectedDependencyId = 'a->b';
    controllerState.selectedDependency = {
      id: 'a->b',
      sourceTaskId: 'a',
      targetTaskId: 'b',
      segments: [],
    };
    controllerState.frame = {
      dependencyPaths: [{
        id: 'a->b',
        sourceTaskId: 'a',
        targetTaskId: 'b',
        segments: [],
      }],
    };
    controllerState.activeEdit = {
      taskId: 'a',
      operation: 'move',
      originalTask: { id: 'a', rowIndex: 0, start: 10, end: 12, label: 'Task A' },
      draftTask: { id: 'a', rowIndex: 9, start: 10, end: 12, label: 'Task A Draft' },
      status: 'preview',
    };

    expect(controller.getTask('a')?.rowIndex).toBe(0);

    const deleted = controller.deleteTask('a');

    expect(deleted.id).toBe('a');
    expect(controller.getSelection().selectedTask).toBeNull();
    expect(controller.getSelection().selectedDependency).toBeNull();
    expect(controller.getTask('b')?.dependencies).toBeUndefined();

    await host.dispose();
  });

  it('tracks multi-task selection with a primary task and preserves remaining selections after delete', async () => {
    const host = await createHost();
    const controller = host.getController();

    controller.setSelectionByTaskIds(['a', 'b'], 'b');

    expect(controller.getSelection().selectedTask?.id).toBe('b');
    expect(controller.getSelection().selectedTasks.map((task) => task.id)).toEqual(['b', 'a']);

    controller.deleteTask('b');

    expect(controller.getSelection().selectedTask?.id).toBe('a');
    expect(controller.getSelection().selectedTasks.map((task) => task.id)).toEqual(['a']);

    await host.dispose();
  });

  it('previews and commits multi-task edit batches without collapsing selection', async () => {
    const host = await createHost();
    const controller = host.getController();

    controller.setSelectionByTaskIds(['a', 'b'], 'a');

    const previewEvents = controller.previewTaskEdits([
      {
        taskId: 'a',
        operation: 'move',
        originalTask: { id: 'a', rowIndex: 0, start: 10, end: 12, label: 'Task A' },
        proposedTask: { id: 'a', rowIndex: 1, start: 12, end: 14, label: 'Task A' },
        previousDraftTask: null,
        pointer: { screenX: 0, screenY: 0, worldX: 12, worldY: 30 },
        snap: { mode: 'day', incrementDays: 1, applied: true, disabledByModifier: false },
      },
      {
        taskId: 'b',
        operation: 'move',
        originalTask: { id: 'b', rowIndex: 1, start: 14, end: 18, label: 'Task B', dependencies: ['a'] },
        proposedTask: { id: 'b', rowIndex: 2, start: 16, end: 20, label: 'Task B', dependencies: ['a'] },
        previousDraftTask: null,
        pointer: { screenX: 0, screenY: 0, worldX: 12, worldY: 30 },
        snap: { mode: 'day', incrementDays: 1, applied: true, disabledByModifier: false },
      },
    ]);

    expect(previewEvents?.map((event) => event.taskId)).toEqual(['a', 'b']);
    expect(controller.getSelection().selectedTasks.map((task) => task.id)).toEqual(['a', 'b']);
    expect(controller.getInteractionState().activeEdit?.taskId).toBe('a');

    const committed = await controller.commitTaskEdits(previewEvents ?? null);

    expect(committed).toBe(true);
    expect(controller.getTask('a')).toMatchObject({ rowIndex: 1, start: 12, end: 14 });
    expect(controller.getTask('b')).toMatchObject({ rowIndex: 2, start: 16, end: 20 });
    expect(controller.getSelection().selectedTasks.map((task) => task.id)).toEqual(['a', 'b']);
    expect(controller.getSelection().selectedTask?.id).toBe('a');

    await host.dispose();
  });

  it('cancels preview edits before runtime mutations and blocks mutations during pending commits', async () => {
    const host = await createHost();
    const controller = host.getController();
    const controllerState = controller as unknown as {
      activeEdit: unknown;
    };
    const cancelSpy = vi.spyOn(controller, 'cancelActiveEdit');

    controllerState.activeEdit = {
      taskId: 'a',
      operation: 'move',
      originalTask: { id: 'a', rowIndex: 0, start: 10, end: 12, label: 'Task A' },
      draftTask: { id: 'a', rowIndex: 1, start: 11, end: 13, label: 'Task A Draft' },
      status: 'preview',
    };

    controller.addTask({
      id: 'c',
      rowIndex: 2,
      start: '2026-01-20',
      end: '2026-01-20',
      label: 'Task C',
    });

    expect(cancelSpy).toHaveBeenCalledTimes(1);

    controllerState.activeEdit = {
      taskId: 'b',
      operation: 'resize-end',
      originalTask: { id: 'b', rowIndex: 1, start: 14, end: 18, label: 'Task B' },
      draftTask: { id: 'b', rowIndex: 1, start: 14, end: 19, label: 'Task B' },
      status: 'committing',
    };

    expect(() => controller.deleteTask('a')).toThrow('Cannot mutate tasks while a task edit commit is pending.');
    expect(() => controller.replaceScene(makeScene())).toThrow('Cannot mutate tasks while a task edit commit is pending.');

    await host.dispose();
  });
});
