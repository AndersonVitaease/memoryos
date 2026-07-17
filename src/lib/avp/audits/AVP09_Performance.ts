// ══════════════════════════════════════════════════════════════════════════════
// AVP-09 — Performance Certification
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding, makeChain, inp } from "../AVPHelpers";

// Engineering limits (in-browser JS — no real network, all synchronous runtimes)
const LIMITS = {
  singleExecutionMs:   500,   // single execution < 500ms
  batchAvgMs:          200,   // batch average < 200ms per exec
  explainabilityMs:    50,    // explainability overhead < 50ms
  auditMs:             50,    // audit overhead < 50ms
  memoryBaselineKB:    50,    // pipeline memory overhead < 50KB estimated
};

export async function runAVP09(): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-09", "Performance Certification");

  // ── Latency: single execution ─────────────────────────────────────────────
  {
    const chain = makeChain("avp09-latency");
    const t0 = Date.now();
    const r  = await chain.execute(inp("latency test", "sess-lat"));
    const ms = Date.now() - t0;
    a.metrics["singleExecutionMs"] = ms;
    if (ms > LIMITS.singleExecutionMs) {
      finding(a, "HIGH", "Latency", `Single execution took ${ms}ms — limit is ${LIMITS.singleExecutionMs}ms`);
      a.score -= 15;
    }
    // Pipeline duration from report
    const pipelineMs = r.totalDurationMs ?? ms;
    a.metrics["pipelineDurationMs"] = pipelineMs;
  }

  // ── Batch throughput ──────────────────────────────────────────────────────
  {
    const BATCH = 50;
    const chain = makeChain("avp09-batch");
    const t0 = Date.now();
    await Promise.all(
      Array.from({ length: BATCH }, (_, i) => chain.execute(inp(`batch perf ${i}`, `sess-b-${i}`)))
    );
    const totalMs = Date.now() - t0;
    const avgMs   = totalMs / BATCH;
    a.metrics["batchSize"]    = BATCH;
    a.metrics["batchTotalMs"] = totalMs;
    a.metrics["batchAvgMs"]   = Math.round(avgMs);
    if (avgMs > LIMITS.batchAvgMs) {
      finding(a, "HIGH", "Throughput", `Batch avg ${avgMs.toFixed(1)}ms/exec — limit is ${LIMITS.batchAvgMs}ms`);
      a.score -= 10;
    }
  }

  // ── Connector overhead ────────────────────────────────────────────────────
  {
    const chain = makeChain("avp09-connector");
    const t0 = Date.now();
    await chain.execute(inp("Send email to team@corp.com about project update", "sess-conn"));
    const ms = Date.now() - t0;
    a.metrics["connectorOverheadMs"] = ms;
    // Connector path should not add excessive overhead over baseline
    if (ms > LIMITS.singleExecutionMs * 1.5) {
      finding(a, "MEDIUM", "ConnectorOverhead", `Connector path took ${ms}ms — 1.5x limit exceeded`);
      a.score -= 8;
    }
  }

  // ── Explainability overhead ───────────────────────────────────────────────
  {
    const chain = makeChain("avp09-explainability");
    const r = await chain.execute(inp("explain overhead", "sess-ex"));
    // Stage durations — find EXPLAINABILITY stage
    const exStage = r.stages.find(s => s.stage === "EXPLAINABILITY");
    const exMs    = exStage?.durationMs ?? 0;
    a.metrics["explainabilityStageMs"] = exMs;
    if (exMs > LIMITS.explainabilityMs) {
      finding(a, "MEDIUM", "ExplainabilityOverhead", `EXPLAINABILITY stage took ${exMs}ms — limit is ${LIMITS.explainabilityMs}ms`);
      a.score -= 5;
    }
  }

  // ── Audit overhead ────────────────────────────────────────────────────────
  {
    const chain = makeChain("avp09-audit");
    const r = await chain.execute(inp("audit overhead", "sess-aud"));
    const audStage = r.stages.find(s => s.stage === "AUDIT");
    const audMs    = audStage?.durationMs ?? 0;
    a.metrics["auditStageMs"] = audMs;
    if (audMs > LIMITS.auditMs) {
      finding(a, "MEDIUM", "AuditOverhead", `AUDIT stage took ${audMs}ms — limit is ${LIMITS.auditMs}ms`);
      a.score -= 5;
    }
  }

  // ── Memory: report size stays reasonable ─────────────────────────────────
  {
    const chain = makeChain("avp09-memory");
    const r = await chain.execute(inp("memory size test", "sess-mem"));
    const json   = JSON.stringify(r);
    const sizeKB = Math.round(json.length / 1024 * 10) / 10;
    a.metrics["reportSizeKB"] = sizeKB;
    if (sizeKB > LIMITS.memoryBaselineKB) {
      finding(a, "MEDIUM", "MemoryUsage", `Report size ${sizeKB}KB exceeds ${LIMITS.memoryBaselineKB}KB baseline`);
      a.score -= 5;
    }
  }

  a.metrics["limitsApplied"] = Object.keys(LIMITS).length;
  a.score = Math.max(0, Math.min(100, a.score));
  return finalise(a);
}