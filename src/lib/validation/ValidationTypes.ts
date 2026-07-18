/**
 * ValidationTypes.ts — Sprint P-02.0
 * Core type contracts for the Product Validation Framework.
 */

export type ScenarioStatus = "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "PARTIAL";

export interface ValidationScenario {
  readonly id:          string;
  readonly name:        string;
  readonly description: string;
  readonly category:    "simple" | "memory" | "planning" | "execution" | "explainability" | "context" | "failure" | "partial";
  readonly input:       { text: string; sessionId: string; userId: string };
  readonly expect:      ValidationExpectation;
}

export interface ValidationExpectation {
  readonly status:           "COMPLETED" | "FAILED" | "PARTIAL";
  readonly minStagesPassed:  number;
  readonly requiresMemory?:  boolean;
  readonly requiresConnector?: string;
  readonly minConfidence?:   number;
  readonly requiresCompliance?: "COMPLIANT" | "WARNING" | "VIOLATION";
  readonly explainabilityRequired?: boolean;
}

export interface StageTiming {
  readonly stage:      string;
  readonly durationMs: number;
  readonly status:     string;
}

export interface ValidationMetrics {
  readonly totalDurationMs:   number;
  readonly stageTimings:      readonly StageTiming[];
  readonly memoryUsed:        boolean;
  readonly connectorsUsed:    readonly string[];
  readonly confidence:        number;
  readonly stagesPassed:      number;
  readonly stagesTotal:       number;
  readonly hasExplainability: boolean;
  readonly complianceStatus:  string | null;
  readonly errorCount:        number;
}

export interface ValidationResult {
  readonly scenarioId:    string;
  readonly scenarioName:  string;
  readonly category:      string;
  readonly status:        ScenarioStatus;
  readonly passed:        boolean;
  readonly failures:      readonly string[];
  readonly metrics:       ValidationMetrics;
  readonly executedAt:    number;
  readonly durationMs:    number;
  readonly report:        unknown;   // ExecutionChainReport — kept as unknown to avoid coupling
  readonly snapshot:      unknown;   // ExecutionSnapshot
}

export interface ValidationSuiteResult {
  readonly suiteId:      string;
  readonly runAt:        number;
  readonly durationMs:   number;
  readonly total:        number;
  readonly passed:       number;
  readonly failed:       number;
  readonly partial:      number;
  readonly successRate:  number;
  readonly results:      readonly ValidationResult[];
  readonly certified:    boolean;
}