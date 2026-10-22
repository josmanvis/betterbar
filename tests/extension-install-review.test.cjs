const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transform } = require('sucrase');

test('a pending review arriving during Settings startup is picked up after subscription', () => {
  const effects = [], listeners = new Map();
  let pending = [], state;
  const react = {
    useState: initial => { const value = typeof initial === 'function' ? initial() : initial; return [value, next => { state = next; }]; },
    useRef: () => ({ current: null }), useEffect: effect => effects.push(effect),
  };
  const modules = {
    react, '@tauri-apps/api/core': {}, '../extensions-runtime': {},
    '../extension-install': { readInstallReviews: () => pending, INSTALL_REVIEW_EVENT: 'review-changed', INSTALL_REVIEW_KEY: 'reviews' },
  };
  const window = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) };
  const code = transform(fs.readFileSync('src/components/ExtensionInstallReview.tsx', 'utf8'), { transforms: ['typescript', 'jsx', 'imports'] }).code;
  const exports = {};
  new Function('exports', 'require', 'window', code)(exports, name => modules[name], window);
  assert.equal(exports.ExtensionInstallReview(), null);
  pending = [{ token: 'pending-review', name: 'sample', displayName: 'Sample', change: 'downgrade' }];
  // The event happened before subscription, so only a fresh read can recover it.
  const cleanup = effects[0]();
  assert.deepEqual(state, pending);
  cleanup(); assert.equal(listeners.size, 0);
});
