(function (SF) {
  'use strict';

  const { select, escapeHtml } = SF.utils;
  const layout = Object.freeze({ column: 210, row: 104, nodeWidth: 164, nodeHeight: 68, padding: 42 });

  function render(tasks, schedule) {
    const wrap = select('#chart-wrap');
    const svg = select('#pert-svg');
    const nodes = select('#pert-nodes');
    const empty = select('#chart-empty-hint');
    const chain = SF.scheduler.criticalChain(tasks, schedule);
    select('#chart-critical-path').textContent = chain.length ? chain.map((task) => task.name).join(' → ') : 'No critical tasks';

    if (!tasks.length) {
      nodes.innerHTML = '';
      svg.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const memo = new Map();
    const levels = new Map(tasks.map((task) => [task.id, SF.scheduler.levelOf(task, taskById, memo)]));
    const columns = new Map();
    tasks.forEach((task) => {
      const level = levels.get(task.id);
      if (!columns.has(level)) columns.set(level, []);
      columns.get(level).push(task);
    });
    columns.forEach((items) => items.sort((a, b) => SF.date.diffDays(a.dueDate, b.dueDate)));

    const maxLevel = Math.max(...levels.values());
    const maxRows = Math.max(...[...columns.values()].map((items) => items.length));
    const width = layout.padding * 2 + (maxLevel + 1) * layout.column;
    const height = Math.max(380, layout.padding * 2 + maxRows * layout.row);
    Object.assign(nodes.style, { width: `${width}px`, height: `${height}px` });
    Object.assign(wrap.style, { minHeight: `${height}px` });
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    const positions = {};
    columns.forEach((items, level) => {
      const startY = (height - items.length * layout.row) / 2;
      items.forEach((task, index) => {
        positions[task.id] = { x: layout.padding + level * layout.column, y: startY + index * layout.row + 18 };
      });
    });

    svg.innerHTML = tasks.flatMap((task) => task.deps.map((dependency) => {
      const from = positions[dependency];
      const to = positions[task.id];
      if (!from || !to) return '';
      const critical = schedule[dependency]?.critical && schedule[task.id]?.critical && !taskById.get(dependency)?.done && !task.done;
      const x1 = from.x + layout.nodeWidth;
      const y1 = from.y + layout.nodeHeight / 2;
      const x2 = to.x;
      const y2 = to.y + layout.nodeHeight / 2;
      const middle = (x1 + x2) / 2;
      return `<path d="M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}" class="chart-edge ${critical ? 'critical' : ''}"/>`;
    })).join('');

    nodes.innerHTML = tasks.map((task) => {
      const position = positions[task.id];
      const critical = !task.done && schedule[task.id]?.critical;
      return `<button class="pert-node ${critical ? 'critical' : ''} ${task.done ? 'done' : ''}" style="left:${position.x}px;top:${position.y}px;width:${layout.nodeWidth}px" data-id="${task.id}" type="button"><span class="pn-name">${escapeHtml(task.name)}</span><span class="pn-due">Due ${SF.date.display(task.dueDate)}</span></button>`;
    }).join('');
  }

  function showTooltip(event, id, schedule) {
    const task = SF.store.find(id);
    const timing = schedule[id];
    if (!task || !timing) return;
    const tooltip = select('#chart-tooltip');
    const slack = timing.slack < 0 ? `${-timing.slack} day(s) behind` : `${timing.slack} day(s) of slack`;
    tooltip.innerHTML = `<strong>${escapeHtml(task.name)}</strong><span>Due ${SF.date.display(task.dueDate)} · ${slack}</span>${timing.critical ? '<span class="tooltip-critical">Critical path</span>' : ''}`;
    tooltip.hidden = false;
    positionTooltip(event);
  }

  function positionTooltip(event) {
    const wrap = select('#chart-wrap');
    const tooltip = select('#chart-tooltip');
    const bounds = wrap.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - bounds.left + wrap.scrollLeft + 14}px`;
    tooltip.style.top = `${event.clientY - bounds.top + wrap.scrollTop + 14}px`;
  }

  SF.chart = { render, showTooltip, positionTooltip, hideTooltip: () => { select('#chart-tooltip').hidden = true; } };
})(window.StudyFlow);
