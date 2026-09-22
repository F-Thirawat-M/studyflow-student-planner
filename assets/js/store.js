(function (SF) {
  'use strict';

  function normalizeTask(task) {
    return {
      id: String(task.id || SF.utils.uid()),
      name: String(task.name || '').trim(),
      dueDate: String(task.dueDate || ''),
      deps: Array.isArray(task.deps) ? [...new Set(task.deps.map(String))] : [],
      done: Boolean(task.done),
    };
  }

  // cache ในหน่วยความจำ: view อ่านแบบ sync ส่วนการเขียนขึ้น Supabase ทำเบื้องหลังตามลำดับ
  let tasks = [];
  let activeUserId = null;
  let version = 0;          // เพิ่มทุกครั้งที่แก้ cache เพื่อไม่ให้ผลโหลดจากเซิร์ฟเวอร์ที่ช้ากว่าไปทับ
  let pendingWrites = 0;
  let needsReload = false;
  let writeQueue = Promise.resolve();

  async function fetchTasks() {
    const [taskResult, dependencyResult] = await Promise.all([
      SF.db.from('tasks').select('id, name, due_date, done').order('created_at'),
      SF.db.from('task_dependencies').select('task_id, depends_on_id'),
    ]);
    const error = taskResult.error || dependencyResult.error;
    if (error) throw error;
    const depsByTask = new Map();
    dependencyResult.data.forEach(({ task_id: taskId, depends_on_id: dependencyId }) => {
      depsByTask.set(taskId, [...(depsByTask.get(taskId) || []), dependencyId]);
    });
    return taskResult.data
      .map((row) => normalizeTask({ id: row.id, name: row.name, dueDate: row.due_date, done: row.done, deps: depsByTask.get(row.id) }))
      .filter((task) => task.name && task.dueDate);
  }

  // คืน false ถ้ามีการแก้ cache ระหว่างรอ (ผลที่ได้เก่าไปแล้ว จึงไม่นำมาใช้)
  async function reload() {
    const startVersion = version;
    const fetched = await fetchTasks();
    if (version !== startVersion) return false;
    tasks = fetched;
    return true;
  }

  function isSessionError({ error, status }) {
    return status === 401 || ['PGRST301', 'PGRST303'].includes(error?.code);
  }

  async function handleFailure(failure) {
    if (isSessionError(failure)) {
      await SF.auth.expire();
      return;
    }
    // ไม่ปล่อยให้งานที่บันทึกไม่สำเร็จค้างใน cache — ต้องโหลดใหม่หลังคิวหมด
    needsReload = true;
    SF.app.toast('บันทึกไม่สำเร็จ ระบบจะโหลดข้อมูลล่าสุดจากเซิร์ฟเวอร์', true);
  }

  async function reloadAfterFailure() {
    needsReload = false;
    try {
      if (await reload()) SF.app.render();
      else needsReload = true;   // มีการแก้ระหว่างโหลด: ลองใหม่เมื่อคิวถัดไปเสร็จ
    } catch {
      needsReload = true;
    }
  }

  function enqueue(operation) {
    pendingWrites += 1;
    writeQueue = writeQueue.then(async () => {
      let failure = null;
      try {
        const { error, status } = await operation();
        if (error) failure = { error, status };
      } catch (error) {
        failure = { error, status: 0 };
      }
      if (failure) await handleFailure(failure);
      pendingWrites -= 1;
      if (pendingWrites === 0 && needsReload && activeUserId) await reloadAfterFailure();
    });
  }

  // กลับมาที่แท็บนี้ → ดึงข้อมูลล่าสุด (รองรับการแก้จากแท็บ/เครื่องอื่น)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !activeUserId || pendingWrites > 0) return;
    try {
      if (await reload()) SF.app.render();
    } catch {
      // โหลดไม่ได้ก็ใช้ข้อมูลใน cache ต่อไป
    }
  });

  SF.store = {
    all: () => tasks,
    find: (id) => tasks.find((task) => task.id === id),
    async useAccount(userId) {
      const startVersion = version;
      const fetched = await fetchTasks();
      // อาจออกจากระบบระหว่างรอข้อมูล อย่านำงานของเซสชันเดิมกลับมาแสดง
      if (version !== startVersion) return false;
      tasks = fetched;
      activeUserId = userId;
      version += 1;
      return true;
    },
    clear() {
      tasks = [];
      activeUserId = null;
      needsReload = false;
      version += 1;
    },
    // รอให้การเขียนที่ค้างอยู่เสร็จ (เรียกก่อนออกจากระบบ)
    flush: () => writeQueue,
    save(task) {
      const cleanTask = normalizeTask(task);
      const index = tasks.findIndex((item) => item.id === cleanTask.id);
      if (index === -1) tasks.push(cleanTask);
      else tasks[index] = cleanTask;
      version += 1;
      enqueue(() => SF.db.rpc('save_task', {
        p_id: cleanTask.id,
        p_name: cleanTask.name,
        p_due_date: cleanTask.dueDate,
        p_done: cleanTask.done,
        p_deps: cleanTask.deps,
      }));
      return cleanTask;
    },
    remove(id) {
      tasks = tasks
        .filter((task) => task.id !== id)
        .map((task) => ({ ...task, deps: task.deps.filter((dependency) => dependency !== id) }));
      version += 1;
      // dependency ที่ชี้มางานนี้ถูกลบตามด้วย on delete cascade
      enqueue(() => SF.db.from('tasks').delete().eq('id', id));
    },
    setDone(id, done) {
      const task = this.find(id);
      if (!task) return;
      task.done = Boolean(done);
      version += 1;
      enqueue(() => SF.db.from('tasks').update({ done: task.done }).eq('id', id));
    },
  };
})(window.StudyFlow);
