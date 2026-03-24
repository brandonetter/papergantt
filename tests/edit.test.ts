import {
  buildTaskIndex,
  createCamera,
  normalizeConfig,
  resolveTaskEditDraft,
  resolveTaskEditHitTarget,
  resolveTaskMoveDrafts,
} from '@gantt/gantt-core';

describe('edit helpers', () => {
  it('moves tasks across time and rows while preserving duration', () => {
    const editConfig = normalizeConfig({
      edit: {
        enabled: true,
        snap: { mode: 'day' },
      },
    }).edit;
    const task = { id: 'a', rowIndex: 1, start: 10, end: 18, label: 'Task A' };

    const result = resolveTaskEditDraft({
      task,
      operation: 'move',
      startPointer: { screenX: 100, screenY: 30, worldX: 12.25, worldY: 31 },
      pointer: { screenX: 240, screenY: 94, worldX: 19.6, worldY: 95 },
      rowPitch: 28,
      rowCount: 6,
      editConfig,
    });

    expect(result.draftTask.start).toBe(17);
    expect(result.draftTask.end).toBe(25);
    expect(result.draftTask.rowIndex).toBe(3);
    expect(result.snap.mode).toBe('day');
  });

  it('clamps resize edits to the configured minimum duration', () => {
    const editConfig = normalizeConfig({
      edit: {
        enabled: true,
        resize: {
          minDurationDays: 4,
        },
      },
    }).edit;
    const task = { id: 'a', rowIndex: 0, start: 10, end: 22, label: 'Task A' };
    const startPointer = { screenX: 0, screenY: 0, worldX: 10, worldY: 0 };

    const shrinkStart = resolveTaskEditDraft({
      task,
      operation: 'resize-start',
      startPointer,
      pointer: { screenX: 0, screenY: 0, worldX: 20, worldY: 0 },
      rowPitch: 28,
      rowCount: 2,
      editConfig,
    });
    const shrinkEnd = resolveTaskEditDraft({
      task,
      operation: 'resize-end',
      startPointer,
      pointer: { screenX: 0, screenY: 0, worldX: 11, worldY: 0 },
      rowPitch: 28,
      rowCount: 2,
      editConfig,
    });

    expect(shrinkStart.draftTask.start).toBe(18);
    expect(shrinkStart.draftTask.end).toBe(22);
    expect(shrinkEnd.draftTask.start).toBe(10);
    expect(shrinkEnd.draftTask.end).toBe(14);
  });

  it('supports off and increment snap modes', () => {
    const offConfig = normalizeConfig({
      edit: {
        enabled: true,
        snap: { mode: 'off' },
      },
    }).edit;
    const incrementConfig = normalizeConfig({
      edit: {
        enabled: true,
        snap: { mode: 'increment', incrementDays: 7 },
      },
    }).edit;
    const task = { id: 'a', rowIndex: 0, start: 3, end: 8, label: 'Task A' };
    const startPointer = { screenX: 0, screenY: 0, worldX: 3, worldY: 0 };
    const pointer = { screenX: 0, screenY: 0, worldX: 11.4, worldY: 0 };

    const offDraft = resolveTaskEditDraft({
      task,
      operation: 'move',
      startPointer,
      pointer,
      rowPitch: 28,
      rowCount: 2,
      editConfig: offConfig,
    });
    const incrementDraft = resolveTaskEditDraft({
      task,
      operation: 'move',
      startPointer,
      pointer,
      rowPitch: 28,
      rowCount: 2,
      editConfig: incrementConfig,
    });

    expect(offDraft.draftTask.start).toBeCloseTo(11.4);
    expect(offDraft.draftTask.end).toBeCloseTo(16.4);
    expect(incrementDraft.draftTask.start).toBe(14);
    expect(incrementDraft.draftTask.end).toBe(19);
  });

  it('moves a selection as a group using the primary task snap delta', () => {
    const editConfig = normalizeConfig({
      edit: {
        enabled: true,
        snap: { mode: 'day' },
      },
    }).edit;
    const tasks = [
      { id: 'a', rowIndex: 1, start: 10.2, end: 18.2, label: 'Task A' },
      { id: 'b', rowIndex: 3, start: 20.2, end: 24.2, label: 'Task B' },
    ];

    const result = resolveTaskMoveDrafts({
      tasks,
      primaryTaskId: 'a',
      startPointer: { screenX: 100, screenY: 30, worldX: 10.2, worldY: 31 },
      pointer: { screenX: 220, screenY: 86, worldX: 17.6, worldY: 87 },
      rowPitch: 28,
      rowCount: 6,
      editConfig,
    });

    expect(result.draftTasks.map((task) => task.id)).toEqual(['a', 'b']);
    expect(result.draftTasks[0]?.start).toBe(18);
    expect(result.draftTasks[0]?.end).toBe(26);
    expect(result.draftTasks[0]?.rowIndex).toBe(3);
    expect(result.draftTasks[1]?.start).toBe(28);
    expect(result.draftTasks[1]?.end).toBe(32);
    expect(result.draftTasks[1]?.rowIndex).toBe(5);
  });

  it('indexes empty labeled rows as valid drop targets', () => {
    const scene = {
      rowLabels: ['Row 1', 'Row 2', 'Row 3', 'Row 4'],
      timelineStart: 0,
      timelineEnd: 20,
      tasks: [{ id: 'a', rowIndex: 1, start: 3, end: 8, label: 'Task A' }],
    };

    const index = buildTaskIndex(scene.tasks, scene.rowLabels.length);

    expect(index.rowCount).toBe(4);
    expect(index.rows[0]).toEqual([]);
    expect(index.rows[3]).toEqual([]);
  });

  it('uses resize handles only for selected non-milestone tasks', () => {
    const camera = { ...createCamera(800, 240), zoomX: 20, zoomY: 1, scrollX: 0, scrollY: 0 };
    const task = { id: 'a', rowIndex: 0, start: 5, end: 15, label: 'Task A' };
    const milestone = { ...task, id: 'm', milestone: true };

    const leftHandleHit = resolveTaskEditHitTarget({
      task,
      selectedTaskId: task.id,
      camera,
      rowPitch: 28,
      barHeight: 14,
      handleWidthPx: 12,
      resizeEnabled: true,
      screenX: 102,
      screenY: 14,
    });
    const milestoneHit = resolveTaskEditHitTarget({
      task: milestone,
      selectedTaskId: milestone.id,
      camera,
      rowPitch: 28,
      barHeight: 14,
      handleWidthPx: 12,
      resizeEnabled: true,
      screenX: 102,
      screenY: 14,
    });

    expect(leftHandleHit?.operation).toBe('resize-start');
    expect(milestoneHit?.operation).toBe('move');
  });
});
