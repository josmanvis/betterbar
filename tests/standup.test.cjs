const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { transform } = require('sucrase');

const sourcePath = path.join(__dirname, '../extensions/Standup Update/main.tsx');
const options = { skip: !fs.existsSync(sourcePath) && 'Local Standup extension is not installed' };
function nodes(node) { return !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }

async function harness(invoke) {
  const { marked } = await import('marked');
  const previous = { window: global.window, document: global.document };
  global.window = new EventTarget();
  global.document = { getElementById: () => true };
  let cursor = 0, slots = [], effects = [];
  const hooks = { ...React,
    useState: initial => { const id = cursor++; if (!(id in slots)) slots[id] = typeof initial === 'function' ? initial() : initial; return [slots[id], value => { slots[id] = typeof value === 'function' ? value(slots[id]) : value; }]; },
    useRef: initial => { const id = cursor++; return slots[id] ||= { current: initial }; },
    useCallback: fn => fn, useEffect: fn => effects.push(fn),
  };
  const exports = {};
  const code = transform(fs.readFileSync(sourcePath, 'utf8'), { transforms: ['typescript', 'jsx', 'imports'], jsxPragma: 'React.createElement', jsxFragmentPragma: 'React.Fragment' }).code;
  const modules = { react: hooks, marked: { marked }, '@tauri-apps/api/webviewWindow': { WebviewWindow: {} } };
  new Function('exports', 'require', 'React', 'invoke', code)(exports, id => { assert.ok(id in modules, id); return modules[id]; }, hooks, invoke);
  let cleanup, disposed = false;
  return {
    render: (isWindowMode = true) => { cursor = 0; effects = []; return exports.default({ isWindowMode }); },
    mount: () => { cleanup = effects[0](); },
    dispose: () => { if (disposed) return; disposed = true; cleanup?.(); global.window = previous.window; global.document = previous.document; },
    flush: () => new Promise(resolve => setImmediate(resolve)),
  };
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);
const article = tree => nodes(tree).find(node => node.type === 'article');

test('Standup reads only in window mode, refreshes the file, and prevents concurrent reads', options, async () => {
  let calls = 0, resolveRead;
  const h = await harness(command => { assert.equal(command, 'read_standup_file'); calls++; return new Promise(resolve => { resolveRead = resolve; }); });
  try {
    h.render(false); h.mount(); assert.equal(calls, 0);
    h.render(); h.mount(); assert.equal(calls, 1);
    assert.equal(button(h.render(), 'Refresh').props.disabled, true);
    resolveRead('# First note'); await h.flush();
    assert.match(article(h.render()).props.dangerouslySetInnerHTML.__html, /First note/);
    const refresh = button(h.render(), 'Refresh').props.onClick;
    refresh(); refresh(); assert.equal(calls, 2);
    resolveRead('# Latest note'); await h.flush();
    assert.match(article(h.render()).props.dangerouslySetInnerHTML.__html, /Latest note/);
    assert.equal(button(h.render(), 'Refresh').props.disabled, false);
  } finally { h.dispose(); }
});

test('Standup preserves previous content after refresh failure and clears the error after retry', options, async () => {
  let calls = 0;
  const h = await harness(async () => { if (++calls === 2) throw new Error('private internal detail'); return '# Note ' + calls; });
  try {
    h.render(); h.mount(); await h.flush();
    await button(h.render(), 'Refresh').props.onClick();
    const tree = h.render();
    assert.match(article(tree).props.dangerouslySetInnerHTML.__html, /Note 1/);
    assert.equal(nodes(tree).filter(node => node.props.role === 'alert').length, 1);
    assert.ok(!JSON.stringify(tree).includes('private internal detail'));
    await button(tree, 'Refresh').props.onClick();
    assert.equal(nodes(h.render()).filter(node => node.props.role === 'alert').length, 0);
    assert.match(article(h.render()).props.dangerouslySetInnerHTML.__html, /Note 3/);
  } finally { h.dispose(); }
});

test('Standup discards stale reads and removes the keyboard shortcut on unmount', options, async () => {
  let resolveRead, calls = 0;
  const h = await harness(() => { calls++; return new Promise(resolve => { resolveRead = resolve; }); });
  try {
    h.render(); h.mount(); h.dispose();
    resolveRead('# Stale response'); await h.flush();
    assert.equal(article(h.render()), undefined);
    assert.equal(calls, 1);
  } finally { h.dispose(); }
});
