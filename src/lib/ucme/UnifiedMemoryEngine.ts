/**
 * UnifiedMemoryEngine.ts — UCME v1.0
 * Sprint 7.0.0
 *
 * THE single public interface for all memory access in MemoryOS.
 * No Planner, no Connector, no LLM consults memory directly.
 * All memory access goes through here.
 *
 * Architecture:
 *   Consumer → UnifiedMemoryEngine → MemoryProviderRegistry → MemoryProviders
 *                                  ↓
 *                          MemoryFusionEngine
 *                                  ↓
 *                          MemoryResult (evidence + context)
 */

import type {
  MemoryQuery,
  MemoryResult,
  MemoryContext,
  MemoryEvidence,
  MemoryProviderStat,
  MemoryTimeline,
  MemoryTimelineItem,
} from "./UCMETypes";
import { MemoryProviderRegistry } from "./MemoryProviderRegistry";
import { MemoryFusionEngine }     from "./MemoryFusionEngine";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_PER_PROVIDER = 10;

// ── Provider query with timeout & error isolation ─────────────────────────────

async function queryProvider(
  provider: import("./UCMETypes").MemoryProvider,
  query: MemoryQuery,
  timeoutMs: number,
): Promise<{ evidence: MemoryEvidence[]; stat: MemoryProviderStat }> {
  const t0 = Date.now();
  try {
    const evidence = await Promise.race([
      provider.search(query),
      new Promise<MemoryEvidence[]>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs)
      ),
    ]);
    return {
      evidence,
      stat: { providerId: provider.id, providerName: provider.name, hits: evidence.length, durationMs: Date.now() - t0, healthy: true, error: null },
    };
  } catch (e) {
    return {
      evidence: [],
      stat: { providerId: provider.id, providerName: provider.name, hits: 0, durationMs: Date.now() - t0, healthy: false, error: (e as Error).message },
    };
  }
}

// ── Build timeline from evidence ──────────────────────────────────────────────

function buildTimeline(evidence: MemoryEvidence[]): MemoryTimeline {
  const items: MemoryTimelineItem[] = evidence
    .filter(ev => ev.lastUpdated)
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 20)
    .map(ev => ({
      date:     ev.lastUpdated,
      summary:  ev.summary,
      source:   ev.providerName,
      memoryId: ev.memoryId,
    }));
  return { items };
}

// ── Main engine ───────────────────────────────────────────────────────────────

export const UnifiedMemoryEngine = {

  /**
   * Query all relevant memory providers and return merged results.
   * This is the ONLY method consumers should call for memory retrieval.
   */
  async query(query: MemoryQuery): Promise<MemoryResult> {
    const t0 = Date.now();
    const timeoutMs = query.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Select providers
    const allProviders = MemoryProviderRegistry.getAll();
    const providers    = query.providers && query.providers.length > 0
      ? allProviders.filter(p => query.providers!.includes(p.id))
      : allProviders;

    if (providers.length === 0) {
      const empty = MemoryFusionEngine.fuse([]);
      return {
        query,
        evidence:      empty,
        context:       MemoryFusionEngine.buildContext(query.text, empty),
        timeline:      { items: [] },
        durationMs:    Date.now() - t0,
        providerStats: [],
      };
    }

    // Query all providers in parallel (error-isolated)
    const results = await Promise.all(
      providers.map(p => queryProvider(p, { ...query, maxPerProvider: query.maxPerProvider ?? DEFAULT_MAX_PER_PROVIDER }, timeoutMs))
    );

    const allEvidence    = results.flatMap(r => r.evidence);
    const providerStats  = results.map(r => r.stat);

    // Fuse: merge + deduplicate + rank
    const fused  = MemoryFusionEngine.fuse(allEvidence, (query.maxPerProvider ?? DEFAULT_MAX_PER_PROVIDER) * 2);
    const context = MemoryFusionEngine.buildContext(query.text, fused);
    const timeline = buildTimeline(fused);

    return {
      query,
      evidence:     fused,
      context,
      timeline,
      durationMs:   Date.now() - t0,
      providerStats,
    };
  },

  /**
   * Build a structured MemoryContext for LLM consumption.
   */
  async buildContext(query: MemoryQuery): Promise<MemoryContext> {
    const result = await this.query(query);
    return {
      query,
      result,
      prompt: result.context,
      builtAt: new Date().toISOString(),
    };
  },

  /** Store a memory in the specified provider */
  async remember(providerId: string, content: string, metadata?: Record<string, unknown>): Promise<string | null> {
    const p = MemoryProviderRegistry.get(providerId);
    if (!p) return null;
    return p.remember(content, metadata);
  },

  /** Health check across all providers */
  async healthCheck(): Promise<{ providerId: string; providerName: string; healthy: boolean; detail: string }[]> {
    const providers = MemoryProviderRegistry.getAll();
    return Promise.all(
      providers.map(async p => {
        try {
          const h = await Promise.race([p.health(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000))]);
          return { providerId: p.id, providerName: p.name, healthy: h.healthy, detail: h.detail };
        } catch (e) {
          return { providerId: p.id, providerName: p.name, healthy: false, detail: (e as Error).message };
        }
      })
    );
  },

  /** List registered providers */
  providers(): { id: string; name: string; capabilities: string[]; explain: string }[] {
    return MemoryProviderRegistry.getAll().map(p => ({
      id:           p.id,
      name:         p.name,
      capabilities: p.capabilities(),
      explain:      p.explain(),
    }));
  },
};