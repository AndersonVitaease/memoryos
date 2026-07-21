/**
 * OfficialCertificationRecord.ts — Sprint EF-42.9
 *
 * SRP: generate the official certification artifacts from a
 *      CertificationReport + ArchitectureBaseline:
 *
 *   - ADR-Official-Library-Freeze.md  (text)
 *   - OfficialArchitectureCertificationReport.md (text)
 *
 * All content is derived 100% from the report — no hardcoded strings.
 */

import type { CertificationReport } from "./CertificationEngine";
import type { ArchitectureBaseline } from "./ArchitectureBaselineBuilder";

export interface CertificationArtifacts {
  readonly adr:    string;   // ADR-Official-Library-Freeze.md content
  readonly report: string;   // OfficialArchitectureCertificationReport.md content
  readonly generatedAt: string;
}

class OfficialCertificationRecordImpl {

  generate(
    certReport: CertificationReport,
    baseline:   ArchitectureBaseline,
  ): CertificationArtifacts {
    const date = certReport.certifiedAt.slice(0, 10);
    const adr  = this._buildADR(certReport, baseline, date);
    const rep  = this._buildReport(certReport, baseline, date);
    return Object.freeze({ adr, report: rep, generatedAt: certReport.certifiedAt });
  }

  // ── ADR ───────────────────────────────────────────────────────────────────

  private _buildADR(r: CertificationReport, b: ArchitectureBaseline, date: string): string {
    const componentList = r.scan.components.map(c =>
      `- **${c.id}** (${c.sprint}) — ${c.file}`
    ).join("\n");

    const matrixRows = r.matrix.map(m =>
      `| ${m.domain.padEnd(20)} | ${m.status.padEnd(4)} | ${String(m.passCount).padStart(2)}/${String(m.total).padStart(2)} | ${m.notes} |`
    ).join("\n");

    return `# ADR — Official Library Architecture Freeze

**ADR ID:** ${b.adrReference}
**Date:** ${date}
**Status:** ACCEPTED
**Certification ID:** ${b.certificationId}
**Structural Hash:** ${b.structuralHash}
**Score:** ${b.score}/100

---

## Context

The MemoryOS Official Library infrastructure (sprints EF-41 through EF-42.8)
has been completed and subjected to a full architectural certification by the
Self-Auditing Architecture Engine (EF-42.8).

The certification was performed automatically using:
- ArchitectureScanner — component discovery via runtime introspection
- DependencyGraphBuilder — graph construction and cycle detection
- PipelineInspector — live pipeline stage validation
- EvidenceCollector — rule-based evidence accumulation
- CertificationEngine — authoritative verdict generation

---

## Decision

The Official Library Architecture is hereby **FROZEN** at version **${b.version}**.

Certification status: **${r.status}**
Architecture score: **${b.score}/100**

---

## Scope — Frozen Components (${b.totalComponents})

${componentList}

---

## Certification Matrix

| Domain               | Status | Pass | Notes |
|----------------------|--------|------|-------|
${matrixRows}

---

## Consequences

1. No structural change to the Official Library may be made without
   formal ADR approval.

2. The following are considered structural changes:
   - Adding, removing, or renaming any exported singleton
   - Changing a component's layer assignment
   - Introducing new dependencies between components
   - Modifying the pipeline order

3. The following are NOT structural changes (no ADR required):
   - Bug fixes within a component that do not alter its API
   - Performance optimizations with identical interface
   - Adding new test coverage

4. Before any structural change:
   a. Open a new ADR referencing this document
   b. Re-run CertificationEngine to confirm impact
   c. Update the ArchitectureBaseline
   d. Record the new Certification ID

---

## Next Phases (authorized after CERTIFIED)

${r.status === "CERTIFIED" ? [
  "- EF-43 — Authority Engine",
  "- EF-44 — Ranking Engine",
  "- EF-45 — Conflict Resolver",
  "- EF-46 — Knowledge Context Builder",
  "- EF-47 — Planner Integration",
].join("\n") : "_(Blocked until CERTIFIED status is achieved)_"}

---

## Baseline Reference

\`\`\`
Certification ID : ${b.certificationId}
Structural Hash  : ${b.structuralHash}
Frozen At        : ${b.frozenAt}
Version          : ${b.version}
Pipeline Stages  : ${b.pipelineStages} (complete: ${b.pipelineComplete})
Graph Edges      : ${b.graphEdges} (acyclic: ${b.graphIsAcyclic})
Evidence Items   : ${b.evidenceTotal} (passed: ${b.evidencePassed})
\`\`\`
`;
  }

  // ── Executive Report ──────────────────────────────────────────────────────

  private _buildReport(r: CertificationReport, b: ArchitectureBaseline, date: string): string {
    const pipelineStages = r.pipeline.stages.map(s =>
      `| ${s.stage.padEnd(20)} | ${s.isOperational ? "PASS" : "FAIL"} | ${s.globalKey ?? "—"} | ${s.methodsFound.slice(0,4).join(", ")} |`
    ).join("\n");

    const edges = r.graph.edges.map(e =>
      `| ${e.from.padEnd(30)} | ${e.type.padEnd(15)} | ${e.to} |`
    ).join("\n");

    const evidenceRows = [...r.evidence.items].slice(0, 20).map(i =>
      `| ${i.result} | ${i.component.padEnd(30)} | ${i.finding.slice(0, 60)} |`
    ).join("\n");

    const ncSection = r.nonConformities.length === 0
      ? "_None — all rules passed._"
      : r.nonConformities.map(n => `- ${n}`).join("\n");

    const obsSection = r.observations.length === 0
      ? "_None._"
      : r.observations.map(o => `- ${o}`).join("\n");

    const riskSection = r.risks.length === 0
      ? "_No risks identified._"
      : r.risks.map(rk => `- ${rk}`).join("\n");

    return `# Official Architecture Certification Report

**Report:** OfficialArchitectureCertificationReport
**Generated:** ${date}
**Certification ID:** ${b.certificationId}
**Structural Hash:** ${b.structuralHash}
**Status:** ${r.status}
**Score:** ${r.score}/100
**Duration:** ${r.durationMs}ms

---

## 1. Resumo Executivo

The Official Library Infrastructure (EF-41 through EF-42.8) was subjected to a
complete automated architectural audit. The Self-Auditing Architecture Engine
inspected ${r.scan.totalFound} components, ${r.graph.edges.length} dependency edges,
${r.pipeline.totalStages} pipeline stages and collected ${r.evidence.total} evidence items.

**Result: ${r.status}** with score ${r.score}/100.

${r.status === "CERTIFIED"
  ? "The architecture is certified and frozen. Cognitive layer development (EF-43+) is authorized."
  : r.status === "CERTIFIED_WITH_OBSERVATIONS"
  ? "The architecture is operational with minor observations. Resolve observations before EF-43."
  : "Architecture is NOT CERTIFIED. Resolve all failures before proceeding."}

---

## 2. Architecture

- **Total Components:** ${r.scan.totalFound}
- **Singletons:** ${r.scan.singletons}
- **Layers:** ${Object.keys(r.scan.byLayer).join(", ")}
- **Roles:** ${Object.keys(r.scan.byRole).join(", ")}

---

## 3. Pipeline

| Stage                | Status | Global Key | Methods |
|----------------------|--------|-----------|---------|
${pipelineStages}

Pipeline complete: **${r.pipeline.isComplete}**
Operational stages: **${r.pipeline.operationalStages}/${r.pipeline.totalStages}**

---

## 4. Dependency Graph

| From                           | Type            | To |
|--------------------------------|-----------------|---|
${edges}

Acyclic: **${r.graph.isAcyclic}**
Violations: **${r.graph.violations.length}**

---

## 5. Certification Matrix

${r.matrix.map(m => `- **${m.domain}**: ${m.status} (${m.passCount}/${m.total})`).join("\n")}

---

## 6. Evidence (first 20 items)

| Result | Component | Finding |
|--------|-----------|---------|
${evidenceRows}

Total evidence: ${r.evidence.total} | Passed: ${r.evidence.passed} | Failed: ${r.evidence.failed} | Observed: ${r.evidence.observed}

---

## 7. Non-Conformities

${ncSection}

---

## 8. Observations

${obsSection}

---

## 9. Risks

${riskSection}

---

## 10. Baseline

\`\`\`json
{
  "version": "${b.version}",
  "certificationId": "${b.certificationId}",
  "structuralHash": "${b.structuralHash}",
  "frozenAt": "${b.frozenAt}",
  "status": "${b.status}",
  "score": ${b.score},
  "totalComponents": ${b.totalComponents},
  "totalSingletons": ${b.totalSingletons},
  "pipelineStages": ${b.pipelineStages},
  "pipelineComplete": ${b.pipelineComplete},
  "graphEdges": ${b.graphEdges},
  "graphIsAcyclic": ${b.graphIsAcyclic},
  "evidenceTotal": ${b.evidenceTotal},
  "evidencePassed": ${b.evidencePassed},
  "nonConformities": ${b.nonConformities},
  "observations": ${b.observations},
  "adrReference": "${b.adrReference}"
}
\`\`\`

---

## 11. Conclusion

**${r.status}**

${r.recommendations.map(rec => `> ${rec}`).join("\n")}

---

_Generated by OfficialCertificationRecord (EF-42.9) on ${date}_
_Source: CertificationEngine (EF-42.8) — all evidence is traceable._
`;
  }
}

const G = globalThis as typeof globalThis & { __EF429_RECORD__?: OfficialCertificationRecordImpl };
if (!G.__EF429_RECORD__) G.__EF429_RECORD__ = new OfficialCertificationRecordImpl();
export const OfficialCertificationRecord: OfficialCertificationRecordImpl = G.__EF429_RECORD__;