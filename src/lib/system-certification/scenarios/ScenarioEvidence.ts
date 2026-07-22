/**
 * ScenarioEvidence.ts — Sprint EF-55.1
 *
 * Monta evidências de um cenário a partir de ExecutionEvidence real.
 * Nunca fabrica dados.
 */

import type { ExecutionEvidence } from "../runtime/ExecutionEvidence";
import type { GoldenScenario }    from "./GoldenScenario";

export interface EvidenceValidationResult {
  readonly present:  readonly string[];
  readonly missing:  readonly string[];
  readonly allPresent: boolean;
  readonly coverageScore: number;  // 0–1
}

export class ScenarioEvidence {
  validate(scenario: GoldenScenario, ev: ExecutionEvidence): EvidenceValidationResult {
    const present: string[] = [];
    const missing: string[] = [];

    for (const field of scenario.requiredEvidence) {
      const val = (ev as unknown as Record<string, unknown>)[field];
      const isPresent =
        val !== undefined &&
        val !== null &&
        val !== "missing" &&
        val !== "" &&
        val !== 0 ||
        (typeof val === "number" && !isNaN(val)); // 0 is OK for numeric fields like inferenceDepth

      if (isPresent) {
        present.push(`${field}=${String(val).slice(0, 40)}`);
      } else {
        missing.push(field);
      }
    }

    const total = scenario.requiredEvidence.length;
    const coverageScore = total > 0 ? present.length / total : 1;

    return Object.freeze({ present: Object.freeze(present), missing: Object.freeze(missing), allPresent: missing.length === 0, coverageScore });
  }
}