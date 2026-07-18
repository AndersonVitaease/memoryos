/**
 * OLConsistencyAudit.ts — Sprint OL-01
 *
 * Audits the master index for:
 * - duplicate IDs
 * - broken dependency references
 * - orphaned ADRs / RFCs
 * - deprecated / draft documents
 * - missing cross-references
 */

import { OL_MASTER_INDEX, OLDocument } from "./OLMasterIndex";

export type IssueSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface AuditIssue {
  readonly severity:   IssueSeverity;
  readonly code:       string;
  readonly documentId: string;
  readonly message:    string;
}

export interface ConsistencyAuditResult {
  readonly runAt:       number;
  readonly totalDocs:   number;
  readonly issues:      readonly AuditIssue[];
  readonly critical:    number;
  readonly warnings:    number;
  readonly infos:       number;
  readonly clean:       boolean;
  readonly summary:     string;
}

export const OLConsistencyAudit = {
  run(): ConsistencyAuditResult {
    const runAt  = Date.now();
    const docs   = OL_MASTER_INDEX;
    const ids    = new Set(docs.map(d => d.id));
    const issues: AuditIssue[] = [];

    // 1. Duplicate IDs
    const seen = new Set<string>();
    for (const d of docs) {
      if (seen.has(d.id)) {
        issues.push({ severity: "CRITICAL", code: "DUPLICATE_ID", documentId: d.id, message: `Duplicate document ID: ${d.id}` });
      }
      seen.add(d.id);
    }

    // 2. Broken dependency references
    for (const d of docs) {
      for (const dep of d.dependencies) {
        if (!ids.has(dep)) {
          issues.push({ severity: "CRITICAL", code: "BROKEN_DEP", documentId: d.id, message: `Broken dependency: ${d.id} → ${dep}` });
        }
      }
    }

    // 3. Broken relatedDoc references
    for (const d of docs) {
      for (const rel of d.relatedDocs) {
        if (!ids.has(rel)) {
          issues.push({ severity: "WARNING", code: "BROKEN_REF", documentId: d.id, message: `Broken related ref: ${d.id} → ${rel}` });
        }
      }
    }

    // 4. ADR cross-references: all ADR IDs referenced must exist in index
    const adrIds = new Set(docs.filter(d => d.id.startsWith("ADR-")).map(d => d.id));
    for (const d of docs) {
      for (const adr of d.adrs) {
        if (!adrIds.has(adr)) {
          issues.push({ severity: "WARNING", code: "UNKNOWN_ADR", documentId: d.id, message: `ADR reference not in index: ${adr} (in ${d.id})` });
        }
      }
    }

    // 5. RFC cross-references
    const rfcIds = new Set(docs.filter(d => d.id.startsWith("RFC-")).map(d => d.id));
    for (const d of docs) {
      for (const rfc of d.rfcs) {
        if (!rfcIds.has(rfc)) {
          issues.push({ severity: "WARNING", code: "UNKNOWN_RFC", documentId: d.id, message: `RFC reference not in index: ${rfc} (in ${d.id})` });
        }
      }
    }

    // 6. Deprecated documents
    for (const d of docs) {
      if (d.status === "DEPRECATED") {
        issues.push({ severity: "INFO", code: "DEPRECATED", documentId: d.id, message: `Document is deprecated: ${d.name}` });
      }
    }

    // 7. Draft documents
    for (const d of docs) {
      if (d.status === "DRAFT") {
        issues.push({ severity: "INFO", code: "DRAFT", documentId: d.id, message: `Document still in DRAFT: ${d.name}` });
      }
    }

    // 8. OFFICIAL documents missing ADRs or RFCs (should justify their authority)
    for (const d of docs) {
      if (d.authority === "OFFICIAL" && d.adrs.length === 0 && d.rfcs.length === 0 && d.id !== "MV-001") {
        issues.push({ severity: "INFO", code: "NO_ADR_RFC", documentId: d.id, message: `OFFICIAL document has no ADR/RFC backing: ${d.id}` });
      }
    }

    const critical = issues.filter(i => i.severity === "CRITICAL").length;
    const warnings = issues.filter(i => i.severity === "WARNING").length;
    const infos    = issues.filter(i => i.severity === "INFO").length;
    const clean    = critical === 0;

    const summary = clean
      ? `Audit CLEAN — ${docs.length} documents, ${warnings} warnings, ${infos} info items.`
      : `Audit FAILED — ${critical} critical issues across ${docs.length} documents.`;

    return Object.freeze({ runAt, totalDocs: docs.length, issues: Object.freeze(issues), critical, warnings, infos, clean, summary });
  },
};