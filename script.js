(function () {
  'use strict';

  const STORAGE_KEY = 'my-deadlines-tasks-v1';
  const NEW_TASK_SENTINEL = '__new__';
  const {
    addDays, computeSchedule, criticalChain, diffDays, formatDate,
    maxDate, parseDate, pertStats, todayStr,
  } = window.ScheduleCore;

  // ---------------- date helpers ----------------
  function fmtDisplay(s) {
    return parseDate(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }
  function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function uid() { return 't' + Math.random().toString(36).slice(2, 9); }

  // ---------------- state ----------------
  let tasks = loadTasks();
  let activeTab = 'dashboard';
  let calMonthStart = (() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
  let modalTaskId = null;   // id of task being edited, or NEW_TASK_SENTINEL, or null when closed
  let modalDraftId = null;  // stable id used for a brand-new task while its modal is open
  let modalDeps = [];
  const expandedCalendarDays = new Set();

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Stored tasks must be an array');
      return parsed
        .filter(t => t && typeof t.id === 'string' && typeof t.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate))
        .map(t => ({
          id: t.id,
          name: t.name,
          dueDate: t.dueDate,
          deps: Array.isArray(t.deps) ? t.deps.filter(id => typeof id === 'string') : [],
          done: Boolean(t.done),
          estimates: pertStats(t),
        }));
    } catch (e) { /* ignore corrupt storage */ }
    return [];
  }
  function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }

  function byId(id) { return tasks.find(t => t.id === id); }

  function dependsOnTransitively(fromId, targetId, list) {
    const map = new Map(list.map(t => [t.id, t]));
    const seen = new Set();
    function dfs(id) {
      if (id === targetId) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      const t = map.get(id);
      if (!t) return false;
      return t.deps.some(dfs);
    }
    return dfs(fromId);
  }

  function levelOf(t, map, memo) {
    if (memo.has(t.id)) return memo.get(t.id);
    memo.set(t.id, 0); // guard against accidental cycles
    let lvl = 0;
    for (const d of t.deps) {
      const dt = map.get(d);
      if (dt) lvl = Math.max(lvl, levelOf(dt, map, memo) + 1);
    }
    memo.set(t.id, lvl);
    return lvl;
  }

  // ---------------- dom refs ----------------
  const $ = (sel) => document.querySelector(sel);
  const upNextSlot = $('#up-next-slot');
  const statsRow = $('#stats-row');
  const taskListBody = $('#task-list-body');
  const emptyHint = $('#empty-hint');
  const toastContainer = $('#toast-container');
  const chartCriticalPath = $('#chart-critical-path');
  const chartWrap = $('#chart-wrap');
  const pertSvg = $('#pert-svg');
  const pertNodes = $('#pert-nodes');
  const chartTooltip = $('#chart-tooltip');
  const chartEmptyHint = $('#chart-empty-hint');
  const calWeekdayRow = $('#cal-weekdays');
  const calGrid = $('#cal-grid');
  const calRangeLabel = $('#cal-range-label');
  const calCritical = $('#cal-critical');

  // ---------------- rendering: dashboard ----------------
  function renderUpNext(schedule) {
    const open = tasks.filter(t => !t.done).sort((a, b) => diffDays(a.dueDate, b.dueDate));
    if (!open.length) {
      upNextSlot.innerHTML = `<div class="up-next is-empty"><div class="un-title">จัดการงานครบแล้ว 🎉</div></div>`;
      return;
    }
    const t = open[0];
    const days = diffDays(t.dueDate, todayStr());
    const urgent = days <= 1;
    const sched = schedule[t.id];
    let metaText;
    if (days < 0) metaText = `เกินกำหนด ${-days} วัน`;
    else if (days === 0) metaText = 'ส่งวันนี้';
    else if (days === 1) metaText = 'ส่งพรุ่งนี้';
    else metaText = `เหลือ ${days} วัน`;
    if (sched && sched.critical) metaText += ' · อยู่บนเส้นทางวิกฤต';

    upNextSlot.innerHTML = `
      <div class="up-next ${urgent ? 'is-urgent' : ''}">
        <div class="un-main">
          <div class="un-tag">${urgent ? 'งานถัดไป · เร่งด่วน' : 'งานถัดไป'}</div>
          <div class="un-title">${escapeHtml(t.name)}</div>
          <div class="un-meta">${metaText}</div>
        </div>
        <div class="un-actions">
          <button class="btn btn-primary" data-action="done" data-id="${t.id}" type="button">เสร็จแล้ว</button>
          <button class="btn btn-ghost" data-action="edit" data-id="${t.id}" type="button">แก้ไข</button>
        </div>
      </div>`;
    upNextSlot.querySelector('[data-action="done"]').addEventListener('click', () => toggleDone(t.id, true));
    upNextSlot.querySelector('[data-action="edit"]').addEventListener('click', () => openModal(t.id));
  }

  function renderStats(schedule) {
    const open = tasks.filter(t => !t.done);
    const doneCount = tasks.length - open.length;
    const allDoneBy = open.length ? open.reduce((m, t) => maxDate(m, t.dueDate), open[0].dueDate) : null;
    const chain = criticalChain(tasks, schedule);
    statsRow.innerHTML = `
      <div class="stat-tile"><div class="stat-label">งานที่เหลือ</div><div class="stat-value">${open.length}</div></div>
      <div class="stat-tile"><div class="stat-label">กำหนดเสร็จทั้งหมด</div><div class="stat-value">${allDoneBy ? fmtDisplay(allDoneBy) : '—'}</div></div>
      <div class="stat-tile crit"><div class="stat-label">เส้นทางวิกฤต</div><div class="stat-value">${chain.length ? chain.map(t => escapeHtml(t.name)).join(' → ') : '—'}</div></div>
      <div class="stat-tile"><div class="stat-label">เสร็จแล้ว</div><div class="stat-value">${doneCount}/${tasks.length}</div></div>
    `;
  }

  function renderTaskList(schedule) {
    const sorted = [...tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return diffDays(a.dueDate, b.dueDate);
    });
    emptyHint.hidden = sorted.length > 0;
    taskListBody.innerHTML = sorted.map(t => {
      const sched = schedule[t.id];
      const after = t.deps.length ? t.deps.map(id => (byId(id) ? byId(id).name : '?')).join(', ') : '—';
      const days = diffDays(t.dueDate, todayStr());
      let statusLabel = 'ปกติ', statusClass = '';
      if (t.done) { statusLabel = 'เสร็จแล้ว'; statusClass = 'done'; }
      else if (days < 0) { statusLabel = 'เกินกำหนด'; statusClass = 'overdue'; }
      else if (days === 0) { statusLabel = 'ส่งวันนี้'; statusClass = 'due-today'; }
      else if (sched && sched.critical) { statusLabel = 'วิกฤต'; statusClass = 'critical'; }
      return `
        <tr data-id="${t.id}" class="${t.done ? 'is-done' : ''}">
          <td class="col-check"><input type="checkbox" class="row-check" ${t.done ? 'checked' : ''} data-id="${t.id}"></td>
          <td class="task-name">${escapeHtml(t.name)}</td>
          <td>${fmtDisplay(t.dueDate)}</td>
          <td class="task-after">${escapeHtml(after)}</td>
          <td><span class="status-chip ${statusClass}">${statusLabel}</span></td>
        </tr>`;
    }).join('');

    taskListBody.querySelectorAll('.row-check').forEach(cb => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', (e) => toggleDone(e.target.dataset.id, e.target.checked));
    });
    taskListBody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => openModal(tr.dataset.id));
    });
  }

  // ---------------- rendering: chart ----------------
  function renderChart(schedule) {
    const chain = criticalChain(tasks, schedule);
    chartCriticalPath.textContent = chain.length ? chain.map(t => t.name).join(' → ') : '—';

    if (!tasks.length) {
      pertNodes.innerHTML = '';
      pertSvg.innerHTML = '';
      chartEmptyHint.hidden = false;
      return;
    }
    chartEmptyHint.hidden = true;

    const map = new Map(tasks.map(t => [t.id, t]));
    const memo = new Map();
    const levels = new Map(tasks.map(t => [t.id, levelOf(t, map, memo)]));
    const cols = new Map();
    for (const t of tasks) {
      const lvl = levels.get(t.id);
      if (!cols.has(lvl)) cols.set(lvl, []);
      cols.get(lvl).push(t);
    }
    for (const arr of cols.values()) arr.sort((a, b) => diffDays(a.dueDate, b.dueDate));

    const COL_W = 180, ROW_H = 88, NODE_W = 140, NODE_H = 58, PAD = 30;
    const maxLevel = Math.max(...tasks.map(t => levels.get(t.id)));
    const maxRows = Math.max(...[...cols.values()].map(a => a.length));
    const widthPx = PAD * 2 + (maxLevel + 1) * COL_W;
    const heightPx = Math.max(340, PAD * 2 + maxRows * ROW_H);

    pertSvg.setAttribute('width', widthPx);
    pertSvg.setAttribute('height', heightPx);
    chartWrap.style.height = heightPx + 'px';
    pertNodes.style.width = widthPx + 'px';
    pertNodes.style.height = heightPx + 'px';

    const pos = {};
    for (const [lvl, arr] of cols.entries()) {
      const colHeight = arr.length * ROW_H;
      const startY = (heightPx - colHeight) / 2;
      arr.forEach((t, i) => {
        pos[t.id] = { x: PAD + lvl * COL_W, y: startY + i * ROW_H + ROW_H / 2 - NODE_H / 2 };
      });
    }

    let edgesSvg = '';
    for (const t of tasks) {
      for (const d of t.deps) {
        const from = pos[d], to = pos[t.id];
        if (!from || !to) continue;
        const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
        const x2 = to.x, y2 = to.y + NODE_H / 2;
        const fromT = byId(d), critEdge = schedule[d] && schedule[t.id] && schedule[d].critical && schedule[t.id].critical && !fromT.done && !t.done;
        edgesSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${critEdge ? '#d64545' : '#c7cad2'}" stroke-width="${critEdge ? 2 : 1.5}" />`;
      }
    }
    pertSvg.innerHTML = edgesSvg;

    pertNodes.innerHTML = tasks.map(t => {
      const sched = schedule[t.id];
      const p = pos[t.id];
      const critical = !t.done && sched && sched.critical;
      return `<div class="pert-node ${critical ? 'critical' : ''} ${t.done ? 'done' : ''}"
                   style="left:${p.x}px;top:${p.y}px;width:${NODE_W}px"
                   data-id="${t.id}">
                <div class="pn-name">${escapeHtml(t.name)}</div>
                <div class="pn-due">ส่ง ${fmtDisplay(t.dueDate)} · ${sched.expected.toFixed(1)} วัน</div>
              </div>`;
    }).join('');

    pertNodes.querySelectorAll('.pert-node').forEach(el => {
      el.addEventListener('mouseenter', (e) => showTooltip(e, el.dataset.id, schedule));
      el.addEventListener('mousemove', (e) => positionTooltip(e));
      el.addEventListener('mouseleave', hideTooltip);
      el.addEventListener('click', () => openModal(el.dataset.id));
    });
  }

  function showTooltip(e, id, schedule) {
    const t = byId(id);
    const sched = schedule[id];
    if (!t || !sched) return;
    const slackText = sched.slack < 0 ? `ช้ากว่าแผน ${-sched.slack} วัน` : `เวลาสำรอง ${sched.slack} วัน`;
    chartTooltip.innerHTML = `<b>${escapeHtml(t.name)}</b><br>ส่ง ${fmtDisplay(t.dueDate)} · คาดการณ์ ${sched.expected.toFixed(1)} วัน<br>${slackText}${sched.critical ? '<br>อยู่บนเส้นทางวิกฤต' : ''}`;
    chartTooltip.hidden = false;
    positionTooltip(e);
  }
  function positionTooltip(e) {
    const rect = chartWrap.getBoundingClientRect();
    chartTooltip.style.left = (e.clientX - rect.left + chartWrap.scrollLeft + 14) + 'px';
    chartTooltip.style.top = (e.clientY - rect.top + chartWrap.scrollTop + 14) + 'px';
  }
  function hideTooltip() { chartTooltip.hidden = true; }

  // ---------------- rendering: calendar ----------------
  const MAX_CHIPS_PER_DAY = 3;

  function renderCalendar(schedule) {
    const monthStart = new Date(calMonthStart.getFullYear(), calMonthStart.getMonth(), 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const gridStart = startOfWeek(monthStart);

    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    while (days.length > 35 && days.slice(-7).every(d => d > monthEnd)) days.splice(-7, 7);

    calRangeLabel.textContent = monthStart.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

    if (!calWeekdayRow.children.length) {
      calWeekdayRow.innerHTML = days.slice(0, 7)
        .map(d => `<div class="cal-weekday">${d.toLocaleDateString('th-TH', { weekday: 'short' })}</div>`)
        .join('');
    }

    const todayS = todayStr();
    calGrid.innerHTML = days.map(d => {
      const ds = formatDate(d);
      const inMonth = d.getMonth() === monthStart.getMonth();
      const dayTasks = tasks.filter(t => t.dueDate === ds).sort((a, b) => a.name.localeCompare(b.name));
      const expanded = expandedCalendarDays.has(ds);
      const shown = expanded ? dayTasks : dayTasks.slice(0, MAX_CHIPS_PER_DAY);
      const extra = dayTasks.length - shown.length;
      const chips = shown.map(t => {
        const sched = schedule[t.id];
        const critical = !t.done && sched && sched.critical;
        return `<div class="cal-task ${critical ? 'critical' : ''} ${t.done ? 'done' : ''}" data-id="${t.id}">${escapeHtml(t.name)}</div>`;
      }).join('') + (extra > 0 ? `<button type="button" class="cal-more" data-date="${ds}">+${extra} งาน</button>` : '');
      return `<div class="cal-day ${ds === todayS ? 'is-today' : ''} ${inMonth ? '' : 'other-month'}">
                <div class="cal-day-label">${d.getDate()}${ds === todayS ? ' · วันนี้' : ''}</div>
                ${chips}
              </div>`;
    }).join('');

    calGrid.querySelectorAll('.cal-task').forEach(el => {
      el.addEventListener('click', () => openModal(el.dataset.id));
    });
    calGrid.querySelectorAll('.cal-more').forEach(el => {
      el.addEventListener('click', () => {
        expandedCalendarDays.add(el.dataset.date);
        renderCalendar(schedule);
      });
    });

    const chain = criticalChain(tasks, schedule);
    calCritical.innerHTML = chain.length
      ? `เส้นทางวิกฤต: <b>${chain.map(t => escapeHtml(t.name)).join(' → ')}</b> — หากงานใดล่าช้า งานถัดไปจะเลื่อนตาม`
      : 'ยังไม่มีเส้นทางวิกฤต — เพิ่มงานที่มีลำดับต่อเนื่องเพื่อดูผล';
  }

  // ---------------- toast ----------------
  function showToast(message, critical) {
    const el = document.createElement('div');
    el.className = 'toast' + (critical ? ' toast-critical' : '');
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function checkUrgentToast(schedule) {
    const urgent = tasks.filter(t => !t.done && diffDays(t.dueDate, todayStr()) <= 0);
    if (urgent.length) {
      showToast(`⚠ มี ${urgent.length} งานที่ส่งวันนี้หรือเกินกำหนด`, true);
    }
  }

  // ---------------- modal ----------------
  const modalBackdrop = $('#modal-backdrop');
  const modalTitle = $('#modal-title');
  const fieldName = $('#field-name');
  const fieldDue = $('#field-due');
  const fieldOptimistic = $('#field-optimistic');
  const fieldMostLikely = $('#field-most-likely');
  const fieldPessimistic = $('#field-pessimistic');
  const dateError = $('#date-error');
  const estimateError = $('#estimate-error');
  const depsChipRow = $('#deps-chip-row');
  const previewBox = $('#preview-box');
  const modalDeleteBtn = $('#modal-delete');

  function openModal(id) {
    modalTaskId = id || NEW_TASK_SENTINEL;
    const editing = byId(id);
    modalDraftId = editing ? editing.id : uid();
    modalDeps = editing ? [...editing.deps] : [];

    const estimates = pertStats(editing || {});
    modalTitle.textContent = editing ? 'แก้ไขงาน' : 'เพิ่มงาน';
    fieldName.value = editing ? editing.name : '';
    fieldDue.value = editing ? editing.dueDate : '';
    fieldOptimistic.value = estimates.optimistic;
    fieldMostLikely.value = estimates.mostLikely;
    fieldPessimistic.value = estimates.pessimistic;
    fieldDue.min = todayStr();
    dateError.hidden = true;
    estimateError.hidden = true;
    modalDeleteBtn.hidden = !editing;

    renderDepsChipRow();
    renderPreview();
    modalBackdrop.hidden = false;
    fieldName.focus();
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    modalTaskId = null;
    modalDraftId = null;
    modalDeps = [];
  }

  function renderDepsChipRow() {
    const selfRealId = byId(modalTaskId) ? modalTaskId : null;
    const candidates = tasks.filter(t => t.id !== selfRealId);
    depsChipRow.innerHTML = candidates.map(c => {
      const selected = modalDeps.includes(c.id);
      const wouldLoop = selfRealId && dependsOnTransitively(c.id, selfRealId, tasks);
      const cls = wouldLoop ? 'disabled' : (selected ? 'selected' : '');
      return `<button type="button" class="dep-chip ${cls}" data-id="${c.id}" title="${escapeHtml(c.name)}" ${wouldLoop ? 'disabled' : ''}>${escapeHtml(c.name)}</button>`;
    }).join('') || '<span class="field-hint">ยังไม่มีงานอื่น</span>';

    depsChipRow.querySelectorAll('.dep-chip:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (modalDeps.includes(id)) modalDeps = modalDeps.filter(d => d !== id);
        else modalDeps.push(id);
        renderDepsChipRow();
        renderPreview();
      });
    });
  }

  function renderPreview() {
    const name = fieldName.value.trim() || 'งานนี้';
    const due = fieldDue.value;
    if (!due) {
      previewBox.innerHTML = `<div class="pv-line">เลือกวันส่งเพื่อดูตัวอย่างแผนงาน</div>`;
      return;
    }
    const estimates = readEstimateInputs(false) || { optimistic: 1, mostLikely: 1, pessimistic: 1 };
    const draft = { id: modalDraftId, name, dueDate: due, deps: modalDeps, done: false, estimates };
    const others = tasks.filter(t => t.id !== modalDraftId);
    const tempList = [...others, draft];
    const schedule = computeSchedule(tempList);
    const sched = schedule[modalDraftId];
    const slackText = sched.slack < 0
      ? `<span class="pv-critical">ช้ากว่าแผน ${-sched.slack} วัน</span>`
      : `เวลาสำรอง ${sched.slack} วัน`;
    previewBox.innerHTML = `
      <div class="pv-line">ระยะเวลาคาดการณ์ PERT: ${sched.expected.toFixed(1)} วัน</div>
      <div class="pv-line">เสร็จเร็วที่สุด: ${fmtDisplay(sched.asap)}</div>
      <div class="pv-line">${slackText}</div>
      <div class="pv-line ${sched.critical ? 'pv-critical' : ''}">${sched.critical ? 'อยู่บนเส้นทางวิกฤต' : 'ไม่อยู่บนเส้นทางวิกฤต'}</div>
    `;
  }

  function readEstimateInputs(showError) {
    const optimistic = Number(fieldOptimistic.value);
    const mostLikely = Number(fieldMostLikely.value);
    const pessimistic = Number(fieldPessimistic.value);
    const valid = [optimistic, mostLikely, pessimistic].every(n => Number.isInteger(n) && n >= 1 && n <= 365)
      && optimistic <= mostLikely && mostLikely <= pessimistic;
    estimateError.hidden = valid || !showError;
    estimateError.textContent = valid ? '' : 'กรอกจำนวนวัน 1–365 และให้ O ≤ M ≤ P';
    return valid ? { optimistic, mostLikely, pessimistic } : null;
  }

  function saveModal() {
    const name = fieldName.value.trim();
    const due = fieldDue.value;
    if (!name) { fieldName.focus(); return; }
    if (!due) { fieldDue.focus(); return; }
    if (due < todayStr()) {
      dateError.textContent = 'กำหนดส่งต้องไม่เร็วกว่าวันนี้';
      dateError.hidden = false;
      fieldDue.focus();
      return;
    }
    dateError.hidden = true;
    const estimates = readEstimateInputs(true);
    if (!estimates) { fieldOptimistic.focus(); return; }
    const editing = byId(modalTaskId);
    if (editing) {
      editing.name = name;
      editing.dueDate = due;
      editing.deps = [...modalDeps];
      editing.estimates = estimates;
    } else {
      tasks.push({ id: modalDraftId, name, dueDate: due, deps: [...modalDeps], done: false, estimates });
    }
    saveTasks();
    closeModal();
    renderAll();
  }

  function deleteModalTask() {
    const editing = byId(modalTaskId);
    if (!editing) return;
    if (!confirm(`ลบงาน "${editing.name}" หรือไม่?`)) return;
    tasks = tasks.filter(t => t.id !== editing.id);
    tasks.forEach(t => { t.deps = t.deps.filter(d => d !== editing.id); });
    saveTasks();
    closeModal();
    renderAll();
  }

  function toggleDone(id, done) {
    const t = byId(id);
    if (!t) return;
    t.done = done;
    saveTasks();
    renderAll();
  }

  // ---------------- tabs ----------------
  function setActiveTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      const selected = b.dataset.tab === tab;
      b.classList.toggle('active', selected);
      b.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  }

  // ---------------- master render ----------------
  function renderAll() {
    const schedule = computeSchedule(tasks);
    renderUpNext(schedule);
    renderStats(schedule);
    renderTaskList(schedule);
    renderChart(schedule);
    renderCalendar(schedule);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------- wire up events ----------------
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
  $('#add-task-btn').addEventListener('click', () => openModal(null));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-save').addEventListener('click', saveModal);
  modalDeleteBtn.addEventListener('click', deleteModalTask);
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });
  fieldName.addEventListener('input', renderPreview);
  fieldDue.addEventListener('input', () => { dateError.hidden = true; renderPreview(); });
  [fieldOptimistic, fieldMostLikely, fieldPessimistic].forEach(field => {
    field.addEventListener('input', () => { estimateError.hidden = true; renderPreview(); });
  });

  $('#cal-prev').addEventListener('click', () => { calMonthStart.setMonth(calMonthStart.getMonth() - 1); renderCalendar(computeSchedule(tasks)); });
  $('#cal-next').addEventListener('click', () => { calMonthStart.setMonth(calMonthStart.getMonth() + 1); renderCalendar(computeSchedule(tasks)); });
  $('#cal-today').addEventListener('click', () => { const t = new Date(); calMonthStart = new Date(t.getFullYear(), t.getMonth(), 1); renderCalendar(computeSchedule(tasks)); });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalBackdrop.hidden) closeModal(); });

  // ---------------- init ----------------
  renderAll();
  checkUrgentToast(computeSchedule(tasks));
})();
