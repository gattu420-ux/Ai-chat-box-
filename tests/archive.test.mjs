import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE_KEY, TAB_SESSION_KEY, archiveReducer, createConversation, loadArchive, saveTabSession, serializeArchive, titleFromPrompt } from '../src/components/chat/archive.ts';

const message = (role = 'user', text = 'First prompt') => ({ id: crypto.randomUUID(), role, message: text, createdAt: Date.now() });
const base = () => ({ version: 2, activeId: 'one', draft: createConversation('one'), conversations: [] });
const storage = (values) => ({ getItem: (key) => values[key] ?? null });

test('titles normalize whitespace and truncate long first prompts', () => {
  assert.equal(titleFromPrompt('  hello\n world  '), 'hello world');
  assert.equal(titleFromPrompt('x'.repeat(100)).length, 55);
});
test('first prompt sets title; subsequent prompts preserve it', () => {
  let state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  assert.equal(state.draft, null);
  assert.equal(state.conversations.length, 1);
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
test('New Chat generates a fresh draft without archiving empty conversations', () => {
  const state = archiveReducer(base(), { type: 'new', conversation: createConversation('two') });
  assert.equal(state.conversations.length, 0);
  assert.equal(state.activeId, 'two');
  assert.deepEqual(state.draft.messages, []);
});
test('reply stays in the originating conversation after switching', () => {
  let state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  state = archiveReducer(state, { type: 'new', conversation: createConversation('two') });
  state = archiveReducer(state, { type: 'append', id: 'one', message: message('assistant', 'Reply') });
  assert.equal(state.activeId, 'two');
  assert.equal(state.draft.id, 'two');
  assert.equal(state.draft.messages.length, 0);
  assert.equal(state.conversations.find((chat) => chat.id === 'one').messages.length, 2);
});
test('deletion creates a valid fallback and late replies cannot resurrect chats', () => {
  const state = archiveReducer(base(), { type: 'delete', id: 'one', fallback: createConversation('fresh') });
  assert.equal(state.activeId, 'fresh');
  assert.equal(state.conversations.length, 0);
  assert.equal(archiveReducer(state, { type: 'append', id: 'one', message: message('assistant') }), state);
});
test('without a tab selection, opening the site preserves history but starts a fresh draft', () => {
  const state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  const saved = storage({ [ARCHIVE_KEY]: JSON.stringify(state) });
  const loaded = loadArchive(saved).archive;
  const reloaded = loadArchive(saved).archive;
  assert.deepEqual(loaded.conversations, state.conversations);
  assert.notEqual(loaded.activeId, state.activeId);
  assert.notEqual(reloaded.activeId, loaded.activeId);
  assert.equal(loaded.activeId, loaded.draft.id);
  assert.deepEqual(loaded.draft.messages, []);
  const selected = archiveReducer(loaded, { type: 'select', id: 'one' });
  assert.equal(selected.activeId, 'one');
  assert.deepEqual(selected.conversations[0].messages, state.conversations[0].messages);
});

const writableStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

test('first submission saves tab selection; refresh restores that exact conversation', () => {
  const state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  const tab = writableStorage();
  saveTabSession(state, tab);
  assert.equal(tab.getItem(TAB_SESSION_KEY), 'one');
  const loaded = loadArchive(storage({ [ARCHIVE_KEY]: serializeArchive(state) }), tab).archive;
  assert.equal(loaded.activeId, 'one');
  assert.equal(loaded.draft, null);
  assert.deepEqual(loaded.conversations, state.conversations);
});

test('new tabs start blank and selecting a past chat persists only in that tab', () => {
  let state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  state = archiveReducer(state, { type: 'new', conversation: createConversation('two') });
  state = archiveReducer(state, { type: 'append', id: 'two', message: message() });
  const saved = storage({ [ARCHIVE_KEY]: serializeArchive(state) });
  const firstTab = writableStorage(), secondTab = writableStorage();
  saveTabSession(state, firstTab);
  const second = loadArchive(saved, secondTab).archive;
  assert.deepEqual(second.draft.messages, []);
  assert.deepEqual(second.conversations, state.conversations);
  saveTabSession(archiveReducer(second, { type: 'select', id: 'one' }), secondTab);
  assert.equal(loadArchive(saved, secondTab).archive.activeId, 'one');
  assert.equal(loadArchive(saved, firstTab).archive.activeId, 'two');
});

test('New Chat clears the tab selection; refresh stays blank without dropping history', () => {
  let state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  const tab = writableStorage();
  saveTabSession(state, tab);
  state = archiveReducer(state, { type: 'new', conversation: createConversation('fresh') });
  saveTabSession(state, tab);
  assert.equal(tab.getItem(TAB_SESSION_KEY), null);
  const loaded = loadArchive(storage({ [ARCHIVE_KEY]: serializeArchive(state) }), tab).archive;
  assert.deepEqual(loaded.draft.messages, []);
  assert.notEqual(loaded.activeId, 'one');
  assert.equal(loaded.conversations[0].messages.length, 1);
});

test('stale or deleted tab selection falls back safely and clears the stale key', () => {
  const tab = writableStorage(); tab.setItem(TAB_SESSION_KEY, 'deleted');
  const loaded = loadArchive(storage({ [ARCHIVE_KEY]: serializeArchive(base()) }), tab).archive;
  assert.deepEqual(loaded.draft.messages, []);
  saveTabSession(loaded, tab);
  assert.equal(tab.getItem(TAB_SESSION_KEY), null);
});

test('blocked tab storage does not erase readable shared history', () => {
  const state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  const loaded = loadArchive(storage({ [ARCHIVE_KEY]: serializeArchive(state) }), {
    getItem() { throw new Error('disabled'); }
  });
  assert.ok(loaded.tabWarning);
  assert.equal(loaded.warning, undefined);
  assert.deepEqual(loaded.archive.conversations, state.conversations);
});
test('migrates legacy storage while retaining the backend sessionId', () => {
  const result = loadArchive(storage({ 'relay-chat-messages-v1': JSON.stringify([message()]), 'relay-session-id-v1': 'legacy' }));
  assert.notEqual(result.archive.activeId, 'legacy');
  assert.equal(result.archive.conversations[0].id, 'legacy');
  assert.deepEqual(result.archive.draft.messages, []);
  assert.equal(result.archive.conversations[0].title, 'First prompt');
});
test('corrupt storage and disabled storage recover with a warning', () => {
  assert.ok(loadArchive(storage({ [ARCHIVE_KEY]: '{oops' })).warning);
  assert.ok(loadArchive({ getItem() { throw new Error('disabled'); } }).warning);
  assert.ok(loadArchive(storage({ [ARCHIVE_KEY]: JSON.stringify({ version: 2, conversations: [null] }) })).warning);
});
test('stored selection is ignored; duplicate ids are rejected', () => {
  const state = base(); state.activeId = 'missing';
  assert.notEqual(loadArchive(storage({ [ARCHIVE_KEY]: JSON.stringify(state) })).archive.activeId, 'missing');
  state.conversations.push(createConversation('one'), createConversation('one'));
  assert.ok(loadArchive(storage({ [ARCHIVE_KEY]: JSON.stringify(state) })).warning);
});

test('only submitted conversations are persisted; repeated reloads do not add empty sidebar entries', () => {
  const initial = loadArchive().archive;
  assert.equal(initial.conversations.length, 0);
  assert.deepEqual(JSON.parse(serializeArchive(initial)), { version: 2, conversations: [] });
  const submitted = archiveReducer(initial, { type: 'append', id: initial.activeId, message: message() });
  assert.equal(submitted.conversations[0].id, initial.activeId);
  let saved = serializeArchive(submitted);
  for (let i = 0; i < 3; i++) {
    const loaded = loadArchive(storage({ [ARCHIVE_KEY]: saved })).archive;
    assert.deepEqual(loaded.conversations, submitted.conversations);
    assert.deepEqual(loaded.draft.messages, []);
    saved = serializeArchive(loaded);
  }
});

test('old empty drafts are omitted without dropping any conversation messages', () => {
  const state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  state.conversations.unshift(createConversation('old-empty'));
  const loaded = loadArchive(storage({ [ARCHIVE_KEY]: JSON.stringify(state) })).archive;
  assert.deepEqual(loaded.conversations.map((chat) => chat.id), ['one']);
  assert.equal(loaded.conversations[0].messages.length, 1);
});

test('deleting the selected saved chat opens a fresh draft, not another saved chat', () => {
  let state = archiveReducer(base(), { type: 'append', id: 'one', message: message() });
  state = archiveReducer(state, { type: 'new', conversation: createConversation('two') });
  state = archiveReducer(state, { type: 'append', id: 'two', message: message() });
  state = archiveReducer(state, { type: 'delete', id: 'two', fallback: createConversation('fresh') });
  assert.equal(state.activeId, 'fresh');
  assert.deepEqual(state.conversations.map((chat) => chat.id), ['one']);
  assert.equal(archiveReducer(state, { type: 'append', id: 'two', message: message('assistant') }), state);
});
