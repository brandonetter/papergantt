import type { PluginRuntimeHostApi } from '../plugin-runtime';
import type { HostInternals } from './types';

function createLogger() {
  return {
    info: (message: string, details?: unknown) => console.info(message, details),
    warn: (message: string, details?: unknown) => console.warn(message, details),
    error: (message: string, details?: unknown) => console.error(message, details),
  };
}

export function createPluginRuntimeHostApi(host: HostInternals): PluginRuntimeHostApi {
  const logger = createLogger();

  return {
    config: host.config,
    logger,
    safeApi: {
      registerTaskStyleResolver: (resolver) => host.registerTaskStyleResolver(resolver),
      registerOverlay: (overlay) => host.registerOverlay(overlay),
      registerSceneTransform: (transform) => host.registerSceneTransform(transform),
      registerCanvasLayer: (layer) => host.registerCanvasLayer(layer),
      registerUiCommand: (command) => host.registerUiCommand(command),
      registerModule: (module) => host.registerModule(module),
      registerTaskEditResolver: (resolver) => host.registerTaskEditResolver(resolver),
      requestRender: () => host.requestRender(),
      getSceneSnapshot: () => host.scene,
      getTask: (taskId) => host.getTask(taskId),
      getTasks: () => host.getTasks(),
      addTask: (input, options) => host.addTask(input, options),
      updateTask: (taskId, patch, options) => host.updateTask(taskId, patch, options),
      deleteTask: (taskId) => host.deleteTask(taskId),
      deleteTasks: (taskIds) => host.deleteTasks(taskIds),
      importTasks: (inputs, options) => host.importTasks(inputs, options),
      exportTasks: () => host.exportTasks(),
      getCameraSnapshot: () => host.camera,
      getSelection: () => host.getSelection(),
      setSelectionByTaskId: (taskId) => host.setSelectionByTaskId(taskId),
      setSelectionByDependencyId: (dependencyId) => host.setSelectionByDependencyId(dependencyId),
      setSelectionByTaskIds: (taskIds, primaryTaskId) => host.setSelectionByTaskIds(taskIds, primaryTaskId),
      getInteractionState: () => host.getInteractionState(),
      setInteractionMode: (mode) => host.setInteractionMode(mode),
      logger,
    },
    advancedApi: {
      requestRender: () => host.requestRender(),
      getInternals: () => ({ index: host.getIndex(), renderer: host.renderer, gl: host.gl }),
    },
  };
}
