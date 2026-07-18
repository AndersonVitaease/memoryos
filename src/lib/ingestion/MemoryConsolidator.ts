// MemoryConsolidator.ts — Sprint EF-37
// Fuses, summarizes, versions, archives memories

import type { ClassifiedMemory, ConsolidatedMemory } from "./KipTypes";
import { KnowledgeEvidenceFactory } from "./KnowledgeEvidence";

let _seq = 0;
const uid = () => `cns-${Date.now()}-${++_seq}`;

function summarize(contents: string[]): string {
  if (contents.length === 1) return contents[0];
  // Keep first + last for context, summarize middle
  const first = contents[0].slice(0, 120);
  const last  = contents[contents.length - 1].slice(0, 120);
  return contents.length <= 3
    ? contents.join(" | ")
    : `${first} [...${contents.length - 2} more...] ${last}`;
}

export const MemoryConsolidator = {
  consolidate(
    memories: ClassifiedMemory[],
    conversationId: string,
    source: string,
  ): ConsolidatedMemory[] {
    // Group by type + content fingerprint (first 50 chars lowercased)
    const groups = new Map<string, ClassifiedMemory[]>();
    for (const mem of memories) {
      const key = `${mem.type}:${mem.content.slice(0, 50).toLowerCase().replace(/\W+/g, "")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(mem);
    }

    const consolidated: ConsolidatedMemory[] = [];
    for (const [, group] of groups) {
      const primary = group[0];
      const allContent = [...new Set(group.map(m => m.content))];
      const allTags    = [...new Set(group.flatMap(m => m.tags))];

      consolidated.push({
        id:               uid(),
        type:             primary.type,
        content:          allContent[0],
        version:          1,
        history:          allContent,
        archivedVersions: allContent.slice(1),
        summary:          summarize(allContent),
        tags:             allTags,
        evidence:         KnowledgeEvidenceFactory.create({
          source,
          conversationId,
          messageId: primary.sourceMessageId,
          confidence: primary.confidence,
        }),
      });
    }
    return consolidated;
  },

  // Merge two consolidated memories (e.g. on update)
  merge(existing: ConsolidatedMemory, incoming: ClassifiedMemory, source: string): ConsolidatedMemory {
    return {
      ...existing,
      version:          existing.version + 1,
      history:          [incoming.content, ...existing.history],
      archivedVersions: [existing.content, ...existing.archivedVersions],
      summary:          summarize([incoming.content, existing.content]),
      tags:             [...new Set([...existing.tags, ...incoming.tags])],
      evidence:         KnowledgeEvidenceFactory.create({
        source,
        conversationId: existing.evidence.conversationId,
        messageId:      incoming.sourceMessageId,
        confidence:     incoming.confidence,
      }),
    };
  },
};