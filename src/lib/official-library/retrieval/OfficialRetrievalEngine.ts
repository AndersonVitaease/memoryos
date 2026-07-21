/**
 * OfficialRetrievalEngine.ts — Sprint EF-42
 *
 * The first official Retrieval Engine for the Official Library.
 * Entry point for all document retrieval within the Official Library layer.
 *
 * Responsibilities:
 *   1. Receive a natural-language or keyword query
 *   2. Score all indexed documents via KeywordMatcher
 *   3. Select chunks for qualifying documents via ChunkSelector
 *   4. Return a fully immutable RetrievedKnowledge result
 *   5. Record a diagnostic trace via RetrievalDiagnostics
 *
 * What this does NOT do:
 *   - Generate responses (Planner's job, EF-43+)
 *   - Call any LLM or external API
 *   - Modify Index, Registry, or Bootstrap
 *   - Rank across sources (Ranking Engine, EF-44+)
 *   - Resolve authority conflicts (Authority Engine, EF-44+)
 *
 * Dependencies (Official Library only):
 *   - OfficialLibraryIndex   — flat document store
 *   - OfficialLibraryAdapter — converts internal → raw types
 *   - KeywordMatcher         — deterministic scoring
 *   - ChunkSelector          — chunk selection
 *   - RetrievalDiagnostics   — trace recording
 *
 * SRP: coordinate retrieval steps. Never store, never respond.
 *
 * HMR-safe singleton pattern.
 */

import { OfficialLibraryIndex }    from "../index/OfficialLibraryIndex";
import { ChunkIndex }              from "../content/ChunkIndex";
import {
  normalizeText,
  tokenize,
  scoreAgainstKeywords,
  scoreAgainstText,
  combineScores,
} from "./KeywordMatcher";
import { selectChunks }              from "./ChunkSelector";
import { RetrievalDiagnostics }      from "./RetrievalDiagnostics";
import type { DocAnalysisEvent }     from "./RetrievalDiagnostics";
import {
  emptyKnowledge,
  type RetrievedKnowledge,
  type RetrievedDocument,
  type RetrievedRelationship,
} from "./RetrievedKnowledge";
import type { OfficialChunk }       from "../OfficialLibraryTypes";

// ── Config ────────────────────────────────────────────────────────────────────

const MIN_DOC_SCORE = 0.10;

// ── Scoring weights for document-level relevance ──────────────────────────────

const TITLE_WEIGHT    = 0.40;
const KEYWORD_WEIGHT  = 0.35;
const CATEGORY_WEIGHT = 0.15;
const TAG_WEIGHT      = 0.10;

// ── Engine implementation ─────────────────────────────────────────────────────

class OfficialRetrievalEngineImpl {

