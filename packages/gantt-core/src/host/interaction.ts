import {
  pickDependencyAtPoint,
  pickTasksInScreenRect as pickTasksInScreenRectCore,
  pickTaskAtPoint,
  screenToWorld,
  worldToScreen,
  type DependencyPath,
  type GanttScene,
  type GanttTask,
  type TaskIndex,
} from '../core';
import { createTaskEditEvent, replaceTasksInScene } from '../edit';
import type {
  GanttCanvasPointerEvent,
  GanttCanvasPointerEventType,
  GanttInteractionMode,
  GanttTaskEditEvent,
  GanttTaskEditState,
} from '../types';
import { getRenderIndex, getRenderScene } from './render-loop';
import type { ActiveEditBatchState, CanvasLayerHitRegionRecord, HostInternals } from './types';

function normalizeCanvasRect(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const left = Math.min(x, x + width);
  const top = Math.min(y, y + height);
  return {
    x: left,
    y: top,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function pickSelectedTask(
  scene: GanttScene,
  index: TaskIndex,
  camera: import('../core').CameraState,
  x: number,
  y: number,
  options: HostInternals['config']['render'],
): GanttTask | null {
  return pickTaskAtPoint(scene, index, camera, x, y, {
    rowPitch: options.rowPitch,
    barHeight: options.barHeight,
  });
}

function getLocalCanvasPoint(host: HostInternals, event: { clientX?: number; clientY?: number }): { x: number; y: number } {
  const rect = host.canvas.getBoundingClientRect();
  return {
    x: (event.clientX ?? 0) - rect.left,
    y: (event.clientY ?? 0) - rect.top,
  };
}

function resolveCanvasHitRegionByKey(host: HostInternals, key: string | null): CanvasLayerHitRegionRecord | null {
  if (!key) {
    return null;
  }
  return host.canvasHitRegionByKey.get(key) ?? null;
}

function getCanvasHitRegionScreenRect(
  host: HostInternals,
  region: CanvasLayerHitRegionRecord,
): { x: number; y: number; width: number; height: number } {
  if (region.space === 'screen') {
    return normalizeCanvasRect(region.x, region.y, region.width, region.height);
  }

  const [screenX, screenY] = worldToScreen(host.camera, region.x, region.y);
  return normalizeCanvasRect(
    screenX,
    screenY,
    region.width * host.camera.zoomX,
    region.height * host.camera.zoomY,
  );
}

function resolveCanvasHitRegion(host: HostInternals, screenX: number, screenY: number): CanvasLayerHitRegionRecord | null {
  for (let index = host.canvasHitRegions.length - 1; index >= 0; index -= 1) {
    const region = host.canvasHitRegions[index];
    const rect = getCanvasHitRegionScreenRect(host, region);
    if (
      screenX >= rect.x &&
      screenX <= rect.x + rect.width &&
      screenY >= rect.y &&
      screenY <= rect.y + rect.height
    ) {
      return region;
    }
  }

  return null;
}

function buildCanvasPointerEvent(
  host: HostInternals,
  type: GanttCanvasPointerEventType,
  rawEvent: PointerEvent | MouseEvent,
  screenX: number,
  screenY: number,
  capture: () => void,
): GanttCanvasPointerEvent {
  const pointerId = 'pointerId' in rawEvent && typeof rawEvent.pointerId === 'number' ? rawEvent.pointerId : 1;
  const [worldX, worldY] = screenToWorld(host.camera, screenX, screenY);
  return {
    type,
    pointerId,
    screenX,
    screenY,
    worldX,
    worldY,
    button: rawEvent.button ?? 0,
    buttons: rawEvent.buttons ?? 0,
    altKey: rawEvent.altKey ?? false,
    ctrlKey: rawEvent.ctrlKey ?? false,
    metaKey: rawEvent.metaKey ?? false,
    shiftKey: rawEvent.shiftKey ?? false,
    capture,
    requestRender: () => host.requestRender(),
  };
}

function dispatchCanvasPointerEventToRegion(
  host: HostInternals,
  region: CanvasLayerHitRegionRecord | null,
  type: GanttCanvasPointerEventType,
  rawEvent: PointerEvent | MouseEvent,
  screenX: number,
  screenY: number,
): boolean {
  if (!region) {
    return false;
  }

  const handler = type === 'pointerenter'
    ? region.onPointerEnter
    : type === 'pointerleave'
      ? region.onPointerLeave
      : type === 'pointermove'
        ? region.onPointerMove
        : type === 'pointerdown'
          ? region.onPointerDown
          : type === 'pointerup'
            ? region.onPointerUp
            : region.onClick;

  if (!handler) {
    return false;
  }

  let captured = false;
  const event = buildCanvasPointerEvent(host, type, rawEvent, screenX, screenY, () => {
    captured = true;
  });

  try {
    const result = handler(event);
    Promise.resolve(result).catch((error) => {
      console.error(`Canvas hit region ${type} handler failed`, error);
    });
  } catch (error) {
    console.error(`Canvas hit region ${type} handler failed`, error);
  }

  return captured;
}

function clearHoveredCanvasRegion(
  host: HostInternals,
  pointerId: number,
  rawEvent: PointerEvent | MouseEvent,
  screenX: number,
  screenY: number,
): void {
  const hoveredKey = host.hoveredCanvasRegionKeys.get(pointerId) ?? null;
  const hoveredRegion = resolveCanvasHitRegionByKey(host, hoveredKey);
  if (hoveredRegion) {
    dispatchCanvasPointerEventToRegion(host, hoveredRegion, 'pointerleave', rawEvent, screenX, screenY);
  }
  host.hoveredCanvasRegionKeys.delete(pointerId);
}

function syncCanvasCursor(host: HostInternals, screenX: number | null, screenY: number | null): void {
  const capturedRegion = Array.from(host.capturedCanvasRegionKeys.values())
    .map((key) => resolveCanvasHitRegionByKey(host, key))
    .find((region) => region !== null) ?? null;
  const hoveredRegion =
    capturedRegion ??
    (screenX !== null && screenY !== null ? resolveCanvasHitRegion(host, screenX, screenY) : null);
  host.canvas.style.cursor = hoveredRegion?.cursor ?? '';
}

function dispatchCanvasPointer(
  host: HostInternals,
  type: GanttCanvasPointerEventType,
  rawEvent: PointerEvent | MouseEvent,
  screenX: number,
  screenY: number,
): boolean {
  const pointerId = 'pointerId' in rawEvent && typeof rawEvent.pointerId === 'number' ? rawEvent.pointerId : 1;
  const capturedKey = host.capturedCanvasRegionKeys.get(pointerId) ?? null;
  const pendingClickKey = host.pendingCanvasClickRegionKeys.get(pointerId) ?? null;
  let targetRegion = resolveCanvasHitRegionByKey(host, capturedKey);
  if (capturedKey && !targetRegion) {
    host.capturedCanvasRegionKeys.delete(pointerId);
  }

  if (type === 'pointerleave') {
    clearHoveredCanvasRegion(host, pointerId, rawEvent, screenX, screenY);
    return Boolean(host.capturedCanvasRegionKeys.get(pointerId));
  }

  if (!targetRegion && type === 'click') {
    targetRegion = resolveCanvasHitRegionByKey(host, pendingClickKey);
    host.pendingCanvasClickRegionKeys.delete(pointerId);
  }

  if (!targetRegion) {
    targetRegion = resolveCanvasHitRegion(host, screenX, screenY);
  }

  if (type === 'pointermove') {
    const hoveredKey = host.hoveredCanvasRegionKeys.get(pointerId) ?? null;
    const nextHoveredKey = targetRegion?.key ?? null;
    let enteredCaptured = false;

    if (hoveredKey !== nextHoveredKey) {
      const previousRegion = resolveCanvasHitRegionByKey(host, hoveredKey);
      if (previousRegion) {
        dispatchCanvasPointerEventToRegion(host, previousRegion, 'pointerleave', rawEvent, screenX, screenY);
      }
      if (targetRegion) {
        enteredCaptured = dispatchCanvasPointerEventToRegion(
          host,
          targetRegion,
          'pointerenter',
          rawEvent,
          screenX,
          screenY,
        );
        host.hoveredCanvasRegionKeys.set(pointerId, targetRegion.key);
      } else {
        host.hoveredCanvasRegionKeys.delete(pointerId);
      }
    }

    const captured = dispatchCanvasPointerEventToRegion(host, targetRegion, 'pointermove', rawEvent, screenX, screenY);
    return Boolean(host.capturedCanvasRegionKeys.get(pointerId)) || enteredCaptured || captured;
  }

  if (type === 'pointerdown') {
    host.pendingCanvasClickRegionKeys.delete(pointerId);
    const captured = dispatchCanvasPointerEventToRegion(host, targetRegion, 'pointerdown', rawEvent, screenX, screenY);
    if (captured && targetRegion) {
      host.capturedCanvasRegionKeys.set(pointerId, targetRegion.key);
      (host.canvas as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(pointerId);
    }
    return captured;
  }

  if (type === 'pointerup') {
    const captured = dispatchCanvasPointerEventToRegion(host, targetRegion, 'pointerup', rawEvent, screenX, screenY);
    const shouldSuppress = Boolean(capturedKey) || captured;
    if (shouldSuppress && targetRegion) {
      host.pendingCanvasClickRegionKeys.set(pointerId, targetRegion.key);
    }
    host.capturedCanvasRegionKeys.delete(pointerId);
    const canvas = host.canvas as unknown as {
      hasPointerCapture?: (id: number) => boolean;
      releasePointerCapture?: (id: number) => void;
    };
    if (canvas.hasPointerCapture?.(pointerId)) {
      canvas.releasePointerCapture?.(pointerId);
    }
    return shouldSuppress;
  }

  const captured = dispatchCanvasPointerEventToRegion(host, targetRegion, 'click', rawEvent, screenX, screenY);
  return Boolean(pendingClickKey) || captured;
}

export function attachCanvasLayerPointerEvents(host: HostInternals): void {
  const onPointerMove = (event: PointerEvent) => {
    const point = getLocalCanvasPoint(host, event);
    const consumed = dispatchCanvasPointer(host, 'pointermove', event, point.x, point.y);
    syncCanvasCursor(host, point.x, point.y);
    if (consumed) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    const point = getLocalCanvasPoint(host, event);
    const consumed = dispatchCanvasPointer(host, 'pointerdown', event, point.x, point.y);
    syncCanvasCursor(host, point.x, point.y);
    if (consumed) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    const point = getLocalCanvasPoint(host, event);
    const consumed = dispatchCanvasPointer(host, 'pointerup', event, point.x, point.y);
    syncCanvasCursor(host, point.x, point.y);
    if (consumed) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    }
  };

  const onPointerCancel = (event: PointerEvent) => {
    const point = getLocalCanvasPoint(host, event);
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    clearHoveredCanvasRegion(host, pointerId, event, point.x, point.y);
    const consumed = host.capturedCanvasRegionKeys.delete(pointerId);
    host.pendingCanvasClickRegionKeys.delete(pointerId);
    if (host.canvas.hasPointerCapture?.(pointerId)) {
      host.canvas.releasePointerCapture?.(pointerId);
    }
    syncCanvasCursor(host, null, null);
    if (consumed) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    }
  };

  const onPointerLeave = (event: PointerEvent) => {
    const point = getLocalCanvasPoint(host, event);
    const consumed = dispatchCanvasPointer(host, 'pointerleave', event, point.x, point.y);
    syncCanvasCursor(host, null, null);
    if (consumed) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    }
  };

  const onClick = (event: MouseEvent) => {
    const point = getLocalCanvasPoint(host, event);
    const consumed = dispatchCanvasPointer(host, 'click', event, point.x, point.y);
    syncCanvasCursor(host, point.x, point.y);
    if (consumed) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    }
  };

  host.canvas.addEventListener('pointermove', onPointerMove, true);
  host.canvas.addEventListener('pointerdown', onPointerDown, true);
  host.canvas.addEventListener('pointerup', onPointerUp, true);
  host.canvas.addEventListener('pointercancel', onPointerCancel, true);
  host.canvas.addEventListener('pointerleave', onPointerLeave, true);
  host.canvas.addEventListener('click', onClick, true);
  host.registerCleanup(() => {
    host.canvas.removeEventListener('pointermove', onPointerMove, true);
    host.canvas.removeEventListener('pointerdown', onPointerDown, true);
    host.canvas.removeEventListener('pointerup', onPointerUp, true);
    host.canvas.removeEventListener('pointercancel', onPointerCancel, true);
    host.canvas.removeEventListener('pointerleave', onPointerLeave, true);
    host.canvas.removeEventListener('click', onClick, true);
  });
}

