import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const realRequire = createRequire(new URL('../api/index.js', import.meta.url));
const source = fs.readFileSync(new URL('../api/index.js', import.meta.url), 'utf8');

async function harness(responses, run) {
  const requests = [], writes = [];
  let connections = 0;
  const model = { find() { return { sort() { return this; }, limit() { return this; }, async lean() { return []; } }; }, async insertMany(items) { writes.push(items); } };
  const mongoose = { Schema: class {}, models: {}, model() { return model; }, connection: { readyState: 0 }, async connect() { connections++; this.connection.readyState = 1; return this; } };
  const fakeAi = { models: { async generateContent(request) { requests.push(request); const result = responses.shift(); if (result instanceof Error) throw result; return { text: result }; } } };
  const context = { performance, module: { exports: {} }, console: { warn() {}, error() {}, log() {} }, process: { env: { VERCEL: '1', MONGO_URI: 'mongodb://fixture', GEMINI_API_KEY: 'fixture', GEMINI_MODEL: 'gemini-3.5-flash-lite' } },
    require(name) {
      if (name === 'mongoose') return mongoose;
      if (name === '@google/genai') return { GoogleGenAI: class { constructor() { return fakeAi; } } };
      return realRequire(name);
    } };
  vm.runInNewContext(source, context);
  const server = context.module.exports.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/chat/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try { await run({ base, post, requests, writes, connections: () => connections }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('health and invalid inputs do not connect to MongoDB or call Gemini', async () => {
  await harness([], async ({ base, post, requests, connections }) => {
    assert.equal((await fetch(`${base}/api`)).status, 200);
    assert.equal((await post({ message: 'hello' })).status, 400);
    assert.equal((await post({ sessionId: { $ne: null }, message: 'hello' })).status, 400);
    assert.equal((await post({ sessionId: 'fixture', message: ' ' })).status, 400);
    assert.equal(requests.length, 0); assert.equal(connections(), 0);
  });
});
test('general reply uses one model request and one combined history write', async () => {
  await harness([JSON.stringify({ intent: 'answer_question', answer: 'Hello there.' })], async ({ post, requests, writes }) => {
    const response = await post({ sessionId: 'fixture', message: 'hello' });
    assert.equal(response.status, 200); assert.equal((await response.json()).message, 'Hello there.');
    assert.match(response.headers.get('server-timing'), /db_connect;dur=/);
    assert.equal(requests.length, 1); assert.equal(requests[0].model, 'gemini-3.5-flash-lite');
    assert.equal(writes.length, 1); assert.equal(writes[0].length, 2);
    assert.equal(writes[0][0].role, 'user'); assert.equal(writes[0][1].role, 'assistant');
  });
});
test('fallback answer uses the same stable model when classification omits an answer', async () => {
  await harness([JSON.stringify({ intent: 'answer_question' }), 'Fallback reply'], async ({ post, requests }) => {
    const response = await post({ sessionId: 'fixture', message: 'hello' });
    assert.equal(response.status, 200); assert.equal((await response.json()).message, 'Fallback reply');
    assert.equal(requests.length, 2); assert.ok(requests.every((request) => request.model === 'gemini-3.5-flash-lite'));
  });
});
test('persistent Gemini overload remains an honest 503 and never writes history', async () => {
  const busy = () => Object.assign(new Error('private provider details'), { status: 503 });
  await harness([busy(), busy()], async ({ post, requests, writes }) => {
    const response = await post({ sessionId: 'fixture', message: 'hello' });
    assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), '2');
    assert.doesNotMatch(await response.text(), /private provider details/);
    assert.equal(requests.length, 2); assert.equal(writes.length, 0);
  });
});

test('both Gemini paths share the universal persona and open greeting guidance', async () => {
  await harness([JSON.stringify({ intent: 'answer_question' }), 'Hello! How can I help you today?'], async ({ post, requests }) => {
    const response = await post({ sessionId: 'greeting-check', message: 'hi' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).message, 'Hello! How can I help you today?');
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.match(request.config.systemInstruction, /Universal AI assistant/);
      assert.match(request.config.systemInstruction, /code generation and debugging, creative writing, research/);
      assert.match(request.config.systemInstruction, /Hello! How can I help you today/);
      assert.doesNotMatch(request.config.systemInstruction, /1-3 sentences/);
      assert.ok(request.config.maxOutputTokens >= 4096);
    }
    assert.ok(requests[0].config.systemInstruction.includes(requests[1].config.systemInstruction));
    assert.match(requests[0].config.systemInstruction, /Use database intents ONLY/);
    assert.match(requests[0].config.systemInstruction, /write SQL to query orders/);
  });
});
