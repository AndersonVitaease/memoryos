/**
 * ConversationKnowledgeExtractor.ts — Extracts KRE items from conversations
 * EF-36C · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Pure transformation: ConversationData → KnowledgeItems + Relationships + TimelineEvents
 * No networking. No provider dependency. Provider-agnostic.
 */

import type {
  KnowledgeItem,
  KnowledgeDecision,
  KnowledgeArtifact,
  KnowledgeDocument,
  KnowledgeRelationship,
  KnowledgeTimelineEvent,
  KnowledgeProvenance,
} from "../../KRETypes";
import { makeKREId } from "../../KRETypes";
import type { ConversationData, ConversationMessage, ConversationProviderName } from "./ConversationTypes";
import { detectSignals } from "./ConversationTypes";

// ── Provenance factory ────────────────────────────────────────────────────────

function makeConvProvenance(
  sourceId: string,
  providerName: ConversationProviderName,
  conversationId: string,
  messageId: string,
  confidence: number,
): KnowledgeProvenance {
  return {
    sourceId,
    sourceName: `${providerName}: ${conversationId.slice(0, 16)}`,
    sourceType: "chatgpt",
    provider: "ChatGPT",
    originalIdentifier: `${conversationId}#${messageId}`,
    importedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    confidence,
    verificationStatus: "INFERRED",
  };
}

// ── Extraction result ─────────────────────────────────────────────────────────

export interface ExtractionResult {
  items: KnowledgeItem[];
  relationships: KnowledgeRelationship[];
  timelineEvents: KnowledgeTimelineEvent[];
  /** Number of messages processed */
  messagesProcessed: number;
  /** Number of decisions detected */
  decisionsDetected: number;
  /** Signals detected across all messages */
  allSignals: string[];
}

// ── Extractor ─────────────────────────────────────────────────────────────────

export class ConversationKnowledgeExtractor {
  constructor(
    private readonly sourceId: string,
    private readonly providerName: ConversationProviderName,
  ) {}

  extract(conv: ConversationData): ExtractionResult {
    const items: KnowledgeItem[] = [];
    const relationships: KnowledgeRelationship[] = [];
    const timelineEvents: KnowledgeTimelineEvent[] = [];
    const allSignalsSet = new Set<string>();
    let decisionsDetected = 0;

    const convId = conv.meta.id;
    const convProvenance = makeConvProvenance(this.sourceId, this.providerName, convId, "meta", 0.9);

    // ── 1. Conversation document ─────────────────────────────────────────────
    const fullText = conv.messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => `[${m.role.toUpperCase()}] ${m.content}`)
      .join("\n\n")
      .slice(0, 4000);

    const convDoc: KnowledgeDocument = Object.freeze({
      id: `conv:${convId}`,
      type: "document" as const,
      title: conv.meta.title,
      content: fullText.slice(0, 500) + (fullText.length > 500 ? "..." : ""),
      tags: Object.freeze(["conversation", this.providerName.toLowerCase(), "imported"]),
      provenance: Object.freeze(convProvenance),
      createdAt: conv.meta.createdAt,
      format: "conversation",
      sizeBytes: fullText.length,
      checksum: `conv_${convId}_${conv.meta.messageCount}`,
    });
    items.push(convDoc);

    // ── 2. Timeline event: conversation creation ──────────────────────────────
    timelineEvents.push(Object.freeze({
      id: makeKREId("cevt"),
      eventType: "conversation" as const,
      title: `[${this.providerName}] ${conv.meta.title.slice(0, 80)}`,
      description: `${conv.meta.messageCount} messages · Provider: ${this.providerName} · ID: ${convId.slice(0, 16)}`,
      occurredAt: conv.meta.createdAt,
      relatedItemIds: Object.freeze([convDoc.id]),
      provenance: Object.freeze(convProvenance),
    }));

