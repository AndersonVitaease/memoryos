/**
 * KnowledgeQueryParser.ts
 * Transforms a KnowledgeQueryRequest into a normalized KnowledgeQuery.
 *
 * SRP: Parsing / normalization only.
 * Sprint: INTEGRATION-02
 */

import { KnowledgeQueryRegistry } from "./KnowledgeQueryRegistry";
import type { KnowledgeQueryRequest, KnowledgeQuery, KnowledgeFilter, KnowledgeSource } from "./KnowledgeQueryTypes";

const ALL_SOURCES: KnowledgeSource[] = [
  "LESSONS","BEST_PRACTICES","KNOWN_ISSUES","ANTI_PATTERNS","JOURNAL","GOVERNANCE",
];

function normalizeSources(filter?: Partial<KnowledgeFilter>): KnowledgeSource[] {
  if (!filter?.sources?.length) return ALL_SOURCES;
  if (filter.sources.includes("ALL")) return ALL_SOURCES;
  return filter.sources;
}

export const KnowledgeQueryParser = Object.freeze({

  parse(req: KnowledgeQueryRequest): KnowledgeQuery {
    const filter: KnowledgeFilter = {
      sources:       normalizeSources(req.filter),
      category:      req.filter?.category      ?? "ANY",
      components:    req.filter?.components    ?? [],
      tags:          req.filter?.tags          ?? [],
      sprint:        req.filter?.sprint        ?? "",
      project:       req.filter?.project       ?? "",
      domain:        req.filter?.domain        ?? "",
      priority:      req.filter?.priority      ?? "ANY",
      minEvidence:   req.filter?.minEvidence   ?? 0,
      minConfidence: req.filter?.minConfidence ?? 0,
      limit:         req.limit                 ?? 20,
    };

    const policy = KnowledgeQueryRegistry.getDefaultPolicy(req.profileId);

    return KnowledgeQueryRegistry.logQuery({ intent: req.intent, filter, policy });
  },
});