/**
 * SelfOptimizationEngine.ts — Sprint EF-53 · Self Optimization Engine
 *
 * Coordena o pipeline completo de auto-otimização:
 *   Execution History → Episodes → Learning Metrics → Reasoning Metrics
 *   → Optimization Analysis → Recommendations
 *
 * NÃO modifica nenhuma sprint anterior (EF-43 a EF-52).
 * NÃO aprende, NÃO raciocina, NÃO cria conhecimento.
 * Apenas observa, analisa e recomenda.
 * Toda recomendação é baseada em evidências, auditável e reproduzível.
 *
 * HMR-safe singleton via globalThis.
 */

import type { OptimizationReport, OptimizationSnapshot } from "./SOTypes";
import { DEFAULT_OPTIMIZATION_POLICY, type OptimizationPolicyConfig } from "./OptimizationPolicy";
import { PlannerOptimizer }         from "./PlannerOptimizer";
import { StrategyOptimizer }        from "./StrategyOptimizer";
import { CapabilityOptimizer }      from "./CapabilityOptimizer";
import { ConnectorOptimizer }       from "./ConnectorOptimizer";
import { KnowledgeOptimizer }       from "./KnowledgeOptimizer";
import { ReasoningOptimizer }       from "./ReasoningOptimizer";
import { AuthorityOptimizer }       from "./AuthorityOptimizer";
import { ConfidenceOptimizer }      from "./ConfidenceOptimizer";
import { ExecutionOptimizer }       from "./ExecutionOptimizer";
import { OptimizationMetricsEngine }from "./OptimizationMetrics";
import { OptimizationReportBuilder }from "./OptimizationReport";
import { OptimizationHistory }      from "./OptimizationHistory";

class SelfOptimizationEngineImpl {
  private readonly _plannerOpt    = new PlannerOptimizer();
  private readonly _strategyOpt   = new StrategyOptimizer();
  private readonly _capabilityOpt = new CapabilityOptimizer();
  private readonly _connectorOpt  = new ConnectorOptimizer();
  private readonly _knowledgeOpt  = new KnowledgeOptimizer();
  private readonly _reasoningOpt  = new ReasoningOptimizer();
  private readonly _authorityOpt  = new AuthorityOptimizer();
  private readonly _confidenceOpt = new ConfidenceOptimizer();
  private readonly _executionOpt  = new ExecutionOptimizer();
  private readonly _metricsEng    = new OptimizationMetricsEngine();
  private readonly _reportBuilder = new OptimizationReportBuilder();

  private _reports: OptimizationReport[] = [];

  /**
   * Run the full optimization pipeline on the given snapshot.
   * Returns a fully auditable OptimizationReport.
   * Never modifies any external module.
   */
  analyze(
    snapshot:  OptimizationSnapshot,
    policy:    OptimizationPolicyConfig = DEFAULT_OPTIMIZATION_POLICY,
  ): OptimizationReport {
    const startedAt = Date.now();

    const allFindings    = [];
    const allRecs        = [];

    const collect = (r: { findings: any[]; recommendations: any[] }) => {
      allFindings.push(...r.findings);
      allRecs.push(...r.recommendations);
    };

    collect(this._plannerOpt.analyze(snapshot, policy));
    collect(this._strategyOpt.analyze(snapshot, policy));
    collect(this._capabilityOpt.analyze(snapshot, policy));
    collect(this._connectorOpt.analyze(snapshot, policy));
    collect(this._knowledgeOpt.analyze(snapshot, policy));
    collect(this._reasoningOpt.analyze(snapshot, policy));
    collect(this._authorityOpt.analyze(snapshot));
    collect(this._confidenceOpt.analyze(snapshot));
    collect(this._executionOpt.analyze(snapshot, policy));

    const metrics = this._metricsEng.compute(allRecs);
    const report  = this._reportBuilder.build({ startedAt, findings: allFindings, recommendations: allRecs, metrics });

    // Record all recommendations in history
    for (const rec of allRecs) {
      OptimizationHistory.record(rec);
    }

    this._reports.push(report);
    return report;
  }

  /** Build a snapshot from episodic data (helper — does not import EF-50 to avoid circular deps). */
  buildSnapshot(episodes: readonly {
    success: boolean;
    confidence: number;
    authority: number;
    durationMs: number;
    cost: number;
    strategy: string;
    capabilities: readonly string[];
    connectorChain: readonly string[];
  }[]): OptimizationSnapshot {
    if (episodes.length === 0) return this._emptySnapshot();

    const n = episodes.length;
    const avg = (fn: (e: typeof episodes[number]) => number) =>
      episodes.reduce((s, e) => s + fn(e), 0) / n;

    const stratDist: Record<string, number> = {};
    const capUsage:  Record<string, number> = {};
    const connUsage: Record<string, number> = {};

    for (const ep of episodes) {
      stratDist[ep.strategy] = (stratDist[ep.strategy] ?? 0) + 1;
      for (const c of ep.capabilities)    capUsage[c]  = (capUsage[c]  ?? 0) + 1;
      for (const c of ep.connectorChain)  connUsage[c] = (connUsage[c] ?? 0) + 1;
    }

    return Object.freeze({
      episodeCount:             n,
      avgEpisodeSuccess:        avg(e => e.success ? 1 : 0),
      avgEpisodeConfidence:     avg(e => e.confidence),
      avgEpisodeAuthority:      avg(e => e.authority),
      avgEpisodeDurationMs:     avg(e => e.durationMs),
      avgEpisodeCost:           avg(e => e.cost),
      strategyDistribution:     Object.freeze(stratDist),
      capabilityUsage:          Object.freeze(capUsage),
      connectorUsage:           Object.freeze(connUsage),
      // These are populated from EF-51/EF-52 snapshots externally
      knowledgeRuleCount:       0,
      knowledgeAvgConfidence:   0,
      knowledgeAvgSuccessRate:  0,
      reasoningAvgDepth:        0,
      reasoningAvgConfidence:   0,
      reasoningConflictRate:    0,
      reasoningAvgDurationMs:   0,
    });
  }

  /** Enrich snapshot with knowledge/reasoning data (called by page with EF-51/EF-52 data). */
  enrichSnapshot(
    base: OptimizationSnapshot,
    knowledge: Pick<OptimizationSnapshot, "knowledgeRuleCount" | "knowledgeAvgConfidence" | "knowledgeAvgSuccessRate">,
    reasoning: Pick<OptimizationSnapshot, "reasoningAvgDepth" | "reasoningAvgConfidence" | "reasoningConflictRate" | "reasoningAvgDurationMs">,
  ): OptimizationSnapshot {
    return Object.freeze({ ...base, ...knowledge, ...reasoning });
  }

  getReports(): readonly OptimizationReport[] { return this._reports; }
  getLastReport(): OptimizationReport | null  { return this._reports[this._reports.length - 1] ?? null; }
  clearReports(): void { this._reports = []; }

  private _emptySnapshot(): OptimizationSnapshot {
    return Object.freeze({
      episodeCount: 0, avgEpisodeSuccess: 0, avgEpisodeConfidence: 0,
      avgEpisodeAuthority: 0, avgEpisodeDurationMs: 0, avgEpisodeCost: 0,
      strategyDistribution: {}, capabilityUsage: {}, connectorUsage: {},
      knowledgeRuleCount: 0, knowledgeAvgConfidence: 0, knowledgeAvgSuccessRate: 0,
      reasoningAvgDepth: 0, reasoningAvgConfidence: 0, reasoningConflictRate: 0,
      reasoningAvgDurationMs: 0,
    });
  }
}

const G = globalThis as typeof globalThis & { __EF53_SOE__?: SelfOptimizationEngineImpl };
if (!G.__EF53_SOE__) G.__EF53_SOE__ = new SelfOptimizationEngineImpl();
export const SelfOptimizationEngine: SelfOptimizationEngineImpl = G.__EF53_SOE__;