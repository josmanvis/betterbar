const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { transform } = require('sucrase');
const sourcePath = path.join(__dirname, '../extensions/wifi-status/main.tsx');
function harness(invoke = async () => null) {
  let states = [], cursor = 0, effects = [];
  const data = new Map();
  global.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  global.window = new EventTarget();
  const hooks = { ...React, useState: initial => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; }, useEffect: fn => effects.push(fn) };
  const exports = {};
  const code = transform(fs.readFileSync(sourcePath, 'utf8') + '\nexport { readPreferences, fieldValue, formatRate, useStatus };', { transforms: ['typescript', 'jsx', 'imports'] }).code;
  new Function('exports', 'require', 'invoke', code)(exports, id => id === 'react' ? hooks : { WebviewWindow: {} }, invoke);
  return { exports, data, render(fn, props) { cursor = 0; effects = []; return fn(props); }, effects: () => effects };
}
const fixture = { connected: true, download_bps: 1250000, upload_bps: 250000, ipv4: '192.0.2.20', ipv6: null, ssid: null, signal_dbm: -52, link_mbps: 866, speed_test: null };
test('Wi-Fi preferences reject malformed values and preserve independent field choices', { skip: !fs.existsSync(sourcePath) }, () => {
  const h = harness();
  assert.equal(h.exports.readPreferences().fields.download, true);
  h.data.set('bb-wifi-status-preferences', JSON.stringify({ fields: { download: false, upload: true, ip: true, signal: 'yes' }, mode: 'bad', seconds: -10, units: 'bad', captions: 'true' }));
  assert.deepEqual(h.exports.readPreferences(), { fields: { download: false, upload: true, ip: true, signal: false, network: false, link: false }, mode: 'live', units: 'bits', seconds: 2, captions: false });
  h.data.set('bb-wifi-status-preferences', '{bad');
  assert.equal(h.exports.readPreferences().seconds, 2);
});
test('live and test rates use correct units, idle zero, and explicit unavailable states', { skip: !fs.existsSync(sourcePath) }, () => {
  const h = harness(), preferences = h.exports.readPreferences();
  assert.equal(h.exports.fieldValue('download', fixture, preferences), '10.0 Mbps');
  assert.equal(h.exports.fieldValue('upload', fixture, { ...preferences, units: 'bytes' }), '0.25 MB/s');
  assert.equal(h.exports.formatRate(0, 'bits'), '0.00 Mbps');
  assert.equal(h.exports.formatRate(NaN, 'bits'), '—');
  assert.equal(h.exports.fieldValue('download', { ...fixture, connected: false }, preferences), '—');
  assert.equal(h.exports.fieldValue('network', fixture, preferences), 'Network name unavailable');
  assert.equal(h.exports.fieldValue('download', fixture, { ...preferences, mode: 'test' }), '—');
  const status = { ...fixture, connected: false, speed_test: { download_mbps: 100, upload_mbps: null } };
  assert.equal(h.exports.fieldValue('download', status, { ...preferences, mode: 'test' }), '100 Mbps');
  assert.equal(h.exports.fieldValue('upload', status, { ...preferences, mode: 'test' }), '—');
});
test('polling prevents overlap and ignores completed work after unmount without running speed tests', { skip: !fs.existsSync(sourcePath) }, async () => {
  const calls = []; let resolve, tick, cleared = false;
  const oldSet = global.setInterval, oldClear = global.clearInterval;
  global.setInterval = fn => { tick = fn; return 42; }; global.clearInterval = id => { assert.equal(id, 42); cleared = true; };
  try {
    const h = harness(command => { calls.push(command); return new Promise(done => { resolve = done; }); });
    h.render(h.exports.useStatus, 2);
    const cleanup = h.effects()[0]();
    tick(); tick(); assert.deepEqual(calls, ['get_wifi_status']);
    cleanup(); resolve(fixture); await new Promise(done => setImmediate(done));
    assert.equal(h.render(h.exports.useStatus, 2).status, null);
    assert.equal(cleared, true);
  } finally { global.setInterval = oldSet; global.clearInterval = oldClear; }
});