export function hasTask(host: HostInternals, taskId: string | null, index: TaskIndex): boolean {
  void host;
  return taskId !== null && index.byId.has(taskId);
}

export function normalizeSelectedTaskIds(
  host: HostInternals,
  taskIds: readonly string[],
  index: TaskIndex,
  primaryTaskId: string | null = null,
): string[] {
  void host;
  const nextTaskIds: string[] = [];
  const seen = new Set<string>();

  const appendTaskId = (taskId: string | null) => {
    if (!taskId || seen.has(taskId) || !index.byId.has(taskId)) {
      return;
    }

    seen.add(taskId);
    nextTaskIds.push(taskId);
  };

  appendTaskId(primaryTaskId);
  for (const taskId of taskIds) {
    appendTaskId(taskId);
  }

  return nextTaskIds;
}

export function assignTaskSelection(
  host: HostInternals,
  taskIds: readonly string[],
  primaryTaskId: string | null = null,
): void {
  const index = getRenderIndex(host);
  host.selectedTaskIds = normalizeSelectedTaskIds(host, taskIds, index, primaryTaskId);
  host.selectedTasks = host.selectedTaskIds
    .map((taskId) => index.byId.get(taskId) ?? null)
    .filter((task): task is GanttTask => task !== null);
  host.selectedTask = host.selectedTasks[0] ?? null;
  host.selectedTaskId = host.selectedTask?.id ?? null;
  host.selectedDependency = null;
  host.selectedDependencyId = null;
}

