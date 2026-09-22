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
    date: { parse: (value) => ({ value }), format: (date) => date.value },
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
    localStorage: { getItem: () => null },
    Promise,
    Map,
    String,
    Boolean,
    Set,
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'store.js'), 'utf8');
  vm.runInNewContext(source, context);

  const loading = sf.store.useAccount('user-1');
  sf.store.useGuest();
  finishFetch({
    data: [{ id: 'task-1', name: 'Private task', due_date: '2026-09-23', done: false }],
    error: null,
  });

  assert.equal(await loading, false);
  assert.equal(sf.store.all().length, 0);
});

test('guest tasks work offline and reload without Supabase requests', () => {
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const sf = {
    utils: { uid: () => '11111111-1111-4111-8111-111111111111' },
    date: { parse: (value) => ({ value }), format: (date) => date.value },
    db: { from: () => { throw Error('Guest mode must not use Supabase'); }, rpc: () => { throw Error('Guest mode must not use Supabase'); } },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'store.js'), 'utf8');
  vm.runInNewContext(source, {
    window: { StudyFlow: sf }, document: { addEventListener() {} }, localStorage,
    Promise, Map, String, Boolean, Set,
  });

  sf.store.useGuest();
  const first = sf.store.save({ name: 'Read chapter', dueDate: '2026-09-23', deps: [] });
  const second = sf.store.save({ id: '22222222-2222-4222-8222-222222222222', name: 'Write notes', dueDate: '2026-09-24', deps: [first.id] });
  sf.store.setDone(first.id, true);
  sf.store.useGuest();
  assert.equal(sf.store.all().length, 2);
  assert.equal(sf.store.find(first.id).done, true);
  assert.equal(sf.store.find(second.id).deps[0], first.id);

  sf.store.remove(first.id);
  sf.store.useGuest();
  assert.equal(sf.store.all().length, 1);
  assert.equal(sf.store.find(second.id).deps.length, 0);
});

test('guest tasks stay separate from account tasks when switching modes', async () => {
  const values = new Map();
  const guestId = '11111111-1111-4111-8111-111111111111';
  const accountId = '22222222-2222-4222-8222-222222222222';
  const sf = {
    utils: { uid: () => guestId },
    date: { parse: (value) => ({ value }), format: (date) => date.value },
    db: {
      from(table) {
        return {
          select() {
            if (table === 'tasks') return { order: async () => ({ data: [{ id: accountId, name: 'Account task', due_date: '2026-09-24', done: false }], error: null }) };
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
      rpc: () => { throw Error('Guest task must not be uploaded'); },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'store.js'), 'utf8');
  vm.runInNewContext(source, {
    window: { StudyFlow: sf }, document: { addEventListener() {} },
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    Promise, Map, String, Boolean, Set,
  });

  sf.store.useGuest();
  sf.store.save({ name: 'Guest task', dueDate: '2026-09-23', deps: [] });
  assert.equal(await sf.store.useAccount('account-1'), true);
  assert.equal(sf.store.all().length, 1);
  assert.equal(sf.store.find(guestId), undefined);
  assert.equal(sf.store.find(accountId).name, 'Account task');

  sf.store.useGuest();
  assert.equal(sf.store.all().length, 1);
  assert.equal(sf.store.find(guestId).name, 'Guest task');
  assert.equal(sf.store.find(accountId), undefined);
});
