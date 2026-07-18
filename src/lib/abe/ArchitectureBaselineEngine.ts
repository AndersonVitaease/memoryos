/**
 * ArchitectureBaselineEngine.ts — Sprint EF-6.7.0
 *
 * Facade that orchestrates the full ABE lifecycle:
 *   capture → serialize → compare → certify
 *
 * Usage:
 *   const abe = ArchitectureBaselineEngine;
 *   const baseline = abe.capture("EF-6.5.0", modules);
 *   abe.save(baseline);
 *   const current  = abe.capture("EF-6.6.0", modules);
 *   const cert     = abe.certify(baseline, current);
 */

import type { ABEBaseline, ABECertificationResult, ABEDiffResult } from "./ABETypes";
import type { ABEModuleDescriptor }  from "./BaselineSnapshot";
import { captureBaseline }           from "./BaselineSnapshot";
import { BaselineSerializer }        from "./BaselineSerializer";
import { diffBaselines }             from "./BaselineDiffEngine";
import { CertificationEngine }       from "./CertificationEngine";

export const ArchitectureBaselineEngine = {

  /** Capture a new baseline from live modules. No hardcoded data. */
  capture(id: string, label: string, modules: ABEModuleDescriptor[]): ABEBaseline {
    return captureBaseline(id, label, modules);
  },

  /** Save a baseline to localStorage. */
  save(baseline: ABEBaseline): string {
    return BaselineSerializer.save(baseline);
  },

  /** Load a previously saved baseline by id. */
  load(id: string): ABEBaseline | null {
    return BaselineSerializer.load(id);
  },

  /** List all saved baseline ids. */
  list(): string[] {
    return BaselineSerializer.listSaved();
  },

  /** Delete a baseline. */
  delete(id: string): void {
    BaselineSerializer.delete(id);
  },

  /** Diff two baselines. */
  diff(baseline: ABEBaseline, current: ABEBaseline): ABEDiffResult {
    return diffBaselines(baseline, current);
  },

  /** Certify: baseline → current. Returns full certification result with seal. */
  certify(baseline: ABEBaseline, current: ABEBaseline): ABECertificationResult {
    return CertificationEngine.certify(baseline, current);
  },

  /** Certify against a saved baseline. Returns null if baseline not found. */
  certifyAgainstSaved(savedId: string, current: ABEBaseline): ABECertificationResult | null {
    const saved = BaselineSerializer.load(savedId);
    if (!saved) return null;
    return CertificationEngine.certify(saved, current);
  },
};