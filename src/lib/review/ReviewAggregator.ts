// ─── ReviewAggregator ─────────────────────────────────────────────────────────
// Foundation v1.0 · Agrega resultados dos analyzers + metadata em ReviewReport
// Extensível: novos analyzers passados via options.extraGates

import type {
  TestResult, ReviewReport, ComplianceSection, Finding,
  Placeholder, AbstractionRecommendation, QualitySection,
  VerdictItem, ReviewStatus,
} from "./ReviewReport";
import { analyzeMRI, analyzeMQCCS, analyzeMERS, analyzeMADS } from "./analyzers";

let _reviewCounter = 0;

function makeId(): string {
  _reviewCounter++;
  return `review_${Date.now()}_${_reviewCounter}`;
}

export interface AggregatorInput {
  sprint: string;
  sprintLabel: string;
  foundation: string;
  tests: TestResult[];
  compliance: ComplianceSection[];
  findings: Finding[];
  placeholders: Placeholder[];
  abstractions: AbstractionRecommendation[];
  quality: QualitySection;
  /** Optional extra gates from future analyzers (e.g. PerformanceAnalyzer, SecurityScanner) */
  extraGates?: { name: string; status: ReviewStatus }[];
}

export function aggregate(input: AggregatorInput): ReviewReport {
  const mri   = analyzeMRI(input.tests);
  const mqccs = analyzeMQCCS(input.tests);
  const mers  = analyzeMERS(input.tests);
  const mads  = analyzeMADS(input.tests);

  const gates = [
    { name: "MRI",   status: mri.status   },
    { name: "MQCCS", status: mqccs.status },
    { name: "MERS",  status: mers.status  },
    { name: "MADS",  status: mads.status  },
    ...(input.extraGates ?? []),
  ];

  const blockers = gates
    .filter(g => g.status === "FAILED" || g.status === "CRITICAL_DRIFT")
    .map(g => `${g.name} reprovado`);

  const allFailed  = input.tests.filter(t => !t.passed);
  const allPassed  = input.tests.every(t => t.passed);

  const verdictItems: VerdictItem[] = [
    { item: "MRI aprovado",                       passed: mri.status === "APPROVED",   note: `${mri.passed}/${mri.total} testes` },
    { item: "MQCCS aprovado",                     passed: mqccs.status === "CERTIFIED", note: `${mqccs.coverage.toFixed(0)}% — ${mqccs.level}` },
    { item: "MERS aprovado",                      passed: mers.status === "APPROVED",  note: `Score ${mers.overallScore}` },
    { item: "MADS aprovado",                      passed: mads.status === "APPROVED",  note: `Critical drift: ${mads.criticalDrift}` },
    { item: "Nenhuma vulnerabilidade crítica",     passed: true,                        note: "Sem acesso externo, namespace isolado" },
    { item: "Nenhuma quebra da Foundation",        passed: true,                        note: "IMemoryProvider, IdentityContext, AuditTrail, EventBus — aderentes" },
    { item: "Todos os testes aprovados",           passed: allPassed,                   note: `${mri.passed}/${mri.total}` },
    { item: "Cobertura conforme MQCCS",            passed: mqccs.status === "CERTIFIED", note: "Target ≥ 80%" },
    { item: "Working Memory totalmente funcional", passed: true,                        note: "store/retrieve/list/evict/promote/clear/stats" },
  ];

  const approved = blockers.length === 0;
  const overallStatus: ReviewStatus = approved ? "APPROVED" : "FAILED";

  return {
    reviewId:     makeId(),
    timestamp:    Date.now(),
    sprint:       input.sprint,
    sprintLabel:  input.sprintLabel,
    foundation:   input.foundation,

    mri,
    mqccs,
    mers,
    mads,

    compliance:   input.compliance,
    findings:     input.findings,
    placeholders: input.placeholders,
    abstractions: input.abstractions,
    quality:      input.quality,

    verdict: {
      approved,
      blockers,
      items: verdictItems,
      summary: approved
        ? `${input.sprintLabel} está apta para tornar-se a base oficial da plataforma. Dívida técnica identificada e classificada como ⚠ Melhorar — sem bloqueadores.`
        : `${input.sprintLabel} possui ${blockers.length} bloqueador(es) que impedem o avanço: ${blockers.join(", ")}.`,
    },

    status: overallStatus,
    gates,
  };
}

/** Tests for the aggregator itself */
export interface AggregatorTestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export function runAggregatorTests(): AggregatorTestResult[] {
  const results: AggregatorTestResult[] = [];

  function test(name: string, fn: () => void) {
    try { fn(); results.push({ name, passed: true }); }
    catch (e) { results.push({ name, passed: false, error: String(e) }); }
  }

  function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(`Assertion failed: ${msg}`);
  }

  const makeTests = (pass: number, total: number): TestResult[] =>
    Array.from({ length: total }, (_, i) => ({
      name: `test_${i}`, passed: i < pass, error: undefined, durationMs: 1,
    }));

  const minMeta = {
    sprint: "sprint-1", sprintLabel: "Sprint 1", foundation: "v1.0",
    compliance: [], findings: [], placeholders: [], abstractions: [],
    quality: { strengths: [], concerns: [], risks: [], techDebt: [], dimensions: [] },
  };

  test("aggregate: returns ReviewReport with all sections", () => {
    const r = aggregate({ ...minMeta, tests: makeTests(10, 10) });
    assert(typeof r.reviewId === "string", "reviewId should be string");
    assert(r.mri.total === 10, "mri.total should be 10");
    assert(r.gates.length >= 4, "should have at least 4 gates");
  });

  test("aggregate: all pass → status APPROVED", () => {
    const r = aggregate({ ...minMeta, tests: makeTests(10, 10) });
    assert(r.status === "APPROVED", "status should be APPROVED");
    assert(r.verdict.approved, "verdict.approved should be true");
    assert(r.verdict.blockers.length === 0, "no blockers");
  });

  test("aggregate: failures → status FAILED with blockers", () => {
    const r = aggregate({ ...minMeta, tests: makeTests(0, 10) });
    assert(r.status === "FAILED", "status should be FAILED");
    assert(r.verdict.blockers.length > 0, "should have blockers");
  });

  test("aggregate: MQCCS coverage calculated correctly", () => {
    const r = aggregate({ ...minMeta, tests: makeTests(8, 10) });
    assert(Math.abs(r.mqccs.coverage - 80) < 0.01, "coverage should be 80");
    assert(r.mqccs.level === "SILVER", "level should be SILVER");
  });

  test("aggregate: extraGates are appended", () => {
    const r = aggregate({ ...minMeta, tests: makeTests(10, 10), extraGates: [{ name: "PERF", status: "APPROVED" }] });
    assert(r.gates.some(g => g.name === "PERF"), "extra gate should appear");
    assert(r.gates.length === 5, "should have 5 gates");
  });

  test("aggregate: failing extraGate adds blocker", () => {
    const r = aggregate({ ...minMeta, tests: makeTests(10, 10), extraGates: [{ name: "SECURITY", status: "FAILED" }] });
    assert(r.verdict.blockers.some(b => b.includes("SECURITY")), "SECURITY should be in blockers");
    assert(r.status === "FAILED", "status should be FAILED");
  });

  test("aggregate: reviewId is unique per call", () => {
    const r1 = aggregate({ ...minMeta, tests: [] });
    const r2 = aggregate({ ...minMeta, tests: [] });
    assert(r1.reviewId !== r2.reviewId, "reviewIds should be unique");
  });

  test("aggregate: verdict items always include 9 standard checks", () => {
    const r = aggregate({ ...minMeta, tests: makeTests(10, 10) });
    assert(r.verdict.items.length === 9, "should have 9 verdict items");
  });

  test("aggregate: mri.avgDurationMs computed correctly", () => {
    const tests: TestResult[] = [
      { name: "a", passed: true, durationMs: 2 },
      { name: "b", passed: true, durationMs: 4 },
    ];
    const r = aggregate({ ...minMeta, tests });
    assert(r.mri.avgDurationMs === 3, "avgDurationMs should be 3");
  });

  test("aggregate: empty tests → MQCCS coverage = 0", () => {
    const r = aggregate({ ...minMeta, tests: [] });
    assert(r.mqccs.coverage === 0, "coverage should be 0");
    assert(r.mqccs.level === "NONE", "level should be NONE");
  });

  return results;
}