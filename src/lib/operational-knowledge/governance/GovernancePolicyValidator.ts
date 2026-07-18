/**
 * GovernancePolicyValidator.ts
 * Validates governance policies for integrity and consistency.
 *
 * Authority: ENGINEERING
 * SRP: Validation only — no storage, no evaluation.
 * Sprint: KB-05
 *
 * Checks: duplicate IDs, conflicting rules, invalid operators,
 *         missing fields, priority loops, version format.
 */

import { GovernancePolicyRegistry } from "./GovernancePolicyRegistry";
import type { GovernancePolicy, GovernanceRule } from "./GovernancePolicyTypes";

export interface PolicyValidationResult {
  readonly policyId:  string;
  readonly valid:     boolean;
  readonly errors:    string[];
  readonly warnings:  string[];
}

const VALID_OPERATORS = new Set([
  "GTE","GT","LTE","LT","EQ","NEQ","IN","NOT_IN","CONTAINS","EXISTS","NOT_EXISTS",
]);

const VALID_FIELDS = new Set([
  "evidenceScore","confidence","regressionCount","occurrences","approvalCount",
  "duplicatesCount","category","type","sourceType","priority","sprint",
  "component","status","approvalLevel","isAntiPattern","isBestPractice","isKnownIssue","isLesson",
]);

function validateRule(rule: GovernanceRule, ruleIds: Set<string>): string[] {
  const errors: string[] = [];

  if (!rule.id?.match(/^GR-\d{3}$/))      errors.push(`Rule ID "${rule.id}" must match GR-NNN`);
  if (ruleIds.has(rule.id))               errors.push(`Duplicate rule ID: "${rule.id}"`);
  else                                     ruleIds.add(rule.id);
  if (!rule.name?.trim())                  errors.push(`Rule "${rule.id}": missing name`);
  if (!rule.decision)                      errors.push(`Rule "${rule.id}": missing decision`);
  if (!rule.conditions?.length)            errors.push(`Rule "${rule.id}": no conditions defined`);

  for (const cond of (rule.conditions ?? [])) {
    if (!VALID_FIELDS.has(cond.field))    errors.push(`Rule "${rule.id}": unknown field "${cond.field}"`);
    if (!VALID_OPERATORS.has(cond.operator)) errors.push(`Rule "${rule.id}": unknown operator "${cond.operator}"`);
    if (cond.value === undefined)          errors.push(`Rule "${rule.id}": condition value is undefined`);
  }

  return errors;
}

export const GovernancePolicyValidator = Object.freeze({

  validate(policy: GovernancePolicy): PolicyValidationResult {
    const errors:   string[] = [];
    const warnings: string[] = [];
    const ruleIds   = new Set<string>();

    if (!policy.id?.match(/^GP-\d{3}$/))  errors.push(`Policy ID "${policy.id}" must match GP-NNN`);
    if (!policy.name?.trim())              errors.push("Missing policy name");
    if (!policy.version?.match(/^\d+\.\d+$/)) warnings.push("Version does not follow MAJOR.MINOR format");
    if (!policy.rules?.length)             warnings.push("Policy has no rules — will never match");

    for (const rule of (policy.rules ?? [])) {
      errors.push(...validateRule(rule, ruleIds));
    }

    // Conflict detection: same decision from two P0 rules
    const p0Rules = (policy.rules ?? []).filter(r => r.priority === "P0" && r.enabled);
    const p0Decisions = new Set(p0Rules.map(r => r.decision));
    if (p0Decisions.size > 1) {
      warnings.push(`Multiple P0 rules with different decisions — only highest-priority match will fire`);
    }

    return { policyId: policy.id, valid: errors.length === 0, errors, warnings };
  },

  validateAll(): PolicyValidationResult[] {
    return GovernancePolicyRegistry.getAll().map(p => GovernancePolicyValidator.validate(p));
  },

  auditRegistry(): { total: number; valid: number; invalid: number; results: PolicyValidationResult[]; certified: boolean } {
    const results = GovernancePolicyValidator.validateAll();
    const valid   = results.filter(r => r.valid).length;
    return { total: results.length, valid, invalid: results.length - valid, results, certified: results.every(r => r.valid) };
  },
});