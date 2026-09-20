(function (SF) {
  'use strict';

  const { select, escapeHtml } = SF.utils;
  let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  function render(tasks, schedule) {
    const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const gridStart = SF.date.startOfWeek(monthStart);
    const days = Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(day.getDate() + index);
      return day;
    });
    while (days.length > 35 && days.slice(-7).every((day) => day > monthEnd)) days.splice(-7, 7);

    select('#cal-range-label').textContent = monthStart.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const weekdays = select('#cal-weekdays');
    if (!weekdays.children.length) {
      weekdays.innerHTML = days.slice(0, 7).map((day) => `<div class="cal-weekday">${day.toLocaleDateString('th-TH', { weekday: 'short' })}</div>`).join('');
    }

    select('#cal-grid').innerHTML = days.map((day) => {
      const value = SF.date.format(day);
      const inMonth = day.getMonth() === monthStart.getMonth();
      const dayTasks = tasks.filter((task) => task.dueDate === value).sort((a, b) => a.name.localeCompare(b.name));
      const shown = dayTasks.slice(0, SF.config.maxCalendarTasks);
      const chips = shown.map((task) => {
        const critical = !task.done && schedule[task.id]?.critical;
        return `<button class="cal-task ${critical ? 'critical' : ''} ${task.done ? 'done' : ''}" data-id="${task.id}" type="button">${escapeHtml(task.name)}</button>`;
      }).join('');
      const overflow = dayTasks.length - shown.length;
      return `<div class="cal-day ${value === SF.date.today() ? 'is-today' : ''} ${inMonth ? '' : 'other-month'}"><div class="cal-day-label"><time datetime="${value}">${day.getDate()}</time>${value === SF.date.today() ? '<span>วันนี้</span>' : ''}</div>${chips}${overflow > 0 ? `<span class="cal-more">อีก ${overflow} งาน</span>` : ''}</div>`;
    }).join('');

    const chain = SF.scheduler.criticalChain(tasks, schedule);
    select('#cal-critical').innerHTML = chain.length
      ? `<span class="critical-indicator">!</span><div><strong>ลำดับงานที่ห้ามล่าช้า</strong><p>${chain.map((task) => escapeHtml(task.name)).join(' → ')}</p></div>`
      : '<span class="critical-indicator neutral">✓</span><div><strong>ยังไม่มีงานที่เสี่ยงทำให้แผนล่าช้า</strong><p>เพิ่มงานที่ต้องทำต่อกันเพื่อให้ระบบช่วยตรวจสอบลำดับงาน</p></div>';
  }

  SF.calendar = {
    render,
    move(months) { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + months, 1); SF.app.render(); },
    today() { const now = new Date(); visibleMonth = new Date(now.getFullYear(), now.getMonth(), 1); SF.app.render(); },
  };
})(window.StudyFlow);
