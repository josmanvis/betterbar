const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { transform } = require('sucrase');

test('signature repair handles preflight, restart, errors, and protected signatures', async () => {
  let states = [], cursor = 0, effects = [], calls = 0, finish, rejectRepair;
  let status = { valid: false, kind: 'local', identifier: 'old-build-id', repairAvailable: true, reason: null, lastResult: null, logPath: '/tmp/repair.log' };
  const data = new Map();
  global.localStorage = { setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
    useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
  };
  const imports = {
    react: hooks,
    '@phosphor-icons/react': { ArrowCounterClockwise: () => null, ShieldCheck: () => null },
    '@tauri-apps/api/window': { getCurrentWindow: () => ({ onFocusChanged: async () => () => {} }) },
    '../tauri-bridge': {
      getAppSignatureStatus: async () => status,
      repairAppSignature: () => { calls++; return new Promise((resolve, reject) => { finish = resolve; rejectRepair = reject; }); },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/components/SignatureRepair.tsx'), 'utf8');
  const code = transform(source, { transforms: ['typescript', 'jsx', 'imports'], jsxPragma: 'React.createElement' }).code;
  const exports = {};
  new Function('exports', 'require', 'React', code)(exports, name => { assert.ok(imports[name], name); return imports[name]; }, React);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  function render() { cursor = 0; effects = []; return exports.SignatureRepair(); }
  function nodes(node) { return !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
  function button(tree) { return nodes(tree).find(node => node.type === 'button'); }
  function text(tree) { return nodes(tree).flatMap(node => React.Children.toArray(node.props?.children).filter(child => typeof child === 'string')).join(' '); }

  let tree = render();
  assert.equal(button(tree).props.disabled, true);
  const cleanup = effects[0]();
  await flush();
  tree = render();
  assert.match(text(tree), /Needs attention/);
  assert.equal(button(tree).props.disabled, false);
  button(tree).props.onClick();
  assert.equal(calls, 1);
  assert.equal(data.get(exports.REOPEN_PERMISSIONS_KEY), '1');
  tree = render();
  assert.equal(button(tree).props.disabled, true);
  assert.match(text(tree), /Preparing verified copy/);
  button(tree).props.onClick();
  assert.equal(calls, 1);
  rejectRepair('Cannot write beside BetterBar.app');
  await flush();
  tree = render();
  assert.equal(button(tree).props.disabled, false);
  assert.equal(data.has(exports.REOPEN_PERMISSIONS_KEY), false);
  assert.match(text(tree), /Cannot write beside BetterBar.app/);
  button(tree).props.onClick();
  finish();
  await flush();
  tree = render();
  assert.equal(button(tree).props.disabled, true);
  assert.match(text(tree), /Restarting BetterBar/);
  assert.equal(data.get(exports.REOPEN_PERMISSIONS_KEY), '1');
  cleanup();

  for (const kind of ['certificate', 'development']) {
    states = [];
    status = { ...status, kind, repairAvailable: false, reason: 'Repair is unavailable for this build.' };
    render(); effects[0](); await flush();
    tree = render();
    assert.equal(button(tree).props.disabled, true);
    button(tree).props.onClick();
    assert.equal(calls, 2);
  }
});
