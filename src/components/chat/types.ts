export type Message = {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  routingSource?: string;
  responseType?: string;
  intent?: string;
  data?: unknown;
  createdAt: number;
};

export type ApiResponse = {
  intent: string;
  responseType: string;
  routingSource: string;
  message: string;
  data: unknown;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

export type ConversationArchive = {
  version: 2;
  activeId: string;
  conversations: Conversation[];
};