    // ── 3. Per-message analysis ───────────────────────────────────────────────
    for (const msg of conv.messages) {
      if (msg.content.length < 20) continue; // skip trivial messages
      if (msg.role === "system") continue;

      const signals = detectSignals(msg.content);
      signals.forEach(s => allSignalsSet.add(s));

      const msgProvenance = makeConvProvenance(this.sourceId, this.providerName, convId, msg.id, 0.75);

      // Decision detection
      if (signals.includes("decision") && msg.role === "assistant") {
        decisionsDetected++;
        const decisionItem: KnowledgeDecision = Object.freeze({
          id: `conv:decision:${convId}:${msg.id}`,
          type: "decision" as const,
          title: `Decision: ${conv.meta.title.slice(0, 60)}`,
          content: msg.content.slice(0, 600),
          tags: Object.freeze(["conversation", "decision", this.providerName.toLowerCase(), ...signals]),
          provenance: Object.freeze({ ...msgProvenance, confidence: 0.7 }),
          createdAt: msg.timestamp ?? conv.meta.createdAt,
          rationale: msg.content.slice(0, 300),
          decidedAt: msg.timestamp ?? conv.meta.createdAt,
          decisionId: `${convId}:${msg.id}`,
          alternatives: Object.freeze([]),
          consequences: Object.freeze([]),
        });
        items.push(decisionItem);
        relationships.push(Object.freeze({
          id: makeKREId("crel"),
          fromId: convDoc.id,
          toId: decisionItem.id,
          relationshipType: "contains_decision",
          weight: 0.85,
          provenance: Object.freeze(msgProvenance),
          createdAt: Date.now(),
        }));

        // Decision timeline event
        timelineEvents.push(Object.freeze({
          id: makeKREId("cevt"),
          eventType: "decision" as const,
          title: `[Decision] ${conv.meta.title.slice(0, 60)}`,
          description: msg.content.slice(0, 200),
          occurredAt: msg.timestamp ?? conv.meta.createdAt,
          relatedItemIds: Object.freeze([convDoc.id, decisionItem.id]),
          provenance: Object.freeze(msgProvenance),
        }));
      }

      // Architecture discussion
      if (signals.includes("architecture") && msg.content.length > 100) {
        const archItem: KnowledgeArtifact = Object.freeze({
          id: `conv:arch:${convId}:${msg.id}`,
          type: "artifact" as const,
          title: `Architecture: ${conv.meta.title.slice(0, 50)}`,
          content: msg.content.slice(0, 600),
          tags: Object.freeze(["conversation", "architecture", this.providerName.toLowerCase(), ...signals]),
          provenance: Object.freeze({ ...msgProvenance, confidence: 0.65 }),
          createdAt: msg.timestamp ?? conv.meta.createdAt,
          artifactKind: "architecture_discussion",
          version: "1.0",
          filePath: `conv/${convId}/${msg.id}`,
          language: "natural_language",
        });
        items.push(archItem);
        relationships.push(Object.freeze({
          id: makeKREId("crel"),
          fromId: convDoc.id,
          toId: archItem.id,
          relationshipType: "discusses_architecture",
          weight: 0.75,
          provenance: Object.freeze(msgProvenance),
          createdAt: Date.now(),
        }));
      }

      // Sprint/milestone events
      if ((signals.includes("sprint") || signals.includes("milestone")) && msg.content.length > 50) {
        timelineEvents.push(Object.freeze({
          id: makeKREId("cevt"),
          eventType: "architecture" as const,
          title: `[Sprint/Milestone] ${conv.meta.title.slice(0, 60)}`,
          description: msg.content.slice(0, 200),
          occurredAt: msg.timestamp ?? conv.meta.createdAt,
          relatedItemIds: Object.freeze([convDoc.id]),
          provenance: Object.freeze(msgProvenance),
        }));
      }
    }

    return {
      items,
      relationships,
      timelineEvents,
      messagesProcessed: conv.messages.length,
      decisionsDetected,
      allSignals: Array.from(allSignalsSet),
    };
  }
}