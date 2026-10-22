const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transform } = require('sucrase');
const React = require('react');
const storage = new Map();
global.localStorage = { getItem: key => storage.get(key) ?? null };
const code = transform(readFileSync('extensions/apps-drawer/main.tsx', 'utf8') + '\nexport { validFolders, readPreferences, drawerFolders, loadIcon };', { transforms: ['typescript', 'jsx', 'imports'], jsxPragma: 'React.createElement' }).code;
const calls = [];
const exported = {};
new Function('exports', 'module', 'require', 'React', 'invoke', code)(exported, { exports: exported }, id => id === 'react' ? React : {}, React, async (cmd, args) => { calls.push([cmd, args]); return 'icon'; });
const folder = { name: 'Projects', path: '/tmp/Projects' };
test('folder preferences reject malformed values, deduplicate, and preserve old settings', () => {
  assert.deepEqual(exported.validFolders([null, {}, { name: 'Relative', path: 'relative' }, folder, folder]), [folder]);
  storage.set('bb-apps-drawer-settings', JSON.stringify({ layout: 'panel', pins: ['/Applications/Example.app'], doubleTapCommand: false, folders: [folder] }));
  const prefs = exported.readPreferences();
  assert.equal(prefs.layout, 'panel');
  assert.equal(prefs.doubleTapCommand, false);
  assert.deepEqual(prefs.pins, ['/Applications/Example.app']);
  storage.set('betterbar_config', JSON.stringify({ activeSetId: 'a', sets: [{ id: 'a', items: [{ ...folder, kind: 'folder' }, { name: 'Hidden', path: '/tmp/Hidden', kind: 'folder', hidden: true }] }, { id: 'b', items: [{ name: 'Other', path: '/tmp/Other', kind: 'folder' }] }] }));
  assert.deepEqual(exported.drawerFolders(prefs), [{ ...folder, bundle_id: '', kind: 'folder' }]);
});
test('folder icons use literal paths and stay separate from app icon cache', async () => {
  await exported.loadIcon({ ...folder, kind: 'folder', bundle_id: '' });
  await exported.loadIcon({ ...folder, kind: 'folder', bundle_id: '' });
  await exported.loadIcon({ name: 'Example', path: '/Applications/Example.app', bundle_id: 'com.example.App' });
  assert.deepEqual(calls, [['get_path_icon', { path: folder.path }], ['get_app_icon', { bundleId: 'com.example.App' }]]);
});
