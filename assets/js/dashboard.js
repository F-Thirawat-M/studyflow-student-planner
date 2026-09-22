(function (SF) {
  'use strict';

  const { date, utils } = SF;
  const { select, escapeHtml } = utils;

  function renderUpNext(tasks, schedule) {
    const slot = select('#up-next-slot');
    const openTasks = tasks.filter((task) => !task.done).sort((a, b) => date.diffDays(a.dueDate, b.dueDate));
    if (!openTasks.length) {
      slot.innerHTML = SF.auth.currentUser()
        ? '<div class="up-next is-empty"><span class="success-icon" aria-hidden="true">✓</span><div><strong>เรียบร้อยครบทุกงานแล้ว</strong><p>เพิ่มงานใหม่ได้เมื่อพร้อมวางแผนสิ่งต่อไป</p></div></div>'
        : '<div class="up-next is-empty"><span class="success-icon" aria-hidden="true">✦</span><div><strong>เริ่มวางแผนการเรียนได้ที่นี่</strong><p>เข้าสู่ระบบเพื่อเพิ่มงานและดูแผนของคุณ</p></div></div>';
      return;
    }

    const task = openTasks[0];
    const daysRemaining = date.diffDays(task.dueDate, date.today());
    const urgent = daysRemaining <= 1;
    let dueText = `เหลืออีก ${daysRemaining} วัน`;
    if (daysRemaining < 0) dueText = `เลยกำหนดมา ${-daysRemaining} วัน`;
    if (daysRemaining === 0) dueText = 'ครบกำหนดวันนี้';
    if (daysRemaining === 1) dueText = 'ครบกำหนดพรุ่งนี้';
    if (schedule[task.id]?.critical) dueText += ' · ห้ามล่าช้า';

    slot.innerHTML = `
      <article class="up-next ${urgent ? 'is-urgent' : ''}">
        <div class="un-main">
          <span class="un-tag">${urgent ? 'ควรทำทันที' : 'งานถัดไป'}</span>
          <h2 class="un-title">${escapeHtml(task.name)}</h2>
          <p class="un-meta">${dueText}</p>
        </div>
        <div class="un-actions">
          <button class="btn btn-primary" data-action="done" data-id="${task.id}" type="button">ทำเสร็จแล้ว</button>
          <button class="btn btn-ghost" data-action="edit" data-id="${task.id}" type="button">แก้ไข</button>
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
      <article class="stat-tile"><span class="stat-icon blue" aria-hidden="true">↗</span><div><p class="stat-label">งานที่เหลือ</p><p class="stat-value">${openTasks.length}</p></div></article>
      <article class="stat-tile"><span class="stat-icon amber" aria-hidden="true">◷</span><div><p class="stat-label">กำหนดส่งสุดท้าย</p><p class="stat-value">${finishDate ? date.display(finishDate) : '—'}</p></div></article>
      <article class="stat-tile"><span class="stat-icon red" aria-hidden="true">!</span><div><p class="stat-label">งานที่ห้ามล่าช้า</p><p class="stat-value">${chain.length}</p></div></article>
      <article class="stat-tile"><span class="stat-icon green" aria-hidden="true">✓</span><div><p class="stat-label">ความคืบหน้า</p><p class="stat-value">${progress}%</p></div></article>`;
  }

  function renderTaskList(tasks, schedule) {
    const body = select('#task-list-body');
    const sorted = [...tasks].sort((a, b) => a.done - b.done || date.diffDays(a.dueDate, b.dueDate));
    select('#empty-hint').hidden = sorted.length > 0;
    select('#empty-hint').textContent = SF.auth.currentUser()
      ? 'ยังไม่มีงาน — ลองเพิ่มงานแรกของคุณ'
      : 'เข้าสู่ระบบเพื่อเพิ่มงานและดูรายการของคุณ';
    body.innerHTML = sorted.map((task) => {
      const dependencies = task.deps.map((id) => SF.store.find(id)?.name || 'ไม่พบงาน').join(', ') || '—';
      const status = task.done ? ['เสร็จแล้ว', 'done'] : schedule[task.id]?.critical ? ['ห้ามล่าช้า', 'critical'] : ['ตามแผน', ''];
      return `
        <tr data-id="${task.id}" class="${task.done ? 'is-done' : ''}" tabindex="0">
          <td class="col-check"><input type="checkbox" class="row-check" aria-label="ทำเครื่องหมายว่า ${escapeHtml(task.name)} เสร็จแล้ว" ${task.done ? 'checked' : ''} data-id="${task.id}"></td>
          <td class="task-name">${escapeHtml(task.name)}</td>
          <td><time datetime="${task.dueDate}">${date.display(task.dueDate)}</time></td>
          <td class="task-after">${escapeHtml(dependencies)}</td>
          <td><span class="status-chip ${status[1]}"><span class="status-dot"></span>${status[0]}</span></td>
        </tr>`;
    }).join('');
  }

  SF.dashboard = { render(tasks, schedule) { renderUpNext(tasks, schedule); renderStats(tasks, schedule); renderTaskList(tasks, schedule); } };
})(window.StudyFlow);
