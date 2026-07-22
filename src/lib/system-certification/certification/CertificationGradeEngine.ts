/**
 * CertificationGradeEngine.ts — Sprint EF-55.1 Architectural Certification
 *
 * FASE 10: Emite a nota oficial de certificação.
 */

import type { CertGrade } from "./OfficialCertificationReport";

export interface GradeResult {
  readonly grade:         CertGrade;
  readonly justification: string;
  readonly numericScore:  number;
}

export class CertificationGradeEngine {
  grade(opts: {
    implementationScore:   number;
    promptComplianceScore: number;
    architecturalScore:    number;
    codeQualityScore:      number;
    evidenceScore:         number;
    pipelineScore:         number;
  }): GradeResult {
    const { implementationScore, promptComplianceScore, architecturalScore, codeQualityScore, evidenceScore, pipelineScore } = opts;

    const numeric = (
      implementationScore   * 0.20 +
      promptComplianceScore * 0.25 +
      architecturalScore    * 0.20 +
      codeQualityScore      * 0.15 +
      evidenceScore         * 0.10 +
      pipelineScore         * 0.10
    );

    let grade: CertGrade;
    let justification: string;

    if (numeric >= 97) {
      grade = "A+";
      justification = "Implementação excepcional, zero NCs, cobertura total do pipeline.";
    } else if (numeric >= 93) {
      grade = "A";
      justification = "Implementação excelente com conformidade quase total.";
    } else if (numeric >= 90) {
      grade = "A-";
      justification = "Implementação muito boa com pequenas ressalvas.";
    } else if (numeric >= 87) {
      grade = "B+";
      justification = "Implementação boa com algumas lacunas relevantes.";
    } else if (numeric >= 83) {
      grade = "B";
      justification = "Implementação satisfatória com NCs menores e médias.";
    } else if (numeric >= 80) {
      grade = "B-";
      justification = "Implementação aceitável. NCs maiores identificadas que precisam de resolução.";
    } else if (numeric >= 75) {
      grade = "C";
      justification = "Implementação com déficits relevantes. Requer ação corretiva.";
    } else if (numeric >= 60) {
      grade = "D";
      justification = "Implementação deficiente. Revisão significativa necessária.";
    } else {
      grade = "F";
      justification = "Implementação não atinge critério mínimo de certificação.";
    }

    // Breakdown contribution to grade
    const breakdown = [
      `Implementação: ${implementationScore.toFixed(0)}/100 (peso 20%)`,
      `Conformidade prompt: ${promptComplianceScore.toFixed(0)}/100 (peso 25%)`,
      `Arquitetura: ${architecturalScore.toFixed(0)}/100 (peso 20%)`,
      `Qualidade código: ${codeQualityScore.toFixed(0)}/100 (peso 15%)`,
      `Integridade evidências: ${evidenceScore.toFixed(0)}/100 (peso 10%)`,
      `Cobertura pipeline: ${pipelineScore.toFixed(0)}/100 (peso 10%)`,
    ].join(" | ");

    return Object.freeze({ grade, justification: `${justification} | ${breakdown}`, numericScore: numeric });
  }
}