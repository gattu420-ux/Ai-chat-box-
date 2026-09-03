import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const filename = fileURLToPath(new URL('../src/components/chat/ChatApp.tsx', import.meta.url));
const modules = new Map();
function loadComponent(file) {
  if (modules.has(file)) return modules.get(file);
  const component = new Module(file);
  modules.set(file, component);
  component.filename = file;
  component.paths = Module._nodeModulePaths(path.dirname(file));
  const nativeRequire = createRequire(file);
  component.require = (name) => {
    if (!name.startsWith('.')) return nativeRequire(name);
    const base = path.resolve(path.dirname(file), name);
    const resolved = [base, base + '.tsx', base + '.ts', base + '.js'].find((candidate) =>
      fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) throw new Error('Cannot resolve local component: ' + name);
    return loadComponent(resolved).exports;
  };
  component._compile(transformSync(fs.readFileSync(file, 'utf8'), {
    loader: file.endsWith('.tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic',
  }).code, file);
  return component;
}
const component = loadComponent(filename);

test('initial ChatApp render keeps saved titles in sidebar without restoring any message feed', (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  let tabReads = 0;
  const saved = JSON.stringify({ version: 2, activeId: 'old-session', conversations: [{
    id: 'old-session', title: 'Saved sidebar title', createdAt: 1, updatedAt: 2,
    messages: [{ id: 'old-message', role: 'user', message: 'Private old message body', createdAt: 2 }],
  }] });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: { getItem: (key) => key === 'relay-conversations-v2' ? saved : null },
    get sessionStorage() {
      tabReads++;
      return { getItem: () => 'old-session' };
    },
  } });
  // Simulate initial mount and remount/refresh with both old selection stores populated.
  for (let i = 0; i < 2; i++) {
    const html = renderToStaticMarkup(React.createElement(component.exports.ChatApp));
    assert.match(html, /Open conversation: Saved sidebar title/);
    assert.match(html, /New Chat/);
    assert.match(html, /Start with a question below/);
    assert.doesNotMatch(html, /<article|Private old message body|aria-current="page"/);
  }
  assert.equal(tabReads, 0, 'mount must ignore the former sessionStorage selection');
});
