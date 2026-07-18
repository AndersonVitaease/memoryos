/**
 * KnowledgeQueryEngine.ts
 * Public query API — typed convenience methods over the pipeline.
 *
 * SRP: Public API surface only — delegates everything to Pipeline.
 * Sprint: INTEGRATION-02
 */

import { KnowledgeQueryPipeline } from "./KnowledgeQueryPipeline";
import type { KnowledgeQueryRequest, KnowledgeQueryResponse } from "./KnowledgeQueryTypes";

export const KnowledgeQueryEngine = Object.freeze({

  query(req: KnowledgeQueryRequest): KnowledgeQueryResponse {
    return KnowledgeQueryPipeline.run(req);
  },

  queryLessons(intent: string, limit = 10): KnowledgeQueryResponse {
    return KnowledgeQueryPipeline.run({ intent, filter: { sources: ["LESSONS"] }, limit });
  },

  queryBestPractices(intent: string, limit = 10): KnowledgeQueryResponse {
    return KnowledgeQueryPipeline.run({ intent, filter: { sources: ["BEST_PRACTICES"] }, limit });
  },

  queryKnownIssues(intent: string, limit = 10): KnowledgeQueryResponse {
    return KnowledgeQueryPipeline.run({ intent, filter: { sources: ["KNOWN_ISSUES"] }, limit });
  },

  queryAntiPatterns(intent: string, limit = 10): KnowledgeQueryResponse {
    return KnowledgeQueryPipeline.run({ intent, filter: { sources: ["ANTI_PATTERNS"] }, limit });
  },

  queryJournal(intent: string, limit = 10): KnowledgeQueryResponse {
    return KnowledgeQueryPipeline.run({ intent, filter: { sources: ["JOURNAL"] }, limit });
  },

  queryGovernance(intent: string, limit = 10): KnowledgeQueryResponse {
    return KnowledgeQueryPipeline.run({ intent, filter: { sources: ["GOVERNANCE"] }, limit });
  },

  queryAll(intent: string, limit = 20): KnowledgeQueryResponse {
    return KnowledgeQueryPipeline.run({ intent, filter: { sources: ["ALL"] }, limit });
  },
});