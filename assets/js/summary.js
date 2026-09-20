(function (SF) {
  'use strict';

  const { select, escapeHtml } = SF.utils;

  function dueLabel(task) {
    const days = SF.date.diffDays(task.dueDate, SF.date.today());
    if (task.done) return `กำหนดส่ง ${SF.date.display(task.dueDate)}`;
    if (days < 0) return `เลยกำหนด ${-days} วัน`;
    if (days === 0) return 'ครบกำหนดวันนี้';
    if (days === 1) return 'ครบกำหนดพรุ่งนี้';
    return `เหลืออีก ${days} วัน`;
  }

  function taskRow(task, schedule) {
    const overdue = !task.done && SF.date.diffDays(task.dueDate, SF.date.today()) < 0;
    const needsAttention = !task.done && schedule[task.id]?.critical;
    const statusClass = overdue ? 'overdue' : task.done ? 'completed' : needsAttention ? 'attention' : '';
    const statusText = overdue ? 'เลยกำหนด' : task.done ? 'เสร็จแล้ว' : needsAttention ? 'ห้ามล่าช้า' : 'ตามแผน';
    return `<div class="summary-task" data-id="${task.id}" role="button" tabindex="0">
      <input class="summary-check" type="checkbox" data-id="${task.id}" aria-label="ทำเครื่องหมายว่า ${escapeHtml(task.name)} เสร็จแล้ว" ${task.done ? 'checked' : ''}>
      <span class="summary-task-info"><strong>${escapeHtml(task.name)}</strong><small>${dueLabel(task)}</small></span>
      <span class="summary-task-status ${statusClass}">${statusText}</span>
    </div>`;
  }

  function emptyState(message) {
    return `<div class="summary-empty"><span aria-hidden="true">—</span><p>${message}</p></div>`;
  }

  function render(tasks, schedule) {
    const completed = tasks.filter((task) => task.done);
    const pending = tasks.filter((task) => !task.done);
    const overdue = pending.filter((task) => SF.date.diffDays(task.dueDate, SF.date.today()) < 0);
    const progress = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;

    select('#summary-stats').innerHTML = `
      <article class="summary-stat"><span class="summary-stat-dot total"></span><div><p>งานทั้งหมด</p><strong>${tasks.length}</strong></div></article>
      <article class="summary-stat"><span class="summary-stat-dot completed"></span><div><p>เสร็จแล้ว</p><strong>${completed.length}</strong></div></article>
      <article class="summary-stat"><span class="summary-stat-dot pending"></span><div><p>ยังไม่เสร็จ</p><strong>${pending.length}</strong></div></article>
      <article class="summary-stat"><span class="summary-stat-dot overdue"></span><div><p>เลยกำหนด</p><strong>${overdue.length}</strong></div></article>`;

    select('#summary-message').textContent = !tasks.length
      ? 'เริ่มเพิ่มงานเพื่อดูความคืบหน้าของคุณ'
      : progress === 100
        ? 'ยอดเยี่ยมมาก คุณทำครบทุกงานแล้ว'
        : overdue.length
          ? `มี ${overdue.length} งานที่ควรรีบจัดการ`
          : `ทำต่ออีกนิด ตอนนี้สำเร็จแล้ว ${progress}%`;

    select('#summary-progress-label').textContent = `${progress}%`;
    select('#summary-progress-detail').textContent = `${completed.length} จาก ${tasks.length} งานเสร็จแล้ว`;
    select('#summary-progress-bar').style.width = `${progress}%`;
    select('.progress-track').setAttribute('aria-valuenow', progress);
    select('#pending-count-label').textContent = `${pending.length} งาน`;
    select('#completed-count-label').textContent = `${completed.length} งาน`;

    const sortedPending = [...pending].sort((a, b) => SF.date.diffDays(a.dueDate, b.dueDate));
    const sortedCompleted = [...completed].sort((a, b) => SF.date.diffDays(b.dueDate, a.dueDate));
    select('#summary-pending-list').innerHTML = sortedPending.length
      ? sortedPending.map((task) => taskRow(task, schedule)).join('')
      : emptyState('ไม่มีงานที่ค้างอยู่');
    select('#summary-completed-list').innerHTML = sortedCompleted.length
      ? sortedCompleted.map((task) => taskRow(task, schedule)).join('')
      : emptyState('ยังไม่มีงานที่เสร็จแล้ว');
  }

  SF.summary = { render };
})(window.StudyFlow);
