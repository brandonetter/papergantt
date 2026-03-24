import { vi } from 'vitest';
import { normalizeConfig } from '@gantt/gantt-core';
import type {
  FrameScene,
  GanttExportedTask,
  GanttInteractionState,
  GanttPlugin,
  GanttSafeApi,
  GanttScene,
  GanttTask,
  PluginSelectionState,
} from '@gantt/gantt-core';

const loadPluginsMock = vi.hoisted(() => vi.fn());

vi.mock('../packages/gantt-core/src/plugin-loader', () => ({
  loadPlugins: loadPluginsMock,
}));

import { PluginRuntime } from '../packages/gantt-core/src/plugin-runtime';

function makeHostApi(configInput = {}) {
  const logs: Array<{ level: 'info' | 'warn' | 'error'; message: string }> = [];
  const config = normalizeConfig(configInput);
  const safeApi: GanttSafeApi = {
    registerTaskStyleResolver: () => () => undefined,
    registerOverlay: () => () => undefined,
    registerUiCommand: () => () => undefined,
    registerModule: () => () => undefined,
    registerTaskEditResolver: () => () => undefined,
    getSceneSnapshot: () => ({ tasks: [], rowLabels: [], timelineStart: 0, timelineEnd: 0 }),
    getTask: () => null,
    getTasks: () => [] as GanttTask[],
    addTask: () => ({ id: 'added', rowIndex: 0, start: 0, end: 1, label: 'Added Task' } as GanttTask),
    updateTask: () => ({ id: 'updated', rowIndex: 0, start: 0, end: 1, label: 'Updated Task' } as GanttTask),
    deleteTask: () => ({ id: 'deleted', rowIndex: 0, start: 0, end: 1, label: 'Deleted Task' } as GanttTask),
    deleteTasks: () => [] as GanttTask[],
    importTasks: () => ({ added: [], updated: [] }),
    exportTasks: () => [] as GanttExportedTask[],
    getCameraSnapshot: () => ({ scrollX: 0, scrollY: 0, zoomX: 1, zoomY: 1, viewportWidth: 100, viewportHeight: 100 }),
    getSelection: () => ({
      selectedTask: null,
      selectedTasks: [],
      hoveredTask: null,
      selectedDependency: null,
      hoveredDependency: null,
    }),
    setSelectionByTaskId: () => undefined,
    setSelectionByTaskIds: () => undefined,
    getInteractionState: () => ({ mode: 'view' as const, activeEdit: null }),
    setInteractionMode: () => undefined,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  };

  return {
    logs,
    api: {
      config,
      safeApi,
      advancedApi: {
        requestRender: () => undefined,
        getInternals: () => ({ index: {} as never, renderer: {}, gl: {} as WebGL2RenderingContext }),
      },
      logger: {
        info: (message: string) => logs.push({ level: 'info', message }),
        warn: (message: string) => logs.push({ level: 'warn', message }),
        error: (message: string) => logs.push({ level: 'error', message }),
      },
    },
  };
}

