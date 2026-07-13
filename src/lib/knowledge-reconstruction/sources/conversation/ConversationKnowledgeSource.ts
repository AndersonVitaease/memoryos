/**
 * ConversationKnowledgeSource.ts — Conversation Knowledge Provider
 * EF-36C · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Implements IKnowledgeSource. Provider-agnostic.
 * Accepts any IConversationProvider (ChatGPT, Claude, Gemini, etc.)
 *
 * ARCHITECTURE RULES:
 *   - Never depends on ChatGPT internals
 *   - Never depends on specific export formats
 *   - Delegates all data access to IConversationProvider
 *   - Delegates all extraction to ConversationKnowledgeExtractor
 */

import type { IKnowledgeSource } from "../../IKnowledgeSource";
import type {
  KnowledgeSourceMetadata,
  KnowledgeSourceHealth,
  KnowledgeScanResult,
  KnowledgeLoadResult,
  KnowledgeItem,
  KnowledgeRelationship,
  KnowledgeTimelineEvent,
} from "../../KRETypes";
import type { IConversationProvider } from "./IConversationProvider";
import type { ConversationSyncState } from "./ConversationTypes";
import { ConversationKnowledgeExtractor } from "./ConversationKnowledgeExtractor";

// ── Source ─────────────────────────────────────────────────────────────────────

export class ConversationKnowledgeSource implements IKnowledgeSource {
  readonly id: string;
  readonly name: string;

  private readonly provider: IConversationProvider;
  private readonly extractor: ConversationKnowledgeExtractor;
  private syncState: ConversationSyncState;
  private _lastScanResult: KnowledgeScanResult | null = null;

  constructor(config: {
    sourceId?: string;
    provider: IConversationProvider;
  }) {
    this.id = config.sourceId ?? `conversation-${config.provider.providerId}`;
    this.name = `${config.provider.providerName} Conversation Provider`;
    this.provider = config.provider;
    this.extractor = new ConversationKnowledgeExtractor(this.id, config.provider.providerName);
    this.syncState = {
      lastSyncAt: null,
      knownConversationIds: new Set(),
      knownMessageIds: new Set(),
      totalImported: 0,
      totalMessages: 0,
    };
  }

  // ── IKnowledgeSource ────────────────────────────────────────────────────────

  metadata(): KnowledgeSourceMetadata {
    return {
      id: this.id,
      name: this.name,
      provider: "ChatGPT",
      type: "chatgpt",
      version: "1.0.0",
      description: `Conversation Knowledge Provider — ${this.provider.providerName} — EF-36C`,
    };
  }

  async isAvailable(): Promise<KnowledgeSourceHealth> {
    const h = await this.provider.health();
    if (h.available) return "available";
    if (h.conversationCount > 0) return "degraded";
    return "unavailable";
  }

  async health(): Promise<{ status: KnowledgeSourceHealth; details: string; checkedAt: number }> {
    const h = await this.provider.health();
    const status: KnowledgeSourceHealth = h.available ? "available" : h.conversationCount > 0 ? "degraded" : "unavailable";
    return {
      status,
      details: `${h.details} · Imported: ${this.syncState.totalImported} · Messages: ${this.syncState.totalMessages}`,
      checkedAt: h.checkedAt,
    };
  }

  async scan(): Promise<KnowledgeScanResult> {
    const t = Date.now();
    const errors: string[] = [];
    const itemIds: string[] = [];

    try {
      const convList = await this.provider.listConversations();
      for (const meta of convList) {
        itemIds.push(`conv:${meta.id}`);
      }
    } catch (e) {
      errors.push(`Scan failed: ${(e as Error).message}`);
    }

    this._lastScanResult = {
      sourceId: this.id,
      scannedAt: Date.now(),
      itemsFound: itemIds.length,
      itemIds,
      errors,
      durationMs: Date.now() - t,
    };
    return this._lastScanResult;
  }

  async load(): Promise<KnowledgeLoadResult> {
    const t = Date.now();
    const items: KnowledgeItem[] = [];
    const relationships: KnowledgeRelationship[] = [];
    const timelineEvents: KnowledgeTimelineEvent[] = [];
    const errors: string[] = [];

    const h = await this.provider.health();
    if (!h.available && h.conversationCount === 0) {
      return {
        sourceId: this.id, loadedAt: Date.now(), items: [], relationships: [],
        timelineEvents: [], errors: ["No conversations loaded in provider"], durationMs: Date.now() - t,
      };
    }

    try {
      const convList = await this.provider.listConversations();

      for (const meta of convList) {
        try {
          const conv = await this.provider.loadConversation(meta.id);
          if (!conv) continue;

          const result = this.extractor.extract(conv);
          items.push(...result.items);
          relationships.push(...result.relationships);
          timelineEvents.push(...result.timelineEvents);

          // Update sync state
          this.syncState.knownConversationIds.add(meta.id);
          for (const msg of conv.messages) {
            this.syncState.knownMessageIds.add(`${meta.id}:${msg.id}`);
          }
          this.syncState.totalMessages += conv.messages.length;
        } catch (e) {
          errors.push(`Failed loading conversation "${meta.id}": ${(e as Error).message}`);
        }
      }

      this.syncState.totalImported = this.syncState.knownConversationIds.size;
      this.syncState.lastSyncAt = Date.now();
    } catch (e) {
      errors.push(`Load failed: ${(e as Error).message}`);
    }

    return {
      sourceId: this.id,
      loadedAt: Date.now(),
      items, relationships, timelineEvents, errors,
      durationMs: Date.now() - t,
    };
  }

  // ── Incremental Sync ────────────────────────────────────────────────────────

  async sync(): Promise<{
    newConversations: number;
    newMessages: number;
    newItems: KnowledgeItem[];
    newRelationships: KnowledgeRelationship[];
    newTimelineEvents: KnowledgeTimelineEvent[];
    syncedAt: number;
  }> {
    const newItems: KnowledgeItem[] = [];
    const newRelationships: KnowledgeRelationship[] = [];
    const newTimelineEvents: KnowledgeTimelineEvent[] = [];
    let newConversations = 0;
    let newMessages = 0;

    const convList = await this.provider.listConversations();

    for (const meta of convList) {
      const isNew = !this.syncState.knownConversationIds.has(meta.id);
      if (!isNew) continue;

      const conv = await this.provider.loadConversation(meta.id);
      if (!conv) continue;

      const result = this.extractor.extract(conv);
      newItems.push(...result.items);
      newRelationships.push(...result.relationships);
      newTimelineEvents.push(...result.timelineEvents);

      this.syncState.knownConversationIds.add(meta.id);
      for (const msg of conv.messages) {
        this.syncState.knownMessageIds.add(`${meta.id}:${msg.id}`);
      }
      newConversations++;
      newMessages += conv.messages.length;
    }

    this.syncState.totalImported = this.syncState.knownConversationIds.size;
    this.syncState.lastSyncAt = Date.now();

    return {
      newConversations, newMessages,
      newItems, newRelationships, newTimelineEvents,
      syncedAt: Date.now(),
    };
  }

  getSyncState(): Readonly<ConversationSyncState> {
    return {
      ...this.syncState,
      knownConversationIds: new Set(this.syncState.knownConversationIds),
      knownMessageIds: new Set(this.syncState.knownMessageIds),
    };
  }
}