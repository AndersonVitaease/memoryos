/**
 * ReadinessReport.ts — Sprint 6.3.5
 * Generates the full ERC report from validator results.
 */

import type {
  ReadinessReportData, ValidatorResult, ReadinessScorecard,
  DomainScore, ChecklistItem, RiskItem, CertificationLevel,
  PerformanceBaseline, ReadinessDomain,
} from "./ReadinessTypes";

let _seq = 0;
function makeId(): string { return `erc_${Date.now()}_${++_seq}`; }

const DOMAIN_WEIGHTS: Record<string, number> = {
  infrastructure: 15,
  security: 15,
  recovery: 10,
  persistence: 10,
  acceptance: 10,
  regression: 10,
  performance: 5,
  governance: 10,
  architecture: 10,
  connectorPlatform: 5,
  engineeringMemory: 5,
  knowledgeGraph: 5,
};

export class ReadinessReport {
  generate(
    validators: ValidatorResult[],
    baseline: PerformanceBaseline,
    durationMs: number,
  ): ReadinessReportData {
    const scorecard = this._buildScorecard(validators);
    const domainScores = this._buildDomainScores(validators);
    const blockers = validators.flatMap(v => v.blockers);
    const warnings = validators.flatMap(v => v.warnings);
    const recommendations = validators.flatMap(v => v.recommendations);
    const checklist = this._buildChecklist(validators);
    const risks = this._buildRisks(validators);
    const metrics = this._buildMetrics(validators, baseline);
    const pendingItems = validators
      .filter(v => v.status === "WARN" || v.status === "FAIL")
      .map(v => `[${v.domain}] ${v.name}: ${v.detail}`);

    const certification = this._certify(scorecard.overall, blockers);
    const executiveSummary = this._buildSummary(scorecard, certification, blockers, warnings);

    return {
      id: makeId(),
      generatedAt: Date.now(),
      durationMs,
      certification,
      scorecard,
      domainScores,
      validatorResults: validators,
      executiveSummary,
      checklist,
      metrics,
      pendingItems,
      risks,
      blockers,
      recommendations: [...new Set(recommendations)],
      performanceBaseline: baseline,
    };
  }

  private _buildScorecard(validators: ValidatorResult[]): ReadinessScorecard {
    const byDomain = (domain: ReadinessDomain) => {
      const vs = validators.filter(v => v.domain === domain);
      if (vs.length === 0) return 100;
      return Math.round(vs.reduce((sum, v) => sum + v.score, 0) / vs.length);
    };

    const infrastructure    = byDomain("Infrastructure");
    const security          = byDomain("Security");
    const recovery          = byDomain("Recovery");
    const persistence       = byDomain("Persistence");
    const acceptance        = byDomain("Acceptance");
    const regression        = byDomain("Regression");
    const performance       = byDomain("Performance");
    const governance        = byDomain("Governance");
    const architecture      = byDomain("Architecture");
    const connectorPlatform = byDomain("ConnectorPlatform");
    const engineeringMemory = byDomain("EngineeringMemory");
    const knowledgeGraph    = byDomain("KnowledgeGraph");

    const weighted =
      infrastructure    * DOMAIN_WEIGHTS.infrastructure    / 100 +
      security          * DOMAIN_WEIGHTS.security          / 100 +
      recovery          * DOMAIN_WEIGHTS.recovery          / 100 +
      persistence       * DOMAIN_WEIGHTS.persistence       / 100 +
      acceptance        * DOMAIN_WEIGHTS.acceptance        / 100 +
      regression        * DOMAIN_WEIGHTS.regression        / 100 +
      performance       * DOMAIN_WEIGHTS.performance       / 100 +
      governance        * DOMAIN_WEIGHTS.governance        / 100 +
      architecture      * DOMAIN_WEIGHTS.architecture      / 100 +
      connectorPlatform * DOMAIN_WEIGHTS.connectorPlatform / 100 +
      engineeringMemory * DOMAIN_WEIGHTS.engineeringMemory / 100 +
      knowledgeGraph    * DOMAIN_WEIGHTS.knowledgeGraph    / 100;

    return {
      infrastructure, security, recovery, persistence,
      acceptance, regression, performance, governance,
      architecture, connectorPlatform, engineeringMemory, knowledgeGraph,
      overall: Math.round(weighted),
    };
  }

  private _buildDomainScores(validators: ValidatorResult[]): DomainScore[] {
    const domains: ReadinessDomain[] = [
      "Infrastructure", "Security", "Recovery", "Persistence",
      "Acceptance", "Regression", "Performance", "Governance",
      "Architecture", "ConnectorPlatform", "EngineeringMemory", "KnowledgeGraph",
    ];
    return domains.map(domain => {
      const vs = validators.filter(v => v.domain === domain);
      const score = vs.length === 0 ? 100 : Math.round(vs.reduce((s, v) => s + v.score, 0) / vs.length);
      const blockers = vs.flatMap(v => v.blockers);
      const warnings = vs.flatMap(v => v.warnings);
      const status = blockers.length > 0 ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS";
      return { domain, score, status, blockers, warnings };
    });
  }

  private _buildChecklist(validators: ValidatorResult[]): ChecklistItem[] {
    return validators.flatMap(v =>
      v.checks.map((c, i) => ({
        id: `${v.id}_c${i}`,
        label: c.name,
        status: c.status === "PASS" ? "PASS" : c.status === "WARN" ? "WARN" : "FAIL",
        domain: v.domain,
        critical: c.critical,
      } as ChecklistItem))
    );
  }

  private _buildRisks(validators: ValidatorResult[]): RiskItem[] {
    const risks: RiskItem[] = [];
    let seq = 0;
    for (const v of validators) {
      if (v.blockers.length > 0) {
        risks.push({
          id: `risk_${++seq}`,
          level: "HIGH",
          area: v.domain,
          description: `${v.name}: ${v.blockers.join("; ")}`,
          mitigation: v.recommendations[0] ?? "Fix blocker and re-run certification.",
        });
      } else if (v.warnings.length > 0) {
        risks.push({
          id: `risk_${++seq}`,
          level: "MEDIUM",
          area: v.domain,
          description: `${v.name}: ${v.warnings.join("; ")}`,
          mitigation: v.recommendations[0] ?? "Address warning before production deployment.",
        });
      }
    }
    return risks;
  }

  private _buildMetrics(validators: ValidatorResult[], baseline: PerformanceBaseline): Record<string, number | string> {
    return {
      totalValidators: validators.length,
      passedValidators: validators.filter(v => v.status === "PASS").length,
      failedValidators: validators.filter(v => v.status === "FAIL").length,
      warnedValidators: validators.filter(v => v.status === "WARN").length,
      totalChecks: validators.reduce((s, v) => s + v.checks.length, 0),
      criticalChecks: validators.reduce((s, v) => s + v.checks.filter(c => c.critical).length, 0),
      startupMs: baseline.startupMs,
      warmupMs: baseline.warmupMs,
      fullLoopMs: baseline.fullLoopMs,
      regressionMs: baseline.regressionMs,
    };
  }

  private _certify(overall: number, blockers: string[]): CertificationLevel {
    if (blockers.length > 0 || overall < 60) return "NOT_READY";
    if (overall < 80) return "PARTIALLY_READY";
    if (overall < 90) return "READY_FOR_CONNECTORS";
    if (overall < 97) return "READY_FOR_AUTOMATION";
    return "ENTERPRISE_READY";
  }

  private _buildSummary(
    scorecard: ReadinessScorecard,
    cert: CertificationLevel,
    blockers: string[],
    warnings: string[],
  ): string {
    const certLabel: Record<CertificationLevel, string> = {
      NOT_READY: "NOT READY",
      PARTIALLY_READY: "PARTIALLY READY",
      READY_FOR_CONNECTORS: "READY FOR CONNECTORS",
      READY_FOR_AUTOMATION: "READY FOR AUTOMATION",
      ENTERPRISE_READY: "ENTERPRISE READY",
    };
    const base = `MemoryOS Engineering Readiness Certification — Sprint 6.3.5. ` +
      `Overall score: ${scorecard.overall}%. Certification level: ${certLabel[cert]}. `;
    if (blockers.length > 0) {
      return base + `${blockers.length} blocker(s) require immediate attention before production deployment.`;
    }
    if (warnings.length > 0) {
      return base + `${warnings.length} warning(s) detected. Platform is operational; address warnings before scaling.`;
    }
    return base + `All systems operational. Platform is certified and ready for the connector integration phase.`;
  }
}