const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { transform } = require('sucrase');
function evaluate(file, modules = {}) {
  const exports = {};
  const code = transform(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { transforms: ['typescript', 'jsx', 'imports'], jsxPragma: 'React.createElement' }).code;
  new Function('exports', 'require', 'React', code)(exports, id => { assert.ok(id in modules, id); return modules[id]; }, React);
  return exports;
}
const appearance = evaluate('src/appearance.ts');
const types = evaluate('src/types.ts');
const search = evaluate('src/settings-search.ts');

test('search finds settings by label and synonyms and routes clocks to their installed extension', () => {
  const entries = search.settingsSearchEntries(['time', 'apple-calendar', 'focus-timer', 'system-monitor'].map(name => ({ name, displayName: name.replaceAll('-', ' ') })));
  for (const [query, tab] of [['transparency', 'style'], ['bar thickness', 'layout'], ['reorder', 'sections'], ['auto hide', 'behaviour'], ['resign', 'permissions'], ['clock timezone', 'extensions'], ['pomodoro', 'extensions'], ['ram', 'extensions'], ['calendar agenda', 'extensions'], ['extension labels', 'extensions'], ['halo', 'style']]) {
    assert.equal(search.searchSettings(query, entries)[0]?.tab, tab, query);
  }
  assert.equal(search.searchSettings('OPACITY', entries)[0].label, 'Background opacity');
  assert.deepEqual(search.searchSettings('   ', entries), []);
  assert.deepEqual(search.searchSettings('no-such-setting', entries), []);
  assert.equal(search.searchSettings('timezone', search.settingsSearchEntries([]))[0].tab, 'sets');
});

test('focus treatments and label overrides survive sanitization without changing defaults', () => {
  const replacements = evaluate('src/extension-replacements.ts');
  const layout = evaluate('src/bar-layout.ts', { './types': types, './extension-replacements': replacements });
  const store = evaluate('src/store.ts', { react: React, './types': types, './appearance': appearance, './extensions-runtime': {}, './extension-replacements': replacements, './bar-layout': layout, './tauri-bridge': {} });
  const editor = evaluate('src/components/ActiveAppEditor.tsx', { '../appearance': appearance });
  const legacy = store.sanitize({ ...types.DEFAULT_CONFIG, activeAppStyle: undefined, showExtensionLabels: undefined });
  assert.equal(legacy.activeAppStyle, 'edge');
  assert.equal(legacy.showExtensionLabels, true);
  assert.equal(store.sanitize({ ...legacy, activeAppStyle: 'invalid', activeAppStrength: 999 }).activeAppStrength, 100);
  assert.equal(store.sanitize({ ...legacy, activeAppStyle: 'invalid' }).activeAppStyle, 'edge');
  for (const style of appearance.ACTIVE_APP_STYLES) {
    const config = store.sanitize({ ...legacy, barSize: 24, activeAppStyle: style, activeAppStrength: 60, activeAppPulse: true, dimInactiveApps: true, showExtensionLabels: false,
      extensionAppearance: { time: { showLabels: true }, media: { showLabels: false } } });
    assert.equal(config.barSize, 24);
    const persisted = store.sanitize(JSON.parse(JSON.stringify(config)));
    assert.equal(persisted.activeAppStyle, style);
    assert.equal(persisted.showExtensionLabels, false);
    assert.equal(persisted.extensionAppearance.time.showLabels, true);
    assert.equal(persisted.extensionAppearance.media.showLabels, false);
    const active = editor.appFocusProps(persisted, true, 'right');
    assert.equal(active['data-active-style'], style);
    assert.equal(active['data-active-position'], 'right');
    assert.equal(active.style['--bb-active-opacity'], .6);
    assert.equal(active['data-dim-idle'], 'true');
  }
  assert.equal(store.sanitize({ ...legacy, barSize: -1 }).barSize, 24);
});

test('bar content fits the cross axis at compact sizes and with oversized overrides', () => {
  const { fitBarScale } = evaluate('src/components/SortableBarItem.tsx', { react: React, '@dnd-kit/sortable': {}, '@dnd-kit/utilities': {} });
  for (const size of [24, 28, 32, 40, 48, 68, 200]) for (const naturalCross of [18, 36, 48, 80, 140]) for (const requested of [.5, 1, 1.5, 2]) {
    const scale = fitBarScale(requested, naturalCross, size - 4);
    assert.ok(scale > 0 && scale <= requested);
    assert.ok(naturalCross * scale <= size - 4 + 1e-10);
  }
  assert.equal(fitBarScale(.5, 0, 20), .5);
  assert.equal(fitBarScale(1, 36), 1);
});

test('settings search supports typing, keyboard selection, Escape, and no-result feedback', () => {
  let states = [], cursor = 0, chosen;
  const hooks = { ...React, useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useMemo: fn => fn(), useRef: () => ({ current: null }), useEffect: () => {} };
  const { SettingsSearch } = evaluate('src/components/SettingsSearch.tsx', { react: hooks, '@phosphor-icons/react': { MagnifyingGlass: () => null, X: () => null }, '../settings-search': search });
  function render() { cursor = 0; return SettingsSearch({ extensions: [], onSelect: entry => { chosen = entry; } }); }
  function nodes(node) { return !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
  function input(tree) { return nodes(tree).find(node => node.type === 'input'); }
  function key(tree, key) { input(tree).props.onKeyDown({ key, preventDefault() {} }); }
  let tree = render();
  input(tree).props.onChange({ target: { value: 'opacity' } }); tree = render();
  assert.equal(input(tree).props['aria-expanded'], true);
  assert.ok(nodes(tree).some(node => node.props.role === 'option'));
  key(tree, 'Enter');
  assert.equal(chosen.label, 'Background opacity');
  tree = render(); assert.equal(input(tree).props.value, '');
  input(tree).props.onChange({ target: { value: 'zz-no-match' } }); tree = render();
  assert.ok(nodes(tree).some(node => node.type === 'p' && String(node.props.children).includes('No settings found')));
  key(tree, 'Escape'); tree = render(); assert.equal(input(tree).props['aria-expanded'], false);
  input(tree).props.onChange({ target: { value: 'bar' } }); tree = render();
  const options = nodes(tree).filter(node => node.props.role === 'option');
  assert.ok(options.length > 1);
  assert.equal(options[1].props.onMouseEnter, undefined);
  options[1].props.onMouseMove({ movementX: 0, movementY: 0 }); tree = render(); key(tree, 'Enter');
  assert.equal(chosen.label, search.searchSettings('bar', search.settingsSearchEntries([]))[0].label);
});

test('numeric settings allow partial edits, clamp on commit, and cancel with Escape', () => {
  let draft = null, changed = [], cancelled = { current: false };
  const hooks = { useState: () => [draft, value => { draft = value; }], useRef: () => cancelled };
  const { SettingNumberInput } = evaluate('src/components/SettingNumberInput.tsx', { react: hooks });
  const render = () => SettingNumberInput({ value: 50, min: 24, max: 200, step: 1, onChange: value => changed.push(value) });
  let input = render(); input.props.onFocus(); input = render();
  input.props.onChange({ target: { value: '' } }); input = render(); assert.equal(input.props.value, '');
  input.props.onChange({ target: { value: '2' } }); input = render(); assert.equal(input.props.value, '2'); assert.equal(changed.length, 0);
  input.props.onChange({ target: { value: '24' } }); input = render(); input.props.onBlur(); assert.equal(changed.at(-1), 24);
  input = render(); input.props.onFocus(); input = render(); input.props.onChange({ target: { value: '999' } }); input = render(); input.props.onBlur(); assert.equal(changed.at(-1), 200);
  input = render(); input.props.onFocus(); input = render(); input.props.onChange({ target: { value: '75' } }); input = render();
  const count = changed.length; input.props.onKeyDown({ key: 'Escape', preventDefault() {}, currentTarget: { blur: () => input.props.onBlur() } }); assert.equal(changed.length, count);
});

test('border choices preserve explicit zero, per-item overrides, and extension inheritance across saves', () => {
  const replacements = evaluate('src/extension-replacements.ts');
  const layout = evaluate('src/bar-layout.ts', { './types': types, './extension-replacements': replacements });
  const store = evaluate('src/store.ts', { react: React, './types': types, './appearance': appearance, './extensions-runtime': {}, './extension-replacements': replacements, './bar-layout': layout, './tauri-bridge': {} });
  const chrome = evaluate('src/iconChrome.ts');
  const legacy = store.sanitize(types.DEFAULT_CONFIG);
  assert.equal(legacy.showExtensionBorders, true);
  assert.equal(chrome.iconBordersVisible(legacy.iconChrome), true);
  const config = store.sanitize({ ...legacy, iconChrome: { showBorder: false, borderWidth: 3 }, showExtensionBorders: false,
    extensionAppearance: { 'system-monitor': { showBorder: true }, time: { showBorder: false }, media: {} } });
  const saved = store.sanitize(JSON.parse(JSON.stringify(config)));
  assert.equal(chrome.iconBordersVisible(saved.iconChrome), false);
  assert.equal(chrome.iconChromeStyle(saved.iconChrome).borderColor, 'transparent');
  assert.equal(chrome.iconBordersVisible(chrome.mergeChrome(saved.iconChrome, { showBorder: true })), true);
  assert.equal(chrome.iconBordersVisible({ borderWidth: 0, borderColor: '#ff0000' }), false);
  assert.equal(chrome.iconChromeStyle({ borderWidth: 0 }).border, '0px solid transparent');
  assert.equal(appearance.extensionBorderVisible(saved, 'system-monitor'), true);
  assert.equal(appearance.extensionBorderVisible(saved, 'media'), false);
  assert.equal(appearance.extensionBorderVisible({ ...saved, showExtensionBorders: true }, 'time'), false);
  const entries = search.settingsSearchEntries([{ name: 'system-monitor', displayName: 'System Monitor' }]);
  assert.equal(search.searchSettings('icon borders', entries)[0].label, 'Show icon borders');
  assert.equal(search.searchSettings('extension borders', entries)[0].label, 'Show extension borders');
  assert.equal(search.searchSettings('ram', entries)[0].label, 'System Monitor');
});

test('extensions filter by purpose and status, disclose settings, and report reload failures', async () => {
  let states = [], cursor = 0, toggled, reloadFails = true;
  const hooks = { ...React, useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useEffect: () => {} };
  const { ExtensionManager, filterExtensions } = evaluate('src/components/ExtensionManager.tsx', {
    react: hooks, '@phosphor-icons/react': { CaretDown: () => null, MagnifyingGlass: () => null, PuzzlePiece: () => null },
    '../extension-permissions': { permissionStrings: {}, useExtensionApprovals: () => 0, isExtensionApproved: () => true }, './ExtensionPermissionReview': { ExtensionPermissionDetails: () => null, ExtensionPermissionReview: () => null },
    '../extensions-runtime': { reloadExtensions: async () => { if (reloadFails) throw Error('private detail'); } }, './AppearanceEditor': { ExtensionAppearanceEditor: () => null },
  });
  const extensions = [{ name: 'time', displayName: 'Time' }, { name: 'system-monitor', displayName: 'System Monitor' }];
  assert.deepEqual(filterExtensions(extensions, ['time'], 'CPU', 'all').map(ext => ext.name), ['system-monitor']);
  assert.deepEqual(filterExtensions(extensions, ['time'], '', 'enabled').map(ext => ext.name), ['time']);
  assert.deepEqual(filterExtensions(extensions, ['time'], '', 'disabled').map(ext => ext.name), ['system-monitor']);
  const props = { config: { ...types.DEFAULT_CONFIG, enabledExtensions: ['time'], showExtensions: false }, extensions, ready: true,
    loaded: [{ name: 'time', displayName: 'Time', Settings: () => null }], toggle: name => { toggled = name; }, update: () => {} };
  function nodes(node) { return !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
  function render() { cursor = 0; return ExtensionManager(props); }
  let tree = render();
  assert.equal(nodes(tree).find(node => node.props['aria-label'] === 'Configure Time').props['aria-expanded'], false);
  assert.ok(nodes(tree).some(node => node.type === 'small' && node.props.children === 'Enabled · hidden from bar'));
  nodes(tree).find(node => node.props['aria-label'] === 'Configure Time').props.onClick(); tree = render();
  assert.equal(nodes(tree).find(node => node.props['aria-label'] === 'Configure Time').props['aria-expanded'], true);
  nodes(tree).find(node => node.props['aria-label'] === 'Enable System Monitor').props.onClick(); assert.equal(toggled, 'system-monitor');
  let reload = nodes(tree).find(node => node.type === 'button' && node.props.children === 'Reload extensions');
  await reload.props.onClick(); tree = render();
  assert.ok(nodes(tree).some(node => node.props.role === 'alert' && !String(node.props.children).includes('private detail')));
  reloadFails = false; reload = nodes(tree).find(node => node.type === 'button' && node.props.children === 'Reload extensions');
  await reload.props.onClick(); tree = render();
  assert.ok(nodes(tree).some(node => node.props.role === 'status' && node.props.children === 'Extensions reloaded.'));
});