export function clearTaskSelection(host: HostInternals): void {
  host.selectedTaskIds = [];
  host.selectedTasks = [];
  host.selectedTaskId = null;
  host.selectedTask = null;
}

export function refreshSelectionReferences(host: HostInternals): void {
  const index = getRenderIndex(host);
  host.selectedTaskIds = normalizeSelectedTaskIds(host, host.selectedTaskIds, index, host.selectedTaskId);
  host.selectedTasks = host.selectedTaskIds
    .map((taskId) => index.byId.get(taskId) ?? null)
    .filter((task): task is GanttTask => task !== null);
  host.selectedTask = host.selectedTasks[0] ?? null;
  host.selectedTaskId = host.selectedTask?.id ?? null;

  if (host.selectionPreviewTaskIds !== null) {
    host.selectionPreviewTaskIds = normalizeSelectedTaskIds(
      host,
      host.selectionPreviewTaskIds,
      index,
      host.selectionPreviewPrimaryTaskId,
    );
    host.selectionPreviewPrimaryTaskId = host.selectionPreviewTaskIds[0] ?? null;
  }

  if (hasTask(host, host.hoveredTaskId, index)) {
    host.hoveredTask = index.byId.get(host.hoveredTaskId as string) ?? null;
  } else {
    host.hoveredTaskId = null;
    host.hoveredTask = null;
  }

  if (host.selectedDependencyId) {
    host.selectedDependency = host.frame?.dependencyPaths.find((path) => path.id === host.selectedDependencyId) ?? null;
    if (!host.selectedDependency) {
      host.selectedDependencyId = null;
    }
  }

  if (host.hoveredDependencyId) {
    host.hoveredDependency = host.frame?.dependencyPaths.find((path) => path.id === host.hoveredDependencyId) ?? null;
    if (!host.hoveredDependency) {
      host.hoveredDependencyId = null;
    }
  }
}

