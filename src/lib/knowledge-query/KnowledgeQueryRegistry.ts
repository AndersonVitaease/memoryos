/**
 * KnowledgeQueryRegistry.ts
 * Stores ranking profiles, policies, and execution plan templates.
 * Append-only — nothing is deleted.
 *
 * SRP: Registry storage only.
 * Sprint: INTEGRATION-02
 */

import type { RankingProfile, RankingPolicy, KnowledgeQuery } from "./KnowledgeQueryTypes";

// ── Default Profiles ──────────────────────────────────────────────────────────

const DEFAULT_PROFILES: RankingProfile[] = [
  {
    id: "RP-DEFAULT",
    name: "Default Balanced",
    weights: { evidence: 0.40, confidence: 0.25, recency: 0.20, occurrences: 0.10, approvals: 0.03, governance: 0.02 },
  },
  {
    id: "RP-EVIDENCE",
    name: "Evidence-Heavy",
    weights: { evidence: 0.60, confidence: 0.20, recency: 0.10, occurrences: 0.05, approvals: 0.03, governance: 0.02 },
  },
  {
    id: "RP-RECENCY",
    name: "Recency-First",
    weights: { evidence: 0.20, confidence: 0.20, recency: 0.45, occurrences: 0.10, approvals: 0.03, governance: 0.02 },
  },
  {
    id: "RP-GOVERNANCE",
    name: "Governance-Aware",
    weights: { evidence: 0.30, confidence: 0.20, recency: 0.15, occurrences: 0.10, approvals: 0.05, governance: 0.20 },
  },
];

const DEFAULT_POLICY: RankingPolicy = {
  profileId:  "RP-DEFAULT",
  topN:       20,
  minScore:   0.10,
  tieBreaker: "RECENCY",
};

// ── Internal stores ────────────────────────────────────────────────────────────

const _profiles = new Map<string, RankingProfile>(DEFAULT_PROFILES.map(p => [p.id, p]));
const _queries:  KnowledgeQuery[] = [];
let   _queryCounter = 0;

export const KnowledgeQueryRegistry = Object.freeze({

  // ── Profiles ────────────────────────────────────────────────────────────────

  getProfile(id: string): RankingProfile {
    return _profiles.get(id) ?? _profiles.get("RP-DEFAULT")!;
  },

  getAllProfiles(): RankingProfile[] {
    return [..._profiles.values()];
  },

  registerProfile(p: Omit<RankingProfile, "id">): RankingProfile {
    const id = `RP-CUSTOM-${_profiles.size + 1}`;
    const full = { ...p, id };
    _profiles.set(id, full);
    return full;
  },

  // ── Default policy ──────────────────────────────────────────────────────────

  getDefaultPolicy(profileId?: string): RankingPolicy {
    return { ...DEFAULT_POLICY, profileId: profileId ?? DEFAULT_POLICY.profileId };
  },

  // ── Query log (read-only append) ─────────────────────────────────────────────

  logQuery(q: Omit<KnowledgeQuery, "id" | "createdAt">): KnowledgeQuery {
    _queryCounter++;
    const full: KnowledgeQuery = {
      ...q,
      id:        `KQ-${String(_queryCounter).padStart(3, "0")}`,
      createdAt: new Date().toISOString(),
    };
    _queries.push(full);
    return full;
  },

  getQueries(): KnowledgeQuery[] {
    return [..._queries].reverse();
  },

  count(): number { return _queryCounter; },
});