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
