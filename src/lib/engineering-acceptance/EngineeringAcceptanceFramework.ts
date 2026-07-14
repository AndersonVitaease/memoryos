/**
 * EngineeringAcceptanceFramework.ts — Sprint 6.3.2
 * HMR-safe singleton — the single entry point for all EAF operations
 *
 * Architecture position:
 *   EW → EI → EMem → EGov → AA → Regression Shield → SHR → EAF → READY
 */

import { AcceptanceEngine } from "./AcceptanceEngine";
import { globalRegistry } from "./AcceptanceRegistry";
import { buildScenarios631 } from "./scenarios/Sprint631Scenarios";
import { buildScenarios632 } from "./scenarios/Sprint632Scenarios";

const G = globalThis as any;

if (!G.__eaf_instance) {
  const engine = new AcceptanceEngine();

  // Bind built-in sprint scenarios
  globalRegistry.bindScenarios("6.3.1", buildScenarios631());
  globalRegistry.bindScenarios("6.3.2", buildScenarios632());

  G.__eaf_instance = engine;
}

export const EAF: AcceptanceEngine = G.__eaf_instance;

// Re-export for convenience
export { globalRegistry as EAFRegistry } from "./AcceptanceRegistry";
export { AcceptanceEngine } from "./AcceptanceEngine";
export { AcceptanceRunner } from "./AcceptanceRunner";
export { AcceptanceValidator } from "./AcceptanceValidator";
export { AcceptanceReporter } from "./AcceptanceReporter";
export { AcceptanceHistory } from "./AcceptanceHistory";
export { AcceptanceMetrics } from "./AcceptanceMetrics";
export { AcceptanceAudit } from "./AcceptanceAudit";
export { AcceptanceEvidenceStore } from "./AcceptanceEvidence";
export { assert } from "./AcceptanceAssertion";