/**
 * GoldenScenario.ts — Sprint EF-55.1
 *
 * Define a estrutura de um Golden Scenario oficial.
 * Cada cenário possui: goal, planner esperado, strategy, capability,
 * connector, resultado, evidências obrigatórias.
 */

export type ScenarioStatus = "pass" | "fail" | "warn" | "pending";

export interface GoldenScenario {
  readonly id:                 string;
  readonly name:               string;
  readonly description:        string;
  readonly goal:               string;
  readonly intent:             string;
  readonly expectedStrategy:   string;
  readonly expectedCapabilities: readonly string[];
  readonly expectedConnectors: readonly string[];
  readonly expectedSuccess:    boolean;
  readonly confidence:         number;
  readonly authority:          number;
  readonly durationMs:         number;
  readonly episodeCount:       number;
  readonly requiredEvidence:   readonly string[];  // field names that must be non-missing
}

export interface ScenarioResult {
  readonly scenarioId:    string;
  readonly scenarioName:  string;
  readonly status:        ScenarioStatus;
  readonly score:         number;       // 0–100
  readonly evidence:      readonly string[];
  readonly issues:        readonly string[];
  readonly confidence:    Readonly<{
    structural:  number;
    behavior:    number;
    evidence:    number;
    runtime:     number;
    overall:     number;
  }>;
  readonly durationMs:    number;
}