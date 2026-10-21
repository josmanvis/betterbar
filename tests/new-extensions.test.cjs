const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { transform } = require('sucrase');
function harness(file, extra, invoke = async () => null) {
  let states = [], cursor = 0, effects = [];
  const data = new Map();
  global.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  global.window = new EventTarget(); global.document = new EventTarget(); document.hidden = false;
  const hooks = { ...React, useState: initial => { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useCallback: fn => fn, useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8') + `\nexport { ${extra} };`;
  const code = transform(source, { transforms: ['typescript', 'jsx', 'imports'], jsxPragma: 'React.createElement', jsxFragmentPragma: 'React.Fragment' }).code;
  const webview = { getCurrent: () => ({ onFocusChanged: async () => () => {} }) };
  const modules = { react: hooks, '@tauri-apps/api/webviewWindow': { WebviewWindow: webview } };
  new Function('exports', 'require', 'React', 'invoke', code)(exports, id => { assert.ok(id in modules, id); return modules[id]; }, hooks, invoke);
  return { exports, data, render: (fn, props = {}) => { cursor = 0; effects = []; return fn(props); }, effects: () => effects, restart: () => { states = []; } };
}
function nodes(node) { return !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
function text(node) { return typeof node === 'string' ? node : !node || typeof node !== 'object' ? '' : React.Children.toArray(node.props?.children).map(text).join(' '); }

test('focus timer pause/resume, sleep, completion, and restart use persisted deadlines', () => {
  const oldNow = Date.now;
  let now = 1_000_000; Date.now = () => now;
  try {
    const h = harness('extensions/focus-timer/main.tsx', 'readPreferences, readTimer, remaining, formatTime, useTimer');
    let timer = h.render(h.exports.useTimer);
    timer.start(); let saved = h.exports.readTimer(); assert.equal(saved.end, now + 25 * 60_000);
    now += 60_000; timer = h.render(h.exports.useTimer); timer.pause();
    assert.equal(h.exports.readTimer().remaining, 24 * 60_000);
    now += 60_000; timer = h.render(h.exports.useTimer); timer.start();
    assert.equal(h.exports.readTimer().end, now + 24 * 60_000);
    h.restart(); timer = h.render(h.exports.useTimer); assert.equal(timer.milliseconds, 24 * 60_000);
    now += 30 * 60_000;
    assert.equal(h.exports.remaining(h.exports.readTimer(), now), 0);
    const cleanup = h.effects().at(-1)();
    assert.equal(h.exports.readTimer().completed, true);
    assert.equal(h.exports.readTimer().running, false); cleanup();
    timer = h.render(h.exports.useTimer); timer.start('break');
    assert.equal(h.exports.readTimer().total, 5 * 60_000);
    assert.equal(h.exports.formatTime(60_001), '1:01');
    h.data.set('bb-focus-timer-preferences', JSON.stringify({ focus: -9, break: 999 }));
    assert.deepEqual(h.exports.readPreferences(), { focus: 1, break: 60 });
  } finally { Date.now = oldNow; }
});

test('calendar waits for explicit connection and hides titles in native requests by default', async () => {
  const calls = []; let granted = false;
  const h = harness('extensions/apple-calendar/main.tsx', 'readPreferences, AgendaWindow, dayKey', async (command, args) => {
    calls.push([command, args]);
    if (command === 'request_apple_calendar_access') { granted = true; return 'authorized'; }
    return { status: granted ? 'authorized' : 'not-determined', calendars: [], events: [], truncated: false };
  });
  assert.equal(h.exports.readPreferences().showTitles, false);
  let tree = h.render(h.exports.AgendaWindow);
  const cleanups = h.effects().map(effect => effect()).filter(value => typeof value === 'function');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls[0], ['get_apple_calendar_agenda', { days: 7, showTitles: false }]);
  assert.ok(!calls.some(([command]) => command === 'request_apple_calendar_access'));
  tree = h.render(h.exports.AgendaWindow);
  const connect = nodes(tree).find(node => node.type === 'button' && text(node) === 'Connect calendars');
  assert.ok(connect); connect.props.onClick(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.some(([command]) => command === 'request_apple_calendar_access'));
  tree = h.render(h.exports.AgendaWindow); assert.match(text(tree), /No upcoming events/);
  assert.ok(!h.data.has('events'));
  for (const cleanup of cleanups) cleanup();
  h.data.set('bb-apple-calendar-preferences', JSON.stringify({ days: 999, showTitles: 'yes', calendarId: 9 }));
  assert.deepEqual(h.exports.readPreferences(), { days: 7, showTitles: false, calendarId: '' });
});

test('system monitor has bounded preferences and hides readouts without hiding its icon', async () => {
  const calls = [];
  const h = harness('extensions/system-monitor/main.tsx', 'readPreferences', async command => { calls.push(command); return { cpu_percent: 15, memory_percent: 50, memory_used: 4, memory_total: 8 }; });
  let tree = h.render(h.exports.default, { showLabels: false, iconSize: 28, slotSize: 36 });
  const cleanups = h.effects().map(effect => effect()).filter(value => typeof value === 'function');
  await new Promise(resolve => setImmediate(resolve));
  tree = h.render(h.exports.default, { showLabels: false, iconSize: 28, slotSize: 36 });
  assert.ok(nodes(tree).some(node => node.type === 'svg'));
  assert.ok(!nodes(tree).some(node => 'data-bb-extension-label' in node.props));
  assert.match(tree.props.title, /CPU 15%/);
  assert.deepEqual(calls, ['get_system_stats']);
  assert.equal(h.data.size, 0);
  for (const cleanup of cleanups) cleanup();
  h.data.set('bb-system-monitor-preferences', JSON.stringify({ metric: 'invalid', seconds: -1 }));
  assert.deepEqual(h.exports.readPreferences(), { metric: 'both', seconds: 5, graph: true });
});
