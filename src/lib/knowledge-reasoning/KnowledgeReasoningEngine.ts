/**
 * KnowledgeReasoningEngine.ts — Sprint EF-52 · Knowledge Reasoning Engine
 *
 * Coordena o pipeline completo de raciocínio:
 *   Goal → KnowledgeRetriever → KnowledgeMatcher → InferenceEngine
 *   → ConflictResolver → DecisionBuilder → ReasoningGraph → Report
 *
 * NÃO modifica sprints anteriores (EF-43 a EF-51).
 * NÃO cria conhecimento novo.
 * NÃO promove inferências para o KnowledgeStore.
 * Toda inferência é TEMPORÁRIA.
 * Toda decisão é EXPLICÁVEL e AUDITÁVEL.
 *
 * HMR-safe singleton via globalThis.
 */

import type { ReasoningContext, ReasoningReport } from "./KRTypes";
import { ReasoningContextBuilder, type ReasoningContextInput } from "./ReasoningContext";
import { KnowledgeRetriever }      from "./KnowledgeRetriever";
import { KnowledgeMatcher }        from "./KnowledgeMatcher";
import { InferenceEngine }         from "./InferenceEngine";
import { ConflictResolver }        from "./ConflictResolver";
import { DecisionBuilder }         from "./DecisionBuilder";
import { ReasoningGraphBuilder }   from "./ReasoningGraph";
import { ReasoningMetricsEngine }  from "./ReasoningMetricsEngine";
import { ReasoningReportBuilder }  from "./ReasoningReport";

class KnowledgeReasoningEngineImpl {
  private readonly _ctxBuilder    = new ReasoningContextBuilder();
  private readonly _retriever     = new KnowledgeRetriever();
  private readonly _matcher       = new KnowledgeMatcher();
  private readonly _inference     = new InferenceEngine();
  private readonly _conflictRes   = new ConflictResolver();
  private readonly _decision      = new DecisionBuilder();
  private readonly _graphBuilder  = new ReasoningGraphBuilder();
  private readonly _metricsEng    = new ReasoningMetricsEngine();
  private readonly _reportBuilder = new ReasoningReportBuilder();

  private _reports: ReasoningReport[] = [];

  // ── Core reason() ─────────────────────────────────────────────────────────

  /**
   * Run the full reasoning pipeline for a given goal/context.
   * Returns a fully auditable ReasoningReport.
   */
  reason(input: ReasoningContextInput): ReasoningReport {
    const startedAt = Date.now();

    // 1. Build context
    const ctx = this._ctxBuilder.build(input);

    // 2. Retrieve relevant knowledge (read-only from KnowledgeStore)
    const rules = this._retriever.retrieve(ctx);

    // 3. Match rules — find relationships
    const matches = this._matcher.match(rules);

    // 4. Infer — produce temporary InferenceChain
    const chain = this._inference.infer(rules, matches, ctx.goal);

    // 5. Resolve conflicts
    const { conflicts, resolutions } = this._conflictRes.resolve(rules, matches);
    const loserIds = this._conflictRes.losers(resolutions);

    // 6. Build decision
    const decision = this._decision.build({ ctx, rules, chain, conflicts, resolutions, loserIds });

    // 7. Build reasoning graph
    const graph = this._graphBuilder.build({ ctx, rules, chain, decision, conflicts });

    // 8. Compute metrics
    const metrics = this._metricsEng.compute({
      allRules:    rules,
      usedRuleIds: decision.rulesUsed,
      chain,
      conflicts,
      resolutions,
      decision,
      durationMs: Date.now() - startedAt,
    });

    // 9. Build report
    const report = this._reportBuilder.build({
      startedAt, ctx, rules, chain, conflicts, resolutions, decision, metrics, graph,
    });

    this._reports.push(report);
    return report;
  }

  // ── Overload: reason from an existing context ─────────────────────────────

  reasonWithContext(ctx: ReasoningContext): ReasoningReport {
    return this.reason({
      goal:        ctx.goal,
      intent:      ctx.intent,
      capabilities: [...ctx.capabilities],
      strategy:    ctx.strategy,
      projectSize: ctx.projectSize,
      domain:      ctx.domain,
      metadata:    { ...ctx.metadata },
    });
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getReports(): readonly ReasoningReport[] { return this._reports; }
  getLastReport(): ReasoningReport | null  { return this._reports[this._reports.length - 1] ?? null; }
  clearReports(): void { this._reports = []; }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF52_KRE__?: KnowledgeReasoningEngineImpl };
if (!G.__EF52_KRE__) G.__EF52_KRE__ = new KnowledgeReasoningEngineImpl();
export const KnowledgeReasoningEngine: KnowledgeReasoningEngineImpl = G.__EF52_KRE__;