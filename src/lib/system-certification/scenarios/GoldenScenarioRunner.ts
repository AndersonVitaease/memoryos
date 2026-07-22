/**
 * GoldenScenarioRunner.ts — Sprint EF-55.1
 *
 * Executa todos os Golden Scenarios usando o RuntimeEvidenceCollector.
 * Nenhum dado sintético — toda execução é real.
 */

import { GOLDEN_SCENARIOS }         from "./ScenarioRegistry";
import { ScenarioValidator }         from "./ScenarioValidator";
import { RuntimeEvidenceCollector }  from "../runtime/RuntimeEvidenceCollector";
import type { ScenarioResult }       from "./GoldenScenario";

export interface GoldenRunSummary {
  readonly totalScenarios:  number;
  readonly passed:          number;
  readonly failed:          number;
  readonly warned:          number;
  readonly overallScore:    number;   // 0–100 average
  readonly overallConf:     number;   // 0–1 average confidence
  readonly results:         readonly ScenarioResult[];
  readonly durationMs:      number;
}

export class GoldenScenarioRunner {
  private readonly _validator = new ScenarioValidator();
  private readonly _collector = new RuntimeEvidenceCollector();

  async runAll(onProgress?: (msg: string) => void): Promise<GoldenRunSummary> {
    const t0 = Date.now();
    const results: ScenarioResult[] = [];

    for (const scenario of GOLDEN_SCENARIOS) {
      onProgress?.(`Running scenario ${scenario.id}: ${scenario.name}...`);
      try {
        const ev = await this._collector.collect({
          goal:         scenario.goal,
          intent:       scenario.intent,
          context:      "golden_scenario",
          strategy:     scenario.expectedStrategy,
          capabilities: [...scenario.expectedCapabilities],
          connectors:   [...scenario.expectedConnectors],
          confidence:   scenario.confidence,
          authority:    scenario.authority,
          durationMs:   scenario.durationMs,
          success:      scenario.expectedSuccess,
          episodeCount: scenario.episodeCount,
        });

        const result = this._validator.validate(scenario, ev);
        results.push(result);
        onProgress?.(`  ${scenario.id} → ${result.status.toUpperCase()} (score=${result.score})`);
      } catch (e: unknown) {
        results.push(Object.freeze({
          scenarioId:   scenario.id,
          scenarioName: scenario.name,
          status:       "fail",
          score:        0,
          evidence:     [],
          issues:       [`Runtime error: ${e instanceof Error ? e.message : String(e)}`],
          confidence:   Object.freeze({ structural: 0, behavior: 0, evidence: 0, runtime: 0, overall: 0 }),
          durationMs:   0,
        }));
        onProgress?.(`  ${scenario.id} → FAIL (error)`);
      }
    }

    const passed  = results.filter(r => r.status === "pass").length;
    const failed  = results.filter(r => r.status === "fail").length;
    const warned  = results.filter(r => r.status === "warn").length;
    const avgScore = results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0;
    const avgConf  = results.length > 0 ? results.reduce((s, r) => s + r.confidence.overall, 0) / results.length : 0;

    return Object.freeze({
      totalScenarios: results.length,
      passed, failed, warned,
      overallScore: avgScore,
      overallConf:  avgConf,
      results:      Object.freeze(results),
      durationMs:   Date.now() - t0,
    });
  }
}