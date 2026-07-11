// ABV — Change Detection Engine & Regression Detector
// Foundation v1.0 · Engineering First
//
// Compara dois Baselines e produz evidencias de mudanca.
// READ ONLY — apenas observa, nunca modifica.

import type { ArchitecturalBaseline, ChangeType } from "./BaselineEngine";
import { makeEvidence } from "./EvidenceModel";
import type { ArchitecturalEvidence, EvidenceSeverity } from "./EvidenceModel";

// ── Change Record ─────────────────────────────────────────────────────────────

export interface ChangeRecord {
  changeType: ChangeType;
  category: string;
  description: string;
  severity: EvidenceSeverity;
  layer?: string;
  before?: string | number;
  after?: string | number;
  evidence: ArchitecturalEvidence;
}

// ── Compliance Delta ──────────────────────────────────────────────────────────

export interface ComplianceDelta {
  metric: string;
  before: number;
  after: number;
  delta: number;
  trend: "IMPROVED" | "REGRESSED" | "STABLE";
}

// ── Change Report ─────────────────────────────────────────────────────────────

export interface ChangeReport {
  baselineFrom: string;
  baselineTo: string;
  timestampFrom: number;
  timestampTo: number;
  durationMs: number;
  // Summary
  totalChanges: number;
  regressions: number;
  improvements: number;
  additions: number;
  removals: number;
  // Detail
  changes: ChangeRecord[];
  complianceDeltas: ComplianceDelta[];
  // Partitions
  regressionChanges: ChangeRecord[];
  improvementChanges: ChangeRecord[];
  addedModules: string[];
  removedModules: string[];
  addedApis: Record<string, string[]>;
  removedApis: Record<string, string[]>;
  newCircularDeps: number;
  resolvedCircularDeps: number;
  // Conclusion
  overallTrend: "IMPROVED" | "REGRESSED" | "STABLE";
  conclusion: string;
}

// ── Timeline Entry ────────────────────────────────────────────────────────────

export interface TimelineEntry {
  baselineId: string;
  version: string;
  label: string;
  timestamp: number;
  compliance: number;
  totalChanges: number;
  regressions: number;
  improvements: number;
  conclusion: string;
  comparedToId: string | null;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class ChangeDetectionEngine {
  compare(from: ArchitecturalBaseline, to: ArchitecturalBaseline): ChangeReport {
    const start = Date.now();
    const changes: ChangeRecord[] = [];

    // ── Module additions/removals ─────────────────────────────────────────
    const fromModules = new Set(from.modulePaths);
    const toModules   = new Set(to.modulePaths);

    const addedModules:   string[] = [];
    const removedModules: string[] = [];

    for (const m of toModules) {
      if (!fromModules.has(m)) {
        addedModules.push(m);
        changes.push(this.makeChange("ADDED", "module", `Modulo adicionado: "${m}"`, "INFO", undefined, undefined, m, from.baselineId, to.baselineId));
      }
    }
    for (const m of fromModules) {
      if (!toModules.has(m)) {
        removedModules.push(m);
        changes.push(this.makeChange("REMOVED", "module", `Modulo removido: "${m}"`, "WARNING", undefined, m, undefined, from.baselineId, to.baselineId));
      }
    }

    // ── API surface diffs per layer ───────────────────────────────────────
    const addedApis:   Record<string, string[]> = {};
    const removedApis: Record<string, string[]> = {};

    const allLayerIds = new Set([...Object.keys(from.apiSurface), ...Object.keys(to.apiSurface)]);
    for (const layerId of allLayerIds) {
      const fromApi = new Set(from.apiSurface[layerId] ?? []);
      const toApi   = new Set(to.apiSurface[layerId] ?? []);
      addedApis[layerId]   = [];
      removedApis[layerId] = [];

      for (const api of toApi) {
        if (!fromApi.has(api)) {
          addedApis[layerId].push(api);
          changes.push(this.makeChange("ADDED", "api", `Nova API publica em "${layerId}": "${api}"`, "WARNING", layerId, undefined, api, from.baselineId, to.baselineId));
        }
      }
      for (const api of fromApi) {
        if (!toApi.has(api)) {
          removedApis[layerId].push(api);
          changes.push(this.makeChange("REMOVED", "api", `API removida em "${layerId}": "${api}"`, "INFO", layerId, api, undefined, from.baselineId, to.baselineId));
        }
      }
    }

    // ── Dependency graph diffs per layer ──────────────────────────────────
    for (const layerId of allLayerIds) {
      const fromDeps = new Set(from.depGraph[layerId] ?? []);
      const toDeps   = new Set(to.depGraph[layerId] ?? []);

      for (const dep of toDeps) {
        if (!fromDeps.has(dep)) {
          const layer = to.layers.find(l => l.id === layerId);
          const isForbidden = layer?.forbiddenDeps.includes(dep);
          changes.push(this.makeChange(
            isForbidden ? "REGRESSION" : "ADDED",
            "dependency",
            isForbidden
              ? `REGRESSAO: nova dependencia PROIBIDA em "${layerId}" -> "${dep}"`
              : `Nova dependencia em "${layerId}" -> "${dep}"`,
            isForbidden ? "CRITICAL" : "WARNING",
            layerId, undefined, dep, from.baselineId, to.baselineId,
          ));
        }
      }
      for (const dep of fromDeps) {
        if (!toDeps.has(dep)) {
          changes.push(this.makeChange("REMOVED", "dependency", `Dependencia removida em "${layerId}" -> "${dep}"`, "INFO", layerId, dep, undefined, from.baselineId, to.baselineId));
        }
      }
    }

    // ── Boundary violations ───────────────────────────────────────────────
    for (const toLayer of to.layers) {
      const fromLayer = from.layers.find(l => l.id === toLayer.id);
      const prevViol  = fromLayer?.boundaryViolations ?? 0;
      const currViol  = toLayer.boundaryViolations;

      if (currViol > prevViol) {
        changes.push(this.makeChange(
          "REGRESSION", "boundary",
          `REGRESSAO de boundary: "${toLayer.label}" passou de ${prevViol} para ${currViol} violacao(oes)`,
          "CRITICAL", toLayer.id, String(prevViol), String(currViol), from.baselineId, to.baselineId,
        ));
      } else if (currViol < prevViol) {
        changes.push(this.makeChange(
          "IMPROVEMENT", "boundary",
          `Melhoria de boundary: "${toLayer.label}" passou de ${prevViol} para ${currViol} violacao(oes)`,
          "INFO", toLayer.id, String(prevViol), String(currViol), from.baselineId, to.baselineId,
        ));
      }
    }

    // ── Circular dependencies ─────────────────────────────────────────────
    const newCircularDeps     = Math.max(0, to.circularDependencies - from.circularDependencies);
    const resolvedCircularDeps = Math.max(0, from.circularDependencies - to.circularDependencies);

    if (newCircularDeps > 0) {
      changes.push(this.makeChange(
        "REGRESSION", "circular",
        `REGRESSAO: ${newCircularDeps} nova(s) dependencia(s) circular(es)`,
        "ERROR", undefined, String(from.circularDependencies), String(to.circularDependencies), from.baselineId, to.baselineId,
      ));
    }
    if (resolvedCircularDeps > 0) {
      changes.push(this.makeChange(
        "IMPROVEMENT", "circular",
        `Melhoria: ${resolvedCircularDeps} dependencia(s) circular(es) resolvida(s)`,
        "INFO", undefined, String(from.circularDependencies), String(to.circularDependencies), from.baselineId, to.baselineId,
      ));
    }

    // ── Compliance deltas ─────────────────────────────────────────────────
    const complianceDeltas: ComplianceDelta[] = this.buildComplianceDeltas(from, to);

    // Compliance regressions
    for (const delta of complianceDeltas) {
      if (delta.trend === "REGRESSED") {
        changes.push(this.makeChange(
          "REGRESSION", "compliance",
          `REGRESSAO de compliance "${delta.metric}": ${delta.before}% -> ${delta.after}% (${delta.delta > 0 ? "+" : ""}${delta.delta}%)`,
          "ERROR", undefined, String(delta.before), String(delta.after), from.baselineId, to.baselineId,
        ));
      } else if (delta.trend === "IMPROVED") {
        changes.push(this.makeChange(
          "IMPROVEMENT", "compliance",
          `Melhoria de compliance "${delta.metric}": ${delta.before}% -> ${delta.after}% (+${delta.delta}%)`,
          "INFO", undefined, String(delta.before), String(delta.after), from.baselineId, to.baselineId,
        ));
      }
    }

    // ── Partitions ────────────────────────────────────────────────────────
    const regressionChanges  = changes.filter(c => c.changeType === "REGRESSION");
    const improvementChanges = changes.filter(c => c.changeType === "IMPROVEMENT");

    // ── Overall trend ─────────────────────────────────────────────────────
    const overallDelta = to.compliance.overallCompliance - from.compliance.overallCompliance;
    const overallTrend: ChangeReport["overallTrend"] =
      overallDelta > 0 ? "IMPROVED" : overallDelta < 0 ? "REGRESSED" : "STABLE";

    const conclusion =
      regressionChanges.length > 0
        ? `${regressionChanges.length} regressao(oes) detectada(s). Compliance: ${from.compliance.overallCompliance}% -> ${to.compliance.overallCompliance}%. Encaminhar para Engineering Review.`
        : improvementChanges.length > 0
          ? `Nenhuma regressao. ${improvementChanges.length} melhoria(s) detectada(s). Compliance: ${from.compliance.overallCompliance}% -> ${to.compliance.overallCompliance}%.`
          : changes.length === 0
            ? `Nenhuma mudanca detectada. Arquitetura estavel. Compliance: ${to.compliance.overallCompliance}%.`
            : `${changes.length} mudanca(s) detectada(s), sem regressoes. Compliance: ${from.compliance.overallCompliance}% -> ${to.compliance.overallCompliance}%.`;

    return {
      baselineFrom: from.baselineId,
      baselineTo:   to.baselineId,
      timestampFrom: from.timestamp,
      timestampTo:   to.timestamp,
      durationMs: Date.now() - start,
      totalChanges: changes.length,
      regressions:  regressionChanges.length,
      improvements: improvementChanges.length,
      additions:    changes.filter(c => c.changeType === "ADDED").length,
      removals:     changes.filter(c => c.changeType === "REMOVED").length,
      changes,
      complianceDeltas,
      regressionChanges,
      improvementChanges,
      addedModules,
      removedModules,
      addedApis,
      removedApis,
      newCircularDeps,
      resolvedCircularDeps,
      overallTrend,
      conclusion,
    };
  }

  buildTimeline(
    baselines: ArchitecturalBaseline[],
    reports: Map<string, ChangeReport>,
  ): TimelineEntry[] {
    return baselines.map(b => {
      const report = [...reports.values()].find(r => r.baselineTo === b.baselineId);
      return {
        baselineId:   b.baselineId,
        version:      b.version,
        label:        b.label,
        timestamp:    b.timestamp,
        compliance:   b.compliance.overallCompliance,
        totalChanges: report?.totalChanges ?? 0,
        regressions:  report?.regressions  ?? 0,
        improvements: report?.improvements ?? 0,
        conclusion:   report?.conclusion   ?? "Baseline inicial",
        comparedToId: report?.baselineFrom ?? null,
      };
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private makeChange(
    changeType: ChangeType,
    category: string,
    description: string,
    severity: EvidenceSeverity,
    layer: string | undefined,
    before: string | undefined,
    after:  string | undefined,
    baselineFrom: string,
    baselineTo:   string,
  ): ChangeRecord {
    const ev = makeEvidence({
      ruleId: `CHANGE_${changeType}`,
      module: layer ?? "architecture",
      file:   layer ?? "architecture",
      line:   0,
      description,
      severity,
      rawEvidence: `${before ?? "∅"} -> ${after ?? "∅"}`,
      layerFrom: layer,
      confidence: 100,
    });
    // Augment evidence with baseline context
    (ev as Record<string, unknown>)["baselineFrom"] = baselineFrom;
    (ev as Record<string, unknown>)["baselineTo"]   = baselineTo;
    (ev as Record<string, unknown>)["changeType"]   = changeType;

    return { changeType, category, description, severity, layer, before, after, evidence: ev };
  }

  private buildComplianceDeltas(from: ArchitecturalBaseline, to: ArchitecturalBaseline): ComplianceDelta[] {
    const metrics: Array<{ key: keyof typeof from.compliance; label: string }> = [
      { key: "overallCompliance",       label: "Overall Compliance" },
      { key: "boundaryCompliance",      label: "Boundary Compliance" },
      { key: "dependencyCompliance",    label: "Dependency Compliance" },
      { key: "apiCompliance",           label: "API Compliance" },
      { key: "circularDependencyScore", label: "Circular Dependency Score" },
      { key: "importCompliance",        label: "Import Compliance" },
    ];

    return metrics.map(({ key, label }) => {
      const before = from.compliance[key];
      const after  = to.compliance[key];
      const delta  = after - before;
      return {
        metric: label,
        before,
        after,
        delta,
        trend: delta > 0 ? "IMPROVED" : delta < 0 ? "REGRESSED" : "STABLE",
      };
    });
  }
}