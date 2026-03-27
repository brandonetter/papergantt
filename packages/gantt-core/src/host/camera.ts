import {
  computeVisibleTimeWindow,
  createCamera,
  getDependencyTaskId,
  panCamera,
  resizeCamera,
  taskWorldRect,
  worldToScreen,
  zoomCameraAt,
  type CameraState,
  type GanttTask,
} from '../core';
import type { HostInternals, ZoomPreset } from './types';

const DEFAULT_HOME_VISIBLE_DAYS = 28;
const DEFAULT_HOME_LEAD_DAYS = 3;

export const ZOOM_PRESETS: ZoomPreset[] = [
  { id: 'day', label: 'Day', visibleDays: 1 },
  { id: 'week', label: 'Week', visibleDays: 7 },
  { id: 'month', label: 'Month', visibleDays: 28 },
  { id: 'quarter', label: 'Quarter', visibleDays: 84 },
  { id: 'year', label: 'Year', visibleDays: 336 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function findClosestZoomPreset(visibleDays: number): string | null {
  let closest: ZoomPreset | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const preset of ZOOM_PRESETS) {
    const distance = Math.abs(Math.log(visibleDays / preset.visibleDays));
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = preset;
    }
  }

  return bestDistance <= 0.32 ? closest?.id ?? null : null;
}

function resolvePresetZoomX(boundsWidthDays: number, availableWidthPx: number): number {
  return availableWidthPx / Math.max(1, boundsWidthDays);
}

function collectFocusTasks(
  task: GanttTask,
  byId: Map<string, GanttTask>,
  dependentsById: Map<string, GanttTask[]>,
): GanttTask[] {
  const tasks = new Map<string, GanttTask>();
  tasks.set(task.id, task);

  for (const dependencyId of task.dependencies ?? []) {
    const dependency = byId.get(getDependencyTaskId(dependencyId));
    if (dependency) {
      tasks.set(dependency.id, dependency);
    }
  }

  for (const dependent of dependentsById.get(task.id) ?? []) {
    tasks.set(dependent.id, dependent);
  }

  return Array.from(tasks.values());
}

export function createHostCameraState(
  viewportWidth: number,
  viewportHeight: number,
  headerHeight: number,
  timelineStart: number,
  hasTasks: boolean,
): CameraState {
  return {
    ...createCamera(viewportWidth, viewportHeight),
    scrollX: hasTasks ? timelineStart - DEFAULT_HOME_LEAD_DAYS : 0,
    scrollY: -headerHeight,
    zoomX: clamp(viewportWidth / DEFAULT_HOME_VISIBLE_DAYS, 0.15, 768),
  };
}

export function stopCameraAnimation(host: HostInternals): void {
  if (host.cameraAnimationFrame !== 0) {
    cancelAnimationFrame(host.cameraAnimationFrame);
    host.cameraAnimationFrame = 0;
  }
}

export function syncCanvasSize(host: HostInternals): void {
  const rect = host.surface.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  host.canvas.style.width = `${width}px`;
  host.canvas.style.height = `${height}px`;
  host.canvas.width = Math.max(1, Math.floor(width * dpr));
  host.canvas.height = Math.max(1, Math.floor(height * dpr));
  host.camera = resizeCamera(host.camera, width, height);
  host.gl.viewport(0, 0, host.canvas.width, host.canvas.height);
  host.requestRender();
}

export function panByScreenDelta(host: HostInternals, dx: number, dy: number): void {
  host.camera = panCamera(host.camera, dx, dy);
  host.requestRender();
}

export function zoomAt(host: HostInternals, zoomFactor: number, anchorX: number, anchorY: number): void {
  host.camera = zoomCameraAt(host.camera, zoomFactor, anchorX, anchorY);
  host.requestRender();
}

export function resetCamera(host: HostInternals): void {
  stopCameraAnimation(host);
  host.camera = createHostCameraState(
    host.camera.viewportWidth,
    host.camera.viewportHeight,
    host.config.render.headerHeight,
    host.scene.timelineStart,
    host.scene.tasks.length > 0,
  );
  host.requestRender();
}

export function animateToZoomPresetId(host: HostInternals, presetId: string): void {
  const preset = ZOOM_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    return;
  }

  stopCameraAnimation(host);
  const startZoomX = host.camera.zoomX;
  const targetZoomX = host.camera.viewportWidth / preset.visibleDays;
  const anchorX = host.camera.viewportWidth * 0.5;
  const anchorY = host.camera.viewportHeight * 0.5;
  const startedAt = performance.now();
  const durationMs = 220;

  const tick = (now: number) => {
    const t = clamp((now - startedAt) / durationMs, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const desiredZoomX = startZoomX + (targetZoomX - startZoomX) * eased;
    const zoomFactor = desiredZoomX / host.camera.zoomX;
    host.camera = zoomCameraAt(host.camera, zoomFactor, anchorX, anchorY);
    host.requestRender();

    if (t < 1) {
      host.cameraAnimationFrame = requestAnimationFrame(tick);
    } else {
      host.cameraAnimationFrame = 0;
    }
  };

  host.cameraAnimationFrame = requestAnimationFrame(tick);
}

export function animateCameraToTask(host: HostInternals, task: GanttTask): void {
  stopCameraAnimation(host);
  const focusTasks = collectFocusTasks(task, host.index.byId, host.dependentsById);
  const focusRects = focusTasks.map((focusTask) => (
    taskWorldRect(focusTask, host.config.render.rowPitch, host.config.render.barHeight)
  ));
  const minX = Math.min(...focusRects.map((rect) => rect.x));
  const maxX = Math.max(...focusRects.map((rect) => rect.x + rect.w));
  const minY = Math.min(...focusRects.map((rect) => rect.y));
  const maxY = Math.max(...focusRects.map((rect) => rect.y + rect.h));
  const boundsWidth = Math.max(1, maxX - minX);
  const horizontalMarginPx = Math.min(220, Math.max(72, host.camera.viewportWidth * 0.14));
  const availableWidthPx = Math.max(120, host.camera.viewportWidth - horizontalMarginPx * 2);
  const targetZoomX = resolvePresetZoomX(boundsWidth, availableWidthPx);
  const bodyCenterScreenX = host.camera.viewportWidth * 0.5;
  const bodyCenterScreenY =
    host.config.render.headerHeight +
    Math.max(0, host.camera.viewportHeight - host.config.render.headerHeight) * 0.5;
  const startCamera = { ...host.camera };
  const targetCenterX = minX + boundsWidth * 0.5;
  const targetCenterY = minY + (maxY - minY) * 0.5;
  const [startTaskScreenX, startTaskScreenY] = worldToScreen(host.camera, targetCenterX, targetCenterY);
  const zoomedCamera = zoomCameraAt(
    host.camera,
    targetZoomX / host.camera.zoomX,
    bodyCenterScreenX,
    bodyCenterScreenY,
  );
  const startedAt = performance.now();
  const travelPx = Math.hypot(
    bodyCenterScreenX - startTaskScreenX,
    bodyCenterScreenY - startTaskScreenY,
  );
  const zoomChange = Math.abs(Math.log(Math.max(0.001, zoomedCamera.zoomX / Math.max(0.001, startCamera.zoomX))));
  const durationMs = clamp(220 + travelPx * 0.18 + zoomChange * 140, 220, 560);

  const tick = (now: number) => {
    const t = clamp((now - startedAt) / durationMs, 0, 1);
    const eased = easeInOutCubic(t);
    const zoomX = startCamera.zoomX + (zoomedCamera.zoomX - startCamera.zoomX) * eased;
    const zoomY = startCamera.zoomY + (zoomedCamera.zoomY - startCamera.zoomY) * eased;
    const taskScreenX = startTaskScreenX + (bodyCenterScreenX - startTaskScreenX) * eased;
    const taskScreenY = startTaskScreenY + (bodyCenterScreenY - startTaskScreenY) * eased;
    host.camera = {
      ...host.camera,
      zoomX,
      zoomY,
      scrollX: targetCenterX - taskScreenX / zoomX,
      scrollY: targetCenterY - taskScreenY / zoomY,
    };
    host.requestRender();

    if (t < 1) {
      host.cameraAnimationFrame = requestAnimationFrame(tick);
    } else {
      host.cameraAnimationFrame = 0;
    }
  };

  host.cameraAnimationFrame = requestAnimationFrame(tick);
}

export function getZoomPresetIdForVisibleWindow(host: HostInternals): string | null {
  const visibleWindow = computeVisibleTimeWindow(host.camera, 0);
  const visibleDays = Math.max(1, visibleWindow.end - visibleWindow.start);
  return findClosestZoomPreset(visibleDays);
}
