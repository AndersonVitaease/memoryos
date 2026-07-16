/**
 * KnowledgeNormalizer.ts — Sprint 8.12.1
 *
 * SRP: transform a UnifiedContext into an array of RawKnowledgeUnit[].
 *      This is the ONLY component authorized to perform this transformation.
 *
 * Constraints (by architecture contract):
 *   ✗ No deduplication
 *   ✗ No confidence calculation
 *   ✗ No relationship building
 *   ✗ No conflict resolution
 *   ✗ No connector execution
 *   ✗ No LLM calls
 *   ✓ Pure normalization only
 *   ✓ Deterministic
 *   ✓ Immutable output
 *   ✓ Never throws
 *
 * Consumes:  UnifiedContext (from UnifiedContextBuilder)
 * Produces:  readonly RawKnowledgeUnit[]  (input to KnowledgeFusionEngine)
 *
 * MDS v2.0 compliant. Singleton via globalThis.
 */

import type { UnifiedContext }    from "@/lib/unified-context/UnifiedContextTypes";
import type { RawKnowledgeUnit, KnowledgeUnitType, KnowledgeSourceId } from "./KFETypes";

// ── ID generator (sequential, deterministic within a run) ─────────────────────

let _seq = 0;
function makeUnitId(sourceId: string, idx: number): string {
  return `unit-${sourceId}-${idx}-${++_seq}`;
}

// ── Source confidence defaults ────────────────────────────────────────────────
// Mirrors KnowledgeConfidenceCalculator source weights — read-only reference.
// Normalizer only stamps the raw confidence; calculator re-scores later.

const SOURCE_CONFIDENCE: Readonly<Record<string, number>> = Object.freeze({
  "official_library":      0.90,
  "github_connector":      0.80,
  "memory.decisions":      0.75,
  "memory.topics":         0.65,
  "memory.entities":       0.65,
  "memory.tasks":          0.60,
  "memory.session_summary":0.55,
  "working_memory":        0.55,
  "memory.keywords":       0.50,
  "gmail_connector":       0.70,
  "drive_connector":       0.70,
  "calendar_connector":    0.70,
  "base44_connector":      0.75,
});

function sourceConfidence(sourceId: string): number {
  return SOURCE_CONFIDENCE[sourceId] ?? 0.40;
}

// ── Token splitter ────────────────────────────────────────────────────────────
// Splits a multi-line or comma-separated blob into discrete knowledge items.

function splitBlob(raw: string): string[] {
  return raw
    .split(/[\n,;|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 512);
}

// ── Unit factory ──────────────────────────────────────────────────────────────

function makeUnit(
  sourceId:   KnowledgeSourceId,
  type:       KnowledgeUnitType,
  rawValue:   string,
  confidence: number,
  context?:   string,
  idx:        number = 0,
): RawKnowledgeUnit {
  return Object.freeze({
    id:         makeUnitId(sourceId, idx),
    sourceId,
    type,
    value:      rawValue.toLowerCase().replace(/\s+/g, " ").trim(),
    rawValue,
    confidence,
    context:    context ?? undefined,
    metadata:   Object.freeze({}),
  });
}

// ── KnowledgeNormalizer ───────────────────────────────────────────────────────

export interface NormalizerResult {
  readonly units:        readonly RawKnowledgeUnit[];
  readonly unitCount:    number;
  readonly sourcesRead:  readonly KnowledgeSourceId[];
  readonly durationMs:   number;
  readonly buildId:      string;
}

class KnowledgeNormalizer {
  private _totalNormalizations = 0;

  /**
   * Transform a UnifiedContext into a flat array of RawKnowledgeUnit[].
   * Pure computation — no I/O, no async, no side effects.
   * Never throws — returns an empty result on error.
   */
  normalize(ctx: UnifiedContext): NormalizerResult {
    const t0       = Date.now();
    const units:   RawKnowledgeUnit[] = [];
    const sources: Set<KnowledgeSourceId> = new Set();

    try {
      // ── 1. Memory: entities ──────────────────────────────────────────────
      if (ctx.memoryContext.entities) {
        const conf = sourceConfidence("memory.entities");
        splitBlob(ctx.memoryContext.entities).forEach((v, i) => {
          units.push(makeUnit("memory.entities", "entity", v, conf, "from memory.entities", i));
          sources.add("memory.entities");
        });
      }

      // ── 2. Memory: topics ────────────────────────────────────────────────
      if (ctx.memoryContext.topics) {
        const conf = sourceConfidence("memory.topics");
        splitBlob(ctx.memoryContext.topics).forEach((v, i) => {
          units.push(makeUnit("memory.topics", "topic", v, conf, "from memory.topics", i));
          sources.add("memory.topics");
        });
      }

      // ── 3. Memory: decisions ─────────────────────────────────────────────
      if (ctx.memoryContext.decisions) {
        const conf = sourceConfidence("memory.decisions");
        splitBlob(ctx.memoryContext.decisions).forEach((v, i) => {
          units.push(makeUnit("memory.decisions", "decision", v, conf, "from memory.decisions", i));
          sources.add("memory.decisions");
        });
      }

      // ── 4. Memory: tasks ─────────────────────────────────────────────────
      if (ctx.memoryContext.tasks) {
        const conf = sourceConfidence("memory.tasks");
        splitBlob(ctx.memoryContext.tasks).forEach((v, i) => {
          units.push(makeUnit("memory.tasks", "task", v, conf, "from memory.tasks", i));
          sources.add("memory.tasks");
        });
      }

      // ── 5. Memory: keywords ──────────────────────────────────────────────
      if (ctx.memoryContext.keywords) {
        const conf = sourceConfidence("memory.keywords");
        splitBlob(ctx.memoryContext.keywords).forEach((v, i) => {
          units.push(makeUnit("memory.keywords", "keyword", v, conf, "from memory.keywords", i));
          sources.add("memory.keywords");
        });
      }

      // ── 6. Session summary ───────────────────────────────────────────────
      if (ctx.userContext.sessionSummary) {
        const conf = sourceConfidence("memory.session_summary");
        splitBlob(ctx.userContext.sessionSummary).forEach((v, i) => {
          units.push(makeUnit("memory.session_summary", "fact", v, conf, "session summary", i));
          sources.add("memory.session_summary");
        });
      }

      // ── 7. Official Library ──────────────────────────────────────────────
      if (ctx.officialKnowledge.available && ctx.officialKnowledge.summary) {
        const conf = sourceConfidence("official_library");
        splitBlob(ctx.officialKnowledge.summary).forEach((v, i) => {
          units.push(makeUnit("official_library", "entity", v, conf, "official library", i));
          sources.add("official_library");
        });
      }

      // ── 8. Project / GitHub ──────────────────────────────────────────────
      if (ctx.projectKnowledge.available && ctx.projectKnowledge.summary) {
        const conf = sourceConfidence("github_connector");
        splitBlob(ctx.projectKnowledge.summary).forEach((v, i) => {
          units.push(makeUnit("github_connector", "entity", v, conf, "project knowledge", i));
          sources.add("github_connector");
        });
      }

      // ── 9. Working memory entries ────────────────────────────────────────
      if (ctx.workingMemory.available) {
        const conf = sourceConfidence("working_memory");
        ctx.workingMemory.entries.forEach((v, i) => {
          if (v && v.trim().length > 2) {
            units.push(makeUnit("working_memory", "fact", v.trim(), conf, "working memory", i));
            sources.add("working_memory");
          }
        });
      }

      // ── 10. Connector knowledge snippets ─────────────────────────────────
      const connectors: Array<[KnowledgeSourceId, string | null]> = [
        ["gmail_connector",    ctx.connectorKnowledge.gmail],
        ["drive_connector",    ctx.connectorKnowledge.drive],
        ["calendar_connector", ctx.connectorKnowledge.calendar],
        ["base44_connector",   ctx.connectorKnowledge.base44],
      ];
      for (const [srcId, snippet] of connectors) {
        if (snippet) {
          const conf = sourceConfidence(srcId);
          splitBlob(snippet).forEach((v, i) => {
            units.push(makeUnit(srcId, "entity", v, conf, `${srcId} snippet`, i));
            sources.add(srcId);
          });
        }
      }

    } catch {
      // Never throws — partial result is valid
    }

    this._totalNormalizations++;
    return Object.freeze({
      units:       Object.freeze(units),
      unitCount:   units.length,
      sourcesRead: Object.freeze([...sources]),
      durationMs:  Date.now() - t0,
      buildId:     ctx.buildId,
    });
  }

  get totalNormalizations(): number { return this._totalNormalizations; }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__KNOWLEDGE_NORMALIZER__";
const g    = globalThis as Record<string, unknown>;
if (!g[_KEY]) g[_KEY] = new KnowledgeNormalizer();
export const knowledgeNormalizer = g[_KEY] as KnowledgeNormalizer;
export { KnowledgeNormalizer };
export type { NormalizerResult };