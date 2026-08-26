/**
 * KnowledgeGraphMemoryProvider.ts — UCME v1.0
 * Sprint 7.0.0
 *
 * Searches the MemoryOS Knowledge Graph entities (KnowledgeEntity, Document, Decision, Task, Topic).
 */

import type { MemoryProvider, MemoryQuery, MemoryEvidence } from "../UCMETypes";
import { MemoryProviderRegistry } from "../MemoryProviderRegistry";
import { recencyScore } from "../MemoryFusionEngine";
import { base44 } from "@/api/base44Client";

function relevanceScore(content: string, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return 0.3;
  const lower = content.toLowerCase();
  const hits  = words.filter(w => lower.includes(w)).length;
  return Math.min(1, 0.2 + (hits / words.length) * 0.8);
}

async function searchEntity(entityName: string, query: MemoryQuery, fields: string[], projectId?: string): Promise<MemoryEvidence[]> {
  try {
    const entity = (base44.entities as any)[entityName];
    if (!entity) return [];
    
    const records = projectId && entityName !== "Project" && entity.filter
      ? await entity.filter({ project_id: projectId }, "-created_date", 50)
      : await entity.list("-created_date", 50);
    return (records as any[])
      .map((r: any) => {
        const text = fields.map(f => r[f] ?? "").join(" ");
        const rel  = relevanceScore(text, query.text);
        if (rel < 0.2) return null;
return {
          memoryId:      r.id,
          providerId:    "knowledge-graph",
          providerName:  "Knowledge Graph",
          content:       text.slice(0, 600),
          summary:       (r.title ?? r.name ?? r.value ?? entityName) + "",
          confidence:    0.8,
          relevance:     rel,
          recency:       recencyScore(r.created_date ?? r.updated_date ?? new Date().toISOString()),
          weight:        0,
          lastUpdated:   r.created_date ?? r.updated_date ?? new Date().toISOString(),
          justification: `${entityName} record matched query`,
          tags:          ["knowledge-graph", entityName.toLowerCase()],
          metadata:      { entityType: entityName, ...r },
        } satisfies MemoryEvidence;
      })
      .filter(Boolean) as MemoryEvidence[];
  } catch { return []; }
}

const KnowledgeGraphMemoryProvider: MemoryProvider = {
  id:   "knowledge-graph",
  name: "Knowledge Graph",

  async search(query: MemoryQuery): Promise<MemoryEvidence[]> {
    // Extract projectId from query
    const projectId = query.projectId;
    
    const [entities, decisions, tasks, topics, documents, projects, chatSessions, keywords] = await Promise.all([
      searchEntity("KnowledgeEntity", query, ["type", "value", "context"], projectId),
      searchEntity("Decision",        query, ["title", "description", "rationale"], projectId),
      searchEntity("Task",            query, ["title", "description"], projectId),
      searchEntity("Topic",           query, ["name", "description"], projectId),
      searchEntity("Document",        query, ["name", "extracted_text", "summary"], projectId),
      searchEntity("Project",         query, ["name", "description", "type"]),
      searchEntity("ChatSession",     query, ["title", "summary"], projectId),
      searchEntity("Keyword",         query, ["keyword", "source_type"], projectId),
    ]);
    const all = [...entities, ...decisions, ...tasks, ...topics, ...documents, ...projects, ...chatSessions, ...keywords]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, query.maxPerProvider ?? 10);
    return all;
  },

  async remember(content: string, metadata?: Record<string, unknown>): Promise<string> {
    const r = await base44.entities.KnowledgeEntity.create({
      source_type: "message",
      type:        "produto",
      value:       content.slice(0, 300),
      context:     content.slice(0, 600),
      memory_tier: "active",
      ...metadata,
    });
    return (r as any).id;
  },

  async forget(memoryId: string): Promise<void> {
    await base44.entities.KnowledgeEntity.delete(memoryId).catch(() => {});
  },

  async update(memoryId: string, content: string): Promise<void> {
    await base44.entities.KnowledgeEntity.update(memoryId, { value: content.slice(0, 300), context: content.slice(0, 600) }).catch(() => {});
  },

  explain(): string {
    return "Searches the MemoryOS knowledge graph: entities, decisions, tasks, topics, documents, projects, chat sessions, and keywords extracted from conversations.";
  },

  async health(): Promise<{ healthy: boolean; detail: string }> {
    try {
      await base44.entities.KnowledgeEntity.list("-created_date", 1);
      return { healthy: true, detail: "Knowledge Graph DB accessible" };
    } catch (e) {
      return { healthy: false, detail: (e as Error).message };
    }
  },

  capabilities(): string[] {
    return ["search", "remember", "forget", "update"];
  },
};

MemoryProviderRegistry.register(KnowledgeGraphMemoryProvider);
export { KnowledgeGraphMemoryProvider };