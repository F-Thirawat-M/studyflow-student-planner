const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeSchedule,
  criticalChain,
  pertStats,
} = require('../schedule-core.js');

test('คำนวณค่าเฉลี่ย PERT จาก O, M และ P', () => {
  const stats = pertStats({
    estimates: { optimistic: 1, mostLikely: 4, pessimistic: 7 },
  });
  assert.equal(stats.expected, 4);
  assert.equal(stats.durationDays, 4);
  assert.equal(stats.variance, 1);
});

test('งานลูกเริ่มหลังงานแม่เสร็จ', () => {
  const tasks = [
    { id: 'a', name: 'A', dueDate: '2026-09-25', deps: [], done: false, estimates: { optimistic: 2, mostLikely: 2, pessimistic: 2 } },
    { id: 'b', name: 'B', dueDate: '2026-09-28', deps: ['a'], done: false, estimates: { optimistic: 1, mostLikely: 1, pessimistic: 1 } },
  ];
  const result = computeSchedule(tasks, '2026-09-20');
  assert.equal(result.a.earliestFinish, '2026-09-21');
  assert.equal(result.b.earliestStart, '2026-09-22');
});

test('งานที่เสร็จแล้วไม่ขวางงานถัดไป', () => {
  const tasks = [
    { id: 'a', name: 'A', dueDate: '2026-09-19', deps: [], done: true, estimates: { optimistic: 5, mostLikely: 5, pessimistic: 5 } },
    { id: 'b', name: 'B', dueDate: '2026-09-22', deps: ['a'], done: false, estimates: { optimistic: 1, mostLikely: 1, pessimistic: 1 } },
  ];
  const result = computeSchedule(tasks, '2026-09-20');
  assert.equal(result.b.earliestStart, '2026-09-20');
});

test('หาเส้นทางวิกฤตจากงานที่ต่อกัน', () => {
  const tasks = [
    { id: 'a', name: 'A', dueDate: '2026-09-20', deps: [], done: false, estimates: { optimistic: 1, mostLikely: 1, pessimistic: 1 } },
    { id: 'b', name: 'B', dueDate: '2026-09-21', deps: ['a'], done: false, estimates: { optimistic: 1, mostLikely: 1, pessimistic: 1 } },
  ];
  const schedule = computeSchedule(tasks, '2026-09-20');
  assert.deepEqual(criticalChain(tasks, schedule).map(task => task.id), ['a', 'b']);
});
