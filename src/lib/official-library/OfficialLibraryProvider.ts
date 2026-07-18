/**
 * OfficialLibraryProvider.ts — Sprint EF-7.2.0
 *
 * Implements MemoryProvider — the single interface all UCME providers must satisfy.
 * Self-registers with MemoryProviderRegistry on import.
 *
 * Responsibilities:
 *   ✓ Search the Official Library index for chunks relevant to the query
 *   ✓ Return MemoryEvidence[] with authority metadata in the metadata field
 *   ✓ Apply authority-based confidence boost (OFFICIAL = +0.20)
 *   ✓ Never talk to the Planner
 *   ✓ Never talk to the MRE directly
 *   ✓ Only provide evidence
 *
 * Citation format in metadata:
 *   { sourceType, documentId, documentName, chapter, section, version, authority }
 */

import type { MemoryProvider, MemoryQuery, MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { OfficialCitation } from "./OfficialLibraryTypes";
import { MemorySourceType } from "./OfficialLibraryTypes";
import { MemoryProviderRegistry } from "@/lib/ucme/MemoryProviderRegistry";
import { OfficialLibraryIndexer }  from "./OfficialLibraryIndexer";
import { OfficialAuthority }       from "./OfficialAuthority";
import { officialKnowledgeGraph }  from "./OfficialKnowledgeGraph";
import { MemoryAuthority }         from "./OfficialLibraryTypes";

const PROVIDER_ID   = "official-library";
const PROVIDER_NAME = "Official Library";

let _seq = 1;
function evidenceId(): string { return `ol-${Date.now()}-${(_seq++).toString(36)}`; }

function recencyFromTimestamp(_iso: string): number {
  // Official docs are always high recency — they are architectural constants
  return 0.90;
}

export const OfficialLibraryProvider: MemoryProvider = {
  id:   PROVIDER_ID,
  name: PROVIDER_NAME,

  async search(query: MemoryQuery): Promise<MemoryEvidence[]> {
    try {
      await OfficialLibraryIndexer.initialize();
      const results = OfficialLibraryIndexer.search(query.text, query.maxPerProvider ?? 10);
      if (results.length === 0) return [];

      // Build knowledge graph if not already built
      if (officialKnowledgeGraph.nodeCount === 0) {
        officialKnowledgeGraph.build(OfficialLibraryIndexer.getChunks());
      }

      return results.map(chunk => {
        const baseConf  = 0.80;
        const boost     = OfficialAuthority.confidenceBoost(chunk.authority);
        const confidence = Math.min(0.99, baseConf + boost);

        // Relevance: keyword overlap
        const words     = query.text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const haystack  = `${chunk.title} ${chunk.content}`.toLowerCase();
        const hits      = words.filter(w => haystack.includes(w)).length;
        const relevance = words.length > 0 ? Math.min(1, 0.3 + (hits / words.length) * 0.7) : 0.5;

        const citation: OfficialCitation = {
          sourceType:   MemorySourceType.OFFICIAL_LIBRARY,
          documentId:   chunk.documentId,
          documentName: chunk.documentName,
          chapter:      chunk.chapter,
          section:      chunk.section,
          version:      chunk.version,
          authority:    chunk.authority,
        };

        // Get graph-linked components for justification
        const links    = officialKnowledgeGraph.getDocumentLinks(chunk.documentId);
        const linkStr  = links.length > 0 ? ` [linked: ${links.slice(0, 3).map(n => n.label).join(", ")}]` : "";

        return {
          memoryId:     evidenceId(),
          providerId:   PROVIDER_ID,
          providerName: PROVIDER_NAME,
          content:      chunk.content,
          summary:      chunk.summary,
          confidence,
          relevance,
          recency:      recencyFromTimestamp(chunk.updatedAt),
          weight:       0,  // computed by MemoryFusionEngine
          lastUpdated:  chunk.updatedAt,
          justification: `Official Library [${chunk.documentName} v${chunk.version}] — ${chunk.chapter} / ${chunk.section}${linkStr}`,
          tags:         [...chunk.tags, chunk.authority, "official-library"],
          metadata:     {
            citation,
            authority:    chunk.authority,
            sourceType:   MemorySourceType.OFFICIAL_LIBRARY,
            documentId:   chunk.documentId,
            documentName: chunk.documentName,
            documentVersion: chunk.version,
            chapter:      chunk.chapter,
            section:      chunk.section,
            chunkId:      chunk.id,
          },
        } satisfies MemoryEvidence;
      });
    } catch {
      return [];
    }
  },

  async remember(_content: string, _metadata?: Record<string, unknown>): Promise<string> {
    // Official Library is read-only — knowledge comes from official documents
    return `readonly-${Date.now()}`;
  },

  async forget(_memoryId: string): Promise<void> {
    // Official Library is immutable — cannot forget official knowledge
  },

  async update(_memoryId: string, _content: string, _metadata?: Record<string, unknown>): Promise<void> {
    // Official Library is updated via reindex (OfficialLibraryWatcher), not direct writes
  },

  explain(): string {
    const stats = OfficialLibraryIndexer.stats();
    return `Searches ${stats.documentCount} official MemoryOS documents (${stats.chunkCount} chunks) with OFFICIAL authority. Evidence always has the highest confidence boost (+0.20). Citations include document, chapter, section, and version.`;
  },

  async health(): Promise<{ healthy: boolean; detail: string }> {
    try {
      await OfficialLibraryIndexer.initialize();
      const stats = OfficialLibraryIndexer.stats();
      const healthy = stats.documentCount > 0 && stats.chunkCount > 0;
      return {
        healthy,
        detail: healthy
          ? `${stats.documentCount} docs, ${stats.chunkCount} chunks, indexed at ${stats.lastIndexedAt}`
          : "Index empty — initialization may have failed",
      };
    } catch (e) {
      return { healthy: false, detail: (e as Error).message };
    }
  },

  capabilities(): string[] {
    return ["search", "citation", "authority", "versioning", "knowledge-graph"];
  },
};

// Self-register
MemoryProviderRegistry.register(OfficialLibraryProvider);