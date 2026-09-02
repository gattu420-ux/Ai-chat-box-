import type { Conversation, ConversationArchive, Message } from './types';

export const ARCHIVE_KEY = 'relay-conversations-v2';
const LEGACY_MESSAGES = 'relay-chat-messages-v1';
const LEGACY_SESSION = 'relay-session-id-v1';

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function createConversation(id: string = createId()): Conversation {
  const now = Date.now();
  return { id, title: 'New conversation', messages: [], createdAt: now, updatedAt: now };
}

export function titleFromPrompt(prompt: string) {
  const title = prompt.replace(/\s+/g, ' ').trim();
  return title.length > 54 ? `${title.slice(0, 54)}…` : title || 'New conversation';
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const message = value as Message;
  return typeof message.id === 'string' && ['user', 'assistant'].includes(message.role) &&
    typeof message.message === 'string' && Number.isFinite(message.createdAt);
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false;
  const chat = value as Conversation;
  return typeof chat.id === 'string' && !!chat.id && typeof chat.title === 'string' &&
    Number.isFinite(chat.createdAt) && Number.isFinite(chat.updatedAt) &&
    Array.isArray(chat.messages) && chat.messages.every(isMessage);
}

function freshArchive(): ConversationArchive {
  const chat = createConversation();
  return { version: 2, activeId: chat.id, conversations: [chat] };
}

// Read lazily before the first render: an empty mount effect must never erase history.
export function loadArchive(storage?: Pick<Storage, 'getItem'>): { archive: ConversationArchive; warning?: string } {
  try {
    if (!storage) return { archive: freshArchive() };
    const saved = storage.getItem(ARCHIVE_KEY);
    if (saved) {
      const value = JSON.parse(saved);
      if (value?.version !== 2 || !Array.isArray(value.conversations) ||
          !value.conversations.every(isConversation) ||
          new Set(value.conversations.map((chat: Conversation) => chat.id)).size !== value.conversations.length) {
        throw new Error('Invalid conversation archive');
      }
      if (!value.conversations.length) return { archive: freshArchive() };
      return { archive: { version: 2, conversations: value.conversations,
        activeId: value.conversations.some((chat: Conversation) => chat.id === value.activeId)
          ? value.activeId : value.conversations[0].id } };
    }
    const legacy = JSON.parse(storage.getItem(LEGACY_MESSAGES) || '[]');
    if (Array.isArray(legacy) && legacy.length && legacy.every(isMessage)) {
      const chat = createConversation(storage.getItem(LEGACY_SESSION) || createId());
      chat.messages = legacy;
      chat.title = titleFromPrompt(legacy.find((message) => message.role === 'user')?.message || 'Saved conversation');
      chat.createdAt = legacy[0].createdAt;
      chat.updatedAt = legacy[legacy.length - 1].createdAt;
      return { archive: { version: 2, activeId: chat.id, conversations: [chat] } };
    }
    return { archive: freshArchive() };
  } catch {
    return { archive: freshArchive(), warning: 'Saved chats could not be loaded. Existing stored data has not been changed.' };
  }
}

export type ArchiveAction =
  | { type: 'new'; conversation: Conversation }
  | { type: 'select'; id: string }
  | { type: 'delete'; id: string; fallback: Conversation }
  | { type: 'append'; id: string; message: Message };

export function archiveReducer(state: ConversationArchive, action: ArchiveAction): ConversationArchive {
  switch (action.type) {
    case 'new': {
      const empty = state.conversations.find((chat) => chat.messages.length === 0);
      return { ...state, activeId: empty?.id ?? action.conversation.id,
        conversations: empty ? state.conversations : [action.conversation, ...state.conversations] };
    }
    case 'select':
      return state.conversations.some((chat) => chat.id === action.id) ? { ...state, activeId: action.id } : state;
    case 'delete': {
      const remaining = state.conversations.filter((chat) => chat.id !== action.id);
      const conversations = remaining.length ? remaining : [action.fallback];
      return { ...state, conversations, activeId: state.activeId === action.id ? conversations[0].id : state.activeId };
    }
    case 'append': {
      // A late response cannot resurrect a deleted chat or land in a different session.
      if (!state.conversations.some((chat) => chat.id === action.id)) return state;
      const conversations = state.conversations.map((chat) => chat.id !== action.id ? chat : {
        ...chat,
        title: action.message.role === 'user' && !chat.messages.some((message) => message.role === 'user')
          ? titleFromPrompt(action.message.message) : chat.title,
        updatedAt: action.message.createdAt,
        messages: [...chat.messages, action.message],
      }).sort((a, b) => b.updatedAt - a.updatedAt);
      return { ...state, conversations };
    }
  }
}
