const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transform } = require('sucrase');
function evaluate(file, modules = {}, globals = {}) {
  const code = transform(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { transforms: ['typescript', 'imports'] }).code;
  const exports = {};
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, id => { assert.ok(id in modules, id); return modules[id]; }, ...Object.values(globals));
  return exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('native list equality preserves identity but detects activation, titles, order, and removals', () => {
  const { reuseUnchangedRecords: reuse } = evaluate('src/hooks/usePollingList.ts', { react: {} });
  const previous = [{ pid: 1, title: 'One', active: false }, { pid: 2, title: 'Two', active: true }];
  assert.equal(reuse(previous, previous.map(item => ({ ...item }))), previous);
  for (const next of [previous.slice(1), [...previous].reverse(), [{ ...previous[0], title: 'New' }, previous[1]], [{ ...previous[0], active: true }, previous[1]], [{ pid: 1, title: 'One' }, previous[1]]]) assert.equal(reuse(previous, next), next);
  const empty = []; assert.equal(reuse(empty, []), empty);
});

test('polling does not overlap, keeps unchanged state, cleans up, and discards stale results', async () => {
  let effect, state = [], interval, cleared = 0, calls = 0, resolve;
  const hooks = { useState: () => [state, setter => { state = setter(state); }], useEffect: fn => { effect = fn; } };
  const { usePollingList } = evaluate('src/hooks/usePollingList.ts', { react: hooks }, {
    setInterval: callback => { interval = callback; return 42; }, clearInterval: id => { assert.equal(id, 42); cleared++; },
  });
  const fetch = () => { calls++; return new Promise(done => { resolve = done; }); };
  usePollingList(fetch, 2000); const cleanup = effect();
  interval(); interval(); assert.equal(calls, 1);
  resolve([{ pid: 1 }]); await tick(); const first = state;
  interval(); assert.equal(calls, 2); resolve([{ pid: 1 }]); await tick(); assert.equal(state, first);
  interval(); cleanup(); resolve([{ pid: 2 }]); await tick(); assert.equal(state, first); assert.equal(cleared, 1);
  usePollingList(fetch, 2000, false); effect(); assert.deepEqual(state, []); assert.equal(calls, 3);
  usePollingList(fetch, 2000); const stop = effect(); assert.equal(calls, 4); stop(); resolve([]); await tick();
});

test('dock picks preserve kinds and paths, deduplicate repeats, and keep same-named files distinct', () => {
  const { newDockItems } = evaluate('src/dock-targets.ts', { '@tauri-apps/api/core': {} });
  const existing = [{ id: 'original', name: 'Notes', path: '/Notes.app', order: 0 }];
  const targets = [{ name: 'Notes', path: '/Notes.app', kind: 'app' }, { name: 'Report.txt', path: '/one/Report.txt', kind: 'file' }, { name: 'Report.txt', path: '/two/Report.txt', kind: 'file' }, { name: 'Work', path: '/Work', kind: 'folder' }, { name: 'Work', path: '/Work', kind: 'folder' }];
  let id = 0; const added = newDockItems(existing, targets, () => `new-${++id}`);
  assert.deepEqual(added.map(item => item.kind), ['file', 'file', 'folder']);
  assert.deepEqual(added.map(item => item.order), [1, 2, 3]);
  assert.equal(existing.length, 1); assert.equal(targets.length, 5);
  assert.deepEqual(newDockItems([...existing, ...added], targets), []);
});

test('section extensions migrate visibility once, preserve pins, and restore native items after removal', () => {
  const types = evaluate('src/types.ts');
  const policy = evaluate('src/extension-replacements.ts');
  const layout = evaluate('src/bar-layout.ts', { './types': types, './extension-replacements': policy });
  const names = policy.EXTENSION_REPLACEMENTS.map(item => item.name);
  const registry = names.map(name => ({ name, displayName: name }));
  const original = { ...types.DEFAULT_CONFIG, showRunningApps: true, showSpaces: false, showSettingsCog: false };
  const migrated = layout.migrateBarOrder(policy.migrateExtensionReplacements(original, names), names);
  assert.equal(migrated.sets, original.sets);
  assert.ok(migrated.enabledExtensions.includes('docked-apps')); assert.ok(migrated.enabledExtensions.includes('opened-apps'));
  assert.ok(!migrated.enabledExtensions.includes('spaces')); assert.ok(!migrated.enabledExtensions.includes('settings'));
  let rows = layout.barItems(migrated, registry);
  assert.equal(rows.filter(item => item.kind === 'app').length, 0);
  assert.equal(rows.filter(item => item.kind === 'native').length, 1); // Flexible space is layout, not a feature.
  const disabled = { ...migrated, enabledExtensions: migrated.enabledExtensions.filter(name => name !== 'docked-apps') };
  rows = layout.barItems(disabled, registry);
  assert.equal(rows.find(item => item.extension === 'docked-apps').enabled, false);
  assert.equal(rows.find(item => item.extension === 'opened-apps').enabled, true);
  assert.equal(policy.migrateExtensionReplacements(disabled, names), disabled);
  const fallback = layout.barItems(disabled, []);
  assert.equal(fallback.filter(item => item.kind === 'app').length, original.sets[0].items.length);
  assert.equal(new Set(layout.resolveBarOrder(disabled, names)).size, layout.resolveBarOrder(disabled, names).length);
  assert.equal(layout.appMatchesDockItem({ name: 'Notes', kind: 'folder' }, { name: 'Notes', bundle_id: 'com.apple.Notes' }), false);
});
