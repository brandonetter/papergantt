import {
  buildFrame,
  buildTaskIndex,
  GlyphInstanceWriter,
  LineInstanceWriter,
  worldToScreen,
  SolidInstanceWriter,
  type GanttScene,
  type GanttTask,
  type RenderState,
  type TaskIndex,
} from '../core';
import { replaceTasksInScene } from '../edit';
import type { FontAtlas } from '../font';
import type {
  GanttCanvasDrawApi,
  GanttCanvasHitRegion,
  GanttCanvasLineCommand,
  GanttCanvasRectCommand,
  GanttCanvasTextBaseline,
  GanttCanvasTextCommand,
} from '../types';
import type { CanvasLayerFrameState, HostInternals } from './types';

export function buildDependentsMap(tasks: GanttTask[]): Map<string, GanttTask[]> {
  const dependentsById = new Map<string, GanttTask[]>();
  for (const task of tasks) {
    for (const dependencyId of task.dependencies ?? []) {
      const sourceTaskId = typeof dependencyId === 'string' ? dependencyId : dependencyId.taskId;
      const dependents = dependentsById.get(sourceTaskId);
      if (dependents) {
        dependents.push(task);
      } else {
        dependentsById.set(sourceTaskId, [task]);
      }
    }
  }
  return dependentsById;
}

export function invalidateRenderCaches(host: HostInternals): void {
  host.previewScene = null;
  host.transformedScene = null;
  host.transformedIndex = null;
}

export function getPreviewScene(host: HostInternals): GanttScene {
  if (!host.activeEdit) {
    return host.scene;
  }

  if (!host.previewScene) {
    const draftTasks = host.activeEditBatch?.draftTasks ?? [host.activeEdit.draftTask];
    host.previewScene = replaceTasksInScene(host.scene, draftTasks);
  }

  return host.previewScene;
}

export function getRenderScene(host: HostInternals): GanttScene {
  const previewScene = getPreviewScene(host);
  if (host.sceneTransforms.length === 0) {
    return previewScene;
  }

  if (!host.transformedScene) {
    let current = previewScene;
    for (const transform of host.sceneTransforms) {
      const next = transform(current);
      if (next) {
        current = next;
      }
    }
    host.transformedScene = current;
  }

  return host.transformedScene;
}

export function getRenderIndex(host: HostInternals): TaskIndex {
  if (!host.activeEdit && host.sceneTransforms.length === 0) {
    return host.index;
  }

  if (!host.transformedIndex) {
    const scene = getRenderScene(host);
    host.transformedIndex = buildTaskIndex(scene.tasks, scene.rowLabels.length);
  }

  return host.transformedIndex;
}

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

function projectCanvasRectToWorld(
  host: HostInternals,
  command: Pick<GanttCanvasRectCommand, 'space' | 'x' | 'y' | 'width' | 'height'>,
): { x: number; y: number; width: number; height: number } {
  const rect = normalizeCanvasRect(command.x, command.y, command.width, command.height);
  if (command.space === 'world') {
    return rect;
  }

  return {
    x: host.camera.scrollX + rect.x / host.camera.zoomX,
    y: host.camera.scrollY + rect.y / host.camera.zoomY,
    width: rect.width / host.camera.zoomX,
    height: rect.height / host.camera.zoomY,
  };
}

function projectCanvasPointToWorld(
  host: HostInternals,
  space: 'world' | 'screen',
  x: number,
  y: number,
): [number, number] {
  return space === 'world'
    ? [x, y]
    : [
        host.camera.scrollX + x / host.camera.zoomX,
        host.camera.scrollY + y / host.camera.zoomY,
      ];
}

function resolveCanvasTextBaselineY(
  atlas: FontAtlas,
  fontPx: number,
  y: number,
  baseline: GanttCanvasTextBaseline | undefined,
): number {
  const scale = fontPx / atlas.lineHeight;
  const textHeight = (atlas.ascender + atlas.descender) * scale;

  switch (baseline ?? 'alphabetic') {
    case 'top':
      return y + atlas.ascender * scale;
    case 'middle':
      return y - textHeight * 0.5 + atlas.ascender * scale;
    case 'bottom':
      return y - atlas.descender * scale;
    default:
      return y;
  }
}

function resolveTaskStyle(host: HostInternals, task: GanttTask, selected: boolean, hovered: boolean) {
  for (let index = host.taskStyleResolvers.length - 1; index >= 0; index -= 1) {
    const style = host.taskStyleResolvers[index]({ task, selected, hovered });
    if (style) {
      return style;
    }
  }

  return null;
}

function getRenderSelectedTaskIds(host: HostInternals): string[] {
  return host.selectionPreviewTaskIds ?? host.selectedTaskIds;
}

function getRenderPrimarySelectedTaskId(host: HostInternals): string | null {
  return host.selectionPreviewTaskIds !== null
    ? host.selectionPreviewPrimaryTaskId
    : host.selectedTaskId;
}

function buildCanvasLayerFrames(
  host: HostInternals,
  scene: GanttScene,
  frame: import('../core').FrameScene,
): CanvasLayerFrameState[] {
  const selection = host.getSelection();
  const interaction = host.getInteractionState();
  const visibleWindow = host.getVisibleWindow();
  const atlas = host.layout.getAtlas();
  const frames: CanvasLayerFrameState[] = [];

  host.canvasHitRegions = [];
  host.canvasHitRegionByKey.clear();

  for (let layerIndex = 0; layerIndex < host.canvasLayers.length; layerIndex += 1) {
    const layer = host.canvasLayers[layerIndex];
    const layerFrame: CanvasLayerFrameState = {
      solids: new SolidInstanceWriter(64),
      lines: new LineInstanceWriter(64),
      glyphs: new GlyphInstanceWriter(128),
      hitRegions: [],
    };

    const draw: GanttCanvasDrawApi = {
      rect: (command: GanttCanvasRectCommand) => {
        const rect = projectCanvasRectToWorld(host, command);
        if (rect.width <= 0 || rect.height <= 0) {
          return;
        }

        layerFrame.solids.appendRect(
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          command.color[0],
          command.color[1],
          command.color[2],
          command.color[3],
          0,
          command.emphasis ?? 0,
          command.radiusPx ?? 0,
        );
      },
      line: (command: GanttCanvasLineCommand) => {
        const [x1, y1] = projectCanvasPointToWorld(host, command.space, command.x1, command.y1);
        const [x2, y2] = projectCanvasPointToWorld(host, command.space, command.x2, command.y2);
        layerFrame.lines.appendLine(
          x1,
          y1,
          x2,
          y2,
          command.color[0],
          command.color[1],
          command.color[2],
          command.color[3],
          command.thickness ?? 1.5,
        );
      },
      text: (command: GanttCanvasTextCommand) => {
        const fontPx = Math.max(1, command.fontPx);
        const [screenX, screenY] = command.space === 'world'
          ? worldToScreen(host.camera, command.x, command.y)
          : [command.x, command.y];
        const maxWidth = command.maxWidth ?? Number.POSITIVE_INFINITY;
        const visibleText = Number.isFinite(maxWidth)
          ? host.layout.fit(command.text, maxWidth, fontPx)
          : command.text;
        if (visibleText.length === 0) {
          return;
        }

        const textWidth = host.layout.measure(visibleText, fontPx);
        const startX =
          command.align === 'center'
            ? screenX - textWidth * 0.5
            : command.align === 'right'
              ? screenX - textWidth
              : screenX;
        const baselineY = resolveCanvasTextBaselineY(atlas, fontPx, screenY, command.baseline);

        if (command.shadowColor) {
          const shadowOffset = Math.max(0.5, fontPx * 0.05);
          host.layout.appendText(
            layerFrame.glyphs,
            visibleText,
            startX + shadowOffset,
            baselineY + shadowOffset,
            fontPx,
            command.shadowColor,
          );
        }

        host.layout.appendText(
          layerFrame.glyphs,
          visibleText,
          startX,
          baselineY,
          fontPx,
          command.color,
        );
      },
      hitRegion: (region: GanttCanvasHitRegion) => {
        const key = `${layerIndex}:${region.id ?? layerFrame.hitRegions.length}`;
        layerFrame.hitRegions.push({
          ...region,
          key,
          layerIndex,
          order: layerFrame.hitRegions.length,
        });
      },
    };

    try {
      layer({
        scene,
        frame,
        camera: host.camera,
        render: host.config.render,
        visibleWindow,
        selection,
        interaction,
        draw,
      });
    } catch (error) {
      console.error('Canvas layer failed', error);
    }

    frames.push(layerFrame);

    for (const region of layerFrame.hitRegions) {
      host.canvasHitRegions.push(region);
      host.canvasHitRegionByKey.set(region.key, region);
    }
  }

  for (const [pointerId, key] of [...host.capturedCanvasRegionKeys.entries()]) {
    if (!host.canvasHitRegionByKey.has(key)) {
      host.capturedCanvasRegionKeys.delete(pointerId);
    }
  }
  for (const [pointerId, key] of [...host.hoveredCanvasRegionKeys.entries()]) {
    if (!host.canvasHitRegionByKey.has(key)) {
      host.hoveredCanvasRegionKeys.delete(pointerId);
    }
  }
  for (const [pointerId, key] of [...host.pendingCanvasClickRegionKeys.entries()]) {
    if (!host.canvasHitRegionByKey.has(key)) {
      host.pendingCanvasClickRegionKeys.delete(pointerId);
    }
  }

  return frames;
}

export async function flushDrawQueue(host: HostInternals): Promise<void> {
  if (host.drawing || host.disposed) {
    return;
  }

  host.drawing = true;

  while (host.renderRequested && !host.disposed) {
    host.renderRequested = false;
    await drawFrame(host);
  }

  host.drawing = false;
}

export async function drawFrame(host: HostInternals): Promise<void> {
  const start = performance.now();
  const scene = getRenderScene(host);
  const index = getRenderIndex(host);
  const renderSelectedTaskIds = getRenderSelectedTaskIds(host);
  const renderState: RenderState = {
    selectedTaskId: getRenderPrimarySelectedTaskId(host),
    selectedTaskIds: renderSelectedTaskIds,
    hoveredTaskId: host.hoveredTaskId,
    selectedDependencyId: host.selectionPreviewTaskIds !== null ? null : host.selectedDependencyId,
    hoveredDependencyId: host.hoveredDependencyId,
    interactionMode: host.interactionMode,
    activeEdit: host.activeEdit
      ? {
          ...host.activeEdit,
          originalTasks: host.activeEditBatch?.originalTasks ?? [host.activeEdit.originalTask],
          draftTasks: host.activeEditBatch?.draftTasks ?? [host.activeEdit.draftTask],
        }
      : null,
    editAffordances: {
      enabled: host.config.edit.enabled,
      handleWidthPx: host.config.edit.resize.handleWidthPx,
      resizeEnabled: host.config.edit.resize.enabled,
    },
    taskStyleResolver: ({ task, selected, hovered }) => resolveTaskStyle(host, task, selected, hovered),
  };

  host.moduleManager.beforeFrame({ host });

  let frame = buildFrame(
    scene,
    index,
    host.camera,
    host.atlas,
    host.layout,
    renderState,
    host.config.render,
    host.config.font,
    host.config.display,
  );

  frame = await host.pluginRuntime.applyFrameHooks(frame);

  const canvasLayerFrames = buildCanvasLayerFrames(host, scene, frame);
  host.renderer.render(frame, host.camera, host.atlas, host.config.display);
  for (const layerFrame of canvasLayerFrames) {
    host.renderer.renderLayer(layerFrame, host.camera, host.atlas);
  }
  host.frame = frame;
  host.lastFrameMs = performance.now() - start;
  host.refreshSelectionReferences();

  host.moduleManager.afterFrame({ host }, frame);

  for (const overlay of host.overlays) {
    try {
      overlay({
        root: host.surface,
        frame,
        camera: host.camera,
      });
    } catch (error) {
      console.error('Overlay renderer failed', error);
    }
  }
}
