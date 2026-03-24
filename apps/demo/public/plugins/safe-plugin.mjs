function readOptions(rawOptions) {
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  return {
    badgeLabel: typeof options.badgeLabel === 'string' ? options.badgeLabel : 'Safe Plugin',
    accentColor: typeof options.accentColor === 'string' ? options.accentColor : '#66d1ff',
  };
}

function cloneTask(task) {
  return {
    ...task,
    dependencies: task.dependencies ? task.dependencies.slice() : undefined,
  };
}

function clampTaskStart(task) {
  if (task.start >= 0) {
    return null;
  }

  const duration = task.end - task.start;
  return {
    ...cloneTask(task),
    start: 0,
    end: 0 + duration,
  };
}

function formatModeLabel(mode) {
  if (mode === 'edit') {
    return 'Edit';
  }

  if (mode === 'select') {
    return 'Select';
  }

  return 'View';
}

function formatSelectionLabel(selection) {
  return Array.isArray(selection.selectedTasks) && selection.selectedTasks.length > 1
    ? `Selected: ${selection.selectedTasks.length} tasks`
    : selection.selectedTask
      ? `Selected: ${selection.selectedTask.label}`
      : selection.hoveredTask
        ? `Hover: ${selection.hoveredTask.label}`
        : 'No task selected';
}

function formatEditStateLabel(activeEdit) {
  if (!activeEdit) {
    return 'Edit lifecycle idle';
  }

  const taskCount = Array.isArray(activeEdit.taskIds) && activeEdit.taskIds.length > 0
    ? activeEdit.taskIds.length
    : Array.isArray(activeEdit.draftTasks) && activeEdit.draftTasks.length > 0
      ? activeEdit.draftTasks.length
      : 1;

  return taskCount > 1
    ? `${activeEdit.status}: ${taskCount} tasks`
    : `${activeEdit.status}: ${activeEdit.draftTask.label}`;
}

const safePlugin = {
  meta: {
    id: 'demo-safe-style',
    version: '1.2.0',
    apiRange: '^1.3.0',
  },
  create(context) {
    const options = readOptions(context.pluginConfig.options);
    let badge = null;
    let visibleTasks = 0;
    let selectionLabel = 'No task selected';
    let modeLabel = 'Mode: View';
    let editLabel = 'Edit lifecycle idle';
    let commitCount = 0;
    const cleanups = [];

    function ensureBadge(root) {
      if (badge && badge.isConnected) {
        return badge;
      }

      badge = root.querySelector('.plugin-badge');
      if (badge) {
        return badge;
      }

      badge = document.createElement('aside');
      badge.className = 'plugin-badge';
      badge.innerHTML = `
        <p class="plugin-badge__title"></p>
        <p class="plugin-badge__metric"></p>
        <p class="plugin-badge__detail"></p>
        <p class="plugin-badge__detail plugin-badge__detail--subtle"></p>
      `;
      root.append(badge);
      return badge;
    }

    function renderBadge() {
      if (!badge) {
        return;
      }

      badge.style.setProperty('--plugin-accent', options.accentColor);
      const title = badge.querySelector('.plugin-badge__title');
      const metric = badge.querySelector('.plugin-badge__metric');
      const detail = badge.querySelector('.plugin-badge__detail');
      const subtleDetail = badge.querySelector('.plugin-badge__detail--subtle');

      if (title) {
        title.textContent = options.badgeLabel;
      }
      if (metric) {
        metric.textContent = `${visibleTasks} visible tasks`;
      }
      if (detail) {
        detail.textContent = `${modeLabel} | commits ${commitCount}`;
      }
      if (subtleDetail) {
        subtleDetail.textContent = `${selectionLabel} | ${editLabel}`;
      }
    }

    return {
      onInit() {
        cleanups.push(
          context.safe.registerTaskStyleResolver(({ task, selected, hovered }) => {
            if (selected) {
              return { fill: [0.98, 0.52, 0.31, 0.98], emphasis: 1 };
            }
            if (hovered && task.rowIndex % 2 === 0) {
              return { fill: [0.29, 0.82, 0.7, 0.92], emphasis: 0.8 };
            }
            return null;
          }),
        );

        cleanups.push(
          context.safe.registerTaskEditResolver((event) => {
            const clamped = clampTaskStart(event.proposedTask);
            if (clamped) {
              editLabel = `Resolver clamped ${event.operation} at day 0`;
              renderBadge();
              return clamped;
            }
            return null;
          }),
        );

        cleanups.push(
          context.safe.registerOverlay(({ root, frame }) => {
            visibleTasks = frame.stats.visibleTasks;
            ensureBadge(root);
            renderBadge();
          }),
        );

        const interaction = context.safe.getInteractionState();
        selectionLabel = formatSelectionLabel(context.safe.getSelection());
        modeLabel = `Mode: ${formatModeLabel(interaction.mode)}`;
        editLabel = formatEditStateLabel(interaction.activeEdit);
      },

      onSelectionChange(selection) {
        selectionLabel = formatSelectionLabel(selection);
        renderBadge();
      },

      onEditModeChange(mode) {
        modeLabel = `Mode: ${formatModeLabel(mode)}`;
        renderBadge();
      },

      onTaskEditStart(event) {
        editLabel = `Start: ${event.operation} ${event.originalTask.label}`;
        renderBadge();
      },

      onTaskEditPreview(event) {
        editLabel = `Preview: row ${event.proposedTask.rowIndex}, ${event.proposedTask.start.toFixed(0)}-${event.proposedTask.end.toFixed(0)}`;
        renderBadge();
      },

      onTaskEditCommit(event) {
        commitCount += 1;
        editLabel = `Commit: ${event.proposedTask.label}`;
        renderBadge();
      },

      onTaskEditCancel(event) {
        editLabel = `Cancelled: ${event.originalTask.label}`;
        renderBadge();
      },

      onDispose() {
        for (const cleanup of cleanups.splice(0).reverse()) {
          cleanup();
        }

        if (badge) {
          badge.remove();
          badge = null;
        }
      },
    };
  },
};

export default safePlugin;
