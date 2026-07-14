/**
 * ContractValidator.ts — Sprint 6.2.3
 * Compares BEFORE vs AFTER contract state and detects violations.
 */

import type { PublicContract, ContractDiff, BreakingChangeLevel } from "./AATypes";

function levelFor(diff: Omit<ContractDiff, "breakingLevel" | "details">): BreakingChangeLevel {
  if (diff.removedMethods.length > 0 || diff.removedExports.length > 0 || diff.changedSignature) return "HIGH";
  if (diff.addedMethods.length > 3) return "MEDIUM";
  if (diff.addedMethods.length > 0) return "LOW";
  return "SAFE";
}

export class ContractValidator {
  compare(before: PublicContract, after: Partial<PublicContract>): ContractDiff {
    const afterMethods  = after.methods  ?? before.methods;
    const afterExports  = after.exports  ?? before.exports;
    const afterSignature = after.signature ?? before.signature;

    const removedMethods = before.methods.filter(m => !afterMethods.includes(m));
    const addedMethods   = afterMethods.filter(m => !before.methods.includes(m));
    const removedExports = before.exports.filter(e => !afterExports.includes(e));
    const changedSignature = afterSignature !== before.signature;

    const base = { contractId: before.id, contractName: before.name, before, after, removedMethods, addedMethods, removedExports, changedSignature };
    const breakingLevel = levelFor(base);

    const details: string[] = [];
    if (removedMethods.length > 0) details.push(`Removed methods: ${removedMethods.join(", ")}`);
    if (removedExports.length > 0) details.push(`Removed exports: ${removedExports.join(", ")}`);
    if (changedSignature)          details.push(`Signature changed: "${before.signature}" → "${afterSignature}"`);
    if (addedMethods.length > 0)   details.push(`Added methods: ${addedMethods.join(", ")}`);
    if (details.length === 0)      details.push("No changes detected");

    return { ...base, breakingLevel, details };
  }

  validateAll(contracts: PublicContract[], patches: Record<string, Partial<PublicContract>>): ContractDiff[] {
    return contracts
      .filter(c => patches[c.name])
      .map(c => this.compare(c, patches[c.name]));
  }
}