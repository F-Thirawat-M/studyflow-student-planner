(function (SF) {
  'use strict';

  const { date, utils } = SF;
  const { select, escapeHtml } = utils;

  function renderUpNext(tasks, schedule) {
    const slot = select('#up-next-slot');
    const openTasks = tasks.filter((task) => !task.done).sort((a, b) => date.diffDays(a.dueDate, b.dueDate));
    if (!openTasks.length) {
      slot.innerHTML = '<div class="up-next is-empty"><span class="success-icon" aria-hidden="true">✓</span><div><strong>You’re all caught up</strong><p>Add a task when you’re ready to plan what’s next.</p></div></div>';
      return;
    }

    const task = openTasks[0];
    const daysRemaining = date.diffDays(task.dueDate, date.today());
    const urgent = daysRemaining <= 1;
    let dueText = `Due in ${daysRemaining} days`;
    if (daysRemaining < 0) dueText = `Overdue by ${-daysRemaining} day${daysRemaining === -1 ? '' : 's'}`;
    if (daysRemaining === 0) dueText = 'Due today';
    if (daysRemaining === 1) dueText = 'Due tomorrow';
    if (schedule[task.id]?.critical) dueText += ' · Critical path';

    slot.innerHTML = `
      <article class="up-next ${urgent ? 'is-urgent' : ''}">
        <div class="un-main">
          <span class="un-tag">${urgent ? 'Priority focus' : 'Up next'}</span>
          <h2 class="un-title">${escapeHtml(task.name)}</h2>
          <p class="un-meta">${dueText}</p>
        </div>
        <div class="un-actions">
          <button class="btn btn-primary" data-action="done" data-id="${task.id}" type="button">Mark done</button>
          <button class="btn btn-ghost" data-action="edit" data-id="${task.id}" type="button">Edit</button>
        </div>
      </article>`;
  }

  function renderStats(tasks, schedule) {
    const openTasks = tasks.filter((task) => !task.done);
    const completed = tasks.length - openTasks.length;
    const finishDate = openTasks.length
      ? openTasks.map((task) => task.dueDate).reduce((latest, value) => date.max(latest, value))
      : null;
    const chain = SF.scheduler.criticalChain(tasks, schedule);
    const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

    select('#stats-row').innerHTML = `
      <article class="stat-tile"><span class="stat-icon blue" aria-hidden="true">↗</span><div><p class="stat-label">Tasks left</p><p class="stat-value">${openTasks.length}</p></div></article>
      <article class="stat-tile"><span class="stat-icon amber" aria-hidden="true">◷</span><div><p class="stat-label">Final deadline</p><p class="stat-value">${finishDate ? date.display(finishDate) : '—'}</p></div></article>
      <article class="stat-tile"><span class="stat-icon red" aria-hidden="true">!</span><div><p class="stat-label">Critical tasks</p><p class="stat-value">${chain.length}</p></div></article>
      <article class="stat-tile"><span class="stat-icon green" aria-hidden="true">✓</span><div><p class="stat-label">Progress</p><p class="stat-value">${progress}%</p></div></article>`;
  }

  function renderTaskList(tasks, schedule) {
    const body = select('#task-list-body');
    const sorted = [...tasks].sort((a, b) => a.done - b.done || date.diffDays(a.dueDate, b.dueDate));
    select('#empty-hint').hidden = sorted.length > 0;
    body.innerHTML = sorted.map((task) => {
      const dependencies = task.deps.map((id) => SF.store.find(id)?.name || 'Unknown task').join(', ') || '—';
      const status = task.done ? ['Completed', 'done'] : schedule[task.id]?.critical ? ['Critical', 'critical'] : ['On track', ''];
      return `
        <tr data-id="${task.id}" class="${task.done ? 'is-done' : ''}" tabindex="0">
          <td class="col-check"><input type="checkbox" class="row-check" aria-label="Mark ${escapeHtml(task.name)} complete" ${task.done ? 'checked' : ''} data-id="${task.id}"></td>
          <td class="task-name">${escapeHtml(task.name)}</td>
          <td><time datetime="${task.dueDate}">${date.display(task.dueDate)}</time></td>
          <td class="task-after">${escapeHtml(dependencies)}</td>
          <td><span class="status-chip ${status[1]}"><span class="status-dot"></span>${status[0]}</span></td>
        </tr>`;
    }).join('');
  }

  SF.dashboard = { render(tasks, schedule) { renderUpNext(tasks, schedule); renderStats(tasks, schedule); renderTaskList(tasks, schedule); } };
})(window.StudyFlow);
