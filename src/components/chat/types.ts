export type GroundingMetadata = {
  webSearchQueries?: string[];
  groundingChunks?: { web?: { uri?: string; title?: string } }[];
  groundingSupports?: unknown[];
  searchEntryPoint?: { renderedContent?: string };
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  routingSource?: string;
  responseType?: string;
  intent?: string;
  data?: unknown;
  groundingMetadata?: GroundingMetadata;
  createdAt: number;
};

export type ApiResponse = {
  intent: string;
  responseType: string;
  routingSource: string;
  message: string;
  data: unknown;
  groundingMetadata?: GroundingMetadata;
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
