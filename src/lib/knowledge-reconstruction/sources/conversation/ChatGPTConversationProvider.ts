/**
 * ChatGPTConversationProvider.ts — ChatGPT Export Provider
 * EF-36C · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Reads the official ChatGPT export ZIP structure:
 *   conversations.json — array of conversation objects
 *   Each conversation has: id, title, create_time, update_time, mapping
 *   Each mapping node: message { id, author { role }, content { parts }, create_time }
 *
 * This provider is ONE IMPLEMENTATION of IConversationProvider.
 * The ConversationKnowledgeSource never imports this class directly in
 * production — it receives an injected IConversationProvider instance.
 */

import type { IConversationProvider, ConversationProviderHealth } from "./IConversationProvider";
import type { ConversationData, ConversationMeta, ConversationMessage } from "./ConversationTypes";

// ── ChatGPT raw export shapes ──────────────────────────────────────────────────

interface RawChatGPTMessage {
  id: string;
  author: { role: string; name?: string };
  content: { content_type: string; parts: unknown[] };
  create_time: number | null;
  metadata?: Record<string, unknown>;
}

interface RawChatGPTNode {
  id: string;
  message: RawChatGPTMessage | null;
  parent: string | null;
  children: string[];
}

interface RawChatGPTConversation {
  id: string;
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, RawChatGPTNode>;
  conversation_id?: string;
  moderation_results?: unknown[];
  current_node?: string;
  default_model_slug?: string;
}

// ── Parser helpers ─────────────────────────────────────────────────────────────

function extractMessageText(msg: RawChatGPTMessage): string {
  if (!msg.content?.parts) return "";
  return msg.content.parts
    .map(p => {
      if (typeof p === "string") return p;
      if (p && typeof p === "object" && "text" in (p as object)) return (p as any).text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeRole(role: string): ConversationMessage["role"] {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  if (role === "system") return "system";
  if (role === "tool") return "tool";
  return "assistant";
}

/** Walk the mapping tree in message order (parent → children BFS) */
function walkMapping(mapping: Record<string, RawChatGPTNode>): RawChatGPTMessage[] {
  // Find root (node with null parent or no parent in mapping)
  const allIds = new Set(Object.keys(mapping));
  const childIds = new Set(Object.values(mapping).flatMap(n => n.children));
  // Root candidates: nodes whose parent is null or not in mapping
  const roots = Object.values(mapping).filter(
    n => n.parent === null || !allIds.has(n.parent ?? ""),
  );

  const visited = new Set<string>();
  const queue: RawChatGPTNode[] = [...roots];
  const messages: RawChatGPTMessage[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (node.message && node.message.author?.role !== "system") {
      const text = extractMessageText(node.message);
      if (text.length > 0) {
        messages.push(node.message);
      }
    }
    // Add children in order
    for (const childId of node.children) {
      const child = mapping[childId];
      if (child && !visited.has(childId)) {
        queue.push(child);
      }
    }
  }

  // Sort by create_time (BFS order may not be chronological for branched trees)
  messages.sort((a, b) => {
    const ta = a.create_time ?? 0;
    const tb = b.create_time ?? 0;
    return ta - tb;
  });

  return messages;
}

function buildMessages(conv: RawChatGPTConversation): ConversationMessage[] {
  const rawMessages = walkMapping(conv.mapping);
  return rawMessages.map((msg, index): ConversationMessage => ({
    id: msg.id,
    role: normalizeRole(msg.author.role),
    content: extractMessageText(msg),
    timestamp: msg.create_time ? msg.create_time * 1000 : null,
    index,
    model: (msg.metadata as any)?.model_slug ?? undefined,
  })).filter(m => m.content.length > 0);
}

function buildMeta(conv: RawChatGPTConversation, messageCount: number): ConversationMeta {
  return {
    id: conv.id,
    title: conv.title || "Untitled Conversation",
    createdAt: conv.create_time ? conv.create_time * 1000 : Date.now(),
    updatedAt: conv.update_time ? conv.update_time * 1000 : Date.now(),
    messageCount,
    provider: "ChatGPT",
    extras: {
      defaultModel: conv.default_model_slug ?? null,
      currentNode: conv.current_node ?? null,
    },
  };
}

// ── Provider ───────────────────────────────────────────────────────────────────

export class ChatGPTConversationProvider implements IConversationProvider {
  readonly providerId = "chatgpt";
  readonly providerName = "ChatGPT" as const;

  private conversations: Map<string, RawChatGPTConversation> = new Map();
  private loaded = false;
  private loadError: string | null = null;

  /**
   * Load from a raw conversations.json array (parsed JSON).
   * Typically called with JSON.parse(zipEntry["conversations.json"])
   */
  loadFromRawJson(data: unknown): { loaded: number; errors: string[] } {
    const errors: string[] = [];
    this.conversations.clear();

    if (!Array.isArray(data)) {
      this.loadError = "Expected an array of conversations";
      errors.push(this.loadError);
      return { loaded: 0, errors };
    }

    for (const item of data) {
      if (!item || typeof item !== "object") {
        errors.push("Skipped non-object entry");
        continue;
      }
      const conv = item as RawChatGPTConversation;
      if (!conv.id || typeof conv.mapping !== "object") {
        errors.push(`Skipped conversation with missing id or mapping: ${JSON.stringify(conv).slice(0, 80)}`);
        continue;
      }
      this.conversations.set(conv.id, conv);
    }

    this.loaded = true;
    this.loadError = null;
    return { loaded: this.conversations.size, errors };
  }

  /**
   * Load from a JSON string (the raw text of conversations.json from the export ZIP)
   */
  loadFromJsonString(jsonString: string): { loaded: number; errors: string[] } {
    try {
      const data = JSON.parse(jsonString);
      return this.loadFromRawJson(data);
    } catch (e) {
      const err = `Failed to parse conversations JSON: ${(e as Error).message}`;
      this.loadError = err;
      return { loaded: 0, errors: [err] };
    }
  }

  // ── IConversationProvider ──────────────────────────────────────────────────

  async health(): Promise<ConversationProviderHealth> {
    return {
      available: this.loaded && this.conversations.size > 0,
      details: this.loadError
        ? `Load error: ${this.loadError}`
        : this.loaded
        ? `${this.conversations.size} conversations loaded`
        : "No data loaded — call loadFromRawJson() or loadFromJsonString()",
      checkedAt: Date.now(),
      providerName: "ChatGPT",
      conversationCount: this.conversations.size,
    };
  }

  async listConversations(): Promise<ConversationMeta[]> {
    const metas: ConversationMeta[] = [];
    for (const conv of this.conversations.values()) {
      const msgs = buildMessages(conv);
      metas.push(buildMeta(conv, msgs.length));
    }
    // Sort newest first
    metas.sort((a, b) => b.createdAt - a.createdAt);
    return metas;
  }

  async loadConversation(conversationId: string): Promise<ConversationData | null> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;
    const messages = buildMessages(conv);
    return { meta: buildMeta(conv, messages.length), messages };
  }

  async loadMessages(conversationId: string): Promise<ConversationMessage[]> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return [];
    return buildMessages(conv);
  }

  async loadMetadata(conversationId: string): Promise<ConversationMeta | null> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;
    const msgs = buildMessages(conv);
    return buildMeta(conv, msgs.length);
  }

  async search(query: string): Promise<ConversationMeta[]> {
    const q = query.toLowerCase();
    const matches: ConversationMeta[] = [];
    for (const conv of this.conversations.values()) {
      if (conv.title?.toLowerCase().includes(q)) {
        const msgs = buildMessages(conv);
        matches.push(buildMeta(conv, msgs.length));
        continue;
      }
      // Check first assistant message content
      const msgs = buildMessages(conv);
      const hasMatch = msgs.some(m => m.content.toLowerCase().includes(q));
      if (hasMatch) matches.push(buildMeta(conv, msgs.length));
    }
    return matches;
  }

  /** Expose raw count for diagnostics */
  getRawConversationCount(): number {
    return this.conversations.size;
  }
}