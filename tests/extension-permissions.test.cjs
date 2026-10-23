const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const { transform } = require('sucrase');
function harness() {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const exports = {};
  const code = transform(fs.readFileSync('src/extension-permissions.ts', 'utf8'), { transforms: ['typescript', 'imports'] }).code;
  new Function('exports', 'require', 'crypto', 'localStorage', 'window', code)(exports, id => id === 'react' || id === './tauri-bridge' ? {} : require(id), webcrypto, storage, new EventTarget());
  return { ...exports, data };
}
const source = 'export const name = "Weather"; export const version = "1.0.0"; export const permissions = ["network", "files", "network"]; throw new Error("never execute");';

test('review reads each literal permission without executing extension code or fake metadata', async () => {
  const h = harness();
  const review = await h.inspectExtension('weather', '// export const permissions = ["shell"];\nconst example = `export const name = "Fake"`;\n' + source);
  assert.deepEqual(review.permissions, ['network', 'files']);
  assert.equal(review.displayName, 'Weather'); assert.equal(review.version, '1.0.0');
  assert.equal(review.legacy, false); assert.match(review.fingerprint, /^[a-f0-9]{64}$/);
});

test('missing, dynamic, malformed and unknown declarations remain visible and conservative', async () => {
  const h = harness();
  for (const declaration of ['', 'export const permissions = requestAccess();', 'export const permissions = ["network", ...more];', 'export const permissions = [false];', 'export const permissions = [']) {
    const review = await h.inspectExtension('legacy', declaration);
    assert.deepEqual(review.permissions, ['full-access']); assert.equal(review.legacy, true);
  }
  const unknown = await h.inspectExtension('new', 'export const permissions = ["future-capability"];');
  assert.deepEqual(unknown.permissions, ['future-capability']);
  const empty = await h.inspectExtension('simple', 'export const permissions = [];');
  assert.deepEqual(empty.permissions, []); assert.equal(empty.legacy, false);
});

test('approvals persist by extension, version and exact source; updates and revocation require review', async () => {
  const h = harness();
  const original = await h.inspectExtension('weather', source);
  assert.equal(h.isExtensionApproved(original), false); h.approveExtension(original);
  assert.equal(h.isExtensionApproved(await h.inspectExtension('weather', source)), true);
  for (const [id, text] of [['other', source], ['weather', source.replace('1.0.0', '1.1.0')], ['weather', source + '\n// changed without version bump'], ['weather', source.replace('"files"', '"shell"')]]) {
    assert.equal(h.isExtensionApproved(await h.inspectExtension(id, text)), false);
  }
  const another = await h.inspectExtension('another', 'export const permissions = [];');
  h.approveExtension(another); h.revokeExtension('weather');
  assert.equal(h.isExtensionApproved(original), false); assert.equal(h.isExtensionApproved(another), true);
  const saved = h.data.get(h.APPROVAL_KEY);
  assert.equal(saved.includes('never execute'), false); assert.equal(saved.includes('export const'), false);
  for (const invalid of ['null', '[]', 'broken JSON', '{"weather":true}']) {
    h.data.set(h.APPROVAL_KEY, invalid); assert.equal(h.isExtensionApproved(original), false);
  }
});
