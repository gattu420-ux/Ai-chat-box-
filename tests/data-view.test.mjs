import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const filename = fileURLToPath(new URL('../src/components/chat/MessageBubble.tsx', import.meta.url));
const compiled = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code;
const componentModule = new Module(filename);
componentModule.filename = filename;
componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
componentModule.require = createRequire(filename);
componentModule._compile(compiled, filename);
const render = (data) => renderToStaticMarkup(React.createElement(componentModule.exports.DataView, { data }));

test('single objects render key-value cards, including nested values and zero/false', () => {
  const html = render({ accountName: 'Demo', balance: 0, active: false, address: { city: 'Pune' }, missing: null });
  assert.match(html, /<dl /); assert.match(html, /account Name/); assert.match(html, />0</); assert.match(html, />No</); assert.match(html, /Pune/);
  assert.doesNotMatch(html, /<pre|\[object Object\]/);
});
test('object arrays remain tables and do not silently truncate records', () => {
  const html = render(Array.from({ length: 25 }, (_, i) => ({ id: i, name: `record-${i}` })));
  assert.match(html, /<table /); assert.match(html, /record-24/);
});
test('empty and primitive arrays render safely', () => {
  assert.match(render([]), /No items/); assert.match(render({}), /No fields/);
  assert.match(render(['one', 2, false]), /one/); assert.equal(render(null), '');
});
test('data cannot inject HTML', () => {
  const html = render({ note: '<script>alert(1)</script>' });
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
});

test('grounding sources allow only web links and isolate provider suggestions', () => {
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.SearchSources, { metadata: {
    groundingChunks: [
      { web: { uri: 'https://example.com/news', title: 'Verified source' } },
      { web: { uri: 'javascript:alert(1)', title: 'Bad link' } },
      { web: { uri: 'data:text/html,bad', title: 'Bad data' } },
    ],
    searchEntryPoint: { renderedContent: '<script>alert(1)</script><div>Suggestions</div>' },
  } }));
  assert.match(html, /href="https:\/\/example.com\/news"/);
  assert.match(html, /Verified source/);
  assert.doesNotMatch(html, /href="javascript:|href="data:|<script>/);
  assert.match(html, /sandbox="allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(html, /allow-scripts|allow-same-origin/);
  assert.match(html, /title="Google Search suggestions"/);
});
