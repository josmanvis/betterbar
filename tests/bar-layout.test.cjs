const ROOT = require('node:path').resolve(__dirname, '..');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(ROOT + '/package.json');
const React = req('react');
const { transform } = req('sucrase');

function evaluate(file, modules = {}) {
  const code = transform(fs.readFileSync(ROOT + '/' + file, 'utf8'), {
    transforms: ['typescript', 'jsx', 'imports'], jsxPragma: 'React.createElement', jsxFragmentPragma: 'React.Fragment',
  }).code;
  const exports = {};
  new Function('exports', 'require', 'React', code)(exports, id => {
    assert.ok(id in modules, id); return modules[id];
  }, React);
  return exports;
}
const types = evaluate('src/types.ts');
const replacements = evaluate('src/extension-replacements.ts');
const layout = evaluate('src/bar-layout.ts', { './types': types, './extension-replacements': replacements });
const { extensionItemId: ext, appItemId: app, resolveBarOrder: resolve, moveBarItem: move } = layout;
assert.equal(layout.appMatchesDockItem({name:'My browser',bundleId:'com.apple.Safari'}, {name:'Safari',bundle_id:'com.apple.Safari'}), true);
assert.equal(layout.appMatchesDockItem({name:'Safari',bundleId:'com.other.browser'}, {name:'Safari',bundle_id:'com.apple.Safari'}), false);
assert.equal(layout.appMatchesDockItem({name:'SAFARI'}, {name:'Safari',bundle_id:'com.apple.Safari'}), true);
const names = ['apps-drawer', 'Standup Update', 'time', 'media', 'power', 'floatnote'];
const registry = names.map(name => ({ name, displayName: name }));
const config = {
  ...types.DEFAULT_CONFIG,
  sets: [
    { id: 'one', name: 'One', items: [
      { id: 'first', name: 'First', path: '/First.app', order: 0 },
      { id: 'hidden', name: 'Hidden', path: '/Hidden.app', order: 1, hidden: true },
      { id: 'last', name: 'Last', path: '/Last.app', order: 2 },
    ] },
    { id: 'two', name: 'Two', items: [{ id: 'first', name: 'Other first', path: '/Other.app', order: 0 }] },
  ],
  activeSetId: 'one', enabledExtensions: names, sectionStyles: { time: { contentScale: 1.2 }, extensions: { padding: { left: 3 } } },
};
let order = resolve(config, names);
assert.equal(new Set(order).size, order.length);
assert.ok(order.indexOf(app('one', 'first')) < order.indexOf(app('one', 'last')));
assert.ok(order.indexOf(ext('apps-drawer')) < order.indexOf('spacer'));
assert.ok(order.indexOf(ext('time')) > order.indexOf('spacer'));
for (const legacy of ['time', 'music', 'battery']) assert.ok(!order.includes(legacy));
const initial = layout.migrateBarOrder(config, names);
assert.equal(layout.migrateBarOrder(initial, names), initial);
assert.equal(initial.clocks, config.clocks);
assert.equal(initial.sets, config.sets);
assert.equal(initial.sectionOrder, config.sectionOrder);

// Put separate extensions before, between, and after pinned apps and features.
order = move(order, ext('time'), app('one', 'last'));
order = move(order, ext('Standup Update'), app('one', 'last'));
order = move(order, ext('floatnote'), 'cog');
let changed = layout.applyBarOrder(initial, order);
let rows = layout.barItems(changed, registry);
let ids = rows.map(row => row.id);
assert.ok(ids.indexOf(app('one', 'first')) < ids.indexOf(ext('time')));
assert.ok(ids.indexOf(ext('time')) < ids.indexOf(app('one', 'last')));
assert.ok(ids.indexOf(ext('Standup Update')) < ids.indexOf(app('one', 'last')));
assert.equal(ids.filter(id => id === ext('time')).length, 1);
assert.ok(!rows.some(row => row.label === 'Other first'));
assert.equal(rows.find(row => row.id === app('one', 'hidden')).enabled, false);
assert.deepEqual(resolve(JSON.parse(JSON.stringify(changed)), names), order);

// Disabling, master hiding, and registry reordering retain the layout.
assert.deepEqual(resolve({ ...changed, enabledExtensions: [], showExtensions: false }, [...names].reverse()), order);
assert.ok(layout.barItems({ ...changed, enabledExtensions: [] }, registry).filter(row => row.kind === 'extension').every(row => !row.enabled));
const withoutStandup = names.filter(name => name !== 'Standup Update');
assert.deepEqual(resolve({ ...changed, barOrder: resolve(changed, withoutStandup) }, names), order);
const uninstalledTime = layout.barItems(changed, registry.filter(item => item.name !== 'time'));
assert.equal(uninstalledTime.filter(item => item.section === 'time').length, 1);
assert.ok(!uninstalledTime.some(item => item.id === ext('time')));

