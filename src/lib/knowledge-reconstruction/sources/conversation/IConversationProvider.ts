/**
 * IConversationProvider.ts — Conversation Provider Interface
 * EF-36C · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * ARCHITECTURE RULE:
 *   ConversationKnowledgeSource depends ONLY on this interface.
 *   ChatGPT, Claude, Gemini, etc. implement this interface.
 *   The KRE never knows which provider is behind the source.
 */

import type { ConversationData, ConversationMeta, ConversationProviderName } from "./ConversationTypes";

export interface ConversationProviderHealth {
  available: boolean;
  details: string;
  checkedAt: number;
  providerName: ConversationProviderName;
  conversationCount: number;
}

export interface IConversationProvider {
  /** Provider identifier — "chatgpt", "claude", etc. */
  readonly providerId: string;
  /** Human name */
  readonly providerName: ConversationProviderName;

  /** Check if the provider has data loaded and is operational */
  health(): Promise<ConversationProviderHealth>;

  /** List all available conversation metadata (no messages) */
  listConversations(): Promise<ConversationMeta[]>;

  /** Load a single conversation with all messages */
  loadConversation(conversationId: string): Promise<ConversationData | null>;

  /** Load all messages from a conversation */
  loadMessages(conversationId: string): Promise<ConversationData["messages"]>;

  /** Load metadata for a single conversation */
  loadMetadata(conversationId: string): Promise<ConversationMeta | null>;

  /** Search conversations by keyword (in title or content) */
  search(query: string): Promise<ConversationMeta[]>;
}