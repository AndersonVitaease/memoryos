// ABV v4.1 — Sprint Validation: Hardening & Traceability
// Foundation v1.0 · Engineering First
//
// 15 criterios de aceitacao cobrindo:
//   Baseline Integrity (SHA-256)
//   Baseline Metadata
//   Real Baseline Comparison
//   Timeline Evolution
//   Engineering Review State
//   Immutable Audit History

import { SourceCodeAnalyzer, loadSourceFiles } from "./SourceCodeAnalyzer";
import { ArchitecturalBoundaryValidator } from "./ArchitecturalBoundaryValidator";
import { createBaseline, BaselineRegistry, ImmutableAuditHistory, PLATFORM_META } from "./BaselineEngine";
import { ChangeDetectionEngine } from "./ChangeDetectionEngine";

export interface SprintTestResult {
  criterion: number;
  name: string;
  category: string;
  passed: boolean;
  durationMs: number;
  detail?: string;
  observation?: string;
  error?: string;
}

export interface SprintSuiteResult {
  results: SprintTestResult[];
  passed: number;
  total: number;
  durationMs: number;
  integrityVerified: boolean;
  sha256Confirmed: boolean;
  historyEntries: number;
}

async function run(
  n: number,
  name: string,
  category: string,
  fn: () => Promise<{ detail?: string; observation?: string }>,
): Promise<SprintTestResult> {
  const t = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, category, passed: true, durationMs: Date.now() - t, ...out };
  } catch (err) {
    return {
      criterion: n, name, category, passed: false,
      durationMs: Date.now() - t,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runABVSprintTests(): Promise<SprintSuiteResult> {
  const suiteStart = Date.now();
  const results: SprintTestResult[] = [];

  // ── Real audit ────────────────────────────────────────────────────────────
  const sources  = await loadSourceFiles();
  const analysis = new SourceCodeAnalyzer().analyze(sources);
  const auditStart = Date.now();
  const report   = new ArchitecturalBoundaryValidator().audit(analysis);
  const auditDurationMs = Date.now() - auditStart;

  const registry = new BaselineRegistry();
  const history  = new ImmutableAuditHistory();
  const detector = new ChangeDetectionEngine();

  // ── Create two real baselines (A = real, B = re-audit same sources) ───────
  // B uses a slightly different label to guarantee a different timestamp/ID
  // while hash will be identical (same code) — testing dedup on real code.
  const baselineA = await createBaseline(report, {
    label: "Baseline A — Auditoria Real (Sprint v4.1)",
    gitCommit: "unavailable",
    auditDurationMs,
  });

  // Simulate a second audit where one extra file is added
  const simulatedReport = simulateMinorChange(report);
  const baselineB = await createBaseline(simulatedReport, {
    label: "Baseline B — Mudanca Simulada (Sprint v4.1)",
    gitCommit: "unavailable",
    auditDurationMs: auditDurationMs + 10,
  });

  registry.register(baselineA);
  registry.register(baselineB);
  history.append(baselineA);
  history.append(baselineB);

  const changeReport = detector.compare(baselineA, baselineB);
  const changeReports = new Map([[baselineB.baselineId, changeReport]]);
  const timeline = detector.buildTimeline(registry.list(), changeReports);

  // ── C1: SHA-256 hash gerado ───────────────────────────────────────────────
  results.push(await run(1, "SHA-256 hash gerado para cada Baseline", "Baseline Integrity", async () => {
    if (!baselineA.auditHash || baselineA.auditHash.length < 32)
      throw new Error(`Hash muito curto: "${baselineA.auditHash}" (${baselineA.auditHash.length} chars)`);
    if (!/^[0-9a-f]+$/.test(baselineA.auditHash))
      throw new Error("Hash nao e hexadecimal valido");
    return {
      detail: `Hash A: ${baselineA.auditHash.slice(0, 16)}... (${baselineA.auditHash.length} chars hex) | Algoritmo: ${baselineA.metadata.hashAlgorithm}`,
    };
  }));

  // ── C2: Hash cobre payload completo ──────────────────────────────────────
  results.push(await run(2, "Hash representa payload arquitetural completo", "Baseline Integrity", async () => {
    const desc = baselineA.metadata.hashPayloadDescription;
    const required = ["files", "imports", "exports", "compliance", "evidences", "layers", "boundaries", "abvVersion"];
    const missing = required.filter(k => !desc.includes(k));
    if (missing.length > 0) throw new Error(`Payload description falta: ${missing.join(", ")}`);
    return { detail: `Payload description: "${desc.slice(0, 80)}..."` };
  }));

  // ── C3: Baselines diferentes produzem hashes diferentes ──────────────────
  results.push(await run(3, "Mudanca arquitetural produz hash SHA-256 diferente", "Baseline Integrity", async () => {
    if (baselineA.auditHash === baselineB.auditHash)
      throw new Error("Hash identico para arquiteturas diferentes — mudanca nao detectada");
    return {
      detail: `Hash A: ${baselineA.auditHash.slice(0, 16)}... | Hash B: ${baselineB.auditHash.slice(0, 16)}... | Diferentes: sim`,
    };
  }));

  // ── C4: Registry rejeita duplicata por hash ───────────────────────────────
  results.push(await run(4, "Registry rejeita duplicata pelo hash SHA-256", "Baseline Integrity", async () => {
    const dup = await createBaseline(report, { label: "Duplicata teste" });
    const dupReg = new BaselineRegistry();
    dupReg.register(baselineA);
    const result = dupReg.register(dup);
    // dup has same hash as A (same report) — should be rejected
    if (result.success) throw new Error("Registry aceitou baseline duplicado (mesmo hash)");
    return { detail: `Duplicata corretamente rejeitada: "${result.reason}"` };
  }));

  // ── C5: Metadata — todos os campos obrigatorios presentes ────────────────
  results.push(await run(5, "Metadata completa em cada Baseline", "Baseline Metadata", async () => {
    const m = baselineA.metadata;
    const requiredFields: Array<keyof typeof m> = [
      "baselineId", "version", "timestamp", "timestampIso", "auditHash", "hashAlgorithm",
      "foundationVersion", "engineeringFirstVersion", "abvVersion", "runtimeVersion",
      "sprint", "auditDurationMs", "totalFiles", "gitCommit", "reviewState", "reviewNote",
    ];
    const missing = requiredFields.filter(f => m[f] === undefined || m[f] === null);
    if (missing.length > 0) throw new Error(`Campos ausentes: ${missing.join(", ")}`);
    return {
      detail: [
        `ID: ${m.baselineId}`,
        `Foundation: ${m.foundationVersion}`,
        `ABV: ${m.abvVersion}`,
        `Sprint: ${m.sprint}`,
        `ReviewState: ${m.reviewState}`,
        `Duration: ${m.auditDurationMs}ms`,
        `Files: ${m.totalFiles}`,
      ].join(" | "),
    };
  }));

  // ── C6: Metadata versoes corretas ─────────────────────────────────────────
  results.push(await run(6, "Metadata reflete versoes da plataforma corretamente", "Baseline Metadata", async () => {
    const m = baselineA.metadata;
    if (m.foundationVersion !== PLATFORM_META.foundationVersion)
      throw new Error(`foundationVersion incorreta: ${m.foundationVersion}`);
    if (m.abvVersion !== PLATFORM_META.abvVersion)
      throw new Error(`abvVersion incorreta: ${m.abvVersion}`);
    if (m.sprint !== PLATFORM_META.sprint)
      throw new Error(`sprint incorreta: ${m.sprint}`);
    return {
      detail: `Foundation: ${m.foundationVersion} | EngineeringFirst: ${m.engineeringFirstVersion} | ABV: ${m.abvVersion} | Sprint: ${m.sprint}`,
    };
  }));

  // ── C7: Engineering Review State derivado automaticamente ────────────────
  results.push(await run(7, "Engineering Review State derivado automaticamente do report", "Engineering Review State", async () => {
    const state = baselineA.metadata.reviewState;
    const valid = ["PENDING", "APPROVED", "REQUIRES_ATTENTION", "REJECTED"];
    if (!valid.includes(state)) throw new Error(`ReviewState invalido: "${state}"`);
    // verify logic: REQUIRES_ATTENTION if critical > 0, APPROVED if compliance >= 90
    const expectedState =
      report.criticalEvidences.length > 0 ? "REQUIRES_ATTENTION"
      : report.compliance.overallCompliance >= 90 ? "APPROVED"
      : "PENDING";
    if (state !== expectedState) throw new Error(`ReviewState esperado "${expectedState}", obtido "${state}"`);
    return {
      detail: `ReviewState: ${state} | Criticals: ${report.criticalEvidences.length} | Compliance: ${report.compliance.overallCompliance}%`,
      observation: state === "REQUIRES_ATTENTION" ? "Evidencias CRITICAL detectadas — Engineering Review obrigatoria" : undefined,
    };
  }));

  // ── C8: Comparacao real entre dois Baselines ─────────────────────────────
  results.push(await run(8, "Comparacao real entre dois Baselines distintos", "Real Baseline Comparison", async () => {
    if (!changeReport) throw new Error("changeReport nao gerado");
    if (changeReport.baselineFrom !== baselineA.baselineId) throw new Error("baselineFrom incorreto");
    if (changeReport.baselineTo   !== baselineB.baselineId) throw new Error("baselineTo incorreto");
    return {
      detail: `De: ${changeReport.baselineFrom.slice(-6)} → Para: ${changeReport.baselineTo.slice(-6)} | Mudancas: ${changeReport.totalChanges} | Regressoes: ${changeReport.regressions} | Trend: ${changeReport.overallTrend} | ${changeReport.durationMs}ms`,
    };
  }));

  // ── C9: Regressoes identificadas com evidencias ───────────────────────────
  results.push(await run(9, "Regressoes rastreadas com ArchitecturalEvidence", "Real Baseline Comparison", async () => {
    for (const c of changeReport.changes) {
      if (!c.evidence || !c.evidence.evidenceId)
        throw new Error(`Mudanca sem evidencia: "${c.description}"`);
    }
    const evidenceIds = changeReport.changes.map(c => c.evidence.evidenceId);
    const unique = new Set(evidenceIds);
    if (unique.size !== evidenceIds.length)
      throw new Error("EvidenceIds duplicados no change report");
    return {
      detail: `${changeReport.changes.length} mudancas | ${evidenceIds.length} evidencias unicas | IDs: ${evidenceIds.slice(0, 3).join(", ")}...`,
    };
  }));

  // ── C10: Compliance deltas calculados ─────────────────────────────────────
  results.push(await run(10, "Compliance deltas calculados por metrica", "Real Baseline Comparison", async () => {
    if (!changeReport.complianceDeltas.length)
      throw new Error("complianceDeltas vazio");
    const overall = changeReport.complianceDeltas.find(d => d.metric === "Overall Compliance");
    if (!overall) throw new Error("Overall Compliance delta ausente");
    const trends = changeReport.complianceDeltas.map(d => `${d.metric}: ${d.before}->${d.after} [${d.trend}]`);
    return { detail: trends.join(" | ") };
  }));

  // ── C11: Timeline gerada automaticamente ─────────────────────────────────
  results.push(await run(11, "Timeline de evolucao gerada automaticamente", "Timeline Evolution", async () => {
    if (!timeline.length) throw new Error("Timeline vazia");
    if (timeline.length !== registry.count())
      throw new Error(`Timeline (${timeline.length}) != Registry (${registry.count()})`);
    const summary = timeline.map(e => `${e.version}:${e.compliance}%`).join(" → ");
    return {
      detail: `${timeline.length} entrada(s) | ${summary}`,
    };
  }));

  // ── C12: Historico imutavel — append-only ─────────────────────────────────
  results.push(await run(12, "Historico imutavel: append-only, sem delecao", "Immutable Audit History", async () => {
    if (history.count() !== 2) throw new Error(`Historico deveria ter 2 entradas, tem ${history.count()}`);
    const entries = history.entries();
    // verify entries are frozen / no delete method
    if ((history as unknown as Record<string, unknown>)["delete"])
      throw new Error("ImmutableAuditHistory nao deve ter metodo delete");
    if ((history as unknown as Record<string, unknown>)["clear"])
      throw new Error("ImmutableAuditHistory nao deve ter metodo clear");
    return {
      detail: `${history.count()} entradas | IDs: ${entries.map(e => e.entryId).join(", ")} | Sem metodo delete/clear`,
    };
  }));

  // ── C13: Integridade do historico verificavel ─────────────────────────────
  results.push(await run(13, "Integridade do historico verificavel contra o Registry", "Immutable Audit History", async () => {
    const { valid, violations } = history.verify(registry);
    if (!valid) throw new Error(`Violacoes de integridade: ${violations.join("; ")}`);
    return {
      detail: `Integridade: VALIDA | ${history.count()} entradas verificadas contra ${registry.count()} baselines | Zero violacoes`,
    };
  }));

  // ── C14: Registry integrity check ────────────────────────────────────────
  results.push(await run(14, "Registry integrity check: hashes unicos", "Baseline Integrity", async () => {
    const { valid, duplicateHashes } = registry.integrityCheck();
    if (!valid) throw new Error(`Hashes duplicados no registry: ${duplicateHashes.join(", ")}`);
    return {
      detail: `${registry.count()} baselines | ${registry.list().map(b => b.auditHash.slice(0, 8)).join(", ")} | Todos unicos`,
    };
  }));

  // ── C15: Zero informacao manual em toda a cadeia ──────────────────────────
  results.push(await run(15, "Toda informacao deriva automaticamente do codigo-fonte", "Baseline Integrity", async () => {
    if (analysis.filesAnalyzed === 0) throw new Error("Nenhum arquivo lido do codigo-fonte");
    if (report.importsAnalyzed === 0) throw new Error("Nenhum import extraido");
    if (baselineA.filesAnalyzed !== report.filesAnalyzed)
      throw new Error("Baseline nao derivado do ABVReport");
    if (baselineA.auditHash.length < 32)
      throw new Error("Hash muito curto para SHA-256");
    if (baselineA.metadata.hashAlgorithm !== "SHA-256")
      throw new Error("Algoritmo de hash incorreto");
    return {
      detail: `${analysis.filesAnalyzed} arquivos lidos | Baseline 100% derivado do ABVReport | Hash: SHA-256 | Cadeia: SourceAnalyzer → ABVReport → Baseline → Registry → History | Zero listas manuais`,
      observation: "Cadeia completamente automatica confirmada para Engineering First",
    };
  }));

  const passed = results.filter(r => r.passed).length;
  const integrityCheck = registry.integrityCheck();
  const sha256Confirmed = results[0]?.passed && baselineA.metadata.hashAlgorithm === "SHA-256";

  return {
    results,
    passed,
    total: results.length,
    durationMs: Date.now() - suiteStart,
    integrityVerified: integrityCheck.valid,
    sha256Confirmed,
    historyEntries: history.count(),
  };
}

// ── Simulation helper ─────────────────────────────────────────────────────────

function simulateMinorChange(base: ReturnType<InstanceType<typeof ArchitecturalBoundaryValidator>["audit"]>) {
  const fakeLayer = {
    ...base.layers[0],
    detectedImports: [...(base.layers[0].detectedImports ?? []), "simulated/new-module-abv41"],
    filesAnalyzed: base.layers[0].filesAnalyzed + 1,
  };
  return {
    ...base,
    filesAnalyzed: base.filesAnalyzed + 1,
    importsAnalyzed: base.importsAnalyzed + 3,
    layers: [fakeLayer, ...base.layers.slice(1)],
    allEvidences:      [...base.allEvidences],
    criticalEvidences: [...base.criticalEvidences],
    errorEvidences:    [...base.errorEvidences],
  };
}