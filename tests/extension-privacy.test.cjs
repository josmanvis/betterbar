const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transform } = require('sucrase');
const React = require('react');

test('privacy audit detects sensitive literals without returning their values', async () => {
  const { scanSource, scanDirectory } = await import('../scripts/audit-extension-privacy.mjs');
  const samples = [
    ['personal-path', 'const folder = "/Users/' + 'private-user/Documents";'],
    ['email', 'const account = "private-user@' + 'private.test";'],
    ['embedded-secret', 'const apiKey = "' + 'private-test-secret";'],
    ['private-endpoint', 'fetch("https://' + 'service.internal/api");'],
    ['private-key', '-----BEGIN ' + 'PRIVATE KEY-----'],
  ];
  for (const [rule, source] of samples) {
    const findings = scanSource(source);
    assert.ok(findings.some(finding => finding.rule === rule));
    assert.ok(findings.every(finding => Object.keys(finding).sort().join() === 'file,line,rule'));
    assert.ok(!JSON.stringify(findings).includes('private-user'));
    assert.ok(!JSON.stringify(findings).includes('private-test-secret'));
  }
  assert.deepEqual(scanSource('const folder = "~/.prep-standup/";'), []);
  assert.deepEqual(scanDirectory(path.join(__dirname, '../extensions')), []);
});

test('standup rendering keeps formatting but blocks active HTML, images, and unsafe links', async () => {
  const { marked } = await import('marked');
  const exports = {};
  const code = transform(fs.readFileSync(path.join(__dirname, '../extensions/Standup Update/main.tsx'), 'utf8') + '\nexport { renderStandup };',
    { transforms: ['typescript', 'jsx', 'imports'], jsxPragma: 'React.createElement' }).code;
  const imports = { react: React, marked: { marked }, '@tauri-apps/api/webviewWindow': { WebviewWindow: {} } };
  new Function('exports', 'require', 'React', 'document', code)(exports, name => imports[name], React, { getElementById: () => true });
  const html = exports.renderStandup('# Daily update\n\n**Progress**\n\n<script>steal()</script>\n\n<img src="https://example.com/pixel" onerror="steal()">\n\n![tracker](https://example.com/pixel)\n\n[unsafe](javascript:steal())\n\n[local](file:///tmp/note)\n\n[safe](https://example.com/docs)');
  assert.match(html, /<h1>Daily update<\/h1>/);
  assert.match(html, /<strong>Progress<\/strong>/);
  assert.doesNotMatch(html, /<script|<img|onerror|javascript:|file:\/\/|steal\(/);
  assert.match(html, /href="https:\/\/example.com\/docs"/);
  assert.match(html, /rel="noopener noreferrer" referrerpolicy="no-referrer"/);
});
