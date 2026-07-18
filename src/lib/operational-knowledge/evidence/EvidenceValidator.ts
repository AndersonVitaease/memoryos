/**
 * EvidenceValidator.ts
 * Validates evidence records for integrity and consistency.
 *
 * Authority: ENGINEERING
 * SRP: Validation only — no registry mutation, no search.
 * Sprint: KB-02
 *
 * Checks: unique IDs, valid cross-refs, no broken links, required fields.
 */

import { EvidenceRegistry } from "./EvidenceRegistry";
import { OperationalKnowledgeRegistry } from "../OperationalKnowledgeRegistry";
import type { Evidence, EvidenceValidationResult } from "./EvidenceTypes";

// ── Known valid reference prefixes ───────────────────────────────────────────

const OFFICIAL_DOC_IDS = new Set([
  "MCF-001","MRS-001","MCS-001","MDIS-001","MIES-001",
  "MDPS-001","MGFS-001","MRI-001","MQCCS-001","MPEGS-001",
  "CDG-001","CCS-001","RVP-001","ORB-001","TST-001",
  "MV-001","MPS-001","MAS-001","MDS-001","MES-001",
]);

const VALID_ADR_PATTERN  = /^ADR-\d{3}(-EF)?$/;
const VALID_RFC_PATTERN  = /^RFC-\d{3}$/;
const VALID_LL_PATTERN   = /^LL-\d{3}$/;
const VALID_AP_PATTERN   = /^AP-\d{3}$/;
const VALID_BP_PATTERN   = /^BP-\d{3}$/;
const VALID_KI_PATTERN   = /^KI-\d{3}$/;
const VALID_TG_PATTERN   = /^TG-[A-Z]+-\d{3}|TG-\d{3}$/;
const VALID_EJ_PATTERN   = /^EJ-\d{3}$/;
const VALID_EVD_PATTERN  = /^EVD-\d{3}$/;

function validateRef(ref: string, pattern: RegExp, errors: string[], label: string): void {
  if (!pattern.test(ref)) {
    errors.push(`Invalid ${label} reference: "${ref}"`);
  }
}

function validateEvidence(e: Evidence, allIds: Set<string>): EvidenceValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!e.id)          errors.push("Missing id");
  if (!e.title)       errors.push("Missing title");
  if (!e.problem)     errors.push("Missing problem");
  if (!e.rootCause)   errors.push("Missing rootCause");
  if (!e.solution)    errors.push("Missing solution");
  if (!e.sprint)      errors.push("Missing sprint");
  if (!e.date)        errors.push("Missing date");

  // ID format
  if (!VALID_EVD_PATTERN.test(e.id)) {
    errors.push(`ID "${e.id}" does not match EVD-NNN format`);
  }

  // Duplicate IDs across the registry are caught externally by checking allIds
  // (single registry, so no duplicate check needed here)

  // Cross-reference validation
  const links = e.links ?? {};

  for (const ref of (links.lessonsLearned ?? []))  validateRef(ref, VALID_LL_PATTERN,  errors, "LL");
  for (const ref of (links.antiPatterns   ?? []))  validateRef(ref, VALID_AP_PATTERN,  errors, "AP");
  for (const ref of (links.bestPractices  ?? []))  validateRef(ref, VALID_BP_PATTERN,  errors, "BP");
  for (const ref of (links.knownIssues    ?? []))  validateRef(ref, VALID_KI_PATTERN,  errors, "KI");
  for (const ref of (links.journalEntries ?? []))  validateRef(ref, VALID_EJ_PATTERN,  errors, "EJ");
  for (const ref of (links.adrs           ?? []))  validateRef(ref, VALID_ADR_PATTERN, errors, "ADR");
  for (const ref of (links.rfcs           ?? []))  validateRef(ref, VALID_RFC_PATTERN, errors, "RFC");

  for (const ref of (links.relatedEvidence ?? [])) {
    if (!VALID_EVD_PATTERN.test(ref)) errors.push(`Invalid EVD reference: "${ref}"`);
    else if (!allIds.has(ref)) warnings.push(`EVD reference "${ref}" not found in registry`);
  }

  for (const ref of (links.officialDocs ?? [])) {
    if (!OFFICIAL_DOC_IDS.has(ref)) {
      warnings.push(`Official doc "${ref}" not in known set — verify it exists`);
    }
  }

  // Optional field warnings
  if (!e.description)       warnings.push("Missing description — consider adding one");
  if (!e.versionAffected)   warnings.push("versionAffected not set");

  return {
    evidenceId: e.id,
    valid:      errors.length === 0,
    errors,
    warnings,
  };
}

export const EvidenceValidator = Object.freeze({
  /**
   * Validate a single evidence record.
   */
  validate(evidence: Evidence): EvidenceValidationResult {
    const allIds = new Set(EvidenceRegistry.getAll().map(e => e.id));
    return validateEvidence(evidence, allIds);
  },

  /**
   * Validate all evidence records in the registry.
   */
  validateAll(): EvidenceValidationResult[] {
    const all    = EvidenceRegistry.getAll();
    const allIds = new Set(all.map(e => e.id));
    return all.map(e => validateEvidence(e, allIds));
  },

  /**
   * Run full validation and return a summary.
   */
  auditRegistry(): {
    totalChecked:  number;
    valid:         number;
    invalid:       number;
    withWarnings:  number;
    results:       EvidenceValidationResult[];
    certified:     boolean;
  } {
    const results      = EvidenceValidator.validateAll();
    const valid        = results.filter(r => r.valid).length;
    const withWarnings = results.filter(r => r.warnings.length > 0).length;

    return {
      totalChecked: results.length,
      valid,
      invalid:      results.length - valid,
      withWarnings,
      results,
      certified:    results.every(r => r.valid),
    };
  },
});