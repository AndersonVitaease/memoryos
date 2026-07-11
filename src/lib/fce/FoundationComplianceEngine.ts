// Foundation Compliance Engine (FCE) — Main Engine
// Foundation v1.0 · Engineering First · Sprint FCE-1
//
// Orquestra: RuleLoader → ABV (reutilizado) → ComplianceEvaluator → FCEReport
// READ ONLY. Nenhuma logica do ABV duplicada.

import { loadSourceFiles, SourceCodeAnalyzer } from "../abv/SourceCodeAnalyzer";
import { ArchitecturalBoundaryValidator } from "../abv/ArchitecturalBoundaryValidator";
import { createBaseline, BaselineRegistry, ImmutableAuditHistory } from "../abv/BaselineEngine";
import { ChangeDetectionEngine } from "../abv/ChangeDetectionEngine";
import { loadFoundationRules } from "./FoundationRuleLoader";
import { ComplianceEvaluator } from "./ComplianceEvaluator";
import type { FCEReport } from "./FCETypes";

let _runCounter = 0;

function makeExecutionId(): string {
  _runCounter++;
  return `FCE-RUN-${Date.now()}-${String(_runCounter).padStart(3, "0")}`;
}

export class FoundationComplianceEngine {
  private readonly evaluator = new ComplianceEvaluator();

  async run(): Promise<FCEReport> {
    const executionId = makeExecutionId();
    const start = Date.now();

    // ── Step 1: Load source files (reutiliza SourceCodeAnalyzer) ──────────
    const sources   = await loadSourceFiles();
    const analysis  = new SourceCodeAnalyzer().analyze(sources);

    // ── Step 2: Run ABV audit (reutiliza ArchitecturalBoundaryValidator) ──
    const abvReport = new ArchitecturalBoundaryValidator().audit(analysis);

    // ── Step 3: Create Baseline (reutiliza BaselineEngine) ────────────────
    const baseline = await createBaseline(abvReport, {
      label: `FCE Baseline — ${new Date().toISOString().slice(0, 16)}`,
      auditDurationMs: abvReport.durationMs,
    });
    const registry = new BaselineRegistry();
    registry.register(baseline);
    const history = new ImmutableAuditHistory();
    history.append(baseline);

    // ── Step 4: Load Foundation rules ─────────────────────────────────────
    const { documents, rules, totalRules } = loadFoundationRules();

    // ── Step 5: Evaluate compliance (reutiliza ComplianceEvaluator) ───────
    const evaluation = this.evaluator.evaluate({ rules, abvReport, analysis });

    // ── Step 6: Build report ───────────────────────────────────────────────
    const compliantEvidences = evaluation.evidences.filter(e => e.status === "COMPLIANT");
    const violationEvidences = evaluation.evidences.filter(e => e.status === "VIOLATION");

    const violations  = evaluation.rulesViolated;
    const partials    = evaluation.rulesPartial;
    const approved    = evaluation.rulesApproved;

    const conclusion =
      violations > 0
        ? `${violations} regra(s) violada(s) da Foundation v1.0. Score: ${evaluation.score.overallCompliance}%. Encaminhar para Engineering Review.`
        : partials > 0
          ? `Nenhuma violacao. ${partials} regra(s) parcialmente verificada(s). Score: ${evaluation.score.overallCompliance}%. Monitorar evolucao.`
          : `Conformidade total com Foundation v1.0. ${approved} regras aprovadas. Score: ${evaluation.score.overallCompliance}%. Engineering First confirmado.`;

    return Object.freeze({
      executionId,
      runAt:       Date.now(),
      durationMs:  Date.now() - start,
      documentsLoaded:      documents,
      documentsEvaluated:   documents.length,
      rulesTotal:           totalRules,
      rulesApproved:        approved,
      rulesViolated:        violations,
      rulesPartial:         partials,
      evidences:            evaluation.evidences,
      compliantEvidences,
      violationEvidences,
      score:                evaluation.score,
      logs:                 evaluation.logs,
      abvFilesAnalyzed:     abvReport.filesAnalyzed,
      abvBoundaryCompliance: abvReport.compliance.boundaryCompliance,
      abvCircularDeps:      abvReport.circularDependencies,
      conclusion,
    });
  }
}