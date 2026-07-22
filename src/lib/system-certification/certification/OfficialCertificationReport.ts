/**
 * OfficialCertificationReport.ts — Sprint EF-55.1 · Architectural Certification
 *
 * Tipos do relatório oficial de certificação arquitetural.
 * Somente leitura — gerado a partir de evidências auditadas.
 */

export type ComplianceStatus = "IMPLEMENTED" | "PARTIAL" | "NOT_IMPLEMENTED";
export type RiskLevel        = "critical" | "high" | "medium" | "low";
export type RiskImpact       = "critical" | "high" | "medium" | "low";
export type RiskProbability  = "high" | "medium" | "low";
export type NCClass          = "critical" | "major" | "minor" | "observation";
export type CertDecision     = "CERTIFIED" | "CERTIFIED_WITH_CAVEATS" | "REJECTED";
export type CertGrade        = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C" | "D" | "F";

export interface ModuleInventory {
  readonly path:      string;
  readonly exists:    boolean;
  readonly hasContent: boolean;
  readonly linesEst:  number;
  readonly note:      string;
}

export interface PromptRequirement {
  readonly id:          string;
  readonly description: string;
  readonly status:      ComplianceStatus;
  readonly evidence:    string;
  readonly note:        string;
}

export interface SolidAnalysis {
  readonly principle:  string;   // SRP, OCP, LSP, ISP, DIP
  readonly module:     string;
  readonly compliant:  boolean;
  readonly evidence:   string;
  readonly issues:     string;
}

export interface CodeQualityFinding {
  readonly category: "duplication" | "complexity" | "dead_code" | "coupling" | "cohesion" | "naming";
  readonly severity: "high" | "medium" | "low";
  readonly module:   string;
  readonly finding:  string;
}

export interface EvidenceIntegrityCheck {
  readonly module:      string;
  readonly check:       string;
  readonly isSynthetic: boolean;
  readonly evidence:    string;
  readonly verdict:     "REAL" | "SYNTHETIC" | "MIXED" | "UNCERTAIN";
}

export interface RiskItem {
  readonly id:          string;
  readonly level:       RiskLevel;
  readonly impact:      RiskImpact;
  readonly probability: RiskProbability;
  readonly title:       string;
  readonly description: string;
  readonly mitigation:  string;
}

export interface NonConformity {
  readonly id:          string;
  readonly class:       NCClass;
  readonly module:      string;
  readonly description: string;
  readonly evidence:    string;
  readonly recommendation: string;
}

export interface OfficialCertificationReport {
  readonly id:              string;
  readonly generatedAt:     number;
  readonly sprint:          string;

  // Fase 1
  readonly moduleInventory:     readonly ModuleInventory[];
  readonly implementationScore: number;  // 0–100

  // Fase 2
  readonly promptRequirements:  readonly PromptRequirement[];
  readonly promptComplianceScore: number; // 0–100

  // Fase 3
  readonly solidAnalysis:       readonly SolidAnalysis[];
  readonly architecturalScore:  number;

  // Fase 4
  readonly codeQualityFindings: readonly CodeQualityFinding[];
  readonly codeQualityScore:    number;

  // Fase 5
  readonly evidenceChecks:      readonly EvidenceIntegrityCheck[];
  readonly evidenceScore:       number;

  // Fase 6
  readonly pipelineStages:      readonly { stage: string; hasEvidence: boolean; note: string }[];
  readonly pipelineScore:       number;

  // Fase 7
  readonly risks:               readonly RiskItem[];

  // Fase 8
  readonly nonConformities:     readonly NonConformity[];

  // Fase 9 + 10
  readonly decision:            CertDecision;
  readonly decisionJustification: string;
  readonly grade:               CertGrade;
  readonly gradeJustification:  string;

  // Summary
  readonly executiveSummary:    string;
  readonly overallScore:        number;
}