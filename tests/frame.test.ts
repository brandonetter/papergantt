import { buildFrame, buildTaskIndex, createCamera } from '@gantt/gantt-core';
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
