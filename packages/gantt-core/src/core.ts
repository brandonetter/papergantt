import type { FontAtlas, GlyphSink, TextLayoutEngine } from './font';
import type { GanttFontConfig } from './types';

export type GanttTask = {
  id: string;
  rowIndex: number;
  start: number;
  end: number;
  label: string;
  milestone?: boolean;
  dependencies?: string[];
};

export type GanttScene = {
  tasks: GanttTask[];
  rowLabels: string[];
  timelineStart: number;
  timelineEnd: number;
};

export type TaskIndex = {
  rows: GanttTask[][];
  byId: Map<string, GanttTask>;
  rowMaxDuration: number[];
  rowCount: number;
  maxDuration: number;
};

export type CameraState = {
  scrollX: number;
  scrollY: number;
  zoomX: number;
  zoomY: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type ViewWindow = {
  start: number;
  end: number;
};

export type LabelTier = {
  fontPx: number;
  minBarWidth: number;
  enabled: boolean;
};

export type FrameStats = {
  rowStart: number;
  rowEnd: number;
  visibleRows: number;
  visibleTasks: number;
  visibleDependencies: number;
  glyphCount: number;
  gridLineCount: number;
  rowBandCount: number;
};

export type FrameScene = {
  backgroundSolids: SolidInstanceWriter;
  foregroundSolids: SolidInstanceWriter;
  backgroundLines: LineInstanceWriter;
  dependencyLines: LineInstanceWriter;
  glyphs: GlyphInstanceWriter;
  dependencyPaths: DependencyPath[];
  stats: FrameStats;
};

export type RenderState = {
  selectedTaskId: string | null;
  hoveredTaskId: string | null;
  selectedDependencyId: string | null;
  hoveredDependencyId: string | null;
  taskStyleResolver?: (input: {
    task: GanttTask;
    selected: boolean;
    hovered: boolean;
  }) =>
    | {
        fill?: [number, number, number, number];
        emphasis?: number;
      }
    | null
    | undefined;
};

export type DependencySegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type Point = {
  x: number;
  y: number;
};

export type DependencyPath = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  segments: DependencySegment[];
};

export type FrameOptions = {
  rowPitch: number;
  barHeight: number;
  milestoneSize: number;
  headerHeight: number;
  rowPadding: number;
  labelPadding: number;
  gridPadding: number;
  overscanRows: number;
  overscanPx: number;
  renderSelectedDependencies: boolean;
};

const DEFAULT_OPTIONS: FrameOptions = {
  rowPitch: 28,
  barHeight: 14,
  milestoneSize: 10,
  headerHeight: 36,
  rowPadding: 6,
  labelPadding: 6,
  gridPadding: 0,
  overscanRows: 2,
  overscanPx: 180,
  renderSelectedDependencies: true,
};

export const DAY_MS = 24 * 60 * 60 * 1000;

type TimeAxisStep = {
  unit: 'day' | 'month' | 'year';
  count: number;
  approxDays: number;
};

const BAR_PALETTE: Array<[number, number, number]> = [
  [0.29, 0.66, 0.98],
  [0.93, 0.57, 0.26],
  [0.41, 0.76, 0.5],
  [0.81, 0.49, 0.93],
  [0.94, 0.74, 0.28],
  [0.38, 0.74, 0.86],
];

const MIN_ZOOM = 0.15;
const MAX_ZOOM_X = 768;
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lowerBound<T>(
  items: readonly T[],
  value: number,
  read: (item: T) => number,
): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (read(items[mid]) < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

class FloatInstanceBuffer {
  protected data: Float32Array;
  count = 0;

  constructor(
    public readonly stride: number,
    initialCapacity = 256,
  ) {
    this.data = new Float32Array(stride * initialCapacity);
  }

  reset(): void {
    this.count = 0;
  }

  protected ensure(extraInstances = 1): void {
    const required = (this.count + extraInstances) * this.stride;
    if (required <= this.data.length) {
      return;
    }

    let next = this.data.length || this.stride * 256;
    while (next < required) {
      next *= 2;
    }

    const resized = new Float32Array(next);
    resized.set(this.data);
    this.data = resized;
  }

  view(): Float32Array {
    return this.data.subarray(0, this.count * this.stride);
  }
}

export class SolidInstanceWriter extends FloatInstanceBuffer {
  constructor(initialCapacity = 256) {
    super(10, initialCapacity);
  }

  appendRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    a: number,
    kind: number,
    emphasis: number,
  ): void {
    this.ensure();
    const offset = this.count * this.stride;
    this.data[offset + 0] = x;
    this.data[offset + 1] = y;
    this.data[offset + 2] = w;
    this.data[offset + 3] = h;
    this.data[offset + 4] = r;
    this.data[offset + 5] = g;
    this.data[offset + 6] = b;
    this.data[offset + 7] = a;
    this.data[offset + 8] = kind;
    this.data[offset + 9] = emphasis;
    this.count += 1;
  }
}

export class LineInstanceWriter extends FloatInstanceBuffer {
  constructor(initialCapacity = 256) {
    super(9, initialCapacity);
  }

  appendLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: number,
    g: number,
    b: number,
    a: number,
    thickness: number,
  ): void {
    this.ensure();
    const offset = this.count * this.stride;
    this.data[offset + 0] = x1;
    this.data[offset + 1] = y1;
    this.data[offset + 2] = x2;
    this.data[offset + 3] = y2;
    this.data[offset + 4] = r;
    this.data[offset + 5] = g;
    this.data[offset + 6] = b;
    this.data[offset + 7] = a;
    this.data[offset + 8] = thickness;
    this.count += 1;
  }
}

export class GlyphInstanceWriter
  extends FloatInstanceBuffer
  implements GlyphSink
{
  constructor(initialCapacity = 512) {
    super(12, initialCapacity);
  }

  appendGlyph(
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    this.ensure();
    const offset = this.count * this.stride;
    this.data[offset + 0] = x;
    this.data[offset + 1] = y;
    this.data[offset + 2] = w;
    this.data[offset + 3] = h;
    this.data[offset + 4] = u0;
    this.data[offset + 5] = v0;
    this.data[offset + 6] = u1;
    this.data[offset + 7] = v1;
    this.data[offset + 8] = r;
    this.data[offset + 9] = g;
    this.data[offset + 10] = b;
    this.data[offset + 11] = a;
    this.count += 1;
  }
}

export function createCamera(
  viewportWidth = 1280,
  viewportHeight = 720,
): CameraState {
  return {
    scrollX: 0,
    scrollY: 0,
    zoomX: 1,
    zoomY: 1,
    viewportWidth,
    viewportHeight,
  };
}

export function resizeCamera(
  camera: CameraState,
  viewportWidth: number,
  viewportHeight: number,
): CameraState {
  return {
    ...camera,
    viewportWidth,
    viewportHeight,
  };
}

export function panCamera(
  camera: CameraState,
  deltaScreenX: number,
  deltaScreenY: number,
): CameraState {
  return {
    ...camera,
    scrollX: camera.scrollX - deltaScreenX / camera.zoomX,
    scrollY: camera.scrollY - deltaScreenY / camera.zoomY,
  };
}

export function zoomCameraAt(
  camera: CameraState,
  zoomFactor: number,
  anchorX: number,
  anchorY: number,
): CameraState {
  const nextZoomX = clamp(camera.zoomX * zoomFactor, MIN_ZOOM, MAX_ZOOM_X);
  // The chart body pans in world-y, but the header is a fixed screen-space band.
  // Keeping vertical zoom fixed avoids a drifting gap between the header and rows.
  const nextZoomY = 1;
  const worldX = camera.scrollX + anchorX / camera.zoomX;
  const worldY = camera.scrollY + anchorY / camera.zoomY;

  return {
    ...camera,
    zoomX: nextZoomX,
    zoomY: nextZoomY,
    scrollX: worldX - anchorX / nextZoomX,
    scrollY: worldY - anchorY / nextZoomY,
  };
}

export function worldToScreen(
  camera: CameraState,
  worldX: number,
  worldY: number,
): [number, number] {
  return [
    (worldX - camera.scrollX) * camera.zoomX,
    (worldY - camera.scrollY) * camera.zoomY,
  ];
}

export function screenToWorld(
  camera: CameraState,
  screenX: number,
  screenY: number,
): [number, number] {
  return [
    camera.scrollX + screenX / camera.zoomX,
    camera.scrollY + screenY / camera.zoomY,
  ];
}

export function buildTaskIndex(tasks: GanttTask[]): TaskIndex {
  const byId = new Map<string, GanttTask>();
  let maxRow = 0;
  let maxDuration = 0;

  for (const task of tasks) {
    byId.set(task.id, task);
    maxRow = Math.max(maxRow, task.rowIndex);
    maxDuration = Math.max(maxDuration, task.end - task.start);
  }

  const rows = Array.from({ length: maxRow + 1 }, () => [] as GanttTask[]);
  const rowMaxDuration = Array.from({ length: maxRow + 1 }, () => 0);

  for (const task of tasks) {
    rows[task.rowIndex].push(task);
    rowMaxDuration[task.rowIndex] = Math.max(
      rowMaxDuration[task.rowIndex],
      task.end - task.start,
    );
  }

  for (const row of rows) {
    row.sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.id.localeCompare(right.id),
    );
  }

  return {
    rows,
    byId,
    rowMaxDuration,
    rowCount: rows.length,
    maxDuration,
  };
}

export function rowToWorldY(rowIndex: number, rowPitch: number): number {
  return rowIndex * rowPitch;
}

export function computeVisibleRowRange(
  camera: CameraState,
  rowPitch: number,
  rowCount: number,
  overscanRows = 2,
): { start: number; end: number } {
  const start = clamp(
    Math.floor(camera.scrollY / rowPitch) - overscanRows,
    0,
    Math.max(0, rowCount - 1),
  );
  const end = clamp(
    Math.ceil(
      (camera.scrollY + camera.viewportHeight / camera.zoomY) / rowPitch,
    ) + overscanRows,
    0,
    Math.max(0, rowCount - 1),
  );
  return { start, end };
}

export function computeVisibleTimeWindow(
  camera: CameraState,
  overscanPx = 220,
): ViewWindow {
  return {
    start: camera.scrollX - overscanPx / camera.zoomX,
    end: camera.scrollX + (camera.viewportWidth + overscanPx) / camera.zoomX,
  };
}

export function chooseLabelTier(zoomX: number, baseFontPx = 12): LabelTier {
  if (zoomX < 0.4) {
    return { enabled: false, fontPx: 0, minBarWidth: Number.POSITIVE_INFINITY };
  }

  if (zoomX < 0.9) {
    return { enabled: true, fontPx: baseFontPx, minBarWidth: 48 };
  }

  if (zoomX < 1.8) {
    return { enabled: true, fontPx: baseFontPx + 1, minBarWidth: 40 };
  }

  if (zoomX < 4) {
    return { enabled: true, fontPx: baseFontPx + 2, minBarWidth: 34 };
  }

  return { enabled: true, fontPx: baseFontPx + 3, minBarWidth: 28 };
}

const TIME_AXIS_STEPS: TimeAxisStep[] = [
  { unit: 'day', count: 1, approxDays: 1 },
  { unit: 'day', count: 2, approxDays: 2 },
  { unit: 'day', count: 3, approxDays: 3 },
  { unit: 'day', count: 5, approxDays: 5 },
  { unit: 'day', count: 7, approxDays: 7 },
  { unit: 'day', count: 14, approxDays: 14 },
  { unit: 'month', count: 1, approxDays: 30 },
  { unit: 'month', count: 2, approxDays: 61 },
  { unit: 'month', count: 3, approxDays: 91 },
  { unit: 'month', count: 6, approxDays: 182 },
  { unit: 'year', count: 1, approxDays: 365 },
];

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const YEAR_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  timeZone: 'UTC',
});

function daySerialToUtcMs(daySerial: number): number {
  return Math.floor(daySerial) * DAY_MS;
}

function utcMsToDaySerial(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

function alignTimeStep(daySerial: number, step: TimeAxisStep): number {
  const wholeDay = Math.floor(daySerial);

  if (step.unit === 'day') {
    return Math.floor(wholeDay / step.count) * step.count;
  }

  const date = new Date(daySerialToUtcMs(wholeDay));

  if (step.unit === 'month') {
    const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth();
    const alignedMonthIndex = Math.floor(monthIndex / step.count) * step.count;
    const year = Math.floor(alignedMonthIndex / 12);
    const month = alignedMonthIndex % 12;
    return utcMsToDaySerial(Date.UTC(year, month, 1));
  }

  const alignedYear =
    Math.floor(date.getUTCFullYear() / step.count) * step.count;
  return utcMsToDaySerial(Date.UTC(alignedYear, 0, 1));
}

function advanceTimeStep(daySerial: number, step: TimeAxisStep): number {
  if (step.unit === 'day') {
    return daySerial + step.count;
  }

  const date = new Date(daySerialToUtcMs(daySerial));

  if (step.unit === 'month') {
    return utcMsToDaySerial(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step.count, 1),
    );
  }

  return utcMsToDaySerial(Date.UTC(date.getUTCFullYear() + step.count, 0, 1));
}

function formatTimeAxisLabel(daySerial: number, step: TimeAxisStep): string {
  const date = new Date(daySerialToUtcMs(daySerial));
  if (step.unit === 'year') {
    return YEAR_LABEL_FORMATTER.format(date);
  }
  if (step.unit === 'month') {
    return MONTH_LABEL_FORMATTER.format(date);
  }
  return DAY_LABEL_FORMATTER.format(date);
}

export function chooseGridStep(zoomX: number): TimeAxisStep {
  const targetPx = 72;
  for (const candidate of TIME_AXIS_STEPS) {
    if (candidate.approxDays * zoomX >= targetPx) {
      return candidate;
    }
  }
  return TIME_AXIS_STEPS[TIME_AXIS_STEPS.length - 1];
}

export function taskWorldRect(
  task: GanttTask,
  rowPitch: number,
  barHeight: number,
): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const rowY = task.rowIndex * rowPitch;

  return {
    x: task.start,
    y: rowY + (rowPitch - barHeight) * 0.5,
    w: Math.max(1, task.end - task.start),
    h: task.milestone ? Math.min(barHeight, 12) : barHeight,
  };
}

export function pickTaskAtPoint(
  scene: GanttScene,
  index: TaskIndex,
  camera: CameraState,
  screenX: number,
  screenY: number,
  options: Pick<FrameOptions, 'rowPitch' | 'barHeight'> = DEFAULT_OPTIONS,
): GanttTask | null {
  const [worldX, worldY] = screenToWorld(camera, screenX, screenY);
  const worldRow = Math.floor(worldY / options.rowPitch);
  if (worldRow < 0 || worldRow >= index.rowCount) {
    return null;
  }

  const rowTasks = index.rows[worldRow];
  if (rowTasks.length === 0) {
    return null;
  }

  const timeWindow = computeVisibleTimeWindow(camera, 0);
  const startIndex = Math.max(
    0,
    lowerBound(
      rowTasks,
      timeWindow.start - index.rowMaxDuration[worldRow],
      (task) => task.start,
    ),
  );

  for (let i = startIndex; i < rowTasks.length; i += 1) {
    const task = rowTasks[i];
    if (task.start > timeWindow.end) {
      break;
    }
    if (task.end < timeWindow.start) {
      continue;
    }

    const rect = taskWorldRect(task, options.rowPitch, options.barHeight);
    if (
      worldX >= rect.x - 4 / camera.zoomX &&
      worldX <= rect.x + rect.w + 4 / camera.zoomX &&
      worldY >= rect.y - 4 / camera.zoomY &&
      worldY <= rect.y + rect.h + 4 / camera.zoomY
    ) {
      return task;
    }
  }

  return null;
}

function paletteForRow(rowIndex: number): [number, number, number] {
  return BAR_PALETTE[rowIndex % BAR_PALETTE.length];
}

function rowFillColor(rowIndex: number): [number, number, number, number] {
  const even = rowIndex % 2 === 0;
  return even ? [0.08, 0.09, 0.12, 0.88] : [0.06, 0.07, 0.09, 0.88];
}

function appendLabelWithShadow(
  glyphs: GlyphInstanceWriter,
  layout: TextLayoutEngine,
  text: string,
  x: number,
  baselineY: number,
  fontPx: number,
  color: [number, number, number, number],
  maxWidth: number,
): void {
  const shadowColor: [number, number, number, number] = [0, 0, 0, 0.36 * color[3]];
  const shadowOffsetX = Math.max(0.5, fontPx * 0.025);
  const shadowOffsetY = Math.max(0.5, fontPx * 0.045);
  layout.appendText(
    glyphs,
    text,
    x + shadowOffsetX,
    baselineY + shadowOffsetY,
    fontPx,
    shadowColor,
    maxWidth,
  );
  layout.appendText(glyphs, text, x, baselineY, fontPx, color, maxWidth);
}

function applyAlpha(
  color: [number, number, number, number],
  alphaMultiplier: number,
): [number, number, number, number] {
  return [color[0], color[1], color[2], color[3] * clamp(alphaMultiplier, 0, 1)];
}

function computeHeaderOcclusionAlpha(
  top: number,
  bottom: number,
  headerHeight: number,
  occluderAlpha: number,
): number {
  if (top >= headerHeight) {
    return 1;
  }

  if (bottom <= headerHeight) {
    return 1 - clamp(occluderAlpha, 0, 1);
  }

  const height = Math.max(0.0001, bottom - top);
  const overlap = Math.max(0, Math.min(bottom, headerHeight) - Math.max(top, 0));
  const overlapRatio = clamp(overlap / height, 0, 1);
  return 1 - clamp(occluderAlpha, 0, 1) * overlapRatio;
}

function taskFillColor(
  task: GanttTask,
  selectedTaskId: string | null,
  hoveredTaskId: string | null,
): [number, number, number, number] {
  const [r, g, b] = paletteForRow(task.rowIndex);
  const selected = task.id === selectedTaskId;
  const hovered = task.id === hoveredTaskId;
  const boost = selected ? 1.25 : hovered ? 1.1 : 1;

  return [
    clamp(r * boost, 0, 1),
    clamp(g * boost, 0, 1),
    clamp(b * boost, 0, 1),
    selected ? 0.98 : hovered ? 0.92 : 0.9,
  ];
}

function lineIntersectsViewport(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 0,
): boolean {
  const minX = -padding;
  const minY = -padding;
  const maxX = viewportWidth + padding;
  const maxY = viewportHeight + padding;

  const lineMinX = Math.min(x1, x2);
  const lineMaxX = Math.max(x1, x2);
  const lineMinY = Math.min(y1, y2);
  const lineMaxY = Math.max(y1, y2);

  if (
    lineMaxX < minX ||
    lineMinX > maxX ||
    lineMaxY < minY ||
    lineMinY > maxY
  ) {
    return false;
  }

  return true;
}

function appendVisibleLine(
  lines: LineInstanceWriter,
  camera: CameraState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  g: number,
  b: number,
  a: number,
  thickness: number,
  padding = 18,
): boolean {
  const sx1 = (x1 - camera.scrollX) * camera.zoomX;
  const sy1 = (y1 - camera.scrollY) * camera.zoomY;
  const sx2 = (x2 - camera.scrollX) * camera.zoomX;
  const sy2 = (y2 - camera.scrollY) * camera.zoomY;

  if (
    !lineIntersectsViewport(
      sx1,
      sy1,
      sx2,
      sy2,
      camera.viewportWidth,
      camera.viewportHeight,
      padding,
    )
  ) {
    return false;
  }

  lines.appendLine(x1, y1, x2, y2, r, g, b, a, thickness);
  return true;
}

function buildRoundedSegments(
  points: Point[],
  radius: number,
): DependencySegment[] {
  if (points.length < 2) {
    return [];
  }

  const segments: DependencySegment[] = [];
  let cursor = points[0];

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const inDx = curr.x - prev.x;
    const inDy = curr.y - prev.y;
    const outDx = next.x - curr.x;
    const outDy = next.y - curr.y;
    const inLen = Math.hypot(inDx, inDy);
    const outLen = Math.hypot(outDx, outDy);

    if (inLen < 0.001 || outLen < 0.001) {
      continue;
    }

    const inDir = { x: inDx / inLen, y: inDy / inLen };
    const outDir = { x: outDx / outLen, y: outDy / outLen };
    const isCorner =
      Math.abs(inDir.x - outDir.x) > 0.001 ||
      Math.abs(inDir.y - outDir.y) > 0.001;

    if (!isCorner) {
      segments.push({ x1: cursor.x, y1: cursor.y, x2: curr.x, y2: curr.y });
      cursor = curr;
      continue;
    }

    const cornerRadius = Math.min(radius, inLen * 0.5, outLen * 0.5);
    const entry = {
      x: curr.x - inDir.x * cornerRadius,
      y: curr.y - inDir.y * cornerRadius,
    };
    const exit = {
      x: curr.x + outDir.x * cornerRadius,
      y: curr.y + outDir.y * cornerRadius,
    };

    segments.push({ x1: cursor.x, y1: cursor.y, x2: entry.x, y2: entry.y });

    const center = {
      x: curr.x - inDir.x * cornerRadius + outDir.x * cornerRadius,
      y: curr.y - inDir.y * cornerRadius + outDir.y * cornerRadius,
    };
    const startAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
    let endAngle = Math.atan2(exit.y - center.y, exit.x - center.x);
    let delta = endAngle - startAngle;

    if (delta > Math.PI) {
      delta -= Math.PI * 2;
    } else if (delta < -Math.PI) {
      delta += Math.PI * 2;
    }

    let previousPoint = entry;
    const steps = 4;
    for (let step = 1; step <= steps; step += 1) {
      const angle = startAngle + (delta * step) / steps;
      const nextPoint = {
        x: center.x + Math.cos(angle) * cornerRadius,
        y: center.y + Math.sin(angle) * cornerRadius,
      };
      segments.push({
        x1: previousPoint.x,
        y1: previousPoint.y,
        x2: nextPoint.x,
        y2: nextPoint.y,
      });
      previousPoint = nextPoint;
    }

    cursor = exit;
  }

  const last = points[points.length - 1];
  segments.push({ x1: cursor.x, y1: cursor.y, x2: last.x, y2: last.y });
  return segments;
}

function buildDependencySegments(
  sourceTask: GanttTask,
  targetTask: GanttTask,
  camera: CameraState,
  config: FrameOptions,
): DependencySegment[] {
  const sourceRect = taskWorldRect(
    sourceTask,
    config.rowPitch,
    config.barHeight,
  );
  const targetRect = taskWorldRect(
    targetTask,
    config.rowPitch,
    config.barHeight,
  );
  const sourceAnchor = {
    x: sourceRect.x + sourceRect.w * 0.5,
    y: sourceRect.y + sourceRect.h,
  };
  const targetAnchor = {
    x: targetRect.x,
    y: targetRect.y + targetRect.h * 0.5,
  };

  const cornerRadius = Math.max(4 / camera.zoomX, 7 / camera.zoomX);
  const verticalOffset = Math.max(
    8 / camera.zoomY,
    (config.rowPitch - config.barHeight) * 0.5 + 2 / camera.zoomY,
  );
  const points: Point[] = [sourceAnchor];
  const targetIsBelow = targetAnchor.y >= sourceAnchor.y;
  const targetIsToRight = targetAnchor.x >= sourceAnchor.x;

  if (targetIsBelow && targetIsToRight) {
    points.push({ x: sourceAnchor.x, y: targetAnchor.y });
  } else if (!targetIsBelow && targetIsToRight) {
    const laneY = Math.max(
      sourceAnchor.y + verticalOffset,
      targetRect.y + targetRect.h + 6 / camera.zoomY,
    );
    points.push({ x: sourceAnchor.x, y: laneY });
    points.push({ x: targetAnchor.x, y: laneY });
    points.push({ x: targetAnchor.x, y: targetAnchor.y });
  } else {
    const detourX =
      Math.max(sourceRect.x + sourceRect.w, targetRect.x + targetRect.w) +
      18 / camera.zoomX;
    const laneY = Math.max(
      sourceAnchor.y + verticalOffset,
      targetRect.y - 6 / camera.zoomY,
    );
    points.push({ x: sourceAnchor.x, y: laneY });
    points.push({ x: detourX, y: laneY });
    points.push({ x: detourX, y: targetAnchor.y });
    points.push({ x: targetAnchor.x, y: targetAnchor.y });
  }

  const segments = buildRoundedSegments(
    points.concat(targetAnchor),
    cornerRadius,
  );
  if (segments.length === 0) {
    return [];
  }

  const targetScreen = worldToScreen(camera, targetAnchor.x, targetAnchor.y);
  const previousScreen = worldToScreen(
    camera,
    segments[segments.length - 1].x1,
    segments[segments.length - 1].y1,
  );
  const dirX = targetScreen[0] - previousScreen[0];
  const dirY = targetScreen[1] - previousScreen[1];
  const dirLength = Math.hypot(dirX, dirY) || 1;
  const unitX = dirX / dirLength;
  const unitY = dirY / dirLength;
  const perpX = -unitY;
  const perpY = unitX;
  const arrowLength = 8;
  const arrowWidth = 4;
  const leftScreen: [number, number] = [
    targetScreen[0] - unitX * arrowLength + perpX * arrowWidth,
    targetScreen[1] - unitY * arrowLength + perpY * arrowWidth,
  ];
  const rightScreen: [number, number] = [
    targetScreen[0] - unitX * arrowLength - perpX * arrowWidth,
    targetScreen[1] - unitY * arrowLength - perpY * arrowWidth,
  ];
  const leftWorld = screenToWorld(camera, leftScreen[0], leftScreen[1]);
  const rightWorld = screenToWorld(camera, rightScreen[0], rightScreen[1]);

  segments.push({
    x1: leftWorld[0],
    y1: leftWorld[1],
    x2: targetAnchor.x,
    y2: targetAnchor.y,
  });
  segments.push({
    x1: rightWorld[0],
    y1: rightWorld[1],
    x2: targetAnchor.x,
    y2: targetAnchor.y,
  });
  return segments;
}

function distanceToSegmentSquared(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    const ox = px - x1;
    const oy = py - y1;
    return ox * ox + oy * oy;
  }

  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
  const cx = x1 + dx * t;
  const cy = y1 + dy * t;
  const ox = px - cx;
  const oy = py - cy;
  return ox * ox + oy * oy;
}

export function pickDependencyAtPoint(
  frame: FrameScene,
  camera: CameraState,
  screenX: number,
  screenY: number,
  tolerancePx = 6,
): DependencyPath | null {
  let best: DependencyPath | null = null;
  let bestDistance = tolerancePx * tolerancePx;

  for (const path of frame.dependencyPaths) {
    for (const segment of path.segments) {
      const x1 = (segment.x1 - camera.scrollX) * camera.zoomX;
      const y1 = (segment.y1 - camera.scrollY) * camera.zoomY;
      const x2 = (segment.x2 - camera.scrollX) * camera.zoomX;
      const y2 = (segment.y2 - camera.scrollY) * camera.zoomY;
      const distance = distanceToSegmentSquared(
        screenX,
        screenY,
        x1,
        y1,
        x2,
        y2,
      );
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = path;
      }
    }
  }

  return best;
}

export function buildFrame(
  scene: GanttScene,
  index: TaskIndex,
  camera: CameraState,
  atlas: FontAtlas,
  layout: TextLayoutEngine,
  renderState: RenderState,
  options: Partial<FrameOptions> = {},
  font: GanttFontConfig = {},
): FrameScene {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const baseFontPx = Math.max(1, Math.round(font.sizePx ?? 12));
  const backgroundSolids = new SolidInstanceWriter(
    Math.max(1024, index.rowCount * 4),
  );
  const foregroundSolids = new SolidInstanceWriter(
    Math.max(1024, index.rowCount * 8),
  );
  const backgroundLines = new LineInstanceWriter(
    Math.max(1024, index.rowCount * 4),
  );
  const dependencyLines = new LineInstanceWriter(
    Math.max(1024, index.rowCount * 8),
  );
  const glyphs = new GlyphInstanceWriter(Math.max(2048, index.rowCount * 24));
  const dependencyPaths: DependencyPath[] = [];

  const rowRange = computeVisibleRowRange(
    camera,
    config.rowPitch,
    index.rowCount,
    config.overscanRows,
  );
  const window = computeVisibleTimeWindow(camera, config.overscanPx);
  const labelTier = chooseLabelTier(camera.zoomX, baseFontPx);
  const gridStep = chooseGridStep(camera.zoomX);
  const gridColor: [number, number, number, number] = [0.12, 0.15, 0.2, 0.28];
  const separatorColor: [number, number, number, number] = [
    0.14, 0.17, 0.22, 0.85,
  ];
  const textColor: [number, number, number, number] = [0.96, 0.98, 1.0, 0.96];
  const axisTextColor: [number, number, number, number] = [
    0.8, 0.86, 0.93, 0.94,
  ];
  const axisBackgroundColor: [number, number, number, number] = [
    0.05, 0.07, 0.1, 0.96,
  ];
  const axisBorderColor: [number, number, number, number] = [
    0.18, 0.22, 0.28, 0.96,
  ];
  const axisTickColor: [number, number, number, number] = [
    0.28, 0.34, 0.42, 0.8,
  ];
  const axisFontPx = baseFontPx + 1;
  const axisScale = axisFontPx / atlas.lineHeight;
  const axisTextHeight = (atlas.ascender + atlas.descender) * axisScale;
  const axisBaseline =
    (config.headerHeight - axisTextHeight) * 0.5 + atlas.ascender * axisScale;

  const headerTop = camera.scrollY;
  const headerHeightWorld = config.headerHeight / camera.zoomY;
  const headerBottom = headerTop + headerHeightWorld;
  const viewportWorldWidth = camera.viewportWidth / camera.zoomX;
  const viewportRight = camera.scrollX + viewportWorldWidth;
  const gridTop = headerBottom;
  const gridBottom =
    Math.min(scene.rowLabels.length, rowRange.end + 1) * config.rowPitch;
  const gridLeft = window.start;
  const gridRight = window.end;

  let gridLineCount = 0;
  let visibleTasks = 0;
  let visibleDependencies = 0;

  for (
    let time = alignTimeStep(gridLeft, gridStep);
    time <= gridRight;
    time = advanceTimeStep(time, gridStep)
  ) {
    backgroundLines.appendLine(
      time,
      gridTop,
      time,
      gridBottom,
      gridColor[0],
      gridColor[1],
      gridColor[2],
      gridColor[3],
      1,
    );
    gridLineCount += 1;
  }

  for (let row = rowRange.start; row <= rowRange.end; row += 1) {
    const rowY = rowToWorldY(row, config.rowPitch);
    const [r, g, b, a] = rowFillColor(row);
    backgroundSolids.appendRect(
      window.start,
      rowY,
      window.end - window.start,
      config.rowPitch,
      r,
      g,
      b,
      a,
      0,
      0,
    );
    backgroundLines.appendLine(
      window.start,
      rowY,
      window.end,
      rowY,
      separatorColor[0],
      separatorColor[1],
      separatorColor[2],
      separatorColor[3],
      1,
    );

    const rowTasks = index.rows[row];
    if (rowTasks.length === 0) {
      continue;
    }

    const rowStartIndex = Math.max(
      0,
      lowerBound(
        rowTasks,
        window.start - index.rowMaxDuration[row],
        (task) => task.start,
      ),
    );

    for (let i = rowStartIndex; i < rowTasks.length; i += 1) {
      const task = rowTasks[i];
      if (task.start > window.end) {
        break;
      }
      if (task.end < window.start) {
        continue;
      }

      visibleTasks += 1;
      const selected = task.id === renderState.selectedTaskId;
      const hovered = task.id === renderState.hoveredTaskId;
      const defaultEmphasis = selected ? 1 : hovered ? 0.45 : 0.1;
      const pluginStyle =
        renderState.taskStyleResolver?.({ task, selected, hovered }) ?? null;
      const fill =
        pluginStyle?.fill ??
        taskFillColor(
          task,
          renderState.selectedTaskId,
          renderState.hoveredTaskId,
        );
      const emphasis = pluginStyle?.emphasis ?? defaultEmphasis;
      const laneY = rowY + (config.rowPitch - config.barHeight) * 0.5;

      if (task.milestone) {
        const size =
          config.milestoneSize * (selected ? 1.15 : hovered ? 1.05 : 1);
        const centerX = task.start;
        const centerY = laneY + config.barHeight * 0.5;
        foregroundSolids.appendRect(
          centerX - size * 0.5,
          centerY - size * 0.5,
          size,
          size,
          fill[0],
          fill[1],
          fill[2],
          fill[3],
          1,
          emphasis,
        );
      } else {
        const x = task.start;
        const w = Math.max(2, task.end - task.start);
        foregroundSolids.appendRect(
          x,
          laneY,
          w,
          config.barHeight,
          fill[0],
          fill[1],
          fill[2],
          fill[3],
          0,
          emphasis,
        );

        if (labelTier.enabled) {
          const screenX = (x - camera.scrollX) * camera.zoomX;
          const screenY = (laneY - camera.scrollY) * camera.zoomY;
          const screenW = w * camera.zoomX;
          const screenH = config.barHeight * camera.zoomY;
          const scale = labelTier.fontPx / atlas.lineHeight;
          const textBoxHeight = (atlas.ascender + atlas.descender) * scale;
          const baseline =
            screenY + (screenH - textBoxHeight) * 0.5 + atlas.ascender * scale;
          const labelTop = baseline - atlas.ascender * scale;
          const labelBottom = labelTop + textBoxHeight;
          const labelColor = applyAlpha(
            textColor,
            computeHeaderOcclusionAlpha(
              labelTop,
              labelBottom,
              config.headerHeight,
              axisBackgroundColor[3],
            ),
          );
          const fullLabelWidth = layout.measure(task.label, labelTier.fontPx);
          const visibleLeft = clamp(screenX, 0, camera.viewportWidth);
          const visibleRight = clamp(
            screenX + screenW,
            0,
            camera.viewportWidth,
          );
          const visibleWidth = Math.max(0, visibleRight - visibleLeft);
          const insideWidth = Math.max(
            0,
            visibleWidth - config.labelPadding * 2,
          );
          const fitsInside =
            visibleWidth >= labelTier.minBarWidth &&
            fullLabelWidth <= insideWidth;

          if (fitsInside) {
            const centeredLabelX =
              visibleLeft + (visibleWidth - fullLabelWidth) * 0.5;
            const minLabelX = visibleLeft + config.labelPadding;
            const maxLabelX =
              visibleRight - config.labelPadding - fullLabelWidth;
            const labelX = clamp(centeredLabelX, minLabelX, maxLabelX);
            appendLabelWithShadow(
              glyphs,
              layout,
              task.label,
              labelX,
              baseline,
              labelTier.fontPx,
              labelColor,
              fullLabelWidth,
            );
          } else {
            const labelX = screenX + screenW + config.labelPadding;
            const availableWidth = Math.max(
              0,
              camera.viewportWidth - labelX - config.labelPadding,
            );
            const label = layout.fit(
              task.label,
              availableWidth,
              labelTier.fontPx,
            );
            if (label.length > 0) {
              appendLabelWithShadow(
                glyphs,
                layout,
                label,
                labelX,
                baseline,
                labelTier.fontPx,
                labelColor,
                camera.viewportWidth - labelX - config.labelPadding,
              );
            }
          }
        }
      }
    }
  }

  foregroundSolids.appendRect(
    camera.scrollX,
    headerTop,
    viewportWorldWidth,
    headerHeightWorld,
    axisBackgroundColor[0],
    axisBackgroundColor[1],
    axisBackgroundColor[2],
    axisBackgroundColor[3],
    0,
    0,
  );
  foregroundSolids.appendRect(
    camera.scrollX,
    headerBottom - 1 / camera.zoomY,
    viewportWorldWidth,
    1 / camera.zoomY,
    axisBorderColor[0],
    axisBorderColor[1],
    axisBorderColor[2],
    axisBorderColor[3],
    0,
    0,
  );

  for (
    let tick = alignTimeStep(camera.scrollX, gridStep);
    tick <= viewportRight;
    tick = advanceTimeStep(tick, gridStep)
  ) {
    const nextTick = advanceTimeStep(tick, gridStep);
    const intervalLeft = (tick - camera.scrollX) * camera.zoomX;
    const intervalRight = (nextTick - camera.scrollX) * camera.zoomX;
    const visibleLeft = clamp(intervalLeft, 0, camera.viewportWidth);
    const visibleRight = clamp(intervalRight, 0, camera.viewportWidth);
    const visibleWidth = visibleRight - visibleLeft;

    foregroundSolids.appendRect(
      tick,
      headerBottom - 8 / camera.zoomY,
      1 / camera.zoomX,
      8 / camera.zoomY,
      axisTickColor[0],
      axisTickColor[1],
      axisTickColor[2],
      axisTickColor[3],
      0,
      0,
    );

    if (visibleWidth < 52) {
      continue;
    }

    const label = formatTimeAxisLabel(tick, gridStep);
    const labelWidth = layout.measure(label, axisFontPx);
    const centeredX = visibleLeft + (visibleWidth - labelWidth) * 0.5;
    const minX = visibleLeft + 8;
    const maxX = visibleRight - 8 - labelWidth;

    if (maxX < minX) {
      continue;
    }

    layout.appendText(
      glyphs,
      label,
      clamp(centeredX, minX, maxX),
      axisBaseline,
      axisFontPx,
      axisTextColor,
      labelWidth,
    );
  }

  for (const task of scene.tasks) {
    const taskSelected = task.id === renderState.selectedTaskId;
    const taskHovered = task.id === renderState.hoveredTaskId;

    for (const depId of task.dependencies ?? []) {
      const predecessor = index.byId.get(depId);
      if (!predecessor) {
        continue;
      }

      const predecessorSelected = predecessor.id === renderState.selectedTaskId;
      const predecessorHovered = predecessor.id === renderState.hoveredTaskId;
      const dependencyId = `${depId}->${task.id}`;
      const lineSelected = dependencyId === renderState.selectedDependencyId;
      const lineHovered = dependencyId === renderState.hoveredDependencyId;
      const emphasis = lineSelected
        ? 0.95
        : lineHovered
          ? 0.78
          : taskSelected || predecessorSelected
            ? 0.8
            : taskHovered || predecessorHovered
              ? 0.6
              : 0.35;
      const thickness = lineSelected ? 2.5 : lineHovered ? 2.0 : 1.5;
      let emitted = false;
      const segments = buildDependencySegments(
        predecessor,
        task,
        camera,
        config,
      );

      for (const segment of segments) {
        emitted =
          appendVisibleLine(
            dependencyLines,
            camera,
            segment.x1,
            segment.y1,
            segment.x2,
            segment.y2,
            0.76,
            0.84,
            0.96,
            emphasis,
            thickness,
          ) || emitted;
      }

      if (emitted) {
        dependencyPaths.push({
          id: dependencyId,
          sourceTaskId: depId,
          targetTaskId: task.id,
          segments,
        });
        visibleDependencies += 1;
      }
    }
  }

  return {
    backgroundSolids,
    foregroundSolids,
    backgroundLines,
    dependencyLines,
    glyphs,
    dependencyPaths,
    stats: {
      rowStart: rowRange.start,
      rowEnd: rowRange.end,
      visibleRows:
        rowRange.end >= rowRange.start ? rowRange.end - rowRange.start + 1 : 0,
      visibleTasks,
      visibleDependencies,
      glyphCount: glyphs.count,
      gridLineCount,
      rowBandCount:
        rowRange.end >= rowRange.start ? rowRange.end - rowRange.start + 1 : 0,
    },
  };
}