describe('plugin runtime', () => {
  beforeEach(() => {
    loadPluginsMock.mockReset();
  });

  it('blocks advanced plugins when capability is not enabled', async () => {
    const createSpy = vi.fn(() => ({
      onSceneBuild: (scene: GanttScene) => ({ ...scene, timelineStart: 99 }),
    }));

    const advancedPlugin: GanttPlugin = {
      meta: {
        id: 'advanced',
        version: '1.0.0',
        apiRange: '^1.0.0',
        capabilities: ['advanced-api'],
      },
      create: createSpy,
    };

    loadPluginsMock.mockResolvedValue([
      {
        definition: advancedPlugin,
        config: {
          source: { type: 'esm', url: 'https://example.com/advanced.mjs' },
          allowAdvanced: false,
        },
      },
    ]);

    const { api, logs } = makeHostApi({
      features: {
        allowAdvancedPlugins: false,
      },
    });

    const runtime = new PluginRuntime(api);
    await runtime.load();
    const scene = await runtime.applySceneHooks({ tasks: [], rowLabels: [], timelineStart: 1, timelineEnd: 2 });

    expect(createSpy).not.toHaveBeenCalled();
    expect(scene.timelineStart).toBe(1);
    expect(logs.some((entry) => entry.level === 'error')).toBe(true);
  });

  it('continues running other plugins when one hook fails', async () => {
    const badPlugin: GanttPlugin = {
      meta: {
        id: 'bad-frame',
        version: '1.0.0',
        apiRange: '^1.0.0',
      },
      create: () => ({
        onFrameBuild: () => {
          throw new Error('frame explode');
        },
      }),
    };

    const goodPlugin: GanttPlugin = {
      meta: {
        id: 'good-frame',
        version: '1.0.0',
        apiRange: '^1.0.0',
      },
      create: () => ({
        onFrameBuild: (frame) => ({ ...frame, __marker: 'ok' } as FrameScene),
      }),
    };

    loadPluginsMock.mockResolvedValue([
      {
        definition: badPlugin,
        config: {
          source: { type: 'esm', url: 'https://example.com/bad.mjs' },
        },
      },
      {
        definition: goodPlugin,
        config: {
          source: { type: 'esm', url: 'https://example.com/good.mjs' },
        },
      },
    ]);

    const { api, logs } = makeHostApi();
    const runtime = new PluginRuntime(api);

    await runtime.load();
    await runtime.init();

    const frame = await runtime.applyFrameHooks({ stats: {} } as FrameScene);

    expect((frame as unknown as { __marker?: string }).__marker).toBe('ok');
    expect(logs.some((entry) => entry.level === 'error' && entry.message.includes('bad-frame'))).toBe(true);
  });

  it('supports safe and advanced plugin paths with explicit opt-in', async () => {
    const registerStyle = vi.fn(() => () => undefined);
    const registerOverlay = vi.fn(() => () => undefined);
    const advancedRender = vi.fn();
    const safePlugin: GanttPlugin = {
      meta: {
        id: 'safe-plugin',
        version: '1.0.0',
        apiRange: '^1.0.0',
      },
      create: (context) => ({
        onInit: () => {
          context.safe.registerTaskStyleResolver(() => ({ fill: [1, 0, 0, 1] }));
          context.safe.registerOverlay(() => undefined);
        },
      }),
    };

    const advancedPlugin: GanttPlugin = {
      meta: {
        id: 'advanced-plugin',
        version: '1.0.0',
        apiRange: '^1.0.0',
        capabilities: ['advanced-api'],
      },
      create: (context) => ({
        onInit: () => {
          context.advanced?.requestRender();
        },
      }),
    };

    loadPluginsMock.mockResolvedValue([
      {
        definition: safePlugin,
        config: {
          source: { type: 'esm', url: 'https://example.com/safe.mjs' },
        },
      },
      {
        definition: advancedPlugin,
        config: {
          source: { type: 'umd', url: 'https://example.com/advanced.js', global: 'AdvancedPlugin' },
          allowAdvanced: true,
        },
      },
    ]);

    const { api } = makeHostApi({
      features: {
        allowAdvancedPlugins: true,
      },
    });

    api.safeApi.registerTaskStyleResolver = registerStyle;
    api.safeApi.registerOverlay = registerOverlay;
    api.advancedApi.requestRender = advancedRender;

    const runtime = new PluginRuntime(api);
    await runtime.load();
    await runtime.init();

    expect(registerStyle).toHaveBeenCalledTimes(1);
    expect(registerOverlay).toHaveBeenCalledTimes(1);
    expect(advancedRender).toHaveBeenCalledTimes(1);
  });

  it('exposes runtime task read and mutation methods to safe plugins', async () => {
    const getTasks = vi.fn(() => []);
    const addTask = vi.fn(() => ({ id: 'task-1', rowIndex: 1, start: 10, end: 12, label: 'Task 1' }));
    const updateTask = vi.fn(() => ({ id: 'task-1', rowIndex: 2, start: 10, end: 13, label: 'Task 1' }));
    const deleteTask = vi.fn(() => ({ id: 'task-1', rowIndex: 2, start: 10, end: 13, label: 'Task 1' }));
    const exportTasks = vi.fn(() => [{
      id: 'task-1',
      rowIndex: 2,
      label: 'Task 1',
      milestone: false,
      dependencies: [],
      startDate: '2026-01-10',
      endDate: '2026-01-12',
      durationDays: 3,
    }]);

    const runtimePlugin: GanttPlugin = {
      meta: {
        id: 'runtime-safe-plugin',
        version: '1.2.0',
        apiRange: '^1.2.0',
      },
      create: (context) => ({
        onInit: () => {
          context.safe.getTasks();
          context.safe.addTask({
            id: 'task-1',
            rowIndex: 1,
            start: '2026-01-10',
            end: '2026-01-11',
            label: 'Task 1',
          });
          context.safe.updateTask('task-1', { rowIndex: 2 });
          context.safe.deleteTask('task-1');
          context.safe.exportTasks();
        },
      }),
    };

    loadPluginsMock.mockResolvedValue([
      {
        definition: runtimePlugin,
        config: {
          source: { type: 'esm', url: 'https://example.com/runtime-safe.mjs' },
        },
      },
    ]);

    const { api } = makeHostApi();
    api.safeApi.getTasks = getTasks;
    api.safeApi.addTask = addTask;
    api.safeApi.updateTask = updateTask;
    api.safeApi.deleteTask = deleteTask;
    api.safeApi.exportTasks = exportTasks;

    const runtime = new PluginRuntime(api);
    await runtime.load();
    await runtime.init();

    expect(getTasks).toHaveBeenCalledTimes(1);
    expect(addTask).toHaveBeenCalledWith({
      id: 'task-1',
      rowIndex: 1,
      start: '2026-01-10',
      end: '2026-01-11',
      label: 'Task 1',
    });
    expect(updateTask).toHaveBeenCalledWith('task-1', { rowIndex: 2 });
    expect(deleteTask).toHaveBeenCalledWith('task-1');
    expect(exportTasks).toHaveBeenCalledTimes(1);
  });

  it('exposes multi-selection and grouped edit state to safe plugins', async () => {
    const getSelection = vi.fn((): Readonly<PluginSelectionState> => ({
      selectedTask: { id: 'task-2', rowIndex: 1, start: 12, end: 16, label: 'Task 2' } as GanttTask,
      selectedTasks: [
        { id: 'task-2', rowIndex: 1, start: 12, end: 16, label: 'Task 2' },
        { id: 'task-1', rowIndex: 0, start: 8, end: 11, label: 'Task 1' },
      ] as GanttTask[],
      hoveredTask: null,
      selectedDependency: null,
      hoveredDependency: null,
    }));
    const setSelectionByTaskId = vi.fn();
    const setSelectionByTaskIds = vi.fn();
    const getInteractionState = vi.fn((): Readonly<GanttInteractionState> => ({
      mode: 'edit' as const,
      activeEdit: {
        taskId: 'task-2',
        taskIds: ['task-2', 'task-1'],
        operation: 'move' as const,
        originalTask: { id: 'task-2', rowIndex: 1, start: 12, end: 16, label: 'Task 2' },
        originalTasks: [
          { id: 'task-2', rowIndex: 1, start: 12, end: 16, label: 'Task 2' },
          { id: 'task-1', rowIndex: 0, start: 8, end: 11, label: 'Task 1' },
        ],
        draftTask: { id: 'task-2', rowIndex: 2, start: 14, end: 18, label: 'Task 2' },
        draftTasks: [
          { id: 'task-2', rowIndex: 2, start: 14, end: 18, label: 'Task 2' },
          { id: 'task-1', rowIndex: 1, start: 10, end: 13, label: 'Task 1' },
        ],
        status: 'preview' as const,
      },
    }));

    const runtimePlugin: GanttPlugin = {
      meta: {
        id: 'runtime-selection-safe-plugin',
        version: '1.3.0',
        apiRange: '^1.3.0',
      },
      create: (context) => ({
        onInit: () => {
          context.safe.getSelection();
          context.safe.getInteractionState();
          context.safe.setSelectionByTaskIds(['task-1', 'task-2'], 'task-2');
          context.safe.setSelectionByTaskId(null);
        },
      }),
    };

    loadPluginsMock.mockResolvedValue([
      {
        definition: runtimePlugin,
        config: {
          source: { type: 'esm', url: 'https://example.com/runtime-selection-safe.mjs' },
        },
      },
    ]);

    const { api } = makeHostApi();
    api.safeApi.getSelection = getSelection;
    api.safeApi.setSelectionByTaskId = setSelectionByTaskId;
    api.safeApi.setSelectionByTaskIds = setSelectionByTaskIds;
    api.safeApi.getInteractionState = getInteractionState;

    const runtime = new PluginRuntime(api);
    await runtime.load();
    await runtime.init();

    const observedSelection = getSelection.mock.results[0]?.value;
    const observedInteraction = getInteractionState.mock.results[0]?.value;

    expect(getSelection).toHaveBeenCalledTimes(1);
    expect(setSelectionByTaskIds).toHaveBeenCalledWith(['task-1', 'task-2'], 'task-2');
    expect(setSelectionByTaskId).toHaveBeenCalledWith(null);
    expect(observedSelection?.selectedTasks.map((task: GanttTask) => task.id)).toEqual(['task-2', 'task-1']);
    expect(observedInteraction?.activeEdit?.taskIds).toEqual(['task-2', 'task-1']);
    expect(observedInteraction?.activeEdit?.draftTasks?.map((task: GanttTask) => task.id)).toEqual(['task-2', 'task-1']);
  });

  it('notifies edit mode and task edit lifecycle hooks in load order', async () => {
    const events: string[] = [];
    const editPlugin: GanttPlugin = {
      meta: {
        id: 'edit-plugin',
        version: '1.1.0',
        apiRange: '^1.0.0',
      },
      create: () => ({
        onEditModeChange: (mode) => {
          events.push(`mode:${mode}`);
        },
        onTaskEditStart: (event) => {
          events.push(`start:${event.operation}`);
        },
        onTaskEditPreview: (event) => {
          events.push(`preview:${event.proposedTask.start}`);
        },
        onTaskEditCommit: (event) => {
          events.push(`commit:${event.proposedTask.end}`);
        },
        onTaskEditCancel: (event) => {
          events.push(`cancel:${event.originalTask.id}`);
        },
      }),
    };

    loadPluginsMock.mockResolvedValue([
      {
        definition: editPlugin,
        config: {
          source: { type: 'esm', url: 'https://example.com/edit.mjs' },
        },
      },
    ]);

    const { api } = makeHostApi();
    const runtime = new PluginRuntime(api);

    await runtime.load();
    await runtime.init();

    const editEvent = {
      taskId: 'task-1',
      operation: 'move' as const,
      originalTask: { id: 'task-1', rowIndex: 0, start: 1, end: 3, label: 'Task 1' },
      proposedTask: { id: 'task-1', rowIndex: 1, start: 4, end: 6, label: 'Task 1' },
      previousDraftTask: null,
      pointer: { screenX: 10, screenY: 20, worldX: 4, worldY: 30 },
      snap: { mode: 'day' as const, incrementDays: 1, applied: true, disabledByModifier: false },
    };

    runtime.notifyEditModeChange('edit');
    runtime.notifyTaskEditStart(editEvent);
    runtime.notifyTaskEditPreview(editEvent);
    runtime.notifyTaskEditCommit(editEvent);
    runtime.notifyTaskEditCancel(editEvent);
    await Promise.resolve();

    expect(events).toEqual([
      'mode:edit',
      'start:move',
      'preview:4',
      'commit:6',
      'cancel:task-1',
    ]);
  });
});
