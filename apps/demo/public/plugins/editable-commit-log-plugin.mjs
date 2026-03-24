function readOptions(rawOptions) {
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const maxCommits = typeof options.maxCommits === 'number' && Number.isFinite(options.maxCommits)
    ? Math.max(1, Math.min(12, Math.round(options.maxCommits)))
    : 6;

  return {
    panelLabel: typeof options.panelLabel === 'string' ? options.panelLabel : 'Editable API Commit Log',
    accentColor: typeof options.accentColor === 'string' ? options.accentColor : '#ff9a5c',
    maxCommits,
  };
}

function cloneTask(task) {
  return {
    ...task,
    dependencies: task.dependencies ? task.dependencies.slice() : undefined,
  };
}

function sameDependencies(left, right) {
  const a = left ?? [];
  const b = right ?? [];
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}

function summarizeTask(task) {
  return {
    id: task.id,
    label: task.label,
    rowIndex: task.rowIndex,
    start: task.start,
    end: task.end,
    durationDays: task.end - task.start,
    milestone: Boolean(task.milestone),
    dependencies: task.dependencies ? task.dependencies.slice() : [],
  };
}

function diffTask(before, after) {
  const changes = {};
  const beforeDuration = before.end - before.start;
  const afterDuration = after.end - after.start;

  if (before.rowIndex !== after.rowIndex) {
    changes.rowIndex = {
      from: before.rowIndex,
      to: after.rowIndex,
      delta: after.rowIndex - before.rowIndex,
    };
  }

  if (before.start !== after.start) {
    changes.start = {
      from: before.start,
      to: after.start,
      delta: after.start - before.start,
    };
  }

  if (before.end !== after.end) {
    changes.end = {
      from: before.end,
      to: after.end,
      delta: after.end - before.end,
    };
  }

  if (beforeDuration !== afterDuration) {
    changes.durationDays = {
      from: beforeDuration,
      to: afterDuration,
      delta: afterDuration - beforeDuration,
    };
  }

  if (before.label !== after.label) {
    changes.label = {
      from: before.label,
      to: after.label,
    };
  }

  if (Boolean(before.milestone) !== Boolean(after.milestone)) {
    changes.milestone = {
      from: Boolean(before.milestone),
      to: Boolean(after.milestone),
    };
  }

  if (!sameDependencies(before.dependencies, after.dependencies)) {
    changes.dependencies = {
      from: before.dependencies ? before.dependencies.slice() : [],
      to: after.dependencies ? after.dependencies.slice() : [],
    };
  }

  return changes;
}

function replaceTaskInScene(scene, task) {
  const tasks = scene.tasks.map((candidate) => (
    candidate.id === task.id
      ? cloneTask(task)
      : cloneTask(candidate)
  ));
  const timelineStart = tasks.length > 0
    ? Math.min(scene.timelineStart, ...tasks.map((candidate) => candidate.start))
    : scene.timelineStart;
  const timelineEnd = tasks.length > 0
    ? Math.max(scene.timelineEnd, ...tasks.map((candidate) => candidate.end))
    : scene.timelineEnd;

  return {
    tasks,
    rowLabels: scene.rowLabels.slice(),
    timelineStart,
    timelineEnd,
  };
}

function createCommitRecord(event) {
  const previousTask = cloneTask(event.originalTask);
  const nextTask = cloneTask(event.proposedTask);

  return {
    id: `${event.taskId}:${Date.now()}`,
    committedAt: new Date().toISOString(),
    status: 'applied',
    taskId: event.taskId,
    taskLabel: nextTask.label,
    operation: event.operation,
    previousTask,
    nextTask,
    changes: diffTask(previousTask, nextTask),
    undoneAt: null,
  };
}

function serializeCommitRecord(record) {
  return {
    commitId: record.id,
    committedAt: record.committedAt,
    undoneAt: record.undoneAt || undefined,
    status: record.status,
    taskId: record.taskId,
    taskLabel: record.taskLabel,
    operation: record.operation,
    before: summarizeTask(record.previousTask),
    after: summarizeTask(record.nextTask),
    changes: record.changes,
  };
}

function summarizeInteractionState(state) {
  return {
    mode: state.mode,
    activeEdit: state.activeEdit
      ? {
          taskId: state.activeEdit.taskId,
          operation: state.activeEdit.operation,
          status: state.activeEdit.status,
          originalTask: summarizeTask(state.activeEdit.originalTask),
          draftTask: summarizeTask(state.activeEdit.draftTask),
        }
      : null,
  };
}

const editableCommitLogPlugin = {
  meta: {
    id: 'demo-editable-commit-log',
    version: '1.1.0',
    apiRange: '^1.1.0',
  },

  create(context) {
    const options = readOptions(context.pluginConfig.options);
    const cleanups = [];
    const commitLog = [];
    const undoStack = [];
    let host = null;
    let panel = null;
    let meta = null;
    let title = null;
    let undoButton = null;
    let output = null;
    let lastUndo = null;
    let lastError = null;
    let lastRenderedJson = '';

    function buildPayload() {
      const interaction = summarizeInteractionState(context.safe.getInteractionState());
      const isCommitPending = host ? host.isTaskEditPending() : false;

      return {
        summary: {
          mode: interaction.mode,
          activeEditStatus: interaction.activeEdit ? interaction.activeEdit.status : 'idle',
          totalCommits: commitLog.length,
          undoableCommits: undoStack.length,
          canUndo: Boolean(host) && undoStack.length > 0 && !isCommitPending,
        },
        activeEdit: interaction.activeEdit,
        lastUndo,
        lastError,
        commits: commitLog
          .slice(-options.maxCommits)
          .reverse()
          .map(serializeCommitRecord),
      };
    }

    function renderPanel() {
      if (!panel || !meta || !title || !undoButton || !output) {
        return;
      }

      const payload = buildPayload();
      const undoLabel = undoStack.length > 0 ? 'Undo last change' : 'Nothing to undo';
      const isCommitPending = host ? host.isTaskEditPending() : false;

      panel.style.setProperty('--editable-plugin-accent', options.accentColor);
      title.textContent = options.panelLabel;
      meta.textContent = `${payload.summary.totalCommits} commits recorded. Showing newest ${Math.min(options.maxCommits, payload.summary.totalCommits)} entries.`;
      undoButton.disabled = !payload.summary.canUndo;
      undoButton.textContent = undoLabel;
      undoButton.title = isCommitPending
        ? 'Wait for the current edit commit to finish.'
        : undoStack.length > 0
          ? `Restore ${undoStack[undoStack.length - 1].taskLabel} to its previous committed state.`
          : 'No committed changes available to undo.';

      const nextJson = JSON.stringify(payload, null, 2);
      if (nextJson !== lastRenderedJson) {
        output.textContent = nextJson;
        lastRenderedJson = nextJson;
      }
    }

    function ensurePanel(root) {
      if (panel && panel.isConnected) {
        return panel;
      }

      panel = root.querySelector('.editable-plugin-panel');
      if (panel) {
        meta = panel.querySelector('.editable-plugin-panel__meta');
        title = panel.querySelector('.editable-plugin-panel__title');
        undoButton = panel.querySelector('.editable-plugin-panel__button');
        output = panel.querySelector('.editable-plugin-panel__json');
        return panel;
      }

      panel = document.createElement('aside');
      panel.className = 'editable-plugin-panel';
      panel.innerHTML = `
        <div class="editable-plugin-panel__header">
          <div class="editable-plugin-panel__heading">
            <p class="editable-plugin-panel__eyebrow">Plugin JSON</p>
            <h3 class="editable-plugin-panel__title"></h3>
          </div>
          <button type="button" class="editable-plugin-panel__button">Undo last change</button>
        </div>
        <p class="editable-plugin-panel__meta"></p>
        <pre class="editable-plugin-panel__json"></pre>
      `;

      meta = panel.querySelector('.editable-plugin-panel__meta');
      title = panel.querySelector('.editable-plugin-panel__title');
      undoButton = panel.querySelector('.editable-plugin-panel__button');
      output = panel.querySelector('.editable-plugin-panel__json');

      if (undoButton) {
        undoButton.addEventListener('click', () => {
          if (!host || undoStack.length === 0 || host.isTaskEditPending()) {
            return;
          }

          const record = undoStack.pop();
          if (!record) {
            return;
          }

          try {
            const scene = replaceTaskInScene(host.getScene(), record.previousTask);
            host.replaceScene(scene);
            host.setSelectionByTaskId(record.previousTask.id);
            record.status = 'undone';
            record.undoneAt = new Date().toISOString();
            lastUndo = {
              commitId: record.id,
              taskId: record.taskId,
              taskLabel: record.taskLabel,
              undoneAt: record.undoneAt,
              restoredTask: summarizeTask(record.previousTask),
            };
            lastError = null;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            lastError = {
              at: new Date().toISOString(),
              message,
            };
            context.safe.logger.error('Editable commit log plugin failed to undo the last change.', error);
          }

          renderPanel();
        });
      }

      root.append(panel);
      return panel;
    }

    return {
      onInit() {
        cleanups.push(
          context.safe.registerModule({
            id: 'demo-editable-commit-log-module',
            onInit({ host: moduleHost }) {
              host = moduleHost;
              renderPanel();
            },
            onDispose() {
              host = null;
            },
          }),
        );

        cleanups.push(
          context.safe.registerOverlay(({ root }) => {
            ensurePanel(root);
            renderPanel();
          }),
        );
      },

      onTaskEditCommit(event) {
        const record = createCommitRecord(event);
        commitLog.push(record);
        undoStack.push(record);
        lastError = null;

        if (commitLog.length > 32) {
          commitLog.splice(0, commitLog.length - 32);
        }
        if (undoStack.length > 32) {
          undoStack.splice(0, undoStack.length - 32);
        }

        renderPanel();
      },

      onDispose() {
        for (const cleanup of cleanups.splice(0).reverse()) {
          cleanup();
        }

        if (panel) {
          panel.remove();
          panel = null;
        }

        meta = null;
        title = null;
        undoButton = null;
        output = null;
        host = null;
      },
    };
  },
};

export default editableCommitLogPlugin;
