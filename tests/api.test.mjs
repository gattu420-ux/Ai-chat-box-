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
  const fakeAi = { models: { async generateContent(request) { requests.push(request); const result = responses.shift(); if (result instanceof Error) throw result; return typeof result === 'object' ? result : { text: result }; } } };
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

const searchFixture = {
  text: 'Recent technology headline from a verified source.',
  candidates: [{ groundingMetadata: {
    webSearchQueries: ['technology news this week'],
    groundingChunks: [{ web: { uri: 'https://example.com/news', title: 'Example News' } }],
    groundingSupports: [{ segment: { endIndex: 51 }, groundingChunkIndices: [0] }],
    searchEntryPoint: { renderedContent: '<div>Google Search suggestions</div>' },
  } }],
};

test('current questions call Google Search separately and return real provider metadata', async () => {
  await harness([JSON.stringify({ intent: 'answer_question', needsSearch: true, searchQuery: 'technology headlines this week', answer: 'Do not use this ungrounded draft.' }), searchFixture], async ({ post, requests, writes }) => {
    const response = await post({ sessionId: 'search-fixture', message: 'Latest tech headlines this week?' });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.routingSource, 'gemini_grounded_search');
    assert.equal(payload.message, searchFixture.text);
    assert.deepEqual(payload.groundingMetadata, searchFixture.candidates[0].groundingMetadata);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].config.tools, undefined);
    assert.deepEqual(requests[1].config.tools, [{ googleSearch: {} }]);
    assert.equal(requests[1].config.responseMimeType, undefined);
    assert.equal(requests[1].contents.length, 1);
    assert.equal(requests[1].contents[0].parts[0].text, 'technology headlines this week');
    assert.match(requests[1].config.systemInstruction, /Current UTC date: \d{4}-\d{2}-\d{2}/);
    assert.equal(writes.length, 1);
  });
});

test('ungrounded output cannot be advertised as a successful search or saved as fact', async () => {
  await harness([JSON.stringify({ intent: 'answer_question', needsSearch: true }), 'I searched the web, trust me.'], async ({ post, writes }) => {
    const response = await post({ sessionId: 'search-fixture', message: 'Latest tech headlines?' });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /did not return verifiable sources/);
    assert.equal(writes.length, 0);
  });
});

test('search quota failures are explicit and never save an unverified answer', async () => {
  const quota = () => Object.assign(new Error('private quota details'), { status: 429 });
  await harness([JSON.stringify({ intent: 'answer_question', needsSearch: true }), quota(), quota()], async ({ post, writes }) => {
    const response = await post({ sessionId: 'quota-fixture', message: 'Latest tech news?' });
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.code, 'SEARCH_QUOTA_EXCEEDED');
    assert.match(payload.error, /Google quota or rate limit/);
    assert.doesNotMatch(payload.error, /private quota details/);
    assert.equal(writes.length, 0);
  });
});

test('recent internal orders remain database-only even if search flag is set', async () => {
  await harness([JSON.stringify({ intent: 'query_data', target: 'orders', filters: {}, needsSearch: true })], async ({ post, requests }) => {
    const response = await post({ sessionId: 'orders-fixture', message: 'Show our most recent internal orders' });
    assert.equal(response.status, 200);
    assert.match((await response.json()).routingSource, /MongoDB/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].config.tools, undefined);
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
