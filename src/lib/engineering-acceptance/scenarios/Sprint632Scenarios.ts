/**
 * Sprint632Scenarios.ts — Sprint 6.3.2
 * Self-validation scenarios — EAF validates itself
 */

import type { AcceptanceScenario } from "../AcceptanceScenario";
import { EAF_CRITERIA } from "../AcceptanceCriteria";
import { assert } from "../AcceptanceAssertion";
import { AcceptanceEngine }    from "../AcceptanceEngine";
import { AcceptanceRegistry }  from "../AcceptanceRegistry";
import { AcceptanceRunner }    from "../AcceptanceRunner";
import { AcceptanceValidator } from "../AcceptanceValidator";
import { AcceptanceReporter }  from "../AcceptanceReporter";
import { AcceptanceHistory }   from "../AcceptanceHistory";
import { AcceptanceMetrics }   from "../AcceptanceMetrics";
import { AcceptanceAudit }     from "../AcceptanceAudit";
import { AcceptanceEvidenceStore } from "../AcceptanceEvidence";
import { buildCriteria } from "../AcceptanceCriteria";

export function buildScenarios632(): AcceptanceScenario[] {
  const [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9] = EAF_CRITERIA;

  return [
    {
      criterion: c0, // AcceptanceEngine initializes
      run: async () => {
        const engine = new AcceptanceEngine();
        const ok = typeof engine.runSprint === "function" && typeof engine.dashboardState === "function";
        return assert.fromBoolean(ok, "AcceptanceEngine API callable", "AcceptanceEngine missing methods");
      },
    },
    {
      criterion: c1, // Registry
      run: async () => {
        const reg = new AcceptanceRegistry();
        const criteria = buildCriteria([{ desc: "test criterion", cat: "SMOKE" }]);
        reg.register("test_sprint", "test objective", criteria);
        const ok = reg.has("test_sprint") && reg.count() === 1;
        return assert.fromBoolean(ok, `Registry stored sprint — count=${reg.count()}`, "Registry store/retrieve failed");
      },
    },
    {
      criterion: c2, // Runner executes pipeline stages
      run: async () => {
        const runner = new AcceptanceRunner();
        const reg    = new AcceptanceRegistry();
        const crit   = buildCriteria([{ desc: "smoke test", cat: "SMOKE" }]);
        reg.register("runner_test", "runner test", crit);
        reg.bindScenarios("runner_test", [{
          criterion: crit[0],
          run: async () => ({ status: "PASS" as const, detail: "ok" }),
        }]);
        const result = await runner.run("runner_test", reg);
        const ok = result.passed === 1 && result.failed === 0;
        return {
          ...assert.fromBoolean(ok, `Runner completed — passed=${result.passed}`, `passed=${result.passed} failed=${result.failed}`),
          evidence: [{ kind: "DURATION" as const, label: "runner-duration", value: result.durationMs }],
        };
      },
    },
    {
      criterion: c3, // Assertions PASS/FAIL/SKIP/BLOCKED
      run: async () => {
        const { assert: a } = await import("../AcceptanceAssertion");
        const p = a.pass("ok");
        const f = a.fail("nope");
        const s = a.skip("skip reason");
        const b = a.blocked("blocked reason");
        const ok = p.status === "PASS" && f.status === "FAIL" && s.status === "SKIP" && b.status === "BLOCKED";
        return assert.fromBoolean(ok, "All 4 assertion statuses work", `Got unexpected statuses: ${p.status}/${f.status}/${s.status}/${b.status}`);
      },
    },
    {
      criterion: c4, // Evidence
      run: async () => {
        const store = new AcceptanceEvidenceStore();
        store.capture("crit_001", "LOG", "test log", "hello world");
        store.capture("crit_001", "METRIC", "count", 42);
        const entries = store.forCriterion("crit_001");
        const ok = entries.length === 2;
        return {
          ...assert.fromBoolean(ok, `Evidence stored: ${entries.length} entries`, `Expected 2, got ${entries.length}`),
          evidence: [{ kind: "METRIC" as const, label: "evidence-count", value: store.count() }],
        };
      },
    },
    {
      criterion: c5, // Validator blocks READY on FAIL
      run: async () => {
        const validator = new AcceptanceValidator();
        const crit = buildCriteria([
          { desc: "mandatory pass", cat: "SMOKE" },
          { desc: "mandatory fail", cat: "SMOKE" },
        ]);
        const assertions = [
          { criterionId: crit[0].id, description: crit[0].description, category: crit[0].category as any, status: "PASS" as const, detail: "ok", durationMs: 1, evidence: [] },
          { criterionId: crit[1].id, description: crit[1].description, category: crit[1].category as any, status: "FAIL" as const, detail: "nope", durationMs: 1, evidence: [] },
        ];
        const result = validator.validate(assertions, crit);
        return assert.fromBoolean(!result.ready && result.blockers.length > 0, "Validator correctly blocked READY on FAIL", "Validator did not block READY");
      },
    },
    {
      criterion: c6, // Reporter generates report
      run: async () => {
        const reporter = new AcceptanceReporter();
        const fakeRun = {
          id: "test_run", sprintId: "6.3.2", startedAt: Date.now(), completedAt: Date.now(),
          durationMs: 100, status: "PASS" as const, assertions: [], passed: 0, failed: 0,
          skipped: 0, blocked: 0, total: 0, score: 100, ready: true, confidence: 100,
          blockers: [], reportId: "rpt_test",
        };
        const report = reporter.generate(fakeRun);
        const ok = !!report.id && report.ready && typeof report.summary === "string";
        return assert.fromBoolean(ok, `Report generated: ${report.id}`, "Report missing required fields");
      },
    },
    {
      criterion: c7, // History append-only
      run: async () => {
        const history = new AcceptanceHistory();
        const fakeRun = {
          id: "h1", sprintId: "6.3.2", startedAt: Date.now(), completedAt: Date.now(),
          durationMs: 50, status: "PASS" as const, assertions: [], passed: 1, failed: 0,
          skipped: 0, blocked: 0, total: 1, score: 100, ready: true, confidence: 100,
          blockers: [], reportId: "r1",
        };
        history.addRun(fakeRun);
        const before = history.runCount();
        const fakeRun2 = { ...fakeRun, id: "h2" };
        history.addRun(fakeRun2);
        const after = history.runCount();
        return assert.fromBoolean(after === before + 1, `History grew: ${before} → ${after}`, "History count did not grow");
      },
    },
    {
      criterion: c8, // Metrics
      run: async () => {
        const metrics = new AcceptanceMetrics();
        metrics.recordRun(200, 100, 100, true);
        metrics.recordRun(300, 80, 90, false);
        const snap = metrics.snapshot();
        const ok = snap.totalRuns === 2 && snap.passRate === 50;
        return {
          ...assert.fromBoolean(ok, `Metrics: runs=2 passRate=50%`, `runs=${snap.totalRuns} passRate=${snap.passRate}`),
          evidence: [{ kind: "METRIC" as const, label: "metrics-snapshot", value: snap }],
        };
      },
    },
    {
      criterion: c9, // Audit
      run: async () => {
        const audit = new AcceptanceAudit();
        audit.record("6.3.2", "run_001", "AcceptanceEngine", "RUN_STARTED", "RUNNING", "test");
        const before = audit.count();
        audit.record("6.3.2", "run_001", "AcceptanceEngine", "RUN_COMPLETED", "PASS", "done");
        const after = audit.count();
        return assert.fromBoolean(after === before + 1, `Audit grew: ${before} → ${after}`, "Audit did not grow");
      },
    },
  ];
}