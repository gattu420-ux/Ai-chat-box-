import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE_KEY, archiveReducer, createConversation, loadArchive, titleFromPrompt } from '../src/components/chat/archive.ts';

const message = (role = 'user', text = 'First prompt') => ({ id: crypto.randomUUID(), role, message: text, createdAt: Date.now() });
const base = () => ({ version: 2, activeId: 'one', conversations: [createConversation('one')] });
const storage = (values) => ({ getItem: (key) => values[key] ?? null });

test('titles normalize whitespace and truncate long first prompts', () => {
  assert.equal(titleFromPrompt('  hello\n world  '), 'hello world');
  assert.equal(titleFromPrompt('x'.repeat(100)).length, 55);
});
test('first prompt sets title; subsequent prompts preserve it', () => {
  let state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  state = archiveReducer(state, { type: 'append', id: 'one', message: message('user', 'Follow up') });
  assert.equal(state.conversations[0].title, 'First prompt');
  assert.equal(state.conversations[0].messages.length, 2);
});
test('new chat archives old messages and selection restores the old session', () => {
  let state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  state = archiveReducer(state, { type: 'new', conversation: createConversation('two') });
  assert.equal(state.activeId, 'two');
  state = archiveReducer(state, { type: 'select', id: 'one' });
  assert.equal(state.activeId, 'one');
  assert.equal(state.conversations.find((chat) => chat.id === 'one').messages[0].message, 'First prompt');
});
test('duplicate empty conversations are not created', () => {
  const state = archiveReducer(base(), { type: 'new', conversation: createConversation('two') });
  assert.equal(state.conversations.length, 1);
  assert.equal(state.activeId, 'one');
});
test('reply stays in the originating conversation after switching', () => {
  let state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  state = archiveReducer(state, { type: 'new', conversation: createConversation('two') });
  state = archiveReducer(state, { type: 'append', id: 'one', message: message('assistant', 'Reply') });
  assert.equal(state.activeId, 'two');
  assert.equal(state.conversations.find((chat) => chat.id === 'two').messages.length, 0);
  assert.equal(state.conversations.find((chat) => chat.id === 'one').messages.length, 2);
});
test('deletion creates a valid fallback and late replies cannot resurrect chats', () => {
  const state = archiveReducer(base(), { type: 'delete', id: 'one', fallback: createConversation('fresh') });
  assert.equal(state.activeId, 'fresh');
  assert.equal(state.conversations.length, 1);
  assert.equal(archiveReducer(state, { type: 'append', id: 'one', message: message('assistant') }), state);
});
test('saved archive round trips without losing messages or selection', () => {
  const state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  assert.deepEqual(loadArchive(storage({ [ARCHIVE_KEY]: JSON.stringify(state) })).archive, state);
});
test('migrates legacy storage while retaining the backend sessionId', () => {
  const result = loadArchive(storage({ 'relay-chat-messages-v1': JSON.stringify([message()]), 'relay-session-id-v1': 'legacy' }));
  assert.equal(result.archive.activeId, 'legacy');
  assert.equal(result.archive.conversations[0].title, 'First prompt');
});
test('corrupt storage and disabled storage recover with a warning', () => {
  assert.ok(loadArchive(storage({ [ARCHIVE_KEY]: '{oops' })).warning);
  assert.ok(loadArchive({ getItem() { throw new Error('disabled'); } }).warning);
  assert.ok(loadArchive(storage({ [ARCHIVE_KEY]: JSON.stringify({ version: 2, conversations: [null] }) })).warning);
});
test('unknown active session repairs selection; duplicate ids are rejected', () => {
  const state = base(); state.activeId = 'missing';
  assert.equal(loadArchive(storage({ [ARCHIVE_KEY]: JSON.stringify(state) })).archive.activeId, 'one');
  state.conversations.push(createConversation('one'));
  assert.ok(loadArchive(storage({ [ARCHIVE_KEY]: JSON.stringify(state) })).warning);
});
