/**
 * CoverageAnalyzer.ts
 * Analyzes which modules are covered by the current test run.
 *
 * SRP: Coverage analysis only.
 * Sprint: EV-1
 *
 * Derives coverage from test suite names mapped to known modules.
 * This is static coverage tracking (name-based), not instrumented coverage.
 */

import type { CoverageSnapshot, TestResult, CoverageEntry } from "./ValidationTypes";

// Known platform modules that should be covered
const KNOWN_MODULES: string[] = [
  // Knowledge Query
  "KnowledgeQueryFacade",
  "KnowledgeQueryEngine",
  "KnowledgeQueryPipeline",
  "KnowledgeQueryExecutor",
  "KnowledgeQueryCache",
  "KnowledgeQueryRanking",
  // Planning
  "PlanningKnowledgePipeline",
  "PlanningKnowledgeProvider",
  // Decision
  "DecisionKnowledgePipeline",
  "DecisionKnowledgeContext",
  "DecisionRiskAnalyzer",
  "DecisionConfidenceCalculator",
  // Connector
  "ConnectorKnowledgePipeline",
  "ConnectorRiskAnalyzer",
  "ConnectorGovernanceValidator",
  "ConnectorConfidenceCalculator",
  "ConnectorExecutionStrategy",
  // Engineering
  "EngineeringKnowledgePipeline",
  "EngineeringRiskAnalyzer",
  "EngineeringGovernanceValidator",
  "EngineeringConfidenceCalculator",
  "EngineeringExecutionStrategy",
  // Registries
  "OperationalKnowledgeRegistry",
  "GovernancePolicyRegistry",
  // Governance
  "GovernancePolicyPipeline",
  "GovernanceDecisionEngine",
  // Testing (self)
  "AssertionEngine",
  "TestEngine",
  "TestRunner",
];

export const CoverageAnalyzer = Object.freeze({

  analyze(results: TestResult[]): CoverageSnapshot {
    // Map suite names to modules by substring matching
    const coveredModules = new Set<string>();
    for (const r of results) {
      for (const mod of KNOWN_MODULES) {
        if (r.suiteName.toLowerCase().includes(mod.toLowerCase()) ||
            r.testName.toLowerCase().includes(mod.toLowerCase())) {
          coveredModules.add(mod);
        }
      }
    }

    // Build entry per module
    const modules: CoverageEntry[] = KNOWN_MODULES.map(mod => {
      const testCount = results.filter(r =>
        r.suiteName.toLowerCase().includes(mod.toLowerCase()) ||
        r.testName.toLowerCase().includes(mod.toLowerCase())
      ).length;
      return Object.freeze({
        module:    mod,
        tested:    coveredModules.has(mod),
        testCount,
      });
    });

    const testedModules = modules.filter(m => m.tested).length;
    const coverageRate  = KNOWN_MODULES.length > 0
      ? Math.round((testedModules / KNOWN_MODULES.length) * 100)
      : 0;

    return Object.freeze({
      modules:       Object.freeze(modules),
      testedModules,
      totalModules:  KNOWN_MODULES.length,
      coverageRate,
    });
  },

  getKnownModules(): string[] {
    return [...KNOWN_MODULES];
  },
});