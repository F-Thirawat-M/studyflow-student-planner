(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScheduleCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayStr() { return formatDate(new Date()); }

  function parseDate(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(s, n) {
    const d = parseDate(s);
    d.setDate(d.getDate() + n);
    return formatDate(d);
  }

  function diffDays(a, b) {
    return Math.round((parseDate(a) - parseDate(b)) / 86400000);
  }

  function maxDate(a, b) { return diffDays(a, b) >= 0 ? a : b; }
  function minDate(a, b) { return diffDays(a, b) <= 0 ? a : b; }

  function estimatesOf(task) {
    const source = task.estimates || {};
    let optimistic = Number(source.optimistic || 1);
    let mostLikely = Number(source.mostLikely || optimistic || 1);
    let pessimistic = Number(source.pessimistic || mostLikely || 1);
    optimistic = Math.max(1, optimistic);
    mostLikely = Math.max(optimistic, mostLikely);
    pessimistic = Math.max(mostLikely, pessimistic);
    return { optimistic, mostLikely, pessimistic };
  }

  function pertStats(task) {
    const e = estimatesOf(task);
    const expected = (e.optimistic + (4 * e.mostLikely) + e.pessimistic) / 6;
    const variance = Math.pow((e.pessimistic - e.optimistic) / 6, 2);
    return { ...e, expected, variance, durationDays: Math.max(1, Math.ceil(expected)) };
  }

  function topoOrder(list) {
    const map = new Map(list.map(t => [t.id, t]));
    const seen = new Set();
    const visiting = new Set();
    const order = [];
    function visit(id) {
      if (seen.has(id) || visiting.has(id)) return;
      visiting.add(id);
      const task = map.get(id);
      if (task) for (const depId of task.deps || []) visit(depId);
      visiting.delete(id);
      seen.add(id);
      order.push(id);
    }
    for (const task of list) visit(task.id);
    return order;
  }

  function computeSchedule(list, startDate) {
    const map = new Map(list.map(t => [t.id, t]));
    const order = topoOrder(list);
    const today = startDate || todayStr();
    const earliestStart = {};
    const earliestFinish = {};

    for (const id of order) {
      const task = map.get(id);
      if (!task) continue;
      let start = today;
      for (const depId of task.deps || []) {
        const dep = map.get(depId);
        if (!dep) continue;
        const candidate = dep.done ? today : addDays(earliestFinish[depId] || today, 1);
        start = maxDate(start, candidate);
      }
      const duration = task.done ? 0 : pertStats(task).durationDays;
      earliestStart[id] = start;
      earliestFinish[id] = duration === 0 ? today : addDays(start, duration - 1);
    }

    const dependents = new Map(list.map(t => [t.id, []]));
    for (const task of list) {
      for (const depId of task.deps || []) {
        if (dependents.has(depId)) dependents.get(depId).push(task.id);
      }
    }

    const latestStart = {};
    const latestFinish = {};
    for (const id of [...order].reverse()) {
      const task = map.get(id);
      if (!task) continue;
      if (task.done) {
        latestStart[id] = today;
        latestFinish[id] = today;
        continue;
      }
      let finish = task.dueDate;
      for (const childId of dependents.get(id) || []) {
        const child = map.get(childId);
        if (!child || child.done) continue;
        finish = minDate(finish, addDays(latestStart[childId], -1));
      }
      const duration = pertStats(task).durationDays;
      latestFinish[id] = finish;
      latestStart[id] = addDays(finish, -(duration - 1));
    }

    const result = {};
    for (const task of list) {
      const stats = pertStats(task);
      const slack = task.done ? 0 : diffDays(latestStart[task.id], earliestStart[task.id]);
      result[task.id] = {
        asap: earliestFinish[task.id],
        alap: latestFinish[task.id],
        earliestStart: earliestStart[task.id],
        earliestFinish: earliestFinish[task.id],
        latestStart: latestStart[task.id],
        latestFinish: latestFinish[task.id],
        slack,
        critical: !task.done && slack <= 0,
        ...stats,
      };
    }
    return result;
  }

  function criticalChain(list, schedule) {
    const map = new Map(list.map(t => [t.id, t]));
    const ids = list.filter(t => !t.done && schedule[t.id] && schedule[t.id].critical).map(t => t.id);
    const criticalSet = new Set(ids);
    const children = new Map(ids.map(id => [id, []]));
    for (const task of list) {
      if (!criticalSet.has(task.id)) continue;
      for (const depId of task.deps || []) {
        if (criticalSet.has(depId)) children.get(depId).push(task.id);
      }
    }
    const memo = new Map();
    function longestFrom(id) {
      if (memo.has(id)) return memo.get(id);
      let best = [id];
      for (const childId of children.get(id) || []) {
        const path = longestFrom(childId);
        if (path.length + 1 > best.length) best = [id, ...path];
      }
      memo.set(id, best);
      return best;
    }
    let best = [];
    for (const id of ids) {
      const path = longestFrom(id);
      if (path.length > best.length) best = path;
    }
    return best.map(id => map.get(id));
  }

  return {
    addDays,
    computeSchedule,
    criticalChain,
    diffDays,
    estimatesOf,
    formatDate,
    maxDate,
    minDate,
    parseDate,
    pertStats,
    todayStr,
    topoOrder,
  };
});