  /**
   * Retrieve knowledge for a query.
   * Returns deeply frozen RetrievedKnowledge.
   */
  retrieve(query: string): RetrievedKnowledge {
    const t0 = Date.now();

    if (!query || query.trim().length === 0) {
      return emptyKnowledge(query, "", Date.now() - t0);
    }

    const normalizedQuery = normalizeText(query);
    const allDocs  = OfficialLibraryIndex.getAll();

    if (allDocs.length === 0) {
      return emptyKnowledge(query, normalizedQuery, Date.now() - t0);
    }

    const docEvents: DocAnalysisEvent[] = [];
    const retrievedDocs: RetrievedDocument[] = [];

    for (const doc of allDocs) {
      // ── Score document ───────────────────────────────────────────────────

      const titleResult    = scoreAgainstText(query, doc.title);
      const keywordResult  = scoreAgainstKeywords(query, doc.keywords);
      const categoryResult = scoreAgainstText(query, doc.category);
      const tagResult      = scoreAgainstKeywords(query, doc.keywords.slice(0, 5));

      const docScore = combineScores([
        { result: titleResult,    weight: TITLE_WEIGHT    },
        { result: keywordResult,  weight: KEYWORD_WEIGHT  },
        { result: categoryResult, weight: CATEGORY_WEIGHT },
        { result: tagResult,      weight: TAG_WEIGHT      },
      ]);

      // ── Retrieve chunks for qualifying docs ──────────────────────────────

      // EF-42.5: use real chunks from ChunkIndex (replaces syntheticChunksFrom)
      let chunksForDoc: OfficialChunk[] = [];
      try {
        const real = ChunkIndex.getChunks(doc.id);
        if (real.length > 0) {
          // Map OfficialContentChunk → OfficialChunk shape for ChunkSelector
          chunksForDoc = real.map(c => ({
            id:           c.id,
            documentId:   c.documentId,
            documentName: doc.title,
            version:      doc.version,
            chapter:      c.chapter,
            section:      c.section,
            title:        c.title,
            content:      c.content,
            summary:      c.summary,
            authority:    "OFFICIAL" as const,
            sourceType:   "OFFICIAL_LIBRARY" as const,
            createdAt:    doc.updatedAt,
            updatedAt:    doc.updatedAt,
            tags:         [...c.tags],
            metadata:     {},
          }));
        }
      } catch {
        chunksForDoc = [];
      }

      const chunkResult = selectChunks(query, chunksForDoc);

      const docSelected = docScore >= MIN_DOC_SCORE;

      docEvents.push(Object.freeze({
        documentId:      doc.id,
        title:           doc.title,
        score:           Math.round(docScore * 1000) / 1000,
        chunksScanned:   chunkResult.totalScanned,
        chunksSelected:  chunkResult.selectedCount,
        selected:        docSelected,
        rejectionReason: !docSelected ? `score ${docScore.toFixed(3)} < threshold ${MIN_DOC_SCORE}` : undefined,
      }));

      if (!docSelected) continue;

      // ── Build relationships ──────────────────────────────────────────────

      const relationships: RetrievedRelationship[] = doc.relatedDocuments.map(r =>
        Object.freeze({
          targetId:    r.targetId,
          targetTitle: r.targetId, // title resolution is EF-44+
          type:        r.relationshipType,
        })
      );

      retrievedDocs.push(Object.freeze({
        documentId:      doc.id,
        title:           doc.title,
        version:         doc.version,
        category:        doc.category,
        relevanceScore:  Math.round(docScore * 1000) / 1000,
        matchedChunks:   chunkResult.chunks,
        relationships:   Object.freeze(relationships),
        metadata:        Object.freeze({
          path:      doc.path,
          status:    doc.status,
          keywords:  Object.freeze([...doc.keywords]),
          updatedAt: doc.updatedAt,
        }),
      }));
    }

    // Sort by relevanceScore descending
    retrievedDocs.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const durationMs     = Date.now() - t0;
    const totalChunks    = retrievedDocs.reduce((s, d) => s + d.matchedChunks.length, 0);
    const topScore       = retrievedDocs[0]?.relevanceScore ?? 0;

    // Record diagnostic trace
    RetrievalDiagnostics.record({
      query, normalizedQuery,
      docsAnalyzed:   allDocs.length,
      docsSelected:   retrievedDocs.length,
      chunksSelected: totalChunks,
      topScore,
      durationMs,
      docEvents:      Object.freeze(docEvents),
    });

    return Object.freeze({
      query,
      normalizedQuery,
      documents:      Object.freeze(retrievedDocs),
      totalDocuments: retrievedDocs.length,
      totalChunks,
      topScore,
      retrievedAt:    new Date().toISOString(),
      durationMs,
    });
  }

  /**
   * Retrieve by explicit category filter (supplementary API).
   */
  retrieveByCategory(category: string): RetrievedKnowledge {
    return this.retrieve(category);
  }

  /**
   * Retrieve by explicit document ID (direct lookup).
   */
  retrieveById(documentId: string): RetrievedDocument | null {
    const t0  = Date.now();
    const doc = OfficialLibraryIndex.get(documentId);
    if (!doc) return null;

    // EF-42.5: use real chunks from ChunkIndex
    const real = ChunkIndex.getChunks(documentId);
    const chunks: OfficialChunk[] = real.map(c => ({
      id:           c.id,
      documentId:   c.documentId,
      documentName: doc.title,
      version:      doc.version,
      chapter:      c.chapter,
      section:      c.section,
      title:        c.title,
      content:      c.content,
      summary:      c.summary,
      authority:    "OFFICIAL" as const,
      sourceType:   "OFFICIAL_LIBRARY" as const,
      createdAt:    doc.updatedAt,
      updatedAt:    doc.updatedAt,
      tags:         [...c.tags],
      metadata:     {},
    }));
    const chunkResult = selectChunks(documentId, chunks);

    return Object.freeze({
      documentId:      doc.id,
      title:           doc.title,
      version:         doc.version,
      category:        doc.category,
      relevanceScore:  1.0,
      matchedChunks:   chunkResult.chunks,
      relationships:   Object.freeze([]),
      metadata:        Object.freeze({
        path:      doc.path,
        status:    doc.status,
        keywords:  Object.freeze([...doc.keywords]),
        updatedAt: doc.updatedAt,
      }),
    });
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_RETRIEVAL_ENGINE__?: OfficialRetrievalEngineImpl };
if (!G.__OL_RETRIEVAL_ENGINE__) G.__OL_RETRIEVAL_ENGINE__ = new OfficialRetrievalEngineImpl();
export const OfficialRetrievalEngine: OfficialRetrievalEngineImpl = G.__OL_RETRIEVAL_ENGINE__;