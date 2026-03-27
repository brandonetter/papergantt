import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeConfig } from '@gantt/gantt-core';
import type { GanttTask } from '@gantt/gantt-core';
import { createPluginRuntimeHostApi } from '../packages/gantt-core/src/host/plugin-api';

describe('createPluginRuntimeHostApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps the full safe and advanced plugin API surface onto the host controller', () => {
    const unregister = vi.fn();
    const styleResolver = vi.fn();
    const overlay = vi.fn();
    const sceneTransform = vi.fn();
    const canvasLayer = vi.fn();
    const uiCommand = { id: 'open-panel', run: vi.fn() };
    const module = { id: 'module-1' };
    const editResolver = vi.fn();
    const scene = { tasks: [], rowLabels: [], timelineStart: 1, timelineEnd: 2 };
    const camera = { scrollX: 10, scrollY: 20, zoomX: 2, zoomY: 3, viewportWidth: 640, viewportHeight: 480 };
    const selection = {
      selectedTask: null,
      selectedTasks: [] as GanttTask[],
      hoveredTask: null,
      selectedDependency: null,
      hoveredDependency: null,
    };
    const interaction = { mode: 'view' as const, activeEdit: null };
    const index = { byId: new Map(), rowCount: 0 };
    const renderer = { render: vi.fn() };
    const gl = { viewport: vi.fn() };
    const task = { id: 'task-1', rowIndex: 0, start: 1, end: 2, label: 'Task 1' } as GanttTask;
    const tasks = [task];
    const config = normalizeConfig({});

    const host = {
      config,
      scene,
      camera,
      renderer,
      gl,
      registerTaskStyleResolver: vi.fn(() => unregister),
      registerOverlay: vi.fn(() => unregister),
      registerSceneTransform: vi.fn(() => unregister),
      registerCanvasLayer: vi.fn(() => unregister),
      registerUiCommand: vi.fn(() => unregister),
      registerModule: vi.fn(() => unregister),
      registerTaskEditResolver: vi.fn(() => unregister),
      requestRender: vi.fn(),
      getTask: vi.fn(() => task),
      getTasks: vi.fn(() => tasks),
      addTask: vi.fn(() => task),
      updateTask: vi.fn(() => task),
      deleteTask: vi.fn(() => task),
      deleteTasks: vi.fn(() => tasks),
      importTasks: vi.fn(() => ({ added: tasks, updated: [] })),
      exportTasks: vi.fn(() => []),
      getSelection: vi.fn(() => selection),
      setSelectionByTaskId: vi.fn(),
      setSelectionByDependencyId: vi.fn(),
      setSelectionByTaskIds: vi.fn(),
      getInteractionState: vi.fn(() => interaction),
      setInteractionMode: vi.fn(),
      getIndex: vi.fn(() => index),
    } as unknown as Parameters<typeof createPluginRuntimeHostApi>[0];

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const api = createPluginRuntimeHostApi(host);

    expect(api.config).toBe(config);
    expect(api.safeApi.registerTaskStyleResolver(styleResolver)).toBe(unregister);
    expect(host.registerTaskStyleResolver).toHaveBeenCalledWith(styleResolver);
    expect(api.safeApi.registerOverlay(overlay)).toBe(unregister);
    expect(host.registerOverlay).toHaveBeenCalledWith(overlay);
    expect(api.safeApi.registerSceneTransform(sceneTransform)).toBe(unregister);
    expect(host.registerSceneTransform).toHaveBeenCalledWith(sceneTransform);
    expect(api.safeApi.registerCanvasLayer(canvasLayer)).toBe(unregister);
    expect(host.registerCanvasLayer).toHaveBeenCalledWith(canvasLayer);
    expect(api.safeApi.registerUiCommand(uiCommand)).toBe(unregister);
    expect(host.registerUiCommand).toHaveBeenCalledWith(uiCommand);
    expect(api.safeApi.registerModule(module as never)).toBe(unregister);
    expect(host.registerModule).toHaveBeenCalledWith(module);
    expect(api.safeApi.registerTaskEditResolver(editResolver)).toBe(unregister);
    expect(host.registerTaskEditResolver).toHaveBeenCalledWith(editResolver);

    api.safeApi.requestRender();
    expect(host.requestRender).toHaveBeenCalledTimes(1);
    expect(api.safeApi.getSceneSnapshot()).toBe(scene);
    expect(api.safeApi.getCameraSnapshot()).toBe(camera);
    expect(api.safeApi.getTask('task-1')).toBe(task);
    expect(host.getTask).toHaveBeenCalledWith('task-1');
    expect(api.safeApi.getTasks()).toBe(tasks);
    expect(host.getTasks).toHaveBeenCalledTimes(1);
    expect(api.safeApi.addTask(task)).toBe(task);
    expect(host.addTask).toHaveBeenCalledWith(task, undefined);
    expect(api.safeApi.updateTask('task-1', { rowIndex: 1 })).toBe(task);
    expect(host.updateTask).toHaveBeenCalledWith('task-1', { rowIndex: 1 }, undefined);
    expect(api.safeApi.deleteTask('task-1')).toBe(task);
    expect(host.deleteTask).toHaveBeenCalledWith('task-1');
    expect(api.safeApi.deleteTasks(['task-1'])).toBe(tasks);
    expect(host.deleteTasks).toHaveBeenCalledWith(['task-1']);
    expect(api.safeApi.importTasks([task])).toEqual({ added: tasks, updated: [] });
    expect(host.importTasks).toHaveBeenCalledWith([task], undefined);
    expect(api.safeApi.exportTasks()).toEqual([]);
    expect(host.exportTasks).toHaveBeenCalledTimes(1);
    expect(api.safeApi.getSelection()).toBe(selection);
    expect(host.getSelection).toHaveBeenCalledTimes(1);
    api.safeApi.setSelectionByTaskId('task-1');
    expect(host.setSelectionByTaskId).toHaveBeenCalledWith('task-1');
    api.safeApi.setSelectionByDependencyId('task-1->task-2');
    expect(host.setSelectionByDependencyId).toHaveBeenCalledWith('task-1->task-2');
    api.safeApi.setSelectionByTaskIds(['task-1'], 'task-1');
    expect(host.setSelectionByTaskIds).toHaveBeenCalledWith(['task-1'], 'task-1');
    expect(api.safeApi.getInteractionState()).toBe(interaction);
    expect(host.getInteractionState).toHaveBeenCalledTimes(1);
    api.safeApi.setInteractionMode('select');
    expect(host.setInteractionMode).toHaveBeenCalledWith('select');

    api.advancedApi.requestRender();
    expect(host.requestRender).toHaveBeenCalledTimes(2);
    expect(api.advancedApi.getInternals()).toEqual({ index, renderer, gl });
    expect(host.getIndex).toHaveBeenCalledTimes(1);

    api.logger.info('info', { ok: true });
    api.safeApi.logger.warn('warn', { ok: true });
    api.safeApi.logger.error('error', { ok: true });
    expect(infoSpy).toHaveBeenCalledWith('info', { ok: true });
    expect(warnSpy).toHaveBeenCalledWith('warn', { ok: true });
    expect(errorSpy).toHaveBeenCalledWith('error', { ok: true });
  });
});
