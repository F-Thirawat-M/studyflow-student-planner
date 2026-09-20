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

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SF.config.storageKey));
      return Array.isArray(saved) ? saved.map(normalizeTask).filter((task) => task.name && task.dueDate) : [];
    } catch {
      return [];
    }
  }

  let tasks = load();
  const persist = () => localStorage.setItem(SF.config.storageKey, JSON.stringify(tasks));

  SF.store = {
    all: () => tasks,
    find: (id) => tasks.find((task) => task.id === id),
    save(task) {
      const cleanTask = normalizeTask(task);
      const index = tasks.findIndex((item) => item.id === cleanTask.id);
      if (index === -1) tasks.push(cleanTask);
      else tasks[index] = cleanTask;
      persist();
      return cleanTask;
    },
    remove(id) {
      tasks = tasks
        .filter((task) => task.id !== id)
        .map((task) => ({ ...task, deps: task.deps.filter((dependency) => dependency !== id) }));
      persist();
    },
    setDone(id, done) {
      const task = this.find(id);
      if (!task) return;
      task.done = Boolean(done);
      persist();
    },
  };
})(window.StudyFlow);