export function resolveTaskEditEvent(host: HostInternals, event: GanttTaskEditEvent): GanttTaskEditEvent | null {
  let nextTask = event.proposedTask;
  let resolved = createTaskEditEvent({
    operation: event.operation,
    originalTask: event.originalTask,
    proposedTask: nextTask,
    previousDraftTask: event.previousDraftTask,
    pointer: event.pointer,
    snap: event.snap,
  });

  for (let index = host.taskEditResolvers.length - 1; index >= 0; index -= 1) {
    const candidate = host.taskEditResolvers[index](resolved);
    if (candidate === false) {
      return null;
    }
    if (candidate) {
      nextTask = candidate;
      resolved = createTaskEditEvent({
        operation: event.operation,
        originalTask: event.originalTask,
        proposedTask: nextTask,
        previousDraftTask: resolved.previousDraftTask,
        pointer: event.pointer,
        snap: event.snap,
      });
    }
  }

  return resolved;
}

export function resolveTaskEditEvents(host: HostInternals, events: GanttTaskEditEvent[]): GanttTaskEditEvent[] | null {
  const resolvedEvents: GanttTaskEditEvent[] = [];

  for (const event of events) {
    const resolved = resolveTaskEditEvent(host, event);
    if (!resolved) {
      return null;
    }
    resolvedEvents.push(resolved);
  }

  return resolvedEvents;
}

export function taskFromPointer(host: HostInternals, x: number, y: number): GanttTask | null {
  return pickSelectedTask(getRenderScene(host), getRenderIndex(host), host.camera, x, y, host.config.render);
}

export function dependencyFromPointer(host: HostInternals, x: number, y: number): DependencyPath | null {
  if (!host.frame) {
    return null;
  }
  return pickDependencyAtPoint(host.frame, host.camera, x, y, 8);
}

export async function setSelection(
  host: HostInternals,
  task: GanttTask | null,
  dependency: DependencyPath | null,
): Promise<void> {
  clearSelectionPreview(host);
  if (task) {
    assignTaskSelection(host, [task.id], task.id);
  } else {
    clearTaskSelection(host);
  }
  host.selectedDependency = dependency;
  host.selectedDependencyId = dependency?.id ?? null;
  host.requestRender();

  await host.pluginRuntime.notifySelection(host.getSelection());
}

export function setSelectionByTaskId(host: HostInternals, taskId: string | null): void {
  if (!taskId) {
    void setSelection(host, null, null);
    return;
  }

  const task = getRenderIndex(host).byId.get(taskId) ?? null;
  void setSelection(host, task, null);
}

export function setSelectionByDependencyId(host: HostInternals, dependencyId: string | null): void {
  if (!dependencyId) {
    void setSelection(host, null, null);
    return;
  }

  const dependency = host.frame?.dependencyPaths.find((path) => path.id === dependencyId) ?? null;
  void setSelection(host, null, dependency);
}

export function setSelectionByTaskIds(host: HostInternals, taskIds: string[], primaryTaskId?: string | null): void {
  clearSelectionPreview(host);
  assignTaskSelection(host, taskIds, primaryTaskId ?? taskIds[0] ?? null);
  host.requestRender();
  void host.pluginRuntime.notifySelection(host.getSelection());
}

export function setSelectionByScreenPoint(host: HostInternals, x: number, y: number): void {
  const task = taskFromPointer(host, x, y);
  const dependency = task ? null : dependencyFromPointer(host, x, y);
  void setSelection(host, task, dependency);
}

export function previewSelectionByTaskIds(host: HostInternals, taskIds: string[], primaryTaskId?: string | null): void {
  const nextTaskIds = normalizeSelectedTaskIds(
    host,
    taskIds,
    getRenderIndex(host),
    primaryTaskId ?? taskIds[0] ?? null,
  );

  host.selectionPreviewTaskIds = nextTaskIds;
  host.selectionPreviewPrimaryTaskId = nextTaskIds[0] ?? null;
  host.requestRender();
}

export function clearSelectionPreview(host: HostInternals): void {
  if (host.selectionPreviewTaskIds === null && host.selectionPreviewPrimaryTaskId === null) {
    return;
  }

  host.selectionPreviewTaskIds = null;
  host.selectionPreviewPrimaryTaskId = null;
  host.requestRender();
}

export function setInteractionMode(host: HostInternals, mode: GanttInteractionMode): void {
  const nextMode = mode === 'edit' && !host.config.edit.enabled ? 'view' : mode;
  if (nextMode === host.interactionMode) {
    return;
  }

  if (host.activeEdit?.status === 'preview' && nextMode !== 'edit') {
    cancelActiveEdit(host);
  }

  host.interactionMode = nextMode;
  host.canvas.dataset.mode = host.interactionMode;
  if (nextMode !== 'select') {
    clearSelectionPreview(host);
  }
  host.requestRender();
  host.pluginRuntime.notifyEditModeChange(host.interactionMode);
}

export function cancelActiveEdit(host: HostInternals): void {
  if (!host.activeEdit || host.activeEdit.status !== 'preview') {
    return;
  }

  const events = host.activeEditBatch?.events ?? (host.lastTaskEditEvent ? [host.lastTaskEditEvent] : []);
  host.updateActiveEdit(null, null, null);
  for (const event of events) {
    host.fireEditCancel(event);
  }
}

export function previewTaskEdit(host: HostInternals, event: GanttTaskEditEvent): GanttTaskEditEvent | null {
  const resolvedEvents = previewTaskEdits(host, [event]);
  return resolvedEvents?.[0] ?? null;
}

export function previewTaskEdits(host: HostInternals, events: GanttTaskEditEvent[]): GanttTaskEditEvent[] | null {
  if (!host.config.edit.enabled || host.activeEdit?.status === 'committing') {
    return null;
  }

  if (events.length === 0) {
    return null;
  }

  const resolvedEvents = resolveTaskEditEvents(host, events);
  if (!resolvedEvents) {
    return null;
  }

  const primaryTaskId = events[0]?.taskId ?? resolvedEvents[0]?.taskId ?? null;
  const primaryEvent = resolvedEvents.find((candidate) => candidate.taskId === primaryTaskId) ?? resolvedEvents[0];
  if (!primaryEvent) {
    return null;
  }

  const isStarting = !host.activeEdit;
  const nextEdit: GanttTaskEditState = {
    taskId: primaryEvent.taskId,
    operation: primaryEvent.operation,
    originalTask: host.cloneTask(primaryEvent.originalTask),
    draftTask: host.cloneTask(primaryEvent.proposedTask),
    status: 'preview',
  };
  const batch: ActiveEditBatchState = {
    primaryTaskId: primaryEvent.taskId,
    events: resolvedEvents.map((candidate) => createTaskEditEvent({
      operation: candidate.operation,
      originalTask: candidate.originalTask,
      proposedTask: candidate.proposedTask,
      previousDraftTask: candidate.previousDraftTask,
      pointer: candidate.pointer,
      snap: candidate.snap,
    })),
    originalTasks: resolvedEvents.map((candidate) => host.cloneTask(candidate.originalTask)),
    draftTasks: resolvedEvents.map((candidate) => host.cloneTask(candidate.proposedTask)),
  };

  clearSelectionPreview(host);
  host.selectedTaskIds = resolvedEvents.map((candidate) => candidate.taskId);
  host.selectedTaskId = primaryEvent.taskId;
  host.selectedDependency = null;
  host.selectedDependencyId = null;
  host.updateActiveEdit(nextEdit, primaryEvent, batch);

  if (isStarting) {
    for (const resolvedEvent of resolvedEvents) {
      host.fireEditStart(resolvedEvent);
    }
  }
  for (const resolvedEvent of resolvedEvents) {
    host.fireEditPreview(resolvedEvent);
  }
  return resolvedEvents;
}

export async function commitActiveEdit(host: HostInternals, event?: GanttTaskEditEvent | null): Promise<boolean> {
  return commitTaskEdits(host, event ? [event] : null);
}

export async function commitTaskEdits(host: HostInternals, events?: GanttTaskEditEvent[] | null): Promise<boolean> {
  const activeEdit = host.activeEdit;
  const commitEvents = events ?? host.activeEditBatch?.events ?? (host.lastTaskEditEvent ? [host.lastTaskEditEvent] : null);
  if (!activeEdit || !commitEvents || commitEvents.length === 0) {
    return false;
  }

  const resolvedEvents = resolveTaskEditEvents(host, commitEvents);
  if (!resolvedEvents) {
    host.updateActiveEdit(null, null, null);
    for (const commitEvent of commitEvents) {
      host.fireEditCancel(commitEvent);
    }
    return false;
  }
  const primaryEvent = resolvedEvents.find((candidate) => candidate.taskId === activeEdit.taskId) ?? resolvedEvents[0];
  if (!primaryEvent) {
    return false;
  }

  host.activeEdit = {
    taskId: primaryEvent.taskId,
    operation: primaryEvent.operation,
    originalTask: host.cloneTask(primaryEvent.originalTask),
    draftTask: host.cloneTask(primaryEvent.proposedTask),
    status: 'committing',
  };
  host.activeEditBatch = {
    primaryTaskId: primaryEvent.taskId,
    events: resolvedEvents.map((candidate) => createTaskEditEvent({
      operation: candidate.operation,
      originalTask: candidate.originalTask,
      proposedTask: candidate.proposedTask,
      previousDraftTask: candidate.previousDraftTask,
      pointer: candidate.pointer,
      snap: candidate.snap,
    })),
    originalTasks: resolvedEvents.map((candidate) => host.cloneTask(candidate.originalTask)),
    draftTasks: resolvedEvents.map((candidate) => host.cloneTask(candidate.proposedTask)),
  };
  host.lastTaskEditEvent = primaryEvent;
  host.requestRender();
  for (const resolvedEvent of resolvedEvents) {
    host.pluginRuntime.notifyTaskEditCommit(resolvedEvent);
  }

  try {
    const appliedTasks: GanttTask[] = [];
    for (const resolvedEvent of resolvedEvents) {
      const result = host.config.edit.callbacks.onTaskEditCommit
        ? await host.config.edit.callbacks.onTaskEditCommit(resolvedEvent)
        : resolvedEvent.proposedTask;
      if (result === false) {
        host.updateActiveEdit(null, null, null);
        for (const cancelEvent of resolvedEvents) {
          host.fireEditCancel(cancelEvent);
        }
        return false;
      }

      appliedTasks.push(host.cloneTask({
        ...result,
        id: resolvedEvent.taskId,
      }));
    }

    host.replaceCommittedScene(replaceTasksInScene(host.scene, appliedTasks));
    assignTaskSelection(host, appliedTasks.map((task) => task.id), primaryEvent.taskId);
    host.updateActiveEdit(null, null, null);
    return true;
  } catch {
    host.updateActiveEdit(null, null, null);
    for (const cancelEvent of resolvedEvents) {
      host.fireEditCancel(cancelEvent);
    }
    return false;
  }
}

export function updateHoverFromScreen(host: HostInternals, x: number, y: number): void {
  const nextTask = taskFromPointer(host, x, y);
  const nextDependency = nextTask ? null : dependencyFromPointer(host, x, y);
  const nextHoverId = nextTask?.id ?? null;
  const nextDependencyId = nextDependency?.id ?? null;

  if (nextHoverId === host.hoveredTaskId && nextDependencyId === host.hoveredDependencyId) {
    return;
  }

  host.hoveredTask = nextTask;
  host.hoveredTaskId = nextHoverId;
  host.hoveredDependency = nextDependency;
  host.hoveredDependencyId = nextDependencyId;
  host.requestRender();
}

export function pickTaskAtScreen(host: HostInternals, x: number, y: number): GanttTask | null {
  return taskFromPointer(host, x, y);
}

export function pickTasksInScreenRect(host: HostInternals, x0: number, y0: number, x1: number, y1: number): GanttTask[] {
  return pickTasksInScreenRectCore(
    getRenderScene(host),
    getRenderIndex(host),
    host.camera,
    x0,
    y0,
    x1,
    y1,
    {
      rowPitch: host.config.render.rowPitch,
      barHeight: host.config.render.barHeight,
    },
  );
}

export function pickDependencyAtScreen(host: HostInternals, x: number, y: number): DependencyPath | null {
  return dependencyFromPointer(host, x, y);
}
