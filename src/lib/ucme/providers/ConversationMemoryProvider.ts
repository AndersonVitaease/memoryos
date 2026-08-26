/**
 * ConversationMemoryProvider.ts — UCME v1.0
 * Sprint 7.0.0
 *
 * Searches the local MemoryOS conversation database for relevant exchanges.
 * Self-registers with MemoryProviderRegistry on import.
 */

import type { MemoryProvider, MemoryQuery, MemoryEvidence } from "../UCMETypes";
import { MemoryProviderRegistry } from "../MemoryProviderRegistry";
import { recencyScore } from "../MemoryFusionEngine";
import { base44 } from "@/api/base44Client";

let _seq = 1;
function uid() { return `conv-${Date.now()}-${(_seq++).toString(4)}`; }

function relevanceScore(content: string, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return 0.3;
  const lower = content.toLowerCase();
  const hits  = words.filter(w => lower.includes(w)).length;
  return Math.min(1, 0.2 + (hits / words.length) * 0.8);
}

const ConversationMemoryProvider: MemoryProvider = {
  id:   "conversation",
  name: "Conversation Memory",

  async search(query: MemoryQuery): Promise<MemoryEvidence[]> {
    try {
      // Fetch recent messages from the narrowest available scope.
      const messages = query.projectId
        ? await base44.entities.Message.filter({ project_id: query.projectId }, "-created_date", 100)
        : query.sessionId
          ? await base44.entities.Message.filter({ session_id: query.sessionId }, "-created_date", 100)
          : await base44.entities.Message.list("-created_date", 100);
      const relevant = (messages as any[])
        .filter((m: any) => m.role === "assistant" && m.content?.length > 20)
        .slice(0, 50);

      return relevant
        .map((m: any) => {
          const rel = relevanceScore(m.content, query.text);
          if (rel < 0.25) return null;
          return {
            memoryId:      m.id,
            providerId:    "conversation",
            providerName:  "Conversation Memory",
            content:       m.content.slice(0, 800),
            summary:       m.content.slice(0, 120) + (m.content.length > 120 ? "..." : ""),
            confidence:    0.75,
            relevance:     rel,
            recency:       recencyScore(m.created_date ?? new Date().toISOString()),
            weight:        0,
            lastUpdated:   m.created_date ?? new Date().toISOString(),
            justification: `Conversation message matched ${Math.round(rel * 100)}% of query keywords`,
            tags:          ["conversation", m.memory_tier ?? "active"],
            metadata:      { session_id: m.session_id, role: m.role },
          } satisfies MemoryEvidence;
        })
        .filter(Boolean)
        .slice(0, query.maxPerProvider ?? 10) as MemoryEvidence[];
    } catch {
      return [];
    }
  },

  async remember(content: string, metadata?: Record<string, unknown>): Promise<string> {
    const msg = await base44.entities.Message.create({
      session_id:  metadata?.session_id ?? "ucme",
      project_id:  metadata?.project_id ?? undefined,
      workspace_id: metadata?.workspace_id ?? undefined,
      scope:        metadata?.scope ?? "personal",
      role:         "assistant",
      content,
      memory_tier:  "active",
      sources_used: Array.isArray(metadata?.sources_used) ? metadata?.sources_used : undefined,
    });
    return (msg as any).id ?? uid();
  },

  async forget(memoryId: string): Promise<void> {
    await base44.entities.Message.delete(memoryId).catch(() => {});
  },

  async update(memoryId: string, content: string): Promise<void> {
    await base44.entities.Message.update(memoryId, { content }).catch(() => {});
  },

  explain(): string {
    return "Searches the MemoryOS conversation history for messages relevant to the query using keyword matching.";
  },

  async health(): Promise<{ healthy: boolean; detail: string }> {
    try {
      await base44.entities.Message.list("-created_date", 1);
      return { healthy: true, detail: "Conversation DB accessible" };
    } catch (e) {
      return { healthy: false, detail: (e as Error).message };
    }
  },

  capabilities(): string[] {
    return ["search", "remember", "forget", "update"];
  },
};

MemoryProviderRegistry.register(ConversationMemoryProvider);
export { ConversationMemoryProvider };