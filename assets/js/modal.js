(function (SF) {
  'use strict';

  const { select, selectAll, escapeHtml, uid } = SF.utils;
  let taskId = null;
  let draftId = null;
  let dependencies = [];

  const refs = {};
  function cacheRefs() {
    refs.backdrop = select('#modal-backdrop');
    refs.title = select('#modal-title');
    refs.name = select('#field-name');
    refs.due = select('#field-due');
    refs.chips = select('#deps-chip-row');
    refs.preview = select('#preview-box');
    refs.deleteButton = select('#modal-delete');
  }

  function open(id) {
    if (!SF.auth.requireAuth()) return;
    const editing = SF.store.find(id);
    taskId = editing?.id || SF.config.newTaskId;
    draftId = editing?.id || uid();
    dependencies = editing ? [...editing.deps] : [];
    refs.title.textContent = editing ? 'แก้ไขงาน' : 'เพิ่มงานใหม่';
    refs.name.value = editing?.name || '';
    refs.due.value = editing?.dueDate || '';
    refs.due.min = SF.date.today();
    refs.deleteButton.hidden = !editing;
    renderDependencies();
    renderPreview();
    refs.backdrop.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => refs.name.focus());
  }

  function close() {
    refs.backdrop.hidden = true;
    document.body.classList.remove('modal-open');
    taskId = null;
    draftId = null;
    dependencies = [];
  }

  function renderDependencies() {
    const realId = SF.store.find(taskId)?.id || null;
    const candidates = SF.store.all().filter((task) => task.id !== realId);
    refs.chips.innerHTML = candidates.map((candidate) => {
      const selected = dependencies.includes(candidate.id);
      const createsLoop = realId && SF.scheduler.dependsOn(candidate.id, realId, SF.store.all());
      return `<button type="button" class="dep-chip ${selected ? 'selected' : ''}" data-id="${candidate.id}" ${createsLoop ? 'disabled' : ''} aria-pressed="${selected}">${escapeHtml(candidate.name)}</button>`;
    }).join('') || '<span class="field-hint">เพิ่มงานอื่นก่อน จึงจะเลือกลำดับงานได้</span>';
  }

  function toggleDependency(id) {
    dependencies = dependencies.includes(id)
      ? dependencies.filter((dependency) => dependency !== id)
      : [...dependencies, id];
    renderDependencies();
    renderPreview();
  }

  function renderPreview() {
    const dueDate = refs.due.value;
    if (!dueDate) {
      refs.preview.innerHTML = '<p class="pv-empty">เลือกกำหนดส่งเพื่อดูว่าแผนงานเป็นอย่างไร</p>';
      return;
    }
    const draft = { id: draftId, name: refs.name.value.trim() || 'งานนี้', dueDate, deps: dependencies, done: false };
    const schedule = SF.scheduler.compute([...SF.store.all().filter((task) => task.id !== draftId), draft]);
    const timing = schedule[draftId];
    const slack = timing.slack < 0 ? `ช้ากว่าแผน ${-timing.slack} วัน` : `เลื่อนได้อีก ${timing.slack} วัน`;
    refs.preview.innerHTML = `<div class="preview-item"><span>เริ่มได้เร็วที่สุด</span><strong>${SF.date.display(timing.asap)}</strong></div><div class="preview-item"><span>สถานะของแผน</span><strong class="${timing.critical ? 'pv-critical' : ''}">${slack}</strong></div>`;
  }

  function save() {
    const name = refs.name.value.trim();
    const dueDate = refs.due.value;
    refs.name.removeAttribute('aria-invalid');
    refs.due.removeAttribute('aria-invalid');
    if (!name) { refs.name.setAttribute('aria-invalid', 'true'); refs.name.focus(); return; }
    if (!dueDate) { refs.due.setAttribute('aria-invalid', 'true'); refs.due.focus(); return; }
    const previous = SF.store.find(taskId);
    SF.store.save({ id: draftId, name, dueDate, deps: [...dependencies], done: previous?.done || false });
    close();
    SF.app.render();
    SF.app.toast(previous ? 'แก้ไขงานเรียบร้อยแล้ว' : 'เพิ่มงานในแผนเรียบร้อยแล้ว');
  }

  function remove() {
    const task = SF.store.find(taskId);
    if (!task || !confirm(`ต้องการลบ “${task.name}” หรือไม่?`)) return;
    SF.store.remove(task.id);
    close();
    SF.app.render();
    SF.app.toast('ลบงานเรียบร้อยแล้ว');
  }

  function init() {
    cacheRefs();
    select('#modal-close').addEventListener('click', close);
    select('#modal-cancel').addEventListener('click', close);
    select('#modal-save').addEventListener('click', save);
    refs.deleteButton.addEventListener('click', remove);
    refs.backdrop.addEventListener('click', (event) => { if (event.target === refs.backdrop) close(); });
    refs.name.addEventListener('input', renderPreview);
    refs.due.addEventListener('input', renderPreview);
    refs.chips.addEventListener('click', (event) => {
      const chip = event.target.closest('.dep-chip');
      if (chip && !chip.disabled) toggleDependency(chip.dataset.id);
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !refs.backdrop.hidden) close(); });
  }

  SF.modal = { init, open, close };
})(window.StudyFlow);
