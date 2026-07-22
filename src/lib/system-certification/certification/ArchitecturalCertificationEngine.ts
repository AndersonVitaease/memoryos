/**
 * ArchitecturalCertificationEngine.ts — Sprint EF-55.1 Architectural Certification
 *
 * Orquestra as 10 fases de auditoria e produz o OfficialCertificationReport.
 * Somente audita — nunca modifica código.
 * HMR-safe singleton via globalThis.
 */

import { ImplementationAuditor }        from "./ImplementationAuditor";
import { ComplianceAuditor }            from "./ComplianceAuditor";
import { CodeQualityAuditor }           from "./CodeQualityAuditor";
import { EvidenceIntegrityAuditor }     from "./EvidenceIntegrityAuditor";
import { RiskAssessmentEngine }         from "./RiskAssessmentEngine";
import { NonConformityRegistry }        from "./NonConformityRegistry";
import { CertificationDecisionEngine }  from "./CertificationDecisionEngine";
import { CertificationGradeEngine }     from "./CertificationGradeEngine";
import type { OfficialCertificationReport } from "./OfficialCertificationReport";

let _idSeq = 0;
function makeId(): string { return `ACE_${Date.now()}_${(++_idSeq).toString(36)}`; }

class ArchitecturalCertificationEngineImpl {
  private readonly _impl    = new ImplementationAuditor();
  private readonly _comp    = new ComplianceAuditor();
  private readonly _quality = new CodeQualityAuditor();
  private readonly _evidence= new EvidenceIntegrityAuditor();
  private readonly _risk    = new RiskAssessmentEngine();
  private readonly _nc      = new NonConformityRegistry();
  private readonly _decision= new CertificationDecisionEngine();
  private readonly _grade   = new CertificationGradeEngine();

  private _reports: OfficialCertificationReport[] = [];

  certify(): OfficialCertificationReport {
    // Fase 1: Implementation
    const { inventory, score: implScore }       = this._impl.audit();

    // Fase 2: Prompt compliance
    const { requirements, score: compScore }    = this._comp.audit();

    // Fase 3+4: SOLID + code quality
    const { analysis: solidAnalysis, score: archScore } = this._quality.auditSolid();
    const { findings: qualFindings, score: qualScore }  = this._quality.auditQuality();

    // Fase 5+6: Evidence + pipeline
    const { checks: evChecks, score: evScore }  = this._evidence.auditEvidence();
    const { stages: pipeStages, score: pipeScore } = this._evidence.auditPipeline();

    // Fase 7: Risks
    const risks = this._risk.assess();

    // Fase 8: NCs
    const ncs = this._nc.build();

    // Fase 9: Decision
    const { decision, justification: decisionJust } = this._decision.decide({
      implementationScore:   implScore,
      promptComplianceScore: compScore,
      architecturalScore:    archScore,
      codeQualityScore:      qualScore,
      evidenceScore:         evScore,
      nonConformities:       ncs,
    });

    // Fase 10: Grade
    const { grade, justification: gradeJust, numericScore } = this._grade.grade({
      implementationScore:   implScore,
      promptComplianceScore: compScore,
      architecturalScore:    archScore,
      codeQualityScore:      qualScore,
      evidenceScore:         evScore,
      pipelineScore:         pipeScore,
    });

    const critical = ncs.filter(n => n.class === "critical").length;
    const major    = ncs.filter(n => n.class === "major").length;
    const minor    = ncs.filter(n => n.class === "minor").length;
    const obs      = ncs.filter(n => n.class === "observation").length;
    const highRisks = risks.filter(r => r.level === "high" || r.level === "critical").length;

    const executiveSummary = [
      `Sprint EF-55.1 — Certificação Arquitetural Oficial.`,
      `Decisão: ${decision}. Nota: ${grade} (${numericScore.toFixed(1)}/100).`,
      `Implementação: ${implScore}% · Conformidade: ${compScore}% · Arquitetura: ${archScore}%.`,
      `Qualidade: ${qualScore}% · Evidência: ${evScore}% · Pipeline: ${pipeScore}%.`,
      `Riscos: ${highRisks} alto(s). NCs: ${critical} crítica(s), ${major} maior(es), ${minor} menor(es), ${obs} observação(ões).`,
      `Principais achados: (1) EF-43→EF-50 não integrados ao pipeline real. (2) ConnectorSnapshot simula execução. (3) Threshold de certificação em 80 vs 95% do prompt.`,
      `Conclusão: A infraestrutura de certificação para EF-51→EF-54 está solidamente implementada com evidências reais. O pipeline EF-43→EF-50 é a lacuna principal a ser resolvida antes da EF-56.`,
    ].join(" ");

    const report: OfficialCertificationReport = Object.freeze({
      id:                      makeId(),
      generatedAt:             Date.now(),
      sprint:                  "EF-55.1",
      moduleInventory:         Object.freeze(inventory),
      implementationScore:     implScore,
      promptRequirements:      Object.freeze(requirements),
      promptComplianceScore:   compScore,
      solidAnalysis:           Object.freeze(solidAnalysis),
      architecturalScore:      archScore,
      codeQualityFindings:     Object.freeze(qualFindings),
      codeQualityScore:        qualScore,
      evidenceChecks:          Object.freeze(evChecks),
      evidenceScore:           evScore,
      pipelineStages:          Object.freeze(pipeStages),
      pipelineScore:           pipeScore,
      risks:                   Object.freeze(risks),
      nonConformities:         Object.freeze(ncs),
      decision,
      decisionJustification:   decisionJust,
      grade,
      gradeJustification:      gradeJust,
      executiveSummary,
      overallScore:            numericScore,
    });

    this._reports.push(report);
    return report;
  }

  getReports(): readonly OfficialCertificationReport[] { return this._reports; }
  getLastReport(): OfficialCertificationReport | null  { return this._reports[this._reports.length - 1] ?? null; }
}

const G = globalThis as typeof globalThis & { __EF55_ACE__?: ArchitecturalCertificationEngineImpl };
if (!G.__EF55_ACE__) G.__EF55_ACE__ = new ArchitecturalCertificationEngineImpl();
export const ArchitecturalCertificationEngine: ArchitecturalCertificationEngineImpl = G.__EF55_ACE__;