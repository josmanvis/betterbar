const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transform } = require('sucrase');
const React = require('react');
const storage = new Map();
global.localStorage = { getItem: key => storage.get(key) ?? null };
const code = transform(readFileSync('extensions/apps-drawer/main.tsx', 'utf8') + '\nexport { validShortcuts, validFolders, readPreferences, drawerFolders, loadIcon };', { transforms: ['typescript', 'jsx', 'imports'], jsxPragma: 'React.createElement' }).code;
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

test('saved file shortcuts validate metadata without altering legacy folders or pins', () => {
  const file = { name: 'Report.txt', path: '/tmp/Report.txt', kind: 'file' };
  const app = { name: 'App', path: '/Applications/App.app', kind: 'app', bundleId: 'com.example.App' };
  assert.deepEqual(exported.validShortcuts([null, {}, { ...file, path: 'relative' }, { ...file, kind: 'folder' }, file, file, app]), [file, app]);
  storage.set('bb-apps-drawer-settings', JSON.stringify({ folders: [folder], pins: [folder.path], shortcuts: [file, app] }));
  const prefs = exported.readPreferences();
  assert.deepEqual(prefs.shortcuts, [file, app]);
  assert.deepEqual(prefs.folders, [folder]);
  assert.deepEqual(prefs.pins, [folder.path]);
});

test('file and folder icons with the same name use separate native paths', async () => {
  calls.length = 0;
  await exported.loadIcon({ name: 'Same', path: '/tmp/Same', kind: 'folder', bundle_id: '' });
  await exported.loadIcon({ name: 'Same', path: '/tmp/Elsewhere/Same', kind: 'file', bundle_id: '' });
  assert.deepEqual(calls, [['get_path_icon', { path: '/tmp/Same' }], ['get_path_icon', { path: '/tmp/Elsewhere/Same' }]]);
});
