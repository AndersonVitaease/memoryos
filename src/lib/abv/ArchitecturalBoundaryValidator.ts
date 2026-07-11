// Architectural Boundary Validation (ABV) — v3
// Foundation v1.0 · Engineering First
//
// Auditoria 100% automatica baseada em evidencias do codigo-fonte.
// READ ONLY. Nenhuma conclusao sem evidencia correspondente.

import type { SourceAnalysisResult } from "./SourceCodeAnalyzer";
import { EvidenceCollector } from "./EvidenceCollector";
import { calculateCompliance } from "./EvidenceModel";
import type { ArchitecturalEvidence, ComplianceScore } from "./EvidenceModel";

// ── Public types ──────────────────────────────────────────────────────────────

export type { ArchitecturalEvidence, ComplianceScore };

export type ABVSeverity = "ERROR" | "WARN" | "INFO";
export type ABVStatus   = "PASS" | "FAIL" | "WARN";

export interface ABVLayerReport {
  layer: string;
  label: string;
  status: ABVStatus;
  filesAnalyzed: number;
  publicApi: string[];
  allowedDeps: string[];
  forbiddenDeps: string[];
  detectedDeps: string[];
  detectedImports: string[];
  boundaryEvidences: ArchitecturalEvidence[];
  apiEvidences: ArchitecturalEvidence[];
  circularDependencies: string[][];
  durationMs: number;
}

export interface ABVReport {
  runAt: number;
  durationMs: number;
  // Source metrics
  filesAnalyzed: number;
  modulesAudited: number;
  importsAnalyzed: number;
  exportsAnalyzed: number;
  // Compliance counters
  validDeps: number;
  forbiddenDeps: number;
  boundariesApproved: number;
  boundariesViolated: number;
  circularDependencies: number;
  // Evidence
  allEvidences: ArchitecturalEvidence[];
  criticalEvidences: ArchitecturalEvidence[];
  errorEvidences: ArchitecturalEvidence[];
  // Graph extras
  isolatedModules: string[];
  orphanModules: string[];
  unparsedFiles: string[];
  // Scores
  compliance: ComplianceScore;
  // Layers
  layers: ABVLayerReport[];
  // Export structure (v3 — populated but not yet rendered externally)
  exportStructure: {
    json: object;
    markdownReady: boolean;
    htmlReady: boolean;
  };
  conclusion: string;
}

// ── Layer Policy Definitions ──────────────────────────────────────────────────

interface LayerPolicy {
  id: string;
  label: string;
  pathPattern: string;
  allowedLayerDeps: string[];
  forbiddenLayerDeps: string[];
  forbiddenApiTerms: string[];
}

const LAYER_POLICIES: LayerPolicy[] = [
  {
    id: "connector-runtime",
    label: "Connector Runtime",
    pathPattern: "connector-runtime",
    allowedLayerDeps: ["policies"],
    forbiddenLayerDeps: ["capability-runtime", "goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
    forbiddenApiTerms: ["capability", "goal", "plan", "infer", "intent", "reason", "strategy"],
  },
  {
    id: "capability-runtime",
    label: "Capability Runtime",
    pathPattern: "capability-runtime",
    allowedLayerDeps: ["connector-runtime", "policies"],
    forbiddenLayerDeps: ["goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
    forbiddenApiTerms: ["interpret", "infer", "plan", "decide", "selectcapability", "findbest", "reason", "strategy", "choosecapability"],
  },
  {
    id: "goal-engine",
    label: "Goal Runtime (future)",
    pathPattern: "goal-engine",
    allowedLayerDeps: ["connector-runtime", "capability-runtime", "wme", "policies", "journey"],
    forbiddenLayerDeps: ["planner-engine", "pie"],
    forbiddenApiTerms: [],
  },
];

// ── Validator ─────────────────────────────────────────────────────────────────

export class ArchitecturalBoundaryValidator {
  private readonly collector = new EvidenceCollector();

  audit(analysis: SourceAnalysisResult): ABVReport {
    const start = Date.now();

    // ── Collect all evidences from source ─────────────────────────────────
    const { evidences, isolatedModules, orphanModules, unparsedFiles } =
      this.collector.collect(analysis);

    const layerReports: ABVLayerReport[] = [];
    let validDeps = 0;
    let forbiddenDepsTotal = 0;
    let boundariesApproved = 0;
    let boundariesViolated = 0;
    let totalResponsibilityViolations = 0;

    for (const policy of LAYER_POLICIES) {
      const layerStart = Date.now();
      const layerFiles = analysis.layerMap[policy.id] ?? [];

      const allImports   = layerFiles.flatMap(f => f.imports);
      const allExports   = layerFiles.flatMap(f => f.exports);

      // Deps actually found in source
      const detectedLayerDeps = [
        ...new Set(
          allImports
            .map(i => i.resolvedLayer)
            .filter((l): l is string => l !== null && l !== policy.id),
        ),
      ];
      const detectedImportSpecifiers = [...new Set(allImports.map(i => i.specifier))];

      // Evidence links for this layer
      const boundaryEvidences = evidences.filter(
        e => (e.layerFrom === policy.id) && (e.ruleId === "FORBIDDEN_DEPENDENCY" || e.ruleId === "CIRCULAR_DEPENDENCY"),
      );
      const apiEvidences = evidences.filter(
        e => (e.layerFrom === policy.id || e.module.includes(policy.pathPattern)) &&
             (e.ruleId === "RESPONSIBILITY_VIOLATION" || e.ruleId === "API_SURFACE"),
      );

      // Counters
      for (const dep of detectedLayerDeps) {
        if (policy.forbiddenLayerDeps.includes(dep)) forbiddenDepsTotal++;
        else validDeps++;
      }

      const responsibilityErrors = apiEvidences.filter(e => e.ruleId === "RESPONSIBILITY_VIOLATION").length;
      totalResponsibilityViolations += responsibilityErrors;

      const layerCycles = analysis.circularDependencies.filter(cycle =>
        cycle.some(p => layerFiles.some(f => f.path === p)),
      );

      const hasBoundaryError = boundaryEvidences.some(e => e.severity === "CRITICAL" || e.severity === "ERROR");
      const hasRespError     = apiEvidences.some(e => e.severity === "ERROR");
      const status: ABVStatus = (hasBoundaryError || hasRespError) ? "FAIL" : "PASS";

      if (status === "FAIL") boundariesViolated++;
      else boundariesApproved++;

      layerReports.push({
        layer: policy.id,
        label: policy.label,
        status,
        filesAnalyzed: layerFiles.length,
        publicApi: allExports,
        allowedDeps: policy.allowedLayerDeps,
        forbiddenDeps: policy.forbiddenLayerDeps,
        detectedDeps: detectedLayerDeps,
        detectedImports: detectedImportSpecifiers,
        boundaryEvidences,
        apiEvidences,
        circularDependencies: layerCycles,
        durationMs: Date.now() - layerStart,
      });
    }

    // ── Compliance Score ──────────────────────────────────────────────────
    const compliance = calculateCompliance({
      totalBoundaries: LAYER_POLICIES.length,
      boundaryViolations: boundariesViolated,
      totalDeps: validDeps + forbiddenDepsTotal,
      forbiddenDeps: forbiddenDepsTotal,
      totalExports: analysis.exportsFound,
      responsibilityViolations: totalResponsibilityViolations,
      filesAnalyzed: analysis.filesAnalyzed,
      circularCycles: analysis.circularDependencies.length,
      totalImports: analysis.importsFound,
      brokenImports: unparsedFiles.length,
    });

    // ── Evidence partitions ───────────────────────────────────────────────
    const criticalEvidences = evidences.filter(e => e.severity === "CRITICAL");
    const errorEvidences    = evidences.filter(e => e.severity === "ERROR");

    // ── Conclusion (based solely on evidences) ────────────────────────────
    const totalCritical = criticalEvidences.length;
    const totalErrors   = errorEvidences.length;
    const conclusion = totalCritical > 0
      ? `${totalCritical} evidencia(s) CRITICAL — boundary(ies) violado(s). Encaminhar para Engineering Review.`
      : totalErrors > 0
        ? `${totalErrors} evidencia(s) ERROR detectada(s). Conformidade parcial. Revisar antes do proximo release.`
        : `Conformidade total — ${evidences.length} evidencias coletadas, nenhuma CRITICAL ou ERROR. Foundation v1.0 respeitada.`;

    const totalDuration = Date.now() - start;

    // ── Export structure (v3 — JSON ready, Markdown/HTML prepared) ────────
    const exportStructure = {
      json: {
        meta: { runAt: Date.now(), durationMs: totalDuration, version: "ABV-v3" },
        compliance,
        summary: {
          filesAnalyzed: analysis.filesAnalyzed,
          importsAnalyzed: analysis.importsFound,
          exportsAnalyzed: analysis.exportsFound,
          boundariesApproved,
          boundariesViolated,
          circularDependencies: analysis.circularDependencies.length,
        },
        evidences: evidences.map(e => ({ ...e })),
        layers: layerReports.map(l => ({
          layer: l.layer,
          label: l.label,
          status: l.status,
          filesAnalyzed: l.filesAnalyzed,
          detectedDeps: l.detectedDeps,
          violations: l.boundaryEvidences.filter(e => e.severity === "CRITICAL" || e.severity === "ERROR").length,
        })),
      },
      markdownReady: true,
      htmlReady: true,
    };

    return {
      runAt: Date.now(),
      durationMs: totalDuration,
      filesAnalyzed: analysis.filesAnalyzed,
      modulesAudited: LAYER_POLICIES.length,
      importsAnalyzed: analysis.importsFound,
      exportsAnalyzed: analysis.exportsFound,
      validDeps,
      forbiddenDeps: forbiddenDepsTotal,
      boundariesApproved,
      boundariesViolated,
      circularDependencies: analysis.circularDependencies.length,
      allEvidences: evidences,
      criticalEvidences,
      errorEvidences,
      isolatedModules,
      orphanModules,
      unparsedFiles,
      compliance,
      layers: layerReports,
      exportStructure,
      conclusion,
    };
  }
}