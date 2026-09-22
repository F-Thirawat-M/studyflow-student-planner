const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('signing out during a task fetch does not restore private tasks', async () => {
  let finishFetch;
  const tasksRequest = new Promise((resolve) => { finishFetch = resolve; });
  const sf = {
    utils: { uid: () => 'new-id' },
    db: {
      from(table) {
        return {
          select() {
            return table === 'tasks'
              ? { order: () => tasksRequest }
              : Promise.resolve({ data: [], error: null });
          },
        };
      },
    },
  };
  const context = {
    window: { StudyFlow: sf },
    document: { addEventListener() {} },
    Promise,
    Map,
    String,
    Boolean,
    Set,
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'store.js'), 'utf8');
  vm.runInNewContext(source, context);

  const loading = sf.store.useAccount('user-1');
  sf.store.clear();
  finishFetch({
    data: [{ id: 'task-1', name: 'Private task', due_date: '2026-09-23', done: false }],
    error: null,
  });

  assert.equal(await loading, false);
  assert.equal(sf.store.all().length, 0);
});