// New installs receive one slot; missing apps are pruned without moving others.
const added = resolve(changed, [...names, 'new-extension']);
assert.equal(added.filter(id => id === ext('new-extension')).length, 1);
assert.deepEqual(added.filter(id => id !== ext('new-extension')), order);
const removedApp = { ...changed, sets: changed.sets.map(set => ({ ...set, items: set.items.filter(item => item.id !== 'hidden') })) };
assert.ok(!resolve(removedApp, names).includes(app('one', 'hidden')));
assert.deepEqual(layout.barItemStyle(changed, ext('time')), config.sectionStyles.time);
assert.deepEqual(layout.barItemStyle(changed, ext('apps-drawer')), config.sectionStyles.extensions);
assert.notEqual(app('one', 'first'), app('two', 'first'));
assert.equal(layout.extensionName(ext('Name: % / with spaces')), 'Name: % / with spaces');
assert.deepEqual(layout.sanitizeBarOrder([null, 3, 'invalid', 'extension:', 'extension:%XX', 'app:a:', 'cog', 'cog']), ['cog']);
assert.deepEqual(resolve({ ...config, barOrder: [] }, names), resolve(config, names));
assert.equal(move(order, ext('time'), 'missing'), order);

// Reordering apps keeps all hidden apps and other sets intact.
changed = layout.applyBarOrder(changed, move(order, app('one', 'last'), app('one', 'first')));
assert.equal(changed.sets[0].items[0].id, 'last');
assert.ok(changed.sets[0].items.some(item => item.id === 'hidden' && item.hidden));
assert.equal(changed.sets[1], config.sets[1]);
assert.deepEqual(changed.sets[0].items.map(item => item.order), [0, 1, 2]);

// Widget controls stay clickable; only modifier-drag starts a widget reorder.
let activations = 0;
const sortable = evaluate('src/components/SortableBarItem.tsx', {
  react: React,
  '@dnd-kit/sortable': { useSortable: () => ({ listeners: { onPointerDown: () => activations++ } }) },
  '@dnd-kit/utilities': { CSS: { Transform: { toString: () => undefined } } },
});
const widget = sortable.SortableBarItem({ id: ext('time'), label: 'Time', vertical: false });
let stopped = 0;
const pointer = metaKey => ({ button: 0, metaKey, preventDefault() { stopped++; }, stopPropagation() { stopped++; } });
widget.props.onPointerDownCapture(pointer(false)); assert.equal(activations, 0);
widget.props.onPointerDownCapture(pointer(true)); assert.equal(activations, 1); assert.equal(stopped, 2);
const icon = sortable.SortableBarItem({ id: app('one', 'first'), label: 'First', vertical: false, normalDrag: true });
icon.props.onPointerDownCapture(pointer(false)); assert.equal(activations, 2);
icon.props.onPointerDownCapture({ ...pointer(true), button: 2 }); assert.equal(activations, 2);
console.log('PASS: independent extension/app placement, migration, all-set identity, persistence, toggles/reloads, install/uninstall, hidden app retention, style inheritance, and modifier-drag activation.');

// Settings arrows, direct position selection, and row drag share the same order.
let editedOrder;
const editor = evaluate('src/components/BarOrderEditor.tsx', {
  react: { useState: value => [value, () => {}] }, '../bar-layout': layout,
});
const tree = editor.BarOrderEditor({ config: initial, extensions: registry, onChange: value => { editedOrder = value; } });
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}
const controls = nodes(tree);
const startButton = controls.find(node => node.props['aria-label'] === 'Move Time toward start');
startButton.props.onClick();
assert.ok(editedOrder.indexOf(ext('time')) < initial.barOrder.indexOf(ext('time')));
const selector = controls.find(node => node.type === 'select' && node.props.value === ext('time'));
selector.props.onChange({ target: { value: app('one', 'last') } });
assert.ok(editedOrder.indexOf(ext('time')) < editedOrder.indexOf(app('one', 'last')));
const rowsById = new Map(controls.filter(node => node.type === 'li').map(node => [node.props['data-bar-order-item'], node]));
const transferred = new Map();
const dataTransfer = { types: ['application/x-betterbar-item'], setData: (key, value) => transferred.set(key, value), getData: key => transferred.get(key) };
rowsById.get(ext('floatnote')).props.onDragStart({ dataTransfer });
let prevented = false;
rowsById.get(app('one', 'first')).props.onDrop({ dataTransfer, preventDefault() { prevented = true; } });
assert.ok(prevented);
assert.ok(editedOrder.indexOf(ext('floatnote')) < editedOrder.indexOf(app('one', 'first')));
console.log('PASS: settings arrows, position picker, and row drag persist independent item order.');
