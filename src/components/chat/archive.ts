import type { Conversation, ConversationArchive, Message } from './types';

export const ARCHIVE_KEY = 'relay-conversations-v2';
const LEGACY_MESSAGES = 'relay-chat-messages-v1';
const LEGACY_SESSION = 'relay-session-id-v1';

// The unsent draft is visit-local, never part of the saved sidebar archive.
export type ChatArchiveState = ConversationArchive & { draft: Conversation | null };

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function createConversation(id: string = createId()): Conversation {
  const now = Date.now();
  return { id, title: 'New Chat', messages: [], createdAt: now, updatedAt: now };
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

function freshArchive(conversations: Conversation[] = []): ChatArchiveState {
  const chat = createConversation();
  return { version: 2, activeId: chat.id, draft: chat, conversations };
}

export function serializeArchive(state: ChatArchiveState): string {
  // Selection and unsent drafts must not be restored on the next page load.
  return JSON.stringify({ version: 2, conversations: state.conversations });
}

// Read lazily before the first render: an empty mount effect must never erase history.
export function loadArchive(storage?: Pick<Storage, 'getItem'>): { archive: ChatArchiveState; warning?: string } {
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
      // Older versions saved activeId and empty drafts. Keep all real history,
      // but always open a newly generated, unarchived conversation.
      return { archive: freshArchive(value.conversations.filter((chat: Conversation) => chat.messages.length > 0)) };
    }
    const legacy = JSON.parse(storage.getItem(LEGACY_MESSAGES) || '[]');
    if (Array.isArray(legacy) && legacy.length && legacy.every(isMessage)) {
      const chat = createConversation(storage.getItem(LEGACY_SESSION) || createId());
      chat.messages = legacy;
      chat.title = titleFromPrompt(legacy.find((message) => message.role === 'user')?.message || 'Saved conversation');
      chat.createdAt = legacy[0].createdAt;
      chat.updatedAt = legacy[legacy.length - 1].createdAt;
      return { archive: freshArchive([chat]) };
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

export function archiveReducer(state: ChatArchiveState, action: ArchiveAction): ChatArchiveState {
  switch (action.type) {
    case 'new': {
      return { ...state, activeId: action.conversation.id, draft: action.conversation };
    }
    case 'select':
      return state.conversations.some((chat) => chat.id === action.id) ? { ...state, activeId: action.id } : state;
    case 'delete': {
      const remaining = state.conversations.filter((chat) => chat.id !== action.id);
      return { ...state, conversations: remaining,
        ...(state.activeId === action.id ? { activeId: action.fallback.id, draft: action.fallback } : {}) };
    }
    case 'append': {
      // A late response cannot resurrect a deleted chat or land in a different session.
      const committingDraft = state.draft?.id === action.id && state.activeId === action.id && action.message.role === 'user';
      if (!committingDraft && !state.conversations.some((chat) => chat.id === action.id)) return state;
      const source = committingDraft ? [state.draft!, ...state.conversations] : state.conversations;
      const conversations = source.map((chat) => chat.id !== action.id ? chat : {
        ...chat,
        title: action.message.role === 'user' && !chat.messages.some((message) => message.role === 'user')
          ? titleFromPrompt(action.message.message) : chat.title,
        updatedAt: action.message.createdAt,
        messages: [...chat.messages, action.message],
      }).sort((a, b) => b.updatedAt - a.updatedAt);
      return { ...state, conversations, draft: committingDraft ? null : state.draft };
    }
  }
}
