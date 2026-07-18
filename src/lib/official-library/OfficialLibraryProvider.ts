/**
 * OfficialLibraryProvider.ts — Sprint EF-7.2.1 (refactored from EF-7.2.0)
 *
 * Changes from EF-7.2.0:
 *   - SearchStrategy injected via DIP (never instantiates concrete strategies)
 *   - Removed authority confidence boost (replaced by structural ranking in FusionEngine)
 *   - Uses AuthorityComparator instead of inline comparisons
 *   - Uses graphQuery (from Bootstrap) with backward-compatible fallback to officialKnowledgeGraph
 */

import type { MemoryProvider, MemoryQuery, MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { OfficialCitation } from "./OfficialLibraryTypes";
import { MemorySourceType }         from "./OfficialLibraryTypes";
import { MemoryProviderRegistry }   from "@/lib/ucme/MemoryProviderRegistry";
import { OfficialLibraryIndexer }   from "./OfficialLibraryIndexer";
import { defaultSearchStrategy, type SearchStrategy } from "./SearchStrategy";
import { AuthorityComparator }       from "./AuthorityComparator";

const PROVIDER_ID   = "official-library";
const PROVIDER_NAME = "Official Library";

let _seq = 1;
function evidenceId(): string { return `ol-${Date.now()}-${(_seq++).toString(36)}`; }

// ── Provider factory (DIP: strategy injected) ─────────────────────────────────

function createOfficialLibraryProvider(strategy: SearchStrategy = defaultSearchStrategy): MemoryProvider {

  // Inject strategy into indexer
  OfficialLibraryIndexer.setSearchStrategy(strategy);

  return {
    id:   PROVIDER_ID,
    name: PROVIDER_NAME,

    async search(query: MemoryQuery): Promise<MemoryEvidence[]> {
      try {
        await OfficialLibraryIndexer.initialize();
        // Strategy is already injected into the indexer
        const results = OfficialLibraryIndexer.search(query.text, query.maxPerProvider ?? 10);
        if (results.length === 0) return [];

        // Graph query for link enrichment (lazy: from Bootstrap or legacy fallback)
        let getLinks: (documentId: string) => { label: string }[] = () => [];
        try {
          const { graphQuery } = await import("./OfficialLibraryBootstrap");
          if (graphQuery) getLinks = id => graphQuery.getDocumentLinks(id);
        } catch {
          try {
            const { officialKnowledgeGraph } = await import("./OfficialKnowledgeGraph");
            if (officialKnowledgeGraph.nodeCount > 0) {
              getLinks = id => officialKnowledgeGraph.getDocumentLinks(id);
            }
          } catch { /* no graph available */ }
        }

        return results.map(chunk => {
          // Confidence = base content confidence only (no authority bonus)
          // Authority rank drives ORDER in FusionEngine — not a score modifier here
          const confidence = 0.85;

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

          const links   = getLinks(chunk.documentId);
          const linkStr = links.length > 0 ? ` [linked: ${links.slice(0, 3).map(n => n.label).join(", ")}]` : "";

          return {
            memoryId:     evidenceId(),
            providerId:   PROVIDER_ID,
            providerName: PROVIDER_NAME,
            content:      chunk.content,
            summary:      chunk.summary,
            confidence,
            relevance,
            recency:      0.90,  // architectural constants are always current
            weight:       0,     // computed by MemoryFusionEngine (authority-first sort)
            lastUpdated:  chunk.updatedAt,
            justification: `Official Library [${chunk.documentName} v${chunk.version}] — ${chunk.chapter} / ${chunk.section}${linkStr}`,
            tags:         [...chunk.tags, chunk.authority, "official-library"],
            metadata:     {
              citation,
              authority:       chunk.authority,
              sourceType:      MemorySourceType.OFFICIAL_LIBRARY,
              documentId:      chunk.documentId,
              documentName:    chunk.documentName,
              documentVersion: chunk.version,
              chapter:         chunk.chapter,
              section:         chunk.section,
              chunkId:         chunk.id,
            },
          } satisfies MemoryEvidence;
        });
      } catch {
        return [];
      }
    },

    async remember(_content: string): Promise<string> {
      return `readonly-${Date.now()}`;
    },

    async forget(_memoryId: string): Promise<void> { /* immutable */ },

    async update(_memoryId: string, _content: string): Promise<void> { /* updated via watcher */ },

    explain(): string {
      const stats = OfficialLibraryIndexer.stats();
      return `Searches ${stats.documentCount} official MemoryOS documents (${stats.chunkCount} chunks). Strategy: ${strategy.strategyId}. Authority: ${AuthorityComparator.rank(chunk => chunk as any).toString() ?? "OFFICIAL"}. Citations: document / chapter / section / version.`;
    },

    async health(): Promise<{ healthy: boolean; detail: string }> {
      try {
        await OfficialLibraryIndexer.initialize();
        const stats   = OfficialLibraryIndexer.stats();
        const healthy = stats.documentCount > 0 && stats.chunkCount > 0;
        return {
          healthy,
          detail: healthy
            ? `${stats.documentCount} docs, ${stats.chunkCount} chunks, strategy: ${strategy.strategyId}`
            : "Index empty — bootstrap may have failed",
        };
      } catch (e) {
        return { healthy: false, detail: (e as Error).message };
      }
    },

    capabilities(): string[] {
      return ["search", "citation", "authority", "versioning", "knowledge-graph", `strategy:${strategy.strategyId}`];
    },
  };
}

// ── Singleton provider (default strategy) ─────────────────────────────────────

export const OfficialLibraryProvider: MemoryProvider = createOfficialLibraryProvider(defaultSearchStrategy);

/** Replace the search strategy at runtime (DIP). Returns the same provider instance for chaining. */
export function setOfficialLibrarySearchStrategy(strategy: SearchStrategy): void {
  OfficialLibraryIndexer.setSearchStrategy(strategy);
}

// Self-register
MemoryProviderRegistry.register(OfficialLibraryProvider);