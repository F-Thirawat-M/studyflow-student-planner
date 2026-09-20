(function (SF) {
  'use strict';

  const { date } = SF;

  function topologicalOrder(tasks) {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    function visit(id) {
      if (visited.has(id) || visiting.has(id)) return;
      visiting.add(id);
      const task = taskById.get(id);
      task?.deps.forEach(visit);
      visiting.delete(id);
      visited.add(id);
      order.push(id);
    }

    tasks.forEach((task) => visit(task.id));
    return order;
  }

  function compute(tasks) {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const order = topologicalOrder(tasks);
    const earliest = {};
    const latest = {};

    order.forEach((id) => {
      const task = taskById.get(id);
      const dependencyDates = task.deps
        .filter((dependency) => earliest[dependency])
        .map((dependency) => date.addDays(earliest[dependency], 1));
      earliest[id] = dependencyDates.length
        ? dependencyDates.reduce((result, value) => date.max(result, value))
        : date.today();
    });

    const dependents = new Map(tasks.map((task) => [task.id, []]));
    tasks.forEach((task) => task.deps.forEach((dependency) => dependents.get(dependency)?.push(task.id)));

    [...order].reverse().forEach((id) => {
      const task = taskById.get(id);
      const dependentDates = (dependents.get(id) || [])
        .filter((dependent) => latest[dependent])
        .map((dependent) => date.addDays(latest[dependent], -1));
      const dependentLimit = dependentDates.length
        ? dependentDates.reduce((result, value) => date.min(result, value))
        : task.dueDate;
      latest[id] = date.min(dependentLimit, task.dueDate);
    });

    return Object.fromEntries(tasks.map((task) => {
      const slack = date.diffDays(latest[task.id], earliest[task.id]);
      return [task.id, { asap: earliest[task.id], alap: latest[task.id], slack, critical: slack <= 0 }];
    }));
  }

  function criticalChain(tasks, schedule) {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const criticalIds = tasks
      .filter((task) => !task.done && schedule[task.id]?.critical)
      .map((task) => task.id);
    const criticalSet = new Set(criticalIds);
    const children = new Map(criticalIds.map((id) => [id, []]));
    tasks.forEach((task) => task.deps.forEach((dependency) => {
      if (criticalSet.has(task.id) && criticalSet.has(dependency)) children.get(dependency).push(task.id);
    }));

    const memo = new Map();
    function longestFrom(id) {
      if (memo.has(id)) return memo.get(id);
      let best = [id];
      (children.get(id) || []).forEach((child) => {
        const path = longestFrom(child);
        if (path.length + 1 > best.length) best = [id, ...path];
      });
      memo.set(id, best);
      return best;
    }

    return criticalIds
      .map(longestFrom)
      .reduce((best, path) => path.length > best.length ? path : best, [])
      .map((id) => taskById.get(id));
  }

  function dependsOn(fromId, targetId, tasks) {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const visited = new Set();
    function search(id) {
      if (id === targetId) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      return taskById.get(id)?.deps.some(search) || false;
    }
    return search(fromId);
  }

  function levelOf(task, taskById, memo) {
    if (memo.has(task.id)) return memo.get(task.id);
    memo.set(task.id, 0);
    const level = task.deps.reduce((maximum, dependency) => {
      const dependencyTask = taskById.get(dependency);
      return dependencyTask ? Math.max(maximum, levelOf(dependencyTask, taskById, memo) + 1) : maximum;
    }, 0);
    memo.set(task.id, level);
    return level;
  }

  SF.scheduler = { compute, criticalChain, dependsOn, levelOf };
})(window.StudyFlow);
