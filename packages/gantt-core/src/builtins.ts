import {
  DAY_MS,
  type DependencyPath,
  type GanttTask,
} from './core';
import type { FrameScene } from './core';
import {
  buildTaskEditPointer,
  createTaskEditEvent,
  resolveTaskMoveDrafts,
  resolveTaskEditDraft,
  resolveTaskEditHitTarget,
} from './edit';
import type { GanttModule, GanttModuleContext } from './types';

const DETAIL_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDaySerial(daySerial: number): string {
  return DETAIL_DATE_FORMATTER.format(new Date(Math.floor(daySerial) * DAY_MS));
}

function formatDurationDays(start: number, end: number): string {
  return `${(end - start).toFixed(0)}d`;
}

function getHudField(root: HTMLElement, field: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[data-field="${field}"]`);
  if (!element) {
    throw new Error(`Missing HUD field: ${field}`);
  }
  return element;
}

function formatTaskDetails(task: GanttTask | null): string {
  if (!task) {
    return 'No task selected';
  }

  const deps = task.dependencies?.length ?? 0;
  return [
    task.label,
    '',
    `id: ${task.id}`,
    `row: ${task.rowIndex}`,
    `start: ${formatDaySerial(task.start)}`,
    `end: ${formatDaySerial(task.end)}`,
    `duration: ${formatDurationDays(task.start, task.end)}`,
    `milestone: ${task.milestone ? 'yes' : 'no'}`,
    `dependencies: ${deps}`,
  ].join('\n');
}

function formatTaskSelectionDetails(tasks: GanttTask[]): string {
  if (tasks.length === 0) {
    return 'No task selected';
  }

  if (tasks.length === 1) {
    return formatTaskDetails(tasks[0]);
  }

  const minStart = Math.min(...tasks.map((task) => task.start));
  const maxEnd = Math.max(...tasks.map((task) => task.end));
  return [
    `${tasks.length} tasks selected`,
    '',
    `primary: ${tasks[0]?.label ?? 'None'}`,
    `rows: ${new Set(tasks.map((task) => task.rowIndex)).size}`,
    `range: ${formatDaySerial(minStart)} - ${formatDaySerial(maxEnd)}`,
    '',
    ...tasks.slice(0, 5).map((task) => `${task.id}: ${task.label}`),
    ...(tasks.length > 5 ? [`+${tasks.length - 5} more`] : []),
  ].join('\n');
}

function formatDependencyDetails(path: DependencyPath | null): string {
  if (!path) {
    return 'No dependency selected';
  }

  return [
    `dependency: ${path.id}`,
    '',
    `source: ${path.sourceTaskId}`,
    `target: ${path.targetTaskId}`,
    `segments: ${path.segments.length}`,
  ].join('\n');
}

function updateInspector(context: GanttModuleContext): void {
  const { host } = context;
  const inspector = host.inspector;
  if (!inspector) {
    return;
  }

  const selection = host.getSelection();
  const field = getHudField(inspector, 'selection');
  const text = selection.selectedTasks.length > 1
    ? formatTaskSelectionDetails(selection.selectedTasks)
    : selection.selectedTask
      ? formatTaskDetails(selection.selectedTask)
      : selection.selectedDependency
        ? formatDependencyDetails(selection.selectedDependency)
        : selection.hoveredTask
          ? `Hover Task\n\n${formatTaskDetails(selection.hoveredTask)}`
          : selection.hoveredDependency
            ? `Hover Dependency\n\n${formatDependencyDetails(selection.hoveredDependency)}`
            : 'No task or dependency selected';

  field.textContent = text;
  field.classList.toggle(
    'inspector-empty',
    selection.selectedTasks.length === 0 &&
      !selection.hoveredTask &&
      !selection.selectedDependency &&
      !selection.hoveredDependency,
  );
}

function updateHud(context: GanttModuleContext, frame: FrameScene): void {
  const { host } = context;
  const hud = host.hud;
  if (!hud) {
    return;
  }

  const visibleWindow = host.getVisibleWindow();
  getHudField(hud, 'rows').textContent = `${frame.stats.visibleRows}`;
  getHudField(hud, 'tasks').textContent = `${frame.stats.visibleTasks}`;
  getHudField(hud, 'glyphs').textContent = `${frame.stats.glyphCount}`;
  getHudField(hud, 'lines').textContent = `${frame.stats.gridLineCount + frame.stats.visibleDependencies}`;
  getHudField(hud, 'frame').textContent = `${host.getLastFrameMs().toFixed(2)}ms`;
  getHudField(hud, 'camera').textContent =
    `${formatDaySerial(visibleWindow.start)} - ${formatDaySerial(visibleWindow.end)} | zoom ${host.getCamera().zoomX.toFixed(2)}x`;
}

function updateZoomToolbar(context: GanttModuleContext): void {
  const toolbar = context.host.toolbar;
  if (!toolbar) {
    return;
  }
  const activePresetId = context.host.getZoomPresetIdForVisibleWindow();
  const buttons = toolbar.querySelectorAll<HTMLButtonElement>('[data-zoom-preset]');
  for (const button of buttons) {
    const active = button.dataset.zoomPreset === activePresetId;
    button.dataset.active = active ? 'true' : 'false';
    button.ariaPressed = active ? 'true' : 'false';
  }

  const interactionMode = context.host.getInteractionState().mode;
  const modeButtons = toolbar.querySelectorAll<HTMLButtonElement>('[data-interaction-mode]');
  for (const button of modeButtons) {
    const active = button.dataset.interactionMode === interactionMode;
    button.dataset.active = active ? 'true' : 'false';
    button.ariaPressed = active ? 'true' : 'false';
  }
}

const POINTER_DRAG_THRESHOLD_PX = 4;

export function createCameraControlsModule(): GanttModule {
  return {
    id: 'camera-controls',
    onInit: ({ host }) => {
      const canvas = host.canvas;

      canvas.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();
          host.stopCameraAnimation();
          const rect = canvas.getBoundingClientRect();
          const anchorX = event.clientX - rect.left;
          const anchorY = event.clientY - rect.top;

          if (event.ctrlKey || event.metaKey || event.altKey) {
            const zoomFactor = Math.exp(-event.deltaY * 0.0015);
            host.zoomAt(zoomFactor, anchorX, anchorY);
          } else {
            host.panByScreenDelta(-event.deltaX, -event.deltaY);
          }
        },
        { passive: false },
      );

      const onKeyDown = (event: KeyboardEvent) => {
        host.stopCameraAnimation();

        if (event.key === '0') {
          host.resetCamera();
        }

        if (event.key === '=' || event.key === '+') {
          const camera = host.getCamera();
          host.zoomAt(1.12, camera.viewportWidth * 0.5, camera.viewportHeight * 0.5);
        }

        if (event.key === '-' || event.key === '_') {
          const camera = host.getCamera();
          host.zoomAt(1 / 1.12, camera.viewportWidth * 0.5, camera.viewportHeight * 0.5);
        }
      };

      window.addEventListener('keydown', onKeyDown);
      host.registerCleanup(() => {
        window.removeEventListener('keydown', onKeyDown);
      });

      const onResize = () => {
        host.syncCanvasSize();
      };

      window.addEventListener('resize', onResize);
      host.registerCleanup(() => {
        window.removeEventListener('resize', onResize);
      });
    },
  };
}

export function createSelectionModule(): GanttModule {
  return {
    id: 'selection',
    onInit: ({ host }) => {
      const canvas = host.canvas;
      const surface = canvas.parentElement;
      type PointerSession = {
        pointerId: number;
        originX: number;
        originY: number;
        lastX: number;
        lastY: number;
        dragStarted: boolean;
        mode: 'pan' | 'pan-or-select' | 'edit-or-select' | 'edit-selection' | 'marquee-select';
        task: GanttTask | null;
        groupTasks: GanttTask[] | null;
        primaryTaskId: string | null;
        operation: 'move' | 'resize-start' | 'resize-end' | null;
        startPointer: ReturnType<typeof buildTaskEditPointer>;
        lastPreviewEvent: ReturnType<typeof createTaskEditEvent> | null;
        lastPreviewEvents: Array<ReturnType<typeof createTaskEditEvent>> | null;
        selectionTaskIds: string[];
      };

      let pointerSession: PointerSession | null = null;
      let spacePressed = false;
      let selectionMarquee: HTMLDivElement | null = null;

      if (surface instanceof HTMLElement) {
        selectionMarquee = document.createElement('div');
        selectionMarquee.className = 'gantt-selection-marquee';
        selectionMarquee.style.position = 'absolute';
        selectionMarquee.style.left = '0';
        selectionMarquee.style.top = '0';
        selectionMarquee.style.width = '0';
        selectionMarquee.style.height = '0';
        selectionMarquee.style.pointerEvents = 'none';
        selectionMarquee.style.display = 'none';
        selectionMarquee.style.zIndex = '2';
        selectionMarquee.style.border = '1px dashed rgba(130, 200, 255, 0.9)';
        selectionMarquee.style.background = 'rgba(86, 162, 222, 0.14)';
        selectionMarquee.style.borderRadius = '8px';
        selectionMarquee.style.boxShadow = 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)';
        surface.append(selectionMarquee);
        host.registerCleanup(() => {
          selectionMarquee?.remove();
          selectionMarquee = null;
        });
      }

      const localPoint = (event: PointerEvent | MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      };

      const hideSelectionMarquee = () => {
        if (!selectionMarquee) {
          return;
        }

        selectionMarquee.style.display = 'none';
        selectionMarquee.style.width = '0';
        selectionMarquee.style.height = '0';
      };

      const updateSelectionMarquee = (x0: number, y0: number, x1: number, y1: number) => {
        if (!selectionMarquee) {
          return;
        }

        selectionMarquee.style.display = 'block';
        selectionMarquee.style.left = `${Math.min(x0, x1)}px`;
        selectionMarquee.style.top = `${Math.min(y0, y1)}px`;
        selectionMarquee.style.width = `${Math.abs(x1 - x0)}px`;
        selectionMarquee.style.height = `${Math.abs(y1 - y0)}px`;
      };

      const resetPointerSession = () => {
        pointerSession = null;
        canvas.dataset.dragging = 'false';
        hideSelectionMarquee();
        host.clearSelectionPreview();
      };

      canvas.dataset.dragging = 'false';

      canvas.addEventListener('pointermove', (event) => {
        if (!pointerSession) {
          const point = localPoint(event);
          host.updateHoverFromScreen(point.x, point.y);
          return;
        }

        if (event.pointerId !== pointerSession.pointerId) {
          return;
        }

        const session = pointerSession;
        const point = localPoint(event);
        const dx = point.x - session.lastX;
        const dy = point.y - session.lastY;
        session.lastX = point.x;
        session.lastY = point.y;

        if (!session.dragStarted) {
          const distance = Math.hypot(point.x - session.originX, point.y - session.originY);
          if (distance < POINTER_DRAG_THRESHOLD_PX) {
            return;
          }
          session.dragStarted = true;
          canvas.dataset.dragging = 'true';
        }

        if (session.mode === 'pan' || session.mode === 'pan-or-select') {
          host.panByScreenDelta(dx, dy);
          return;
        }

        if (session.mode === 'marquee-select') {
          updateSelectionMarquee(session.originX, session.originY, point.x, point.y);
          const tasks = host.pickTasksInScreenRect(
            session.originX,
            session.originY,
            point.x,
            point.y,
          );
          session.selectionTaskIds = tasks.map((task) => task.id);
          host.previewSelectionByTaskIds(session.selectionTaskIds);
          return;
        }

        if (session.mode === 'edit-selection') {
          if (!session.groupTasks || session.groupTasks.length === 0 || host.isTaskEditPending()) {
            return;
          }

          const pointer = buildTaskEditPointer(host.getCamera(), point.x, point.y);
          const draft = resolveTaskMoveDrafts({
            tasks: session.groupTasks,
            primaryTaskId: session.primaryTaskId,
            pointer,
            startPointer: session.startPointer,
            rowPitch: host.getRenderOptions().rowPitch,
            rowCount: host.getScene().rowLabels.length,
            editConfig: host.getEditConfig(),
            disableSnap: event.shiftKey,
          });
          const previousDraftsById = new Map(
            (session.lastPreviewEvents ?? []).map((previewEvent) => [previewEvent.taskId, previewEvent.proposedTask]),
          );
          const previewEvents = draft.draftTasks.map((draftTask) => {
            const originalTask = session.groupTasks?.find((candidate) => candidate.id === draftTask.id) ?? draftTask;
            return createTaskEditEvent({
              operation: 'move',
              originalTask,
              proposedTask: draftTask,
              previousDraftTask: previousDraftsById.get(draftTask.id) ?? null,
              pointer,
              snap: draft.snap,
            });
          });
          const nextPreviewEvents = host.previewTaskEdits(previewEvents);
          if (nextPreviewEvents) {
            session.lastPreviewEvents = nextPreviewEvents;
          }
          return;
        }

        if (!session.task || host.isTaskEditPending()) {
          return;
        }

        const pointer = buildTaskEditPointer(host.getCamera(), point.x, point.y);
        const draft = resolveTaskEditDraft({
          task: session.task,
          operation: session.operation ?? 'move',
          pointer,
          startPointer: session.startPointer,
          rowPitch: host.getRenderOptions().rowPitch,
          rowCount: host.getScene().rowLabels.length,
          editConfig: host.getEditConfig(),
          disableSnap: event.shiftKey,
        });
        const previewEvent = createTaskEditEvent({
          operation: session.operation ?? 'move',
          originalTask: session.task,
          proposedTask: draft.draftTask,
          previousDraftTask: host.getInteractionState().activeEdit?.draftTask ?? session.lastPreviewEvent?.proposedTask ?? null,
          pointer,
          snap: draft.snap,
        });
        const nextPreview = host.previewTaskEdit(previewEvent);
        if (nextPreview) {
          session.lastPreviewEvent = nextPreview;
        }
      });

      canvas.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
          return;
        }

        host.stopCameraAnimation();
        const point = localPoint(event);
        const pointer = buildTaskEditPointer(host.getCamera(), point.x, point.y);
        const interactionState = host.getInteractionState();
        const inSelectMode = interactionState.mode === 'select';
        const inEditMode = host.getEditConfig().enabled && interactionState.mode === 'edit';
        const pendingCommit = host.isTaskEditPending();
        const selection = host.getSelection();
        const pickedTask = host.pickTaskAtScreen(point.x, point.y);
        const selectedTaskIds = selection.selectedTasks.map((task) => task.id);
        const pickedTaskIsSelected = pickedTask ? selectedTaskIds.includes(pickedTask.id) : false;
        const selectionMoveEligible =
          !pendingCommit &&
          pickedTaskIsSelected &&
          selectedTaskIds.length > 0;
        const groupMoveEligible =
          inEditMode &&
          !pendingCommit &&
          selectedTaskIds.length > 1 &&
          pickedTaskIsSelected;
        const hitTarget = inEditMode && !pendingCommit
          ? resolveTaskEditHitTarget({
              task: pickedTask,
              selectedTaskId: selection.selectedTask?.id ?? null,
              camera: host.getCamera(),
              rowPitch: host.getRenderOptions().rowPitch,
              barHeight: host.getRenderOptions().barHeight,
              handleWidthPx: host.getEditConfig().resize.handleWidthPx,
              resizeEnabled: groupMoveEligible ? false : host.getEditConfig().resize.enabled,
              screenX: point.x,
              screenY: point.y,
            })
          : null;

        if (selectionMoveEligible && pickedTask && selection.selectedTask?.id !== pickedTask.id) {
          host.setSelectionByTaskIds(selectedTaskIds, pickedTask.id);
        } else if (pickedTask && !inSelectMode) {
          host.setSelectionByTaskId(pickedTask.id);
        }

        pointerSession = {
          pointerId: event.pointerId,
          originX: point.x,
          originY: point.y,
          lastX: point.x,
          lastY: point.y,
          dragStarted: false,
          mode: spacePressed
            ? 'pan'
            : inSelectMode && selectionMoveEligible
              ? 'edit-selection'
            : inSelectMode
              ? 'marquee-select'
            : groupMoveEligible && hitTarget?.operation === 'move'
              ? 'edit-selection'
            : hitTarget
              ? 'edit-or-select'
              : pickedTask
                ? 'pan-or-select'
                : 'pan',
          task: hitTarget?.task ?? pickedTask ?? null,
          groupTasks: (selectionMoveEligible || groupMoveEligible)
            ? selection.selectedTasks.map((task) => ({
                ...task,
                dependencies: task.dependencies?.slice(),
              }))
            : null,
          primaryTaskId: (selectionMoveEligible || groupMoveEligible)
            ? pickedTask?.id ?? selection.selectedTask?.id ?? null
            : pickedTask?.id ?? null,
          operation: hitTarget?.operation ?? null,
          startPointer: pointer,
          lastPreviewEvent: null,
          lastPreviewEvents: null,
          selectionTaskIds: selectionMoveEligible ? selectedTaskIds.slice() : [],
        };

        canvas.setPointerCapture(event.pointerId);
      });

      const finishPointerSession = async (
        event: PointerEvent,
        cancelled: boolean,
      ) => {
        if (!pointerSession || event.pointerId !== pointerSession.pointerId) {
          return;
        }

        const session = pointerSession;
        const point = localPoint(event);

        try {
          if (cancelled) {
            host.cancelActiveEdit();
            return;
          }

          if (!session.dragStarted) {
            if (session.mode === 'edit-selection') {
              host.setSelectionByTaskIds(session.selectionTaskIds, session.primaryTaskId);
            } else if (session.mode === 'marquee-select') {
              host.setSelectionByScreenPoint(point.x, point.y);
            } else if (session.task) {
              host.setSelectionByTaskId(session.task.id);
            } else {
              host.setSelectionByScreenPoint(point.x, point.y);
            }
            return;
          }

          if (session.mode === 'marquee-select') {
            host.setSelectionByTaskIds(session.selectionTaskIds);
            return;
          }

          if (session.mode === 'edit-selection' && session.lastPreviewEvents) {
            await host.commitTaskEdits(session.lastPreviewEvents);
            return;
          }

          if (session.mode === 'edit-or-select' && session.lastPreviewEvent) {
            await host.commitActiveEdit(session.lastPreviewEvent);
          }
        } finally {
          if (canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
          }
          resetPointerSession();
          host.updateHoverFromScreen(point.x, point.y);
        }
      };

      canvas.addEventListener('pointerup', (event) => {
        void finishPointerSession(event, false);
      });

      canvas.addEventListener('pointercancel', (event) => {
        void finishPointerSession(event, true);
      });

      canvas.addEventListener('dblclick', (event) => {
        if (host.getInteractionState().mode !== 'view') {
          return;
        }

        const point = localPoint(event);
        const task = host.pickTaskAtScreen(point.x, point.y);
        if (!task) {
          return;
        }

        host.setSelectionByTaskId(task.id);
        host.animateCameraToTask(task);
      });

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          if (host.getInteractionState().activeEdit?.status === 'preview') {
            host.cancelActiveEdit();
          } else {
            host.setSelectionByTaskId(null);
          }
          return;
        }

        if (event.key === ' ' || event.code === 'Space') {
          spacePressed = true;
          event.preventDefault();
          return;
        }

        if ((event.key === 'e' || event.key === 'E') && !event.altKey && !event.ctrlKey && !event.metaKey) {
          host.setInteractionMode(host.getInteractionState().mode === 'edit' ? 'view' : 'edit');
          return;
        }

        if ((event.key === 's' || event.key === 'S') && !event.altKey && !event.ctrlKey && !event.metaKey) {
          host.setInteractionMode('select');
          return;
        }

        if ((event.key === 'v' || event.key === 'V') && !event.altKey && !event.ctrlKey && !event.metaKey) {
          host.setInteractionMode('view');
        }
      };

      const onKeyUp = (event: KeyboardEvent) => {
        if (event.key === ' ' || event.code === 'Space') {
          spacePressed = false;
          event.preventDefault();
        }
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      host.registerCleanup(() => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      });
    },
  };
}

export function createHudInspectorModule(): GanttModule {
  return {
    id: 'hud-inspector',
    onAfterFrame(context, frame) {
      updateHud(context, frame);
      updateInspector(context);
    },
  };
}

export function createToolbarModule(): GanttModule {
  return {
    id: 'toolbar',
    onInit: ({ host }) => {
      if (!host.toolbar) {
        return;
      }

      host.toolbar.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        const modeButton = target.closest<HTMLButtonElement>('[data-interaction-mode]');
        if (modeButton) {
          const mode = modeButton.dataset.interactionMode;
          if (mode === 'view' || mode === 'select' || mode === 'edit') {
            host.setInteractionMode(mode);
          }
          return;
        }

        const zoomButton = target.closest<HTMLButtonElement>('[data-zoom-preset]');
        if (!zoomButton) {
          return;
        }

        const presetId = zoomButton.dataset.zoomPreset;
        if (!presetId) {
          return;
        }

        host.animateToZoomPresetId(presetId);
      });
    },

    onAfterFrame(context) {
      updateZoomToolbar(context);
    },
  };
}

export function createBuiltinModule(id: 'camera-controls' | 'selection' | 'hud-inspector' | 'toolbar'): GanttModule {
  switch (id) {
    case 'camera-controls':
      return createCameraControlsModule();
    case 'selection':
      return createSelectionModule();
    case 'hud-inspector':
      return createHudInspectorModule();
    case 'toolbar':
      return createToolbarModule();
    default:
      return createHudInspectorModule();
  }
}
