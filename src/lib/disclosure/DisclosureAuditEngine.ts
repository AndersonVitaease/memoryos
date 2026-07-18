// DisclosureAuditEngine.ts — Sprint EF-36
// Immutable audit log for every disclosure decision

import type { DisclosureAuditEntry, DisclosureDecision, KnowledgeClassification, UserProfileType, DisclosureLevel } from "./DisclosureTypes";

const _log: DisclosureAuditEntry[] = [];
let _seq = 0;

export const DisclosureAuditEngine = {
  record(params: {
    userId?: string;
    profileType: UserProfileType;
    componentName: string;
    classification: KnowledgeClassification;
    userMaxLevel: DisclosureLevel;
    decision: DisclosureDecision;
    transformed: boolean;
    reason: string;
    knowledgeSources?: string[];
  }): DisclosureAuditEntry {
    const entry: DisclosureAuditEntry = Object.freeze({
      id:               `KDE-AUD-${Date.now()}-${++_seq}`,
      timestamp:        Date.now(),
      userId:           params.userId,
      profileType:      params.profileType,
      componentName:    params.componentName,
      classification:   params.classification,
      userMaxLevel:     params.userMaxLevel,
      decision:         params.decision,
      transformed:      params.transformed,
      reason:           params.reason,
      knowledgeSources: params.knowledgeSources ?? [],
    });
    _log.unshift(entry);
    if (_log.length > 1000) _log.splice(1000);
    return entry;
  },

  getAll(): DisclosureAuditEntry[] { return [..._log]; },
  getRecent(n = 50): DisclosureAuditEntry[] { return _log.slice(0, n); },
  getByDecision(d: DisclosureDecision): DisclosureAuditEntry[] { return _log.filter(e => e.decision === d); },
  getByProfile(p: UserProfileType): DisclosureAuditEntry[] { return _log.filter(e => e.profileType === p); },

  stats() {
    const total   = _log.length;
    const allow   = _log.filter(e => e.decision === "ALLOW").length;
    const partial = _log.filter(e => e.decision === "PARTIAL").length;
    const deny    = _log.filter(e => e.decision === "DENY").length;
    const transformed = _log.filter(e => e.transformed).length;
    return { total, allow, partial, deny, transformed };
  },

  clear() { _log.length = 0; },
};