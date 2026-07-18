/**
 * OLConsolidationReport.ts — Sprint OL-01
 *
 * Builds the final Official Library v1.0 consolidation report and freeze declaration.
 */

import { OL_MASTER_INDEX, getByCategory, getByAuthority, DocCategory } from "./OLMasterIndex";
import { OLConsistencyAudit, ConsistencyAuditResult } from "./OLConsistencyAudit";

export interface CategorySummary {
  readonly category:    DocCategory;
  readonly total:       number;
  readonly frozen:      number;
  readonly active:      number;
  readonly deprecated:  number;
}

export interface OLConsolidationCertificate {
  readonly certId:          string;
  readonly issuedAt:        number;
  readonly version:         "1.0";
  readonly frozen:          boolean;
  readonly totalDocuments:  number;
  readonly officialDocs:    number;
  readonly verifiedDocs:    number;
  readonly frozenDocs:      number;
  readonly activeDocs:      number;
  readonly deprecatedDocs:  number;
  readonly draftDocs:       number;
  readonly categories:      readonly CategorySummary[];
  readonly audit:           ConsistencyAuditResult;
  readonly consistencyOk:   boolean;
  readonly crossRefCount:   number;
  readonly adrCount:        number;
  readonly rfcCount:        number;
  readonly componentCount:  number;
  readonly summary:         string;
}

export const OLConsolidationReport = {
  build(): OLConsolidationCertificate {
    const docs    = OL_MASTER_INDEX;
    const audit   = OLConsistencyAudit.run();
    const certId  = `OL-01-CERT-${Date.now()}`;

    const cats: DocCategory[] = ["VISION","PRODUCT","ARCHITECTURE","ENGINEERING","OPERATIONS","DEVELOPMENT"];
    const categories: CategorySummary[] = cats.map(cat => {
      const group = getByCategory(cat);
      return Object.freeze({
        category:   cat,
        total:      group.length,
        frozen:     group.filter(d => d.status === "FROZEN").length,
        active:     group.filter(d => d.status === "ACTIVE").length,
        deprecated: group.filter(d => d.status === "DEPRECATED").length,
      });
    });

    const officialDocs    = getByAuthority("OFFICIAL").length;
    const verifiedDocs    = getByAuthority("VERIFIED").length;
    const frozenDocs      = docs.filter(d => d.status === "FROZEN").length;
    const activeDocs      = docs.filter(d => d.status === "ACTIVE").length;
    const deprecatedDocs  = docs.filter(d => d.status === "DEPRECATED").length;
    const draftDocs       = docs.filter(d => d.status === "DRAFT").length;

    // Cross-reference count
    const crossRefCount = docs.reduce((a, d) =>
      a + d.relatedDocs.length + d.dependencies.length + d.adrs.length + d.rfcs.length, 0);

    const adrCount       = docs.filter(d => d.id.startsWith("ADR-")).length;
    const rfcCount       = docs.filter(d => d.id.startsWith("RFC-")).length;
    const allComponents  = new Set(docs.flatMap(d => d.components));
    const componentCount = allComponents.size;

    const consistencyOk = audit.clean;
    const frozen        = consistencyOk && draftDocs === 0;

    const summary = frozen
      ? `MemoryOS Official Library v1.0 FROZEN. ${docs.length} documents classified, ` +
        `${crossRefCount} cross-references validated, ${adrCount} ADRs, ${rfcCount} RFCs, ` +
        `${componentCount} components covered. Zero critical issues.`
      : `Official Library v1.0 PENDING. ${audit.critical} critical issues, ${draftDocs} drafts remain.`;

    return Object.freeze({
      certId,
      issuedAt: Date.now(),
      version:  "1.0",
      frozen,
      totalDocuments: docs.length,
      officialDocs,
      verifiedDocs,
      frozenDocs,
      activeDocs,
      deprecatedDocs,
      draftDocs,
      categories: Object.freeze(categories),
      audit,
      consistencyOk,
      crossRefCount,
      adrCount,
      rfcCount,
      componentCount,
      summary,
    });
  },
};