import { DEFAULT_DISPLAY_OPTIONS, buildFrame, buildTaskIndex, createCamera, pickTaskAtPoint, pickTasksInScreenRect } from '@gantt/gantt-core';
import { TextLayoutEngine } from '@gantt/gantt-core';
import { makeTestAtlas } from './helpers';

describe('frame assembly', () => {
  it('builds visible batches from a representative scene', () => {
    const atlas = makeTestAtlas();
    const layout = new TextLayoutEngine(atlas);
    const scene = {
      rowLabels: ['Row 1', 'Row 2'],
      timelineStart: 0,
      timelineEnd: 200,
      tasks: [
        { id: 'a', rowIndex: 0, start: 10, end: 90, label: 'Alpha task label', dependencies: ['c'] },
        { id: 'b', rowIndex: 0, start: 100, end: 120, label: 'Beta milestone', milestone: true },
        { id: 'c', rowIndex: 1, start: 20, end: 80, label: 'Gamma task' },
      ],
    };
    const index = buildTaskIndex(scene.tasks);
    const camera = {
      ...createCamera(800, 240),
      zoomX: 2,
      zoomY: 1,
      scrollX: 0,
      scrollY: 0,
    };

    const frame = buildFrame(scene, index, camera, atlas, layout, {
      selectedTaskId: 'a',
      hoveredTaskId: 'c',
    }, {
      rowPitch: 30,
      barHeight: 16,
      milestoneSize: 12,
      rowPadding: 7,
      labelPadding: 8,
      gridPadding: 0,
      overscanRows: 1,
      overscanPx: 80,
      renderSelectedDependencies: true,
    });

    expect(frame.stats.visibleRows).toBe(2);
    expect(frame.stats.visibleTasks).toBe(3);
    expect(frame.stats.visibleDependencies).toBe(1);
    expect(frame.stats.glyphCount).toBeGreaterThan(0);
    expect(frame.backgroundSolids.count).toBeGreaterThan(0);
    expect(frame.foregroundSolids.count).toBeGreaterThanOrEqual(3);
    expect(frame.backgroundLines.count).toBeGreaterThan(0);
    expect(frame.dependencyLines.count).toBeGreaterThan(0);
  });

  it('keeps down-right dependency routing topology stable across zoom levels', () => {
    const atlas = makeTestAtlas();
    const layout = new TextLayoutEngine(atlas);
    const scene = {
      rowLabels: ['Row 1', 'Row 2'],
      timelineStart: 0,
      timelineEnd: 100,
      tasks: [
        { id: 'source', rowIndex: 0, start: 10, end: 30, label: 'Source' },
        { id: 'target', rowIndex: 1, start: 40, end: 52, label: 'Target', dependencies: ['source'] },
      ],
    };
    const index = buildTaskIndex(scene.tasks);
    const renderState = {
      selectedTaskId: null,
      hoveredTaskId: null,
      selectedDependencyId: null,
      hoveredDependencyId: null,
    };

    const zoomedOutFrame = buildFrame(
      scene,
      index,
      { ...createCamera(800, 300), zoomX: 0.2, zoomY: 1, scrollX: 0, scrollY: 0 },
      atlas,
      layout,
      renderState,
      {
        rowPitch: 30,
        barHeight: 16,
        milestoneSize: 12,
        rowPadding: 7,
        labelPadding: 8,
        gridPadding: 0,
        overscanRows: 1,
        overscanPx: 80,
        renderSelectedDependencies: true,
      },
    );

    const zoomedInFrame = buildFrame(
      scene,
      index,
      { ...createCamera(800, 300), zoomX: 2, zoomY: 1, scrollX: 0, scrollY: 0 },
      atlas,
      layout,
      renderState,
      {
        rowPitch: 30,
        barHeight: 16,
        milestoneSize: 12,
        rowPadding: 7,
        labelPadding: 8,
        gridPadding: 0,
        overscanRows: 1,
        overscanPx: 80,
        renderSelectedDependencies: true,
      },
    );

    const zoomedOutPath = zoomedOutFrame.dependencyPaths[0];
    const zoomedInPath = zoomedInFrame.dependencyPaths[0];

    expect(zoomedOutPath).toBeDefined();
    expect(zoomedInPath).toBeDefined();
    expect(zoomedOutPath.segments.length).toBe(zoomedInPath.segments.length);
  });

  it('renders edit outlines, handles, and ghost overlays in edit mode', () => {
    const atlas = makeTestAtlas();
    const layout = new TextLayoutEngine(atlas);
    const scene = {
      rowLabels: ['Row 1', 'Row 2'],
      timelineStart: 0,
      timelineEnd: 100,
      tasks: [
        { id: 'a', rowIndex: 0, start: 10, end: 30, label: 'Editable task' },
        { id: 'b', rowIndex: 1, start: 36, end: 48, label: 'Other task' },
      ],
    };
    const index = buildTaskIndex(scene.tasks, scene.rowLabels.length);
    const camera = { ...createCamera(800, 280), zoomX: 6, zoomY: 1, scrollX: 0, scrollY: 0 };

    const viewFrame = buildFrame(
      scene,
      index,
      camera,
      atlas,
      layout,
      {
        selectedTaskId: 'a',
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
      },
      {
        rowPitch: 30,
        barHeight: 16,
      },
    );

    const editFrame = buildFrame(
      scene,
      index,
      camera,
      atlas,
      layout,
      {
        selectedTaskId: 'a',
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
        interactionMode: 'edit',
        activeEdit: {
          taskId: 'a',
          operation: 'move',
          originalTask: scene.tasks[0],
          draftTask: { ...scene.tasks[0], rowIndex: 1, start: 14, end: 34 },
          status: 'preview',
        },
        editAffordances: {
          enabled: true,
          handleWidthPx: 12,
          resizeEnabled: true,
        },
      },
      {
        rowPitch: 30,
        barHeight: 16,
      },
    );

    expect(editFrame.foregroundSolids.count).toBeGreaterThan(viewFrame.foregroundSolids.count);
  });

  it('renders group move ghosts for multi-selected edit previews', () => {
    const atlas = makeTestAtlas();
    const layout = new TextLayoutEngine(atlas);
    const scene = {
      rowLabels: ['Row 1', 'Row 2', 'Row 3'],
      timelineStart: 0,
      timelineEnd: 100,
      tasks: [
        { id: 'a', rowIndex: 0, start: 10, end: 30, label: 'Task A' },
        { id: 'b', rowIndex: 1, start: 36, end: 48, label: 'Task B' },
        { id: 'c', rowIndex: 2, start: 52, end: 60, label: 'Task C' },
      ],
    };
    const index = buildTaskIndex(scene.tasks, scene.rowLabels.length);
    const camera = { ...createCamera(800, 280), zoomX: 6, zoomY: 1, scrollX: 0, scrollY: 0 };

    const viewFrame = buildFrame(
      scene,
      index,
      camera,
      atlas,
      layout,
      {
        selectedTaskId: 'a',
        selectedTaskIds: ['a', 'b'],
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
      },
      {
        rowPitch: 30,
        barHeight: 16,
      },
    );

    const editFrame = buildFrame(
      scene,
      index,
      camera,
      atlas,
      layout,
      {
        selectedTaskId: 'a',
        selectedTaskIds: ['a', 'b'],
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
        interactionMode: 'edit',
        activeEdit: {
          taskId: 'a',
          operation: 'move',
          originalTask: scene.tasks[0],
          draftTask: { ...scene.tasks[0], rowIndex: 1, start: 14, end: 34 },
          originalTasks: [scene.tasks[0], scene.tasks[1]],
          draftTasks: [
            { ...scene.tasks[0], rowIndex: 1, start: 14, end: 34 },
            { ...scene.tasks[1], rowIndex: 2, start: 40, end: 52 },
          ],
          status: 'preview',
        },
        editAffordances: {
          enabled: true,
          handleWidthPx: 12,
          resizeEnabled: true,
        },
      },
      {
        rowPitch: 30,
        barHeight: 16,
      },
    );

    expect(editFrame.foregroundSolids.count).toBeGreaterThan(viewFrame.foregroundSolids.count);
  });

  it('renders selection outlines in select mode without edit previews', () => {
    const atlas = makeTestAtlas();
    const layout = new TextLayoutEngine(atlas);
    const scene = {
      rowLabels: ['Row 1', 'Row 2'],
      timelineStart: 0,
      timelineEnd: 100,
      tasks: [
        { id: 'a', rowIndex: 0, start: 10, end: 30, label: 'Task A' },
        { id: 'b', rowIndex: 1, start: 36, end: 48, label: 'Task B' },
      ],
    };
    const index = buildTaskIndex(scene.tasks, scene.rowLabels.length);
    const camera = { ...createCamera(800, 280), zoomX: 6, zoomY: 1, scrollX: 0, scrollY: 0 };

    const viewFrame = buildFrame(
      scene,
      index,
      camera,
      atlas,
      layout,
      {
        selectedTaskId: 'a',
        selectedTaskIds: ['a', 'b'],
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
      },
      {
        rowPitch: 30,
        barHeight: 16,
      },
    );

    const editFrame = buildFrame(
      scene,
      index,
      camera,
      atlas,
      layout,
      {
        selectedTaskId: 'a',
        selectedTaskIds: ['a'],
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
        interactionMode: 'edit',
        activeEdit: {
          taskId: 'a',
          operation: 'move',
          originalTask: scene.tasks[0],
          draftTask: { ...scene.tasks[0], rowIndex: 1, start: 14, end: 34 },
          status: 'preview',
        },
        editAffordances: {
          enabled: true,
          handleWidthPx: 12,
          resizeEnabled: true,
        },
      },
      {
        rowPitch: 30,
        barHeight: 16,
      },
    );

    const selectFrame = buildFrame(
      scene,
      index,
      camera,
      atlas,
      layout,
      {
        selectedTaskId: 'a',
        selectedTaskIds: ['a'],
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
        interactionMode: 'select',
        editAffordances: {
          enabled: true,
          handleWidthPx: 12,
          resizeEnabled: true,
        },
      },
      {
        rowPitch: 30,
        barHeight: 16,
      },
    );

    expect(selectFrame.foregroundSolids.count).toBeGreaterThan(viewFrame.foregroundSolids.count);
    expect(selectFrame.foregroundSolids.count).toBeLessThan(editFrame.foregroundSolids.count);
  });

  it('emits both connectors for a task with double dependencies', () => {
    const atlas = makeTestAtlas();
    const layout = new TextLayoutEngine(atlas);
    const scene = {
      rowLabels: ['Row 1', 'Row 2', 'Row 3'],
      timelineStart: 0,
      timelineEnd: 180,
      tasks: [
        { id: 'a', rowIndex: 0, start: 10, end: 50, label: 'A' },
        { id: 'b', rowIndex: 1, start: 20, end: 70, label: 'B' },
        { id: 'c', rowIndex: 2, start: 90, end: 130, label: 'C', dependencies: ['a', 'b'] },
      ],
    };
    const index = buildTaskIndex(scene.tasks);
    const frame = buildFrame(
      scene,
      index,
      { ...createCamera(900, 320), zoomX: 2, zoomY: 1, scrollX: 0, scrollY: 0 },
      atlas,
      layout,
      {
        selectedTaskId: null,
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
      },
      {
        rowPitch: 30,
        barHeight: 16,
        milestoneSize: 12,
        headerHeight: 42,
        rowPadding: 7,
        labelPadding: 8,
        gridPadding: 0,
        overscanRows: 1,
        overscanPx: 80,
        renderSelectedDependencies: true,
      },
    );

    expect(frame.stats.visibleDependencies).toBe(2);
    expect(frame.dependencyPaths.map((path) => path.id).sort()).toEqual(['a->c', 'b->c']);
  });

  it('renders one-day tasks at their true width and keeps picking aligned', () => {
    const atlas = makeTestAtlas();
    const layout = new TextLayoutEngine(atlas);
    const scene = {
      rowLabels: ['Row 1', 'Row 2'],
      timelineStart: 0,
      timelineEnd: 20,
      tasks: [
        { id: 'a', rowIndex: 0, start: 3, end: 4, label: 'A' },
        { id: 'b', rowIndex: 1, start: 6, end: 8, label: 'B', dependencies: ['a'] },
      ],
    };
    const index = buildTaskIndex(scene.tasks);
    const camera = {
      ...createCamera(800, 240),
      zoomX: 100,
      zoomY: 1,
      scrollX: 0,
      scrollY: 0,
    };

    const frame = buildFrame(
      scene,
      index,
      camera,
      atlas,
      layout,
      {
        selectedTaskId: null,
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
      },
      {
        rowPitch: 30,
        barHeight: 16,
        milestoneSize: 12,
        rowPadding: 7,
        labelPadding: 8,
        gridPadding: 0,
        overscanRows: 1,
        overscanPx: 80,
        renderSelectedDependencies: true,
      },
    );

    expect(frame.dependencyPaths[0]?.segments[0]?.x1).toBeCloseTo(3.5);

    const pickedNearRightEdge = pickTaskAtPoint(scene, index, camera, 399, 15, {
      rowPitch: 30,
      barHeight: 16,
    });

    expect(pickedNearRightEdge?.id).toBe('a');
  });

  it('finds every task intersecting a marquee selection rectangle', () => {
    const scene = {
      rowLabels: ['Row 1', 'Row 2', 'Row 3'],
      timelineStart: 0,
      timelineEnd: 50,
      tasks: [
        { id: 'a', rowIndex: 0, start: 10, end: 20, label: 'A' },
        { id: 'b', rowIndex: 1, start: 15, end: 28, label: 'B' },
        { id: 'c', rowIndex: 2, start: 35, end: 40, label: 'C' },
      ],
    };
    const index = buildTaskIndex(scene.tasks, scene.rowLabels.length);
    const camera = {
      ...createCamera(800, 240),
      zoomX: 10,
      zoomY: 1,
      scrollX: 0,
      scrollY: 0,
    };

    const tasks = pickTasksInScreenRect(scene, index, camera, 90, 0, 300, 60, {
      rowPitch: 30,
      barHeight: 16,
    });

    expect(tasks.map((task) => task.id)).toEqual(['a', 'b']);
  });

  it('applies display styling overrides to grid, task text, and dependencies', () => {
    const atlas = makeTestAtlas();
    const layout = new TextLayoutEngine(atlas);
    const scene = {
      rowLabels: ['Row 1', 'Row 2'],
      timelineStart: 0,
      timelineEnd: 100,
      tasks: [
        { id: 'a', rowIndex: 0, start: 10, end: 60, label: 'Task A' },
        { id: 'b', rowIndex: 1, start: 70, end: 90, label: 'Task B', dependencies: ['a'] },
      ],
    };
    const index = buildTaskIndex(scene.tasks);
    const display = {
      ...DEFAULT_DISPLAY_OPTIONS,
      grid: {
        ...DEFAULT_DISPLAY_OPTIONS.grid,
        color: [0.2, 0.3, 0.4, 0.5] as [number, number, number, number],
        thickness: 2,
      },
      tasks: {
        ...DEFAULT_DISPLAY_OPTIONS.tasks,
        textColor: [0.15, 0.2, 0.25, 0.9] as [number, number, number, number],
        textShadowColor: [0.95, 0.95, 0.95, 0.4] as [number, number, number, number],
        barRadiusPx: 6,
      },
      header: {
        ...DEFAULT_DISPLAY_OPTIONS.header,
        textSizePx: 18,
      },
      dependencies: {
        ...DEFAULT_DISPLAY_OPTIONS.dependencies,
        color: [0.6, 0.2, 0.1, 1] as [number, number, number, number],
        thickness: 3,
        showArrowheads: false,
      },
    };
    const frame = buildFrame(
      scene,
      index,
      { ...createCamera(800, 280), zoomX: 2, zoomY: 1, scrollX: 0, scrollY: 0 },
      atlas,
      layout,
      {
        selectedTaskId: null,
        hoveredTaskId: null,
        selectedDependencyId: null,
        hoveredDependencyId: null,
      },
      {
        rowPitch: 30,
        barHeight: 16,
        milestoneSize: 12,
        headerHeight: 40,
      },
      {},
      display,
    );

    const glyphStride = 12;
    const labelGlyphOffset = 'Task A'.length * glyphStride;

    expect(frame.backgroundLines.view()[8]).toBeCloseTo(2);
    expect(frame.glyphs.view()[labelGlyphOffset + 8]).toBeCloseTo(0.15);
    expect(frame.glyphs.view()[labelGlyphOffset + 9]).toBeCloseTo(0.2);
    expect(frame.glyphs.view()[labelGlyphOffset + 10]).toBeCloseTo(0.25);
    expect(frame.dependencyLines.view()[8]).toBeCloseTo(3);
    expect(frame.dependencyPaths[0]?.segments.length).toBeLessThan(8);
  });

  it('fades task label glyph alpha under the header and keeps fully above labels dimmed', () => {
    const atlas = makeTestAtlas();
    const layout = new TextLayoutEngine(atlas);
    const scene = {
      rowLabels: ['Row 1'],
      timelineStart: 0,
      timelineEnd: 100,
      tasks: [{ id: 'a', rowIndex: 0, start: 10, end: 60, label: 'Task' }],
    };
    const index = buildTaskIndex(scene.tasks);
    const camera = { ...createCamera(800, 240), zoomX: 2, zoomY: 1, scrollX: 0, scrollY: 0 };
    const renderState = {
      selectedTaskId: null,
      hoveredTaskId: null,
      selectedDependencyId: null,
      hoveredDependencyId: null,
    };

    const occludedFrame = buildFrame(scene, index, camera, atlas, layout, renderState, {
      headerHeight: 20,
    });
    const aboveTimelineFrame = buildFrame(
      scene,
      index,
      { ...camera, scrollY: 48 },
      atlas,
      layout,
      renderState,
      {
        headerHeight: 20,
      },
    );
    const clearFrame = buildFrame(scene, index, camera, atlas, layout, renderState, {
      headerHeight: 0,
    });

    const glyphStride = 12;
    const textGlyphOffset = 'Task'.length * glyphStride;
    const occludedAlpha = occludedFrame.glyphs.view()[textGlyphOffset + 11];
    const aboveTimelineAlpha = aboveTimelineFrame.glyphs.view()[textGlyphOffset + 11];
    const clearAlpha = clearFrame.glyphs.view()[textGlyphOffset + 11];

    expect(occludedAlpha).toBeLessThan(clearAlpha);
    expect(aboveTimelineAlpha).toBeLessThan(clearAlpha);
    expect(aboveTimelineAlpha).toBeLessThan(occludedAlpha);
    expect(clearAlpha).toBeCloseTo(0.96);
  });
});
