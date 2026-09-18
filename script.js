(function () {
  'use strict';

  const STORAGE_KEY = 'my-deadlines-tasks-v1';
  const NEW_TASK_SENTINEL = '__new__';

  // ---------------- date helpers ----------------
  function formatDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function todayStr() { return formatDate(new Date()); }
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(s, n) {
    const d = parseDate(s);
    d.setDate(d.getDate() + n);
    return formatDate(d);
  }
  function diffDays(a, b) { return Math.round((parseDate(a) - parseDate(b)) / 86400000); }
  function maxDate(a, b) { return diffDays(a, b) >= 0 ? a : b; }
  function minDate(a, b) { return diffDays(a, b) <= 0 ? a : b; }
  function fmtDisplay(s) {
    return parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
  let calWeekStart = startOfWeek(new Date());
  let modalTaskId = null;   // id of task being edited, or NEW_TASK_SENTINEL, or null when closed
  let modalDraftId = null;  // stable id used for a brand-new task while its modal is open
  let modalDeps = [];

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupt storage */ }
    return seedTasks();
  }
  function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }

  function seedTasks() {
    const t = todayStr();
    const mk = (id, name, dueOffset, deps) => ({ id, name, dueDate: addDays(t, dueOffset), deps, done: false });
    return [
      mk('a', 'Literature review draft', 3, []),
      mk('c', 'Essay first draft', 5, ['a']),
      mk('b', 'Lab report data collection', 6, ['a']),
      mk('d', 'Reading response', 7, []),
      mk('e', 'Final presentation', 9, ['c', 'b']),
      mk('f', 'Group check-in notes', 10, []),
    ];
  }

  function byId(id) { return tasks.find(t => t.id === id); }

  // ---------------- scheduling (CPM-ish over due dates) ----------------
  function topoOrder(list) {
    const map = new Map(list.map(t => [t.id, t]));
    const seen = new Set();
    const order = [];
    function visit(id) {
      if (seen.has(id)) return;
      seen.add(id);
      const t = map.get(id);
      if (t) for (const d of t.deps) visit(d);
      order.push(id);
    }
    for (const t of list) visit(t.id);
    return order;
  }

  function computeSchedule(list) {
    const map = new Map(list.map(t => [t.id, t]));
    const order = topoOrder(list);
    const today = todayStr();
    const asap = {};
    for (const id of order) {
      const t = map.get(id);
      if (!t) continue;
      if (!t.deps.length) { asap[id] = today; continue; }
      let latest = null;
      for (const d of t.deps) {
        const v = asap[d] !== undefined ? addDays(asap[d], 1) : today;
        latest = latest === null ? v : maxDate(latest, v);
      }
      asap[id] = latest;
    }

    const dependents = new Map(list.map(t => [t.id, []]));
    for (const t of list) for (const d of t.deps) if (dependents.has(d)) dependents.get(d).push(t.id);

    const alap = {};
    for (const id of [...order].reverse()) {
      const t = map.get(id);
      if (!t) continue;
      const deps2 = dependents.get(id) || [];
      if (!deps2.length) { alap[id] = t.dueDate; continue; }
      let earliest = null;
      for (const u of deps2) {
        const v = alap[u] !== undefined ? addDays(alap[u], -1) : t.dueDate;
        earliest = earliest === null ? v : minDate(earliest, v);
      }
      alap[id] = minDate(earliest, t.dueDate);
    }

    const result = {};
    for (const t of list) {
      const slack = diffDays(alap[t.id], asap[t.id]);
      result[t.id] = { asap: asap[t.id], alap: alap[t.id], slack, critical: slack <= 0 };
    }
    return result;
  }

  function criticalChain(list, schedule) {
    const map = new Map(list.map(t => [t.id, t]));
    const criticalIds = list.filter(t => !t.done && schedule[t.id] && schedule[t.id].critical).map(t => t.id);
    const criticalSet = new Set(criticalIds);
    const childrenOf = new Map(criticalIds.map(id => [id, []]));
    for (const t of list) {
      if (!criticalSet.has(t.id)) continue;
      for (const d of t.deps) if (criticalSet.has(d)) childrenOf.get(d).push(t.id);
    }
    const memo = new Map();
    function longestFrom(id) {
      if (memo.has(id)) return memo.get(id);
      let best = [id];
      for (const k of childrenOf.get(id) || []) {
        const path = longestFrom(k);
        if (path.length + 1 > best.length) best = [id, ...path];
      }
      memo.set(id, best);
      return best;
    }
    let bestOverall = [];
    for (const id of criticalIds) {
      const p = longestFrom(id);
      if (p.length > bestOverall.length) bestOverall = p;
    }
    return bestOverall.map(id => map.get(id));
  }

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
  const calGrid = $('#cal-grid');
  const calRangeLabel = $('#cal-range-label');
  const calCritical = $('#cal-critical');

  // ---------------- rendering: dashboard ----------------
  function renderUpNext(schedule) {
    const open = tasks.filter(t => !t.done).sort((a, b) => diffDays(a.dueDate, b.dueDate));
    if (!open.length) {
      upNextSlot.innerHTML = `<div class="up-next is-empty"><div class="un-title">You're all caught up 🎉</div></div>`;
      return;
    }
    const t = open[0];
    const days = diffDays(t.dueDate, todayStr());
    const urgent = days <= 1;
    const sched = schedule[t.id];
    let metaText;
    if (days < 0) metaText = `overdue by ${-days} day${-days === 1 ? '' : 's'}`;
    else if (days === 0) metaText = 'due today';
    else if (days === 1) metaText = 'due tomorrow';
    else metaText = `due in ${days} days`;
    if (sched && sched.critical) metaText += ' · critical path';

    upNextSlot.innerHTML = `
      <div class="up-next ${urgent ? 'is-urgent' : ''}">
        <div class="un-main">
          <div class="un-tag">${urgent ? 'up next · urgent' : 'up next'}</div>
          <div class="un-title">${escapeHtml(t.name)}</div>
          <div class="un-meta">${metaText}</div>
        </div>
        <div class="un-actions">
          <button class="btn btn-primary" data-action="done" data-id="${t.id}" type="button">mark done</button>
          <button class="btn btn-ghost" data-action="edit" data-id="${t.id}" type="button">edit</button>
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
      <div class="stat-tile"><div class="stat-label">tasks left</div><div class="stat-value">${open.length}</div></div>
      <div class="stat-tile"><div class="stat-label">all done by</div><div class="stat-value">${allDoneBy ? fmtDisplay(allDoneBy) : '—'}</div></div>
      <div class="stat-tile crit"><div class="stat-label">critical path</div><div class="stat-value">${chain.length ? chain.map(t => escapeHtml(t.name)).join(' → ') : '—'}</div></div>
      <div class="stat-tile"><div class="stat-label">done</div><div class="stat-value">${doneCount}/${tasks.length}</div></div>
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
      let statusLabel = 'normal', statusClass = '';
      if (t.done) { statusLabel = 'done'; statusClass = 'done'; }
      else if (sched && sched.critical) { statusLabel = 'critical'; statusClass = 'critical'; }
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
                <div class="pn-due">due ${fmtDisplay(t.dueDate)}</div>
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
    const slackText = sched.slack < 0 ? `${-sched.slack} day(s) behind` : `${sched.slack} day(s) slack`;
    chartTooltip.innerHTML = `<b>${escapeHtml(t.name)}</b><br>due ${fmtDisplay(t.dueDate)} · ${slackText}${sched.critical ? '<br>on critical path' : ''}`;
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
  function renderCalendar(schedule) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(calWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    const rangeStart = days[0], rangeEnd = days[6];
    const sameMonth = rangeStart.getMonth() === rangeEnd.getMonth();
    const opts = { day: 'numeric', month: 'short' };
    calRangeLabel.textContent = sameMonth
      ? `${rangeStart.getDate()} – ${rangeEnd.toLocaleDateString(undefined, opts)}`
      : `${rangeStart.toLocaleDateString(undefined, opts)} – ${rangeEnd.toLocaleDateString(undefined, opts)}`;

    const todayS = todayStr();
    calGrid.innerHTML = days.map(d => {
      const ds = formatDate(d);
      const dayTasks = tasks.filter(t => t.dueDate === ds).sort((a, b) => a.name.localeCompare(b.name));
      const label = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
      const chips = dayTasks.map(t => {
        const sched = schedule[t.id];
        const critical = !t.done && sched && sched.critical;
        return `<div class="cal-task ${critical ? 'critical' : ''} ${t.done ? 'done' : ''}" data-id="${t.id}">${escapeHtml(t.name)}</div>`;
      }).join('');
      return `<div class="cal-day ${ds === todayS ? 'is-today' : ''}">
                <div class="cal-day-label">${label}${ds === todayS ? ' · today' : ''}</div>
                ${chips}
              </div>`;
    }).join('');

    calGrid.querySelectorAll('.cal-task').forEach(el => {
      el.addEventListener('click', () => openModal(el.dataset.id));
    });

    const chain = criticalChain(tasks, schedule);
    calCritical.innerHTML = chain.length
      ? `critical path: <b>${chain.map(t => escapeHtml(t.name)).join(' → ')}</b> — slip one of these and everything moves`
      : 'no critical chain yet — add dependent tasks to see one';
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
      showToast(`⚠ You have ${urgent.length} task${urgent.length === 1 ? '' : 's'} due today or overdue`, true);
    }
  }

  // ---------------- modal ----------------
  const modalBackdrop = $('#modal-backdrop');
  const modalTitle = $('#modal-title');
  const fieldName = $('#field-name');
  const fieldDue = $('#field-due');
  const depsChipRow = $('#deps-chip-row');
  const previewBox = $('#preview-box');
  const modalDeleteBtn = $('#modal-delete');

  function openModal(id) {
    modalTaskId = id || NEW_TASK_SENTINEL;
    const editing = byId(id);
    modalDraftId = editing ? editing.id : uid();
    modalDeps = editing ? [...editing.deps] : [];

    modalTitle.textContent = editing ? 'edit task' : 'new task';
    fieldName.value = editing ? editing.name : '';
    fieldDue.value = editing ? editing.dueDate : '';
    fieldDue.min = todayStr();
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
    }).join('') || '<span class="field-hint">no other tasks yet</span>';

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
    const name = fieldName.value.trim() || 'this task';
    const due = fieldDue.value;
    if (!due) {
      previewBox.innerHTML = `<div class="pv-line">pick a due date to see the schedule preview</div>`;
      return;
    }
    const draft = { id: modalDraftId, name, dueDate: due, deps: modalDeps, done: false };
    const others = tasks.filter(t => t.id !== modalDraftId);
    const tempList = [...others, draft];
    const schedule = computeSchedule(tempList);
    const sched = schedule[modalDraftId];
    const slackText = sched.slack < 0
      ? `<span class="pv-critical">${-sched.slack} day(s) behind schedule</span>`
      : `slack ${sched.slack} day(s)`;
    previewBox.innerHTML = `
      <div class="pv-line">earliest realistic finish: ${fmtDisplay(sched.asap)}</div>
      <div class="pv-line">${slackText}</div>
      <div class="pv-line ${sched.critical ? 'pv-critical' : ''}">${sched.critical ? 'on the critical path' : 'not on the critical path'}</div>
    `;
  }

  function saveModal() {
    const name = fieldName.value.trim();
    const due = fieldDue.value;
    if (!name) { fieldName.focus(); return; }
    if (!due) { fieldDue.focus(); return; }
    const editing = byId(modalTaskId);
    if (editing) {
      editing.name = name;
      editing.dueDate = due;
      editing.deps = [...modalDeps];
    } else {
      tasks.push({ id: modalDraftId, name, dueDate: due, deps: [...modalDeps], done: false });
    }
    saveTasks();
    closeModal();
    renderAll();
  }

  function deleteModalTask() {
    const editing = byId(modalTaskId);
    if (!editing) return;
    if (!confirm(`Delete "${editing.name}"?`)) return;
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
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
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
  fieldDue.addEventListener('input', renderPreview);

  $('#cal-prev').addEventListener('click', () => { calWeekStart.setDate(calWeekStart.getDate() - 7); renderCalendar(computeSchedule(tasks)); });
  $('#cal-next').addEventListener('click', () => { calWeekStart.setDate(calWeekStart.getDate() + 7); renderCalendar(computeSchedule(tasks)); });
  $('#cal-today').addEventListener('click', () => { calWeekStart = startOfWeek(new Date()); renderCalendar(computeSchedule(tasks)); });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalBackdrop.hidden) closeModal(); });

  // ---------------- init ----------------
  renderAll();
  checkUrgentToast(computeSchedule(tasks));
})();
