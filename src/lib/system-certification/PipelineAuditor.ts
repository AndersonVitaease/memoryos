/**
 * PipelineAuditor.ts — Sprint EF-55.1
 *
 * TEST 2: Pipeline Trace — reconstruído integralmente a partir dos artefatos REAIS.
 * PROIBIDO: steps.push(traceStep(...)) com dados fabricados.
 * OBRIGATÓRIO: cada etapa capturada pelo RuntimeTraceCollector.
 */

import type { AuditResult, AuditCheck, AuditStatus, PipelineTrace, PipelineTraceStep } from "./SCTypes";
import { makeSCId } from "./SCTypes";
import { RuntimeTraceCollector } from "./runtime/RuntimeTraceCollector";
import type { PipelineStepSnapshot } from "./runtime/PipelineSnapshot";

function snapshotToTraceStep(s: PipelineStepSnapshot): PipelineTraceStep {
  return Object.freeze({
    id:            s.artifactId,           // real engine ID — not fabricated
    stage:         s.stage,
    startedAt:     s.capturedAt,
    durationMs:    s.durationMs,
    status:        s.status === "present" ? "pass" : "fail" as AuditStatus,
    inputSummary:  s.inputHash,
    outputSummary: s.outputHash,
    metrics:       Object.fromEntries(
      Object.entries(s.metrics).map(([k, v]) => [k, typeof v === "number" ? v : 0])
    ) as Record<string, number>,
    trace:         Object.freeze([`stage=${s.stage}`, `id=${s.artifactId.slice(-14)}`, `captured=${s.capturedAt}`]),
  });
}

export class PipelineAuditor {
  private readonly _tracer = new RuntimeTraceCollector();

  async audit(goal = "pipeline_integrity_test"): Promise<{ result: AuditResult; trace: PipelineTrace }> {
    const t0 = Date.now();
    const checks: AuditCheck[] = [];

    let steps: PipelineTraceStep[] = [];

    try {
      // ── Real runtime execution — no synthetic steps ───────────────────────
      const snap = await this._tracer.collect({
        goal, intent: "validate", context: "pipeline_audit",
        strategy: "direct_connector", capabilities: ["repository.read"],
        connectors: ["github"], confidence: 0.85, authority: 0.80,
        durationMs: 500, success: true, episodeCount: 12,
      });

      // Convert real PipelineStepSnapshots → PipelineTraceSteps
      steps = snap.steps.map(snapshotToTraceStep);

      // Validate: all steps have real IDs
      const syntheticIds = steps.filter(s => s.id.startsWith("ts_") || s.id.length < 5);
      checks.push(Object.freeze({
        id: makeSCId("chk"), name: "Pipeline: All IDs From Runtime",
        description: "No step may use a synthetic ID — all IDs must come from real engines.",
        status: syntheticIds.length === 0 ? "pass" : "fail" as AuditStatus,
        score: syntheticIds.length === 0 ? 100 : 0,
        durationMs: Date.now() - t0,
        evidence: steps.map(s => `${s.stage}=${s.id.slice(-12)}`),
        issues: syntheticIds.map(s => `Synthetic ID at stage: ${s.stage}`),
      }));

      // Validate: pipeline completeness
      const requiredStages = ["learning", "knowledge_store", "reasoning", "optimization", "meta_cognition"];
      const capturedStages = steps.map(s => s.stage);
      const missing = requiredStages.filter(s => !capturedStages.includes(s));
      checks.push(Object.freeze({
        id: makeSCId("chk"), name: "Pipeline: No Missing Stages",
        description: "Every required stage must be present in the runtime trace.",
        status: missing.length === 0 ? "pass" : "fail" as AuditStatus,
        score: missing.length === 0 ? 100 : Math.max(0, 100 - missing.length * 20),
        durationMs: 0,
        evidence: [`capturedStages=${capturedStages.join(",")}`],
        issues: missing.map(s => `Stage not captured: ${s}`),
      }));

      // Validate: no missing artifacts
      const missingArtifacts = snap.missingStages;
      checks.push(Object.freeze({
        id: makeSCId("chk"), name: "Pipeline: No Missing Artifacts",
        description: "No engine artifact may be missing from the snapshot.",
        status: missingArtifacts.length === 0 ? "pass" : "fail" as AuditStatus,
        score: missingArtifacts.length === 0 ? 100 : 0,
        durationMs: 0,
        evidence: [`allPresent=${snap.allPresent}`],
        issues: [...missingArtifacts].map(s => `Missing artifact at stage: ${s}`),
      }));

      // Validate: timestamps are monotonically increasing
      let monotonicOk = true;
      for (let i = 1; i < steps.length; i++) {
        if (steps[i].startedAt < steps[i - 1].startedAt) { monotonicOk = false; break; }
      }
      checks.push(Object.freeze({
        id: makeSCId("chk"), name: "Pipeline: Monotonic Timestamps",
        description: "Timestamps must be non-decreasing across pipeline steps.",
        status: monotonicOk ? "pass" : "warn" as AuditStatus,
        score: monotonicOk ? 100 : 70,
        durationMs: 0,
        evidence: steps.map(s => `${s.stage}=${s.startedAt}`),
        issues: monotonicOk ? [] : ["Non-monotonic timestamp detected"],
      }));

      // Validate: connector present when expected
      if (snap.connector) {
        checks.push(Object.freeze({
          id: makeSCId("chk"), name: "Pipeline: Connector Integrity",
          description: "Connector was selected and executed as expected.",
          status: snap.connector.wasExecuted ? "pass" : "warn" as AuditStatus,
          score: snap.connector.wasExecuted ? 100 : 60,
          durationMs: snap.connector.durationMs,
          evidence: [`connector=${snap.connector.connectorName}`, `capability=${snap.connector.capability}`, `result=${snap.connector.result}`],
          issues: snap.connector.wasExecuted ? [] : ["Connector selected but not executed"],
        }));
      }

    } catch (e: unknown) {
      checks.push(Object.freeze({
        id: makeSCId("chk"), name: "Pipeline Trace — Runtime Error",
        description: "Full runtime trace.", status: "fail" as AuditStatus, score: 0,
        durationMs: Date.now() - t0, evidence: [],
        issues: [`${e instanceof Error ? e.message : String(e)}`],
      }));
    }

    const allTraceable = steps.length > 0 && steps.every(s => s.id && s.startedAt > 0);
    const trace: PipelineTrace = Object.freeze({
      id: makeSCId("pt"), goal, runAt: Date.now(),
      totalDurationMs: Date.now() - t0,
      steps: Object.freeze(steps),
      allIdsTraceable: allTraceable,
      status: checks.some(c => c.status === "fail") ? "fail" : "pass" as AuditStatus,
    });

    const passed = checks.filter(c => c.status === "pass").length;
    const failed = checks.filter(c => c.status === "fail").length;
    const warned = checks.filter(c => c.status === "warn").length;
    const score  = checks.length > 0 ? checks.reduce((s, c) => s + c.score, 0) / checks.length : 0;

    return {
      result: Object.freeze({
        id: makeSCId("ar"), auditor: "PipelineAuditor", runAt: Date.now(),
        durationMs: Date.now() - t0, checks: Object.freeze(checks),
        score, passed, failed, warned,
        status: failed > 0 ? "fail" : warned > 0 ? "warn" : "pass" as AuditStatus,
        summary: `Pipeline: ${steps.length} real steps, allTraceable=${allTraceable}`,
      }),
      trace,
    };
  }
}