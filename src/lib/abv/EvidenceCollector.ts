// ABV — Evidence Collector
// Foundation v1.0 · Engineering First
//
// Coleta evidencias arquiteturais do SourceAnalysisResult.
// READ ONLY — observa, nunca modifica.

import type { SourceAnalysisResult, ModuleAnalysis, ParsedImport } from "./SourceCodeAnalyzer";
import { makeEvidence } from "./EvidenceModel";
import type { ArchitecturalEvidence, EvidenceSeverity } from "./EvidenceModel";

export interface CollectionReport {
  evidences: ArchitecturalEvidence[];
  /** Isolated modules: belong to a known layer but have zero imports and zero consumers */
  isolatedModules: string[];
  /** Orphan modules: not assigned to any known layer */
  orphanModules: string[];
  /** files that failed to parse (rawSource was empty) */
  unparsedFiles: string[];
}

// ── Line locator ──────────────────────────────────────────────────────────────
// Given raw source and an import specifier, find the approximate line number.

function findImportLine(source: string, specifier: string): number {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(specifier)) return i + 1; // 1-based
  }
  return 0;
}

function findExportLine(source: string, symbol: string): number {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`export`) && lines[i].includes(symbol)) return i + 1;
  }
  return 0;
}

// ── Layer Policy (mirrors ArchitecturalBoundaryValidator) ─────────────────────
// Kept minimal — only what is needed for evidence collection.

interface CollectorPolicy {
  id: string;
  label: string;
  forbiddenLayerDeps: string[];
  forbiddenApiTerms: string[];
}

const POLICIES: CollectorPolicy[] = [
  {
    id: "connector-runtime",
    label: "Connector Runtime",
    forbiddenLayerDeps: ["capability-runtime", "goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
    forbiddenApiTerms:  ["capability", "goal", "plan", "infer", "intent", "reason", "strategy"],
  },
  {
    id: "capability-runtime",
    label: "Capability Runtime",
    forbiddenLayerDeps: ["goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
    forbiddenApiTerms:  ["interpret", "infer", "plan", "decide", "selectcapability", "findbest", "reason", "strategy", "choosecapability"],
  },
  {
    id: "goal-engine",
    label: "Goal Runtime",
    forbiddenLayerDeps: ["planner-engine", "pie"],
    forbiddenApiTerms:  [],
  },
];

const POLICY_MAP = new Map(POLICIES.map(p => [p.id, p]));
const KNOWN_LAYERS = new Set(POLICIES.map(p => p.id));

// ── Collector ─────────────────────────────────────────────────────────────────

export class EvidenceCollector {
  collect(analysis: SourceAnalysisResult): CollectionReport {
    const evidences: ArchitecturalEvidence[] = [];
    const consumerMap = buildConsumerMap(analysis);
    const isolatedModules: string[] = [];
    const orphanModules: string[] = [];
    const unparsedFiles: string[] = [];

    for (const mod of analysis.modules) {
      // ── Unparsed / empty ──────────────────────────────────────────────────
      if (!mod.rawSource || mod.rawSource.trim().length === 0) {
        unparsedFiles.push(mod.path);
        evidences.push(makeEvidence({
          ruleId: "EMPTY_MODULE",
          module: mod.path,
          file: mod.path,
          line: 0,
          description: `Arquivo vazio ou sem conteudo legivel: ${mod.path}`,
          severity: "WARNING",
          rawEvidence: mod.path,
          layerFrom: mod.layer ?? "__unknown",
        }));
        continue;
      }

      // ── Orphan modules (no layer) ─────────────────────────────────────────
      if (!mod.layer) {
        orphanModules.push(mod.path);
        // Only emit INFO for lib files — pages/components are expected to be unclassified
        if (mod.path.includes("/lib/")) {
          evidences.push(makeEvidence({
            ruleId: "ORPHAN_MODULE",
            module: mod.path,
            file: mod.path,
            line: 0,
            description: `Modulo nao pertence a nenhuma camada conhecida: ${mod.path}`,
            severity: "INFO",
            confidence: 90,
            rawEvidence: mod.path,
          }));
        }
        continue;
      }

      const policy = POLICY_MAP.get(mod.layer);

      // ── Import evidence ───────────────────────────────────────────────────
      for (const imp of mod.imports) {
        collectImportEvidence(mod, imp, policy ?? null, evidences);
      }

      // ── Export / API surface evidence ─────────────────────────────────────
      if (policy) {
        for (const exp of mod.exports) {
          collectExportEvidence(mod, exp, policy, evidences);
        }
      }

      // ── Isolated modules ──────────────────────────────────────────────────
      if (
        mod.imports.length === 0 &&
        !(consumerMap.get(mod.path)?.length ?? 0) &&
        KNOWN_LAYERS.has(mod.layer)
      ) {
        isolatedModules.push(mod.path);
        evidences.push(makeEvidence({
          ruleId: "ISOLATED_MODULE",
          module: mod.path,
          file: mod.path,
          line: 0,
          description: `Modulo isolado — sem imports e sem consumidores: ${mod.path}`,
          severity: "INFO",
          confidence: 80,
          rawEvidence: mod.path,
          layerFrom: mod.layer,
        }));
      }
    }

    // ── Circular dependency evidence ──────────────────────────────────────────
    for (const cycle of analysis.circularDependencies) {
      evidences.push(makeEvidence({
        ruleId: "CIRCULAR_DEPENDENCY",
        module: cycle[0],
        file: cycle[0],
        line: 0,
        description: `Dependencia circular detectada: ${cycle.join(" -> ")}`,
        severity: "ERROR",
        rawEvidence: cycle.join(" -> "),
        dependencyType: "circular",
        layerFrom: resolveLayerFromPath(cycle[0]),
        layerTo: resolveLayerFromPath(cycle[cycle.length - 1]),
      }));
    }

    return { evidences, isolatedModules, orphanModules, unparsedFiles };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildConsumerMap(analysis: SourceAnalysisResult): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const mod of analysis.modules) {
    for (const imp of mod.imports) {
      const key = imp.specifier;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(mod.path);
    }
  }
  return map;
}

const LAYER_PATTERNS: Array<{ layer: string; pattern: string }> = [
  { layer: "connector-runtime",  pattern: "connector-runtime" },
  { layer: "capability-runtime", pattern: "capability-runtime" },
  { layer: "goal-engine",        pattern: "goal-engine" },
  { layer: "planner-engine",     pattern: "planner-engine" },
  { layer: "pie",                pattern: "/pie/" },
  { layer: "wme",                pattern: "/wme/" },
  { layer: "memory-engine",      pattern: "memory-engine" },
];

function resolveLayerFromPath(path: string): string | undefined {
  return LAYER_PATTERNS.find(p => path.includes(p.pattern))?.layer;
}

function collectImportEvidence(
  mod: ModuleAnalysis,
  imp: ParsedImport,
  policy: CollectorPolicy | null,
  evidences: ArchitecturalEvidence[],
): void {
  const line = findImportLine(mod.rawSource, imp.specifier);

  // All imports are recorded as INFO
  evidences.push(makeEvidence({
    ruleId: "IMPORT_DETECTED",
    module: mod.path,
    file: mod.path,
    line,
    description: `Import ${imp.type} detectado: "${imp.specifier}"`,
    severity: "INFO",
    rawEvidence: imp.raw,
    importSpecifier: imp.specifier,
    layerFrom: mod.layer ?? undefined,
    layerTo: imp.resolvedLayer ?? undefined,
    dependencyType: imp.type === "dynamic" ? "dynamic" : "direct",
    confidence: 95,
  }));

  // Forbidden dependency
  if (policy && imp.resolvedLayer && policy.forbiddenLayerDeps.includes(imp.resolvedLayer)) {
    evidences.push(makeEvidence({
      ruleId: "FORBIDDEN_DEPENDENCY",
      module: mod.path,
      file: mod.path,
      line,
      description: `BOUNDARY VIOLADO: "${mod.layer}" importa "${imp.resolvedLayer}" — proibido pela Foundation v1.0`,
      severity: "CRITICAL",
      rawEvidence: imp.raw,
      importSpecifier: imp.specifier,
      layerFrom: mod.layer ?? undefined,
      layerTo: imp.resolvedLayer,
      boundaryViolated: `${mod.layer} -> ${imp.resolvedLayer}`,
      dependencyType: "direct",
    }));
  }
}

function collectExportEvidence(
  mod: ModuleAnalysis,
  exp: string,
  policy: CollectorPolicy,
  evidences: ArchitecturalEvidence[],
): void {
  const line = findExportLine(mod.rawSource, exp);
  const expLower = exp.toLowerCase();

  const matchedTerm = policy.forbiddenApiTerms.find(t => expLower.includes(t));

  const severity: EvidenceSeverity = matchedTerm ? "ERROR" : "INFO";
  const ruleId = matchedTerm ? "RESPONSIBILITY_VIOLATION" : "API_SURFACE";

  evidences.push(makeEvidence({
    ruleId,
    module: mod.path,
    file: mod.path,
    line,
    description: matchedTerm
      ? `RESPONSABILIDADE VIOLADA: export "${exp}" em "${policy.label}" contem termo proibido "${matchedTerm}"`
      : `API publica: "${exp}" em ${policy.label}`,
    severity,
    rawEvidence: exp,
    exportSymbol: exp,
    layerFrom: policy.id,
    confidence: matchedTerm ? 85 : 100,
  }));
}