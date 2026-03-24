import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCamera, normalizeConfig, type GanttTask } from '@gantt/gantt-core';
import { createSelectionModule } from '../packages/gantt-core/src/builtins';

type Listener = (event: Record<string, unknown>) => void;

class FakeEventTarget {
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  parentElement: FakeEventTarget | null = null;
  children: FakeEventTarget[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly tagName: string) {}

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatchEvent(type: string, event: Record<string, unknown>) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  append(child: FakeEventTarget) {
    child.parentElement = this;
    this.children.push(child);
  }

  remove() {
    if (!this.parentElement) {
      return;
    }

    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: 800,
      height: 320,
    };
  }
}

class FakeCanvasElement extends FakeEventTarget {
  private readonly capturedPointers = new Set<number>();

  constructor() {
    super('canvas');
  }

  setPointerCapture(pointerId: number) {
    this.capturedPointers.add(pointerId);
  }

  releasePointerCapture(pointerId: number) {
    this.capturedPointers.delete(pointerId);
  }

  hasPointerCapture(pointerId: number) {
    return this.capturedPointers.has(pointerId);
  }
}

function installFakeDom() {
  const fakeWindow = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const fakeDocument = {
    createElement: (tagName: string) => new FakeEventTarget(tagName),
  };

  Object.assign(globalThis as Record<string, unknown>, {
    window: fakeWindow,
    document: fakeDocument,
    HTMLElement: FakeEventTarget,
  });
}

function clearFakeDom() {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).HTMLElement;
}

describe('selection builtin interactions', () => {
  beforeEach(() => {
    installFakeDom();
  });

  afterEach(() => {
    clearFakeDom();
  });

  it('drags the current selection from select mode when dragging inside a selected task', async () => {
    const canvas = new FakeCanvasElement();
    const surface = new FakeEventTarget('div');
    surface.append(canvas);

    const selectedTasks: GanttTask[] = [
      { id: 'a', rowIndex: 0, start: 10, end: 16, label: 'Task A' },
      { id: 'b', rowIndex: 1, start: 18, end: 24, label: 'Task B' },
    ];
    const previewTaskEdits = vi.fn((events: unknown[]) => events);
    const commitTaskEdits = vi.fn(async () => true);
    const previewSelectionByTaskIds = vi.fn();
    const setSelectionByTaskIds = vi.fn();
    const setSelectionByScreenPoint = vi.fn();
    const setSelectionByTaskId = vi.fn();
    const host = {
      canvas: canvas as unknown as HTMLCanvasElement,
      registerCleanup: vi.fn(),
      clearSelectionPreview: vi.fn(),
      updateHoverFromScreen: vi.fn(),
      panByScreenDelta: vi.fn(),
      pickTasksInScreenRect: vi.fn(() => []),
      previewSelectionByTaskIds,
      isTaskEditPending: vi.fn(() => false),
      getCamera: vi.fn(() => createCamera(800, 320)),
      getRenderOptions: vi.fn(() => ({ rowPitch: 30, barHeight: 16 })),
      getScene: vi.fn(() => ({ rowLabels: ['Row 1', 'Row 2'], tasks: selectedTasks, timelineStart: 0, timelineEnd: 50 })),
      getEditConfig: vi.fn(() => normalizeConfig({ edit: { enabled: true } }).edit),
      previewTaskEdits,
      previewTaskEdit: vi.fn(),
      commitTaskEdits,
      commitActiveEdit: vi.fn(),
      getInteractionState: vi.fn(() => ({ mode: 'select' as const, activeEdit: null })),
      stopCameraAnimation: vi.fn(),
      getSelection: vi.fn(() => ({
        selectedTask: selectedTasks[0],
        selectedTasks,
        hoveredTask: null,
        selectedDependency: null,
        hoveredDependency: null,
      })),
      pickTaskAtScreen: vi.fn(() => selectedTasks[0]),
      setSelectionByTaskIds,
      setSelectionByTaskId,
      setSelectionByScreenPoint,
      cancelActiveEdit: vi.fn(),
      pickDependencyAtScreen: vi.fn(),
    };

    const module = createSelectionModule();
    await module.onInit?.({ host: host as never });

    canvas.dispatchEvent('pointerdown', {
      button: 0,
      clientX: 12,
      clientY: 12,
      pointerId: 1,
    });
    canvas.dispatchEvent('pointermove', {
      clientX: 28,
      clientY: 12,
      pointerId: 1,
      shiftKey: false,
    });
    canvas.dispatchEvent('pointerup', {
      clientX: 28,
      clientY: 12,
      pointerId: 1,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(previewTaskEdits).toHaveBeenCalledTimes(1);
    expect(commitTaskEdits).toHaveBeenCalledTimes(1);
    expect(previewSelectionByTaskIds).not.toHaveBeenCalled();
    expect(setSelectionByScreenPoint).not.toHaveBeenCalled();
    expect(setSelectionByTaskId).not.toHaveBeenCalled();
  });
});
