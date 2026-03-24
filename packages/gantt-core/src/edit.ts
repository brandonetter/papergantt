import {
  screenToWorld,
  taskWorldRect,
  worldToScreen,
  type CameraState,
  type GanttScene,
  type GanttTask,
} from './core';
import type {
  GanttTaskEditEvent,
  GanttTaskEditOperation,
  GanttTaskEditPointer,
  GanttTaskEditSnap,
  NormalizedGanttEditConfig,
} from './types';

export type TaskEditHitTarget = {
  task: GanttTask;
  operation: GanttTaskEditOperation;
};

export type TaskEditDraftResult = {
  draftTask: GanttTask;
  snap: GanttTaskEditSnap;
};

export type TaskEditGroupDraftResult = {
  draftTasks: GanttTask[];
  snap: GanttTaskEditSnap;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeIncrementDays(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function cloneTask(task: GanttTask): GanttTask {
  return {
    ...task,
    dependencies: task.dependencies?.slice(),
  };
}

export function canResizeTask(task: GanttTask, editConfig: NormalizedGanttEditConfig): boolean {
  return editConfig.resize.enabled && !task.milestone;
}

export function buildTaskEditPointer(
  camera: CameraState,
  screenX: number,
  screenY: number,
): GanttTaskEditPointer {
  const [worldX, worldY] = screenToWorld(camera, screenX, screenY);
  return {
    screenX,
    screenY,
    worldX,
    worldY,
  };
}

function createSnapInfo(
  editConfig: NormalizedGanttEditConfig,
  disabledByModifier: boolean,
): GanttTaskEditSnap {
  return {
    mode: editConfig.snap.mode,
    incrementDays: sanitizeIncrementDays(editConfig.snap.incrementDays),
    applied: false,
    disabledByModifier,
  };
}

function applySnap(
  value: number,
  editConfig: NormalizedGanttEditConfig,
  disableSnap: boolean,
): { value: number; snap: GanttTaskEditSnap } {
  const snap = createSnapInfo(editConfig, disableSnap);
  if (disableSnap || editConfig.snap.mode === 'off') {
    return { value, snap };
  }

  const incrementDays = snap.incrementDays;
  const snapped = editConfig.snap.mode === 'increment'
    ? Math.round(value / incrementDays) * incrementDays
    : Math.round(value);
  snap.applied = Math.abs(snapped - value) > 1e-6;
  return { value: snapped, snap };
}

export function resolveTaskEditHitTarget(input: {
  task: GanttTask | null;
  selectedTaskId: string | null;
  camera: CameraState;
  rowPitch: number;
  barHeight: number;
  handleWidthPx: number;
  resizeEnabled: boolean;
  screenX: number;
  screenY: number;
}): TaskEditHitTarget | null {
  const {
    task,
    selectedTaskId,
    camera,
    rowPitch,
    barHeight,
    handleWidthPx,
    resizeEnabled,
    screenX,
    screenY,
  } = input;

  if (!task) {
    return null;
  }

  const rect = taskWorldRect(task, rowPitch, barHeight);
  const [screenLeft, screenTop] = worldToScreen(camera, rect.x, rect.y);
  const screenWidth = Math.max(1, rect.w * camera.zoomX);
  const screenHeight = Math.max(1, rect.h * camera.zoomY);
  const withinX = screenX >= screenLeft && screenX <= screenLeft + screenWidth;
  const withinY = screenY >= screenTop && screenY <= screenTop + screenHeight;
  if (!withinX || !withinY) {
    return null;
  }

  if (resizeEnabled && selectedTaskId === task.id && !task.milestone) {
    const effectiveHandleWidthPx = Math.max(6, Math.min(handleWidthPx, screenWidth * 0.45));
    if (screenX <= screenLeft + effectiveHandleWidthPx) {
      return { task, operation: 'resize-start' };
    }
    if (screenX >= screenLeft + screenWidth - effectiveHandleWidthPx) {
      return { task, operation: 'resize-end' };
    }
  }

  return { task, operation: 'move' };
}

export function resolveTaskEditDraft(input: {
  task: GanttTask;
  operation: GanttTaskEditOperation;
  pointer: GanttTaskEditPointer;
  startPointer: GanttTaskEditPointer;
  rowPitch: number;
  rowCount: number;
  editConfig: NormalizedGanttEditConfig;
  disableSnap?: boolean;
}): TaskEditDraftResult {
  const { task, operation, pointer, startPointer, rowPitch, rowCount, editConfig } = input;
  const disableSnap = input.disableSnap ?? false;
  const minDurationDays = Math.max(1, editConfig.resize.minDurationDays);
  const originalDuration = Math.max(minDurationDays, task.end - task.start);

  if (operation === 'move') {
    const rawStart = task.start + (pointer.worldX - startPointer.worldX);
    const { value: start, snap } = applySnap(rawStart, editConfig, disableSnap);
    const rowDelta = Math.round((pointer.worldY - startPointer.worldY) / rowPitch);
    const nextRow = editConfig.drag.allowRowChange
      ? clamp(task.rowIndex + rowDelta, 0, Math.max(0, rowCount - 1))
      : task.rowIndex;

    return {
      draftTask: {
        ...cloneTask(task),
        rowIndex: nextRow,
        start,
        end: start + originalDuration,
      },
      snap,
    };
  }

  if (operation === 'resize-start') {
    const { value, snap } = applySnap(pointer.worldX, editConfig, disableSnap);
    return {
      draftTask: {
        ...cloneTask(task),
        start: Math.min(value, task.end - minDurationDays),
      },
      snap,
    };
  }

  const { value, snap } = applySnap(pointer.worldX, editConfig, disableSnap);
  return {
    draftTask: {
      ...cloneTask(task),
      end: Math.max(value, task.start + minDurationDays),
    },
    snap,
  };
}

export function resolveTaskMoveDrafts(input: {
  tasks: GanttTask[];
  primaryTaskId?: string | null;
  pointer: GanttTaskEditPointer;
  startPointer: GanttTaskEditPointer;
  rowPitch: number;
  rowCount: number;
  editConfig: NormalizedGanttEditConfig;
  disableSnap?: boolean;
}): TaskEditGroupDraftResult {
  const { tasks, pointer, startPointer, rowPitch, rowCount, editConfig } = input;
  const disableSnap = input.disableSnap ?? false;
  const primaryTask = tasks.find((task) => task.id === input.primaryTaskId) ?? tasks[0];

  if (!primaryTask) {
    return {
      draftTasks: [],
      snap: createSnapInfo(editConfig, disableSnap),
    };
  }

  const rawStart = primaryTask.start + (pointer.worldX - startPointer.worldX);
  const { value: start, snap } = applySnap(rawStart, editConfig, disableSnap);
  const timeDelta = start - primaryTask.start;
  const rawRowDelta = Math.round((pointer.worldY - startPointer.worldY) / rowPitch);

  let clampedRowDelta = 0;
  if (editConfig.drag.allowRowChange) {
    const minRowIndex = Math.min(...tasks.map((task) => task.rowIndex));
    const maxRowIndex = Math.max(...tasks.map((task) => task.rowIndex));
    clampedRowDelta = clamp(
      rawRowDelta,
      -minRowIndex,
      Math.max(0, rowCount - 1) - maxRowIndex,
    );
  }

  return {
    draftTasks: tasks.map((task) => ({
      ...cloneTask(task),
      rowIndex: task.rowIndex + clampedRowDelta,
      start: task.start + timeDelta,
      end: task.end + timeDelta,
    })),
    snap,
  };
}

export function replaceTaskInScene(scene: GanttScene, task: GanttTask): GanttScene {
  return replaceTasksInScene(scene, [task]);
}

export function replaceTasksInScene(scene: GanttScene, tasksToReplace: GanttTask[]): GanttScene {
  const replacementById = new Map(tasksToReplace.map((task) => [task.id, cloneTask(task)]));
  const tasks = scene.tasks.map((candidate) => (
    replacementById.get(candidate.id) ?? cloneTask(candidate)
  ));
  const minStart = tasks.length > 0 ? Math.min(scene.timelineStart, ...tasks.map((candidate) => candidate.start)) : scene.timelineStart;
  const maxEnd = tasks.length > 0 ? Math.max(scene.timelineEnd, ...tasks.map((candidate) => candidate.end)) : scene.timelineEnd;

  return {
    ...scene,
    tasks,
    rowLabels: scene.rowLabels.slice(),
    timelineStart: minStart,
    timelineEnd: maxEnd,
  };
}

export function createTaskEditEvent(input: {
  operation: GanttTaskEditOperation;
  originalTask: GanttTask;
  proposedTask: GanttTask;
  previousDraftTask: GanttTask | null;
  pointer: GanttTaskEditPointer;
  snap: GanttTaskEditSnap;
}): GanttTaskEditEvent {
  return {
    taskId: input.originalTask.id,
    operation: input.operation,
    originalTask: cloneTask(input.originalTask),
    proposedTask: cloneTask(input.proposedTask),
    previousDraftTask: input.previousDraftTask ? cloneTask(input.previousDraftTask) : null,
    pointer: { ...input.pointer },
    snap: { ...input.snap },
  };
}
