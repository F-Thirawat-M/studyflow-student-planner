(function (SF) {
  'use strict';

  const { select, selectAll } = SF.utils;

  function render() {
    const tasks = SF.store.all();
    const schedule = SF.scheduler.compute(tasks);
    SF.dashboard.render(tasks, schedule);
    SF.chart.render(tasks, schedule);
    SF.calendar.render(tasks, schedule);
    SF.summary.render(tasks, schedule);
  }

  function setActiveTab(tab) {
    selectAll('.tab-btn').forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    selectAll('.panel').forEach((panel) => {
      const active = panel.id === `panel-${tab}`;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  }

  function toast(message, critical = false) {
    const element = document.createElement('div');
    element.className = `toast ${critical ? 'toast-critical' : ''}`;
    element.textContent = message;
    select('#toast-container').appendChild(element);
    setTimeout(() => element.remove(), 4000);
  }

  function handleAction(event) {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'done') {
      SF.store.setDone(action.dataset.id, true);
      render();
      toast('เยี่ยมมาก — งานนี้เสร็จแล้ว');
    }
    if (action.dataset.action === 'edit') SF.modal.open(action.dataset.id);
  }

  function init() {
    SF.modal.init();
    selectAll('.tab-btn').forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
    select('#add-task-btn').addEventListener('click', () => SF.modal.open());
    select('#up-next-slot').addEventListener('click', handleAction);
    select('#task-list-body').addEventListener('change', (event) => {
      if (!event.target.matches('.row-check')) return;
      SF.store.setDone(event.target.dataset.id, event.target.checked);
      render();
    });
    select('#task-list-body').addEventListener('click', (event) => {
      if (event.target.matches('.row-check')) return;
      const row = event.target.closest('tr[data-id]');
      if (row) SF.modal.open(row.dataset.id);
    });
    select('#task-list-body').addEventListener('keydown', (event) => {
      const row = event.target.closest('tr[data-id]');
      if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); SF.modal.open(row.dataset.id); }
    });
    select('#pert-nodes').addEventListener('mouseover', (event) => {
      const node = event.target.closest('.pert-node');
      if (node) SF.chart.showTooltip(event, node.dataset.id, SF.scheduler.compute(SF.store.all()));
    });
    select('#pert-nodes').addEventListener('mousemove', SF.chart.positionTooltip);
    select('#pert-nodes').addEventListener('mouseout', SF.chart.hideTooltip);
    select('#pert-nodes').addEventListener('click', (event) => {
      const node = event.target.closest('.pert-node');
      if (node) SF.modal.open(node.dataset.id);
    });
    select('#cal-grid').addEventListener('click', (event) => {
      const task = event.target.closest('.cal-task');
      if (task) SF.modal.open(task.dataset.id);
    });
    select('#panel-summary').addEventListener('click', (event) => {
      const task = event.target.closest('.summary-task[data-id]');
      if (task) SF.modal.open(task.dataset.id);
    });
    select('#cal-prev').addEventListener('click', () => SF.calendar.move(-1));
    select('#cal-next').addEventListener('click', () => SF.calendar.move(1));
    select('#cal-today').addEventListener('click', SF.calendar.today);
    render();

    const urgent = SF.store.all().filter((task) => !task.done && SF.date.diffDays(task.dueDate, SF.date.today()) <= 0);
    if (urgent.length) toast(`มี ${urgent.length} งานที่ครบกำหนดหรือเลยกำหนดแล้ว`, true);
  }

  SF.app = { init, render, toast, setActiveTab };
  document.addEventListener('DOMContentLoaded', init);
})(window.StudyFlow);
