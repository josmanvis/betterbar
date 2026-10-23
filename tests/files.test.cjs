const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transform } = require('sucrase');
function extension() {
  const data = new Map(); const exports = {};
  const storage = { getItem: key => data.get(key) ?? null };
  const code = transform(fs.readFileSync('extensions/files/main.tsx', 'utf8') + '\nexport { readPreferences, sortEntries, sizeLabel, parent };', { transforms: ['typescript', 'jsx', 'imports'] }).code;
  new Function('exports', 'require', 'localStorage', code)(exports, () => ({}), storage);
  return { ...exports, data };
}
test('Files preferences reject invalid values and preserve only bounded local favorites', () => {
  const h = extension();
  h.data.set('bb-files-preferences', JSON.stringify({ view: 'bad', sort: 'bad', hidden: 'yes', favorites: [{ name: 'Docs', path: '/Documents' }, { name: 'no', path: 'relative' }, null] }));
  assert.deepEqual(h.readPreferences(), { view: 'list', sort: 'name', reverse: false, hidden: false, foldersFirst: true, favorites: [{ name: 'Docs', path: '/Documents' }] });
  h.data.set('bb-files-preferences', 'null'); assert.equal(h.readPreferences().view, 'list');
  h.data.set('bb-files-preferences', '{broken'); assert.deepEqual(h.readPreferences().favorites, []);
});
test('Files sorting is natural, folders-first, immutable, filterable, and reversible', () => {
  const h = extension();
  const items = [{ name: 'report 10.txt', directory: false, size: 10 }, { name: 'report 2.txt', directory: false, size: 20 }, { name: 'Z folder', directory: true, package: false, size: 100 }];
  const prefs = h.readPreferences();
  assert.deepEqual(h.sortEntries(items, prefs).map(i => i.name), ['Z folder', 'report 2.txt', 'report 10.txt']);
  assert.deepEqual(h.sortEntries(items, { ...prefs, reverse: true }).map(i => i.name), ['Z folder', 'report 10.txt', 'report 2.txt']);
  assert.deepEqual(h.sortEntries(items, prefs, 'REPORT 2').map(i => i.name), ['report 2.txt']);
  assert.equal(items[0].name, 'report 10.txt');
  assert.equal(h.parent('/folder'), '/'); assert.equal(h.parent('/'), '/');
  assert.equal(h.sizeLabel(1024), '1 KB'); assert.equal(h.sizeLabel(0), '0 B');
});
