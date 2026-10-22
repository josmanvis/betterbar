const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { transform } = require('sucrase');

const root = path.resolve(__dirname, '..');
function evaluate(file, modules = {}) {
  const exports = {};
  const code = transform(fs.readFileSync(path.join(root, file), 'utf8'), {
    transforms: ['typescript', 'jsx', 'imports'], jsxPragma: 'React.createElement', jsxFragmentPragma: 'React.Fragment',
  }).code;
  new Function('exports', 'require', 'React', code)(exports, id => {
    assert.ok(id in modules, `Unexpected import ${id}`);
    return modules[id];
  }, React);
  return exports;
}
const appearance = evaluate('src/appearance.ts');
const types = evaluate('src/types.ts');
const replacements = evaluate('src/extension-replacements.ts');
const layout = evaluate('src/bar-layout.ts', { './types': types, './extension-replacements': replacements });
const store = evaluate('src/store.ts', {
  react: React, './types': types, './appearance': appearance, './tauri-bridge': {},
  './extensions-runtime': {}, './extension-replacements': replacements, './bar-layout': layout,
});

test('legacy, invalid, and saved settings appearances sanitize independently of all taskbar preferences', () => {
  const original = store.sanitize({ ...types.DEFAULT_CONFIG, accentColor: '#b375ff', barSize: 32, activeAppStyle: 'halo' });
  assert.equal(original.settingsAppearance, 'system');
  for (const [input, expected] of [[undefined, 'system'], ['system', 'system'], ['dark', 'dark'], ['light', 'light'], ['custom', 'system'], [null, 'system'], [{}, 'system']]) {
    const config = store.sanitize(JSON.parse(JSON.stringify({ ...original, settingsAppearance: input })));
    assert.equal(config.settingsAppearance, expected);
    const { settingsAppearance, ...bar } = config;
    const { settingsAppearance: previous, ...originalBar } = original;
    assert.deepEqual(bar, originalBar);
    assert.deepEqual(appearance.barSurface(config), appearance.barSurface(original));
    assert.deepEqual(appearance.themeStyle(config), appearance.themeStyle(original));
  }
});

test('settings resolves semantic system tokens without inheriting taskbar or extension colors', () => {
  for (const mode of ['system', 'dark', 'light']) {
    const config = { ...types.DEFAULT_CONFIG, settingsAppearance: mode, accentColor: '#b375ff', extensionAppearance: { time: { colors: { accent: '#ff0000' } } } };
    const theme = appearance.settingsThemeStyle(config);
    const prefix = mode === 'system' ? '--mac' : `--mac-${mode}`;
    assert.equal(theme['--bb-bg'], `var(${prefix}-background)`);
    assert.equal(theme['--bb-accent'], `var(${prefix}-accent)`);
    assert.equal(theme.colorScheme, mode === 'system' ? 'light dark' : mode);
    assert.equal(appearance.themeStyle(config)['--bb-accent'], '#b375ff');
  }
});

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}

test('appearance buttons change only Settings and bar customizations retain the existing update contract', () => {
  const patches = [];
  const hooks = { ...React, useState: initial => [initial, () => {}], useEffect: () => {} };
  const { SettingsAppearanceEditor } = evaluate('src/components/SettingsAppearanceEditor.tsx', {
    react: hooks, './AppearanceEditor': { AppearanceEditor: 'bar-editor' },
  });
  const config = store.sanitize(types.DEFAULT_CONFIG);
  const tree = SettingsAppearanceEditor({ config, update: patch => patches.push(patch), revealCustom: true });
  const buttons = nodes(tree).filter(node => node.type === 'button');
  assert.equal(buttons.length, 3);
  for (const [index, mode] of ['system', 'light', 'dark'].entries()) {
    buttons[index].props.onClick();
    assert.deepEqual(patches.at(-1), { settingsAppearance: mode });
  }
  assert.equal(nodes(tree).find(node => node.type === 'details').props.open, true);
  const editor = nodes(tree).find(node => node.type === 'bar-editor');
  editor.props.update({ accentColor: '#00ff00' });
  assert.deepEqual(patches.at(-1), { accentColor: '#00ff00' });
});

test('system symbol loading shares a request across consumers, caches success, and retries failures', async () => {
  let requests = 0;
  const symbols = evaluate('src/system-symbols.ts', { './tauri-bridge': { getSystemSymbols: async () => {
    if (++requests === 1) throw new Error('unavailable');
    return { layout: 'data:image/png;base64,sample' };
  } } });
  const failed = await Promise.all([symbols.systemSymbols(), symbols.systemSymbols()]);
  assert.equal(requests, 1);
  assert.deepEqual(failed, [{}, {}]);
  const success = await Promise.all([symbols.systemSymbols(), symbols.systemSymbols()]);
  assert.equal(requests, 2);
  assert.equal(success[0].layout, 'data:image/png;base64,sample');
  await symbols.systemSymbols();
  assert.equal(requests, 2);
});

test('native Settings appearance refreshes on focus and removes listeners on unmount', async () => {
  const previous = { window: global.window, document: global.document };
  let effect, deps, cleanup;
  const listeners = new Map(), media = new Map(), css = new Map(), dataset = {};
  let requests = 0;
  const themes = [];
  global.window = {
    addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key),
    matchMedia: () => ({ addEventListener: (key, fn) => media.set(key, fn), removeEventListener: key => media.delete(key) }),
  };
  global.document = { documentElement: { dataset, style: {} }, querySelector: selector => { assert.equal(selector, '.bb-settings'); return { style: { setProperty: (key, value) => css.set(key, value) } }; } };
  try {
    const { SettingsAppearance } = evaluate('src/components/SettingsAppearance.tsx', {
      react: { useEffect: (fn, dependencies) => { effect = fn; deps = dependencies; } },
      '@tauri-apps/api/window': { getCurrentWindow: () => ({ setTheme: async mode => themes.push(mode) }) },
      '../appearance': appearance,
      '../tauri-bridge': { getMacosPreferences: async () => { requests++; return { accent: '#ff00ff', reduce_transparency: true, increase_contrast: true, reduce_motion: true }; } },
    });
    SettingsAppearance({ config: { ...types.DEFAULT_CONFIG, settingsAppearance: 'dark' } });
    assert.deepEqual(deps, ['dark'], 'bar geometry and palette edits must not reload native preferences');
    cleanup = effect();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(themes, ['dark']);
    assert.equal(dataset.macosAppearance, 'dark');
    assert.equal(dataset.nativeReduceTransparency, 'true');
    assert.equal(dataset.nativeIncreaseContrast, 'true');
    assert.equal(dataset.nativeReduceMotion, 'true');
    assert.equal(css.get('--mac-accent'), '#ff00ff');
    assert.equal(requests, 1);
    await listeners.get('focus')();
    assert.equal(requests, 2);
    cleanup(); cleanup = null;
    assert.equal(listeners.size, 0);
    assert.equal(media.size, 0);
  } finally {
    cleanup?.(); global.window = previous.window; global.document = previous.document;
  }
});

test('native CSS is syntactically valid and every selector is scoped to Settings', () => {
  const css = require('postcss').parse(fs.readFileSync(path.join(root, 'src/settings-native.css'), 'utf8'));
  css.walkRules(rule => {
    assert.ok(rule.selector.trim(), 'empty selectors break production styles');
    for (const selector of rule.selectors) assert.ok(selector.includes('.bb-settings'), selector);
    assert.ok(!rule.selector.includes('.bb-native-bar'), rule.selector);
  });
  const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json')));
  const settings = config.app.windows.find(window => window.label === 'settings');
  assert.equal(settings.titleBarStyle, 'Overlay');
  assert.equal(settings.hiddenTitle, true);
  const capability = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/capabilities/settings.json')));
  assert.deepEqual(capability.windows, ['settings']);
});

test('a clean checkout builds without local extensions while explicit missing audit paths fail', () => {
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'betterbar-audit-'));
  try {
    fs.mkdirSync(path.join(directory, 'scripts'));
    const script = path.join(fs.realpathSync(directory), 'scripts/audit-extension-privacy.mjs');
    fs.copyFileSync(path.join(root, 'scripts/audit-extension-privacy.mjs'), script);
    const clean = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stderr);
    const explicit = spawnSync(process.execPath, [script, path.join(directory, 'missing')], { encoding: 'utf8' });
    assert.equal(explicit.status, 1);
    assert.match(explicit.stderr, /directory unavailable/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
