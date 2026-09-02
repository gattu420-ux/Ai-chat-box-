import test from 'node:test';
import assert from 'node:assert/strict';
import database from '../server/database.cjs';
import gemini from '../server/gemini.cjs';

test('parallel invocations share one in-flight Mongo connection, then reuse warm pool', async () => {
  let calls = 0, finish;
  const mongoose = { connection: { readyState: 0 }, connect() { calls++; return new Promise((resolve) => { finish = () => { mongoose.connection.readyState = 1; resolve(mongoose); }; }); } };
  const connect = database.createDatabaseConnector(mongoose, 'mongodb://test');
  const a = connect(), b = connect();
  assert.equal(calls, 1);
  finish(); await Promise.all([a, b]); await connect();
  assert.equal(calls, 1);
});
test('connection failures reset the cached promise and can be retried', async () => {
  let calls = 0;
  const mongoose = { connection: { readyState: 0 }, async connect() { if (++calls === 1) throw new Error('temporary'); mongoose.connection.readyState = 1; return mongoose; } };
  const connect = database.createDatabaseConnector(mongoose, 'mongodb://test');
  await assert.rejects(connect(), /temporary/);
  await connect(); assert.equal(calls, 2);
  mongoose.connection.readyState = 0;
  await connect(); assert.equal(calls, 3);
});
test('missing Mongo URI fails clearly', async () => {
  const connect = database.createDatabaseConnector({ connection: { readyState: 0 } }, undefined);
  await assert.rejects(connect(), /MONGO_URI/);
});
test('temporary provider failures retry once, preserving model parameters', async () => {
  let calls = 0, waits = 0;
  const request = { model: 'test-model', contents: 'hello' };
  const ai = { models: { async generateContent(input) { assert.equal(input, request); if (++calls === 1) throw { status: 503 }; return { text: 'hello' }; } } };
  assert.equal((await gemini.generateWithRetry(ai, request, async () => { waits++; })).text, 'hello');
  assert.equal(calls, 2); assert.equal(waits, 1);
});
test('permanent provider errors are never retried; transient retries are bounded', async () => {
  let calls = 0;
  const ai = { models: { async generateContent() { calls++; throw { status: 404 }; } } };
  await assert.rejects(gemini.generateWithRetry(ai, {}, async () => {})); assert.equal(calls, 1);
  calls = 0;
  ai.models.generateContent = async () => { calls++; throw { status: 503 }; };
  await assert.rejects(gemini.generateWithRetry(ai, {}, async () => {})); assert.equal(calls, 2);
});
