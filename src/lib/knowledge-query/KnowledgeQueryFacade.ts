/**
 * KnowledgeQueryFacade.ts
 * THE single public API for all knowledge consumers.
 *
 * SRP: Facade only — no logic, delegates entirely to KnowledgeQueryEngine.
 * Sprint: INTEGRATION-02
 *
 * Rule: No component may import OperationalKnowledgeRegistry or
 *       GovernancePolicyRegistry directly. All knowledge access goes through here.
 */

import { KnowledgeQueryEngine }  from "./KnowledgeQueryEngine";
import { KnowledgeQueryCache }   from "./KnowledgeQueryCache";
import { KnowledgeQueryMetricsEngine } from "./KnowledgeQueryMetrics";
import { KnowledgeQueryRegistry }      from "./KnowledgeQueryRegistry";
import type { KnowledgeQueryRequest, KnowledgeQueryResponse, KnowledgeQueryMetrics } from "./KnowledgeQueryTypes";

export const KnowledgeQueryFacade = Object.freeze({

  // ── Typed convenience methods ───────────────────────────────────────────────
  query          (req: KnowledgeQueryRequest):         KnowledgeQueryResponse { return KnowledgeQueryEngine.query(req);            },
  queryLessons   (intent: string, limit?: number):     KnowledgeQueryResponse { return KnowledgeQueryEngine.queryLessons(intent, limit);       },
  queryBestPractices(intent: string, limit?: number):  KnowledgeQueryResponse { return KnowledgeQueryEngine.queryBestPractices(intent, limit);  },
  queryKnownIssues  (intent: string, limit?: number):  KnowledgeQueryResponse { return KnowledgeQueryEngine.queryKnownIssues(intent, limit);    },
  queryAntiPatterns (intent: string, limit?: number):  KnowledgeQueryResponse { return KnowledgeQueryEngine.queryAntiPatterns(intent, limit);   },
  queryJournal      (intent: string, limit?: number):  KnowledgeQueryResponse { return KnowledgeQueryEngine.queryJournal(intent, limit);        },
  queryGovernance   (intent: string, limit?: number):  KnowledgeQueryResponse { return KnowledgeQueryEngine.queryGovernance(intent, limit);     },
  queryAll          (intent: string, limit?: number):  KnowledgeQueryResponse { return KnowledgeQueryEngine.queryAll(intent, limit);            },

  // ── Cache management ────────────────────────────────────────────────────────
  invalidateCache(): void { KnowledgeQueryCache.invalidate(); },
  cacheStats() { return KnowledgeQueryCache.stats(); },

  // ── Metrics ─────────────────────────────────────────────────────────────────
  metrics(): KnowledgeQueryMetrics { return KnowledgeQueryMetricsEngine.snapshot(); },

  // ── Profiles ────────────────────────────────────────────────────────────────
  getRankingProfiles() { return KnowledgeQueryRegistry.getAllProfiles(); },
});