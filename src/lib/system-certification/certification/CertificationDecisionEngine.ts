/**
 * CertificationDecisionEngine.ts — Sprint EF-55.1 Architectural Certification
 *
 * FASE 9: Emite a decisão formal de certificação com justificativa técnica.
 */

import type { CertDecision, NonConformity } from "./OfficialCertificationReport";

export interface CertificationDecision {
  readonly decision:      CertDecision;
  readonly justification: string;
}

export class CertificationDecisionEngine {
  decide(opts: {
    implementationScore: number;
    promptComplianceScore: number;
    architecturalScore: number;
    codeQualityScore: number;
    evidenceScore: number;
    nonConformities: readonly NonConformity[];
  }): CertificationDecision {
    const { implementationScore, promptComplianceScore, architecturalScore, codeQualityScore, evidenceScore, nonConformities } = opts;

    const criticalNCs = nonConformities.filter(n => n.class === "critical").length;
    const majorNCs    = nonConformities.filter(n => n.class === "major").length;

    const overallScore = (
      implementationScore  * 0.20 +
      promptComplianceScore* 0.25 +
      architecturalScore   * 0.20 +
      codeQualityScore     * 0.15 +
      evidenceScore        * 0.20
    );

    if (criticalNCs > 0) {
      return Object.freeze({
        decision: "REJECTED",
        justification: `${criticalNCs} não conformidade(s) crítica(s) impedem a certificação. Nenhuma aprovação possível com NCs críticas.`,
      });
    }

    if (majorNCs > 2 || overallScore < 70) {
      return Object.freeze({
        decision: "REJECTED",
        justification: `${majorNCs} não conformidade(s) maior(es) e score geral ${overallScore.toFixed(0)}/100. Score mínimo para aprovação é 70.`,
      });
    }

    if (majorNCs > 0 || overallScore < 90 || promptComplianceScore < 95) {
      return Object.freeze({
        decision: "CERTIFIED_WITH_CAVEATS",
        justification: [
          `Score geral: ${overallScore.toFixed(1)}/100.`,
          `${majorNCs} não conformidade(s) maior(es) identificadas.`,
          `Conformidade com prompt: ${promptComplianceScore.toFixed(0)}% (requisito: 95%).`,
          "A implementação demonstra arquitetura sólida para EF-51→EF-54 com runtime real.",
          "EF-43→EF-50 não integrados é a principal não conformidade — pipeline completo não verificado.",
          "Certificação condicionada à resolução das NCs majors antes de EF-56.",
        ].join(" "),
      });
    }

    return Object.freeze({
      decision: "CERTIFIED",
      justification: `Score geral: ${overallScore.toFixed(1)}/100. Nenhuma NC crítica ou maior. Conformidade ≥ 95%.`,
    });
  }
}