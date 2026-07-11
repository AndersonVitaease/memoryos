// Architectural Boundary Validation (ABV) — v2
// Foundation v1.0 · Engineering First
//
// Auditoria 100% automatica baseada em codigo-fonte real.
// Nenhuma lista manual de imports. Toda evidencia extraida pelo SourceCodeAnalyzer.

import type { SourceAnalysisResult, ModuleAnalysis } from "./SourceCodeAnalyzer";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ABVSeverity = "ERROR" | "WARN" | "INFO";
export type ABVStatus   = "PASS" | "FAIL" | "WARN";

export interface ABVViolation {
  rule: string;
  layer: string;
  detail: string;
  severity: ABVSeverity;
  evidence?: string;
}

export interface ABVLayerReport {
  layer: string;
  label: string;
  status: ABVStatus;
  filesAnalyzed: number;
  publicApi: string[];
  allowedDeps: string[];
  forbiddenDeps: string[];
  detectedDeps: string[];          // unique layers actually imported
  detectedImports: string[];       // raw specifiers found in source
  violations: ABVViolation[];
  responsibilityViolations: ABVViolation[];
  circularDependencies: string[][];
  durationMs: number;
}

export interface ABVReport {
  runAt: number;
  durationMs: number;
  filesAnalyzed: number;
  modulesAudited: number;
  importsAnalyzed: number;
  exportsAnalyzed: number;
  validDeps: number;
  forbiddenDeps: number;
  boundariesApproved: number;
  boundariesViolated: number;
  circularDependencies: number;
  layers: ABVLayerReport[];
  allViolations: ABVViolation[];
  conclusion: string;
}

// ── Layer Policy Definitions — Foundation v1.0 ───────────────────────────────
// These are the RULES (what is allowed/forbidden).
// The actual imports are read from source code, never hardcoded here.

interface LayerPolicy {
  id: string;
  label: string;
  /** Glob-friendly path fragments identifying files in this layer */
  pathPattern: string;
  allowedLayerDeps: string[];
  forbiddenLayerDeps: string[];
  /** Method/export name fragments that signal a responsibility violation */
  forbiddenApiTerms: string[];
}

const LAYER_POLICIES: LayerPolicy[] = [
  {
    id: "connector-runtime",
    label: "Connector Runtime",
    pathPattern: "connector-runtime",
    allowedLayerDeps: ["policies", "__unknown", null as unknown as string],
    forbiddenLayerDeps: ["capability-runtime", "goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
    forbiddenApiTerms: ["capability", "goal", "plan", "infer", "intent", "reason", "strategy"],
  },
  {
    id: "capability-runtime",
    label: "Capability Runtime",
    pathPattern: "capability-runtime",
    allowedLayerDeps: ["connector-runtime", "policies", "__unknown", null as unknown as string],
    forbiddenLayerDeps: ["goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
    forbiddenApiTerms: ["interpret", "infer", "plan", "decide", "selectcapability", "findbest", "reason", "strategy", "choosecapability"],
  },
  {
    id: "goal-engine",
    label: "Goal Runtime (future)",
    pathPattern: "goal-engine",
    allowedLayerDeps: ["connector-runtime", "capability-runtime", "wme", "policies", "journey", "__unknown", null as unknown as string],
    forbiddenLayerDeps: ["planner-engine", "pie"],
    forbiddenApiTerms: [],
  },
];

// ── Validator ─────────────────────────────────────────────────────────────────

export class ArchitecturalBoundaryValidator {
  /**
   * Run boundary audit against a SourceAnalysisResult produced by SourceCodeAnalyzer.
   * No manual lists — all import evidence comes from the analysis.
   */
  audit(analysis: SourceAnalysisResult): ABVReport {
    const start = Date.now();
    const layerReports: ABVLayerReport[] = [];
    let validDeps = 0;
    let forbiddenDepsTotal = 0;
    let boundariesApproved = 0;
    let boundariesViolated = 0;
    const allViolations: ABVViolation[] = [];

    for (const policy of LAYER_POLICIES) {
      const layerStart = Date.now();

      // All files belonging to this layer (from source code analysis)
      const layerFiles: ModuleAnalysis[] = analysis.layerMap[policy.id] ?? [];

      // Collect all actual imports across all files in this layer
      const allImports = layerFiles.flatMap(f => f.imports);
      const allExports = layerFiles.flatMap(f => f.exports);

      // Unique layers actually imported (exclude self and external)
      const detectedLayerDeps = [
        ...new Set(
          allImports
            .map(i => i.resolvedLayer)
            .filter((l): l is string => l !== null && l !== policy.id),
        ),
      ];

      const detectedImportSpecifiers = [...new Set(allImports.map(i => i.specifier))];

      const violations: ABVViolation[] = [];
      const responsibilityViolations: ABVViolation[] = [];

      // ── Forbidden dependency check (from actual source imports) ───────────
      for (const dep of detectedLayerDeps) {
        if (policy.forbiddenLayerDeps.includes(dep)) {
          // Find which file(s) introduced this violation
          const offendingFiles = layerFiles
            .filter(f => f.imports.some(i => i.resolvedLayer === dep))
            .map(f => f.path);

          forbiddenDepsTotal++;
          violations.push({
            rule: "FORBIDDEN_DEPENDENCY",
            layer: policy.label,
            detail: `Dependencia proibida "${dep}" encontrada em: ${offendingFiles.join(", ")}`,
            severity: "ERROR",
            evidence: offendingFiles.join(", "),
          });
        } else {
          validDeps++;
        }
      }

      // ── Circular dependencies within this layer ───────────────────────────
      const layerPaths = new Set(layerFiles.map(f => f.path));
      const layerCycles = analysis.circularDependencies.filter(cycle =>
        cycle.some(p => layerPaths.has(p)),
      );
      if (layerCycles.length > 0) {
        layerCycles.forEach(cycle => {
          violations.push({
            rule: "CIRCULAR_DEPENDENCY",
            layer: policy.label,
            detail: `Dependencia circular: ${cycle.join(" -> ")}`,
            severity: "ERROR",
            evidence: cycle.join(" -> "),
          });
        });
      }

      // ── Responsibility / API surface check (actual exports from source) ───
      for (const exp of allExports) {
        const expLower = exp.toLowerCase();
        for (const term of policy.forbiddenApiTerms) {
          if (expLower.includes(term)) {
            responsibilityViolations.push({
              rule: "RESPONSIBILITY_VIOLATION",
              layer: policy.label,
              detail: `Export "${exp}" sugere responsabilidade proibida ("${term}")`,
              severity: "ERROR",
              evidence: exp,
            });
          }
        }
      }

      const layerViolations = [...violations, ...responsibilityViolations];
      const hasErrors = layerViolations.some(v => v.severity === "ERROR");
      const hasWarns  = layerViolations.some(v => v.severity === "WARN");
      const status: ABVStatus = hasErrors ? "FAIL" : hasWarns ? "WARN" : "PASS";

      if (status === "FAIL") boundariesViolated++;
      else boundariesApproved++;

      allViolations.push(...layerViolations);

      layerReports.push({
        layer: policy.id,
        label: policy.label,
        status,
        filesAnalyzed: layerFiles.length,
        publicApi: allExports,
        allowedDeps: policy.allowedLayerDeps.filter(Boolean),
        forbiddenDeps: policy.forbiddenLayerDeps,
        detectedDeps: detectedLayerDeps,
        detectedImports: detectedImportSpecifiers,
        violations,
        responsibilityViolations,
        circularDependencies: layerCycles,
        durationMs: Date.now() - layerStart,
      });
    }

    const totalDuration = Date.now() - start;
    const errorCount = allViolations.filter(v => v.severity === "ERROR").length;
    const conclusion = errorCount === 0
      ? "Auditoria concluida — nenhuma violacao arquitetural encontrada. Foundation v1.0 boundaries respeitados."
      : `Auditoria concluida com ${errorCount} violacao(oes) ERROR detectada(s) no codigo-fonte. Encaminhar para Engineering Review.`;

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
      layers: layerReports,
      allViolations,
      conclusion,
    };
  }
}