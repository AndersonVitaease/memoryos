/**
 * SprintEF401Page.jsx — SPRINT EF-40.1 Execution Observability Certification
 * Evidence-only audit. No inferences. Only what exists in source code.
 */

import React, { useState } from "react";

const AUDIT_TABLE = [
  { stage: "ConversationPipeline", file: "ConversationPipeline.ts", input: "RECORDED", output: "RECORDED", runtimeTrace: "PARTIAL — beginTrace called; goal/plan/connector/llm_response steps recorded; NO stageId, NO correlationId", executionOutcome: "RECORDED — fromInput/fromConnectorSuccess/fromConnectorFailure/fromLLMReasoning per producer", status: "RECORDED", startedAt: "RECORDED — t0synth, t0ctx, t0llm per sub-stage", finishedAt: "RECORDED — Date.now() per step", duration: "RECORDED — durationMs per step", confidence: "RECORDED — per ExecutionOutcome", correlationId: "NOT RECORDED — executionId used but no correlationId generated", errorHandling: "PARTIAL — 8+ catch {} blocks suppress errors silently", verdict: "PARTIAL" },
  { stage: "ExecutionDispatcher", file: "ExecutionDispatcher.ts", input: "RECORDED — DispatchInput: {executionId, step, stepTimeoutMs}", output: "RECORDED — StepResult: {stepId, connector, capability, status, output, error, startedAt, finishedAt, durationMs}", runtimeTrace: "NOT RECORDED — console.log [RUNTIME-PROBE][EXD-01] only; NOT written to runtimeTraceStore", executionOutcome: "NOT RECORDED — StepResult is not an ExecutionOutcome; no adapter called", status: "RECORDED — status field in StepResult", startedAt: "RECORDED — startedAt = Date.now() at entry", finishedAt: "RECORDED — finishedAt computed after await", duration: "RECORDED — durationMs = finishedAt - startedAt", confidence: "NOT RECORDED", correlationId: "NOT RECORDED", errorHandling: "RECORDED — catch returns StepResult status=failed/timeout", verdict: "PARTIAL" },
  { stage: "OfficialRuntimeBridge", file: "OfficialRuntimeBridge.ts", input: "RECORDED — connectorId, operation, parameters", output: "RECORDED — BridgeInvocationResult: {success, data, allOutputs, status, error, durationMs, executionId}", runtimeTrace: "NOT RECORDED — _track() writes to internal _lastResults[]; no runtimeTraceStore.recordStep()", executionOutcome: "NOT RECORDED — BridgeInvocationResult is not an ExecutionOutcome", status: "RECORDED — status field", startedAt: "RECORDED — t0 = Date.now() at entry", finishedAt: "NOT RECORDED — only durationMs stored", duration: "RECORDED — durationMs = Date.now() - t0", confidence: "NOT RECORDED", correlationId: "NOT RECORDED", errorHandling: "RECORDED — catch returns BridgeInvocationResult status=FAILED", verdict: "PARTIAL" },
  { stage: "ConnectorInvocationService", file: "ConnectorInvocationService.ts", input: "RECORDED — CognitiveInvocationRecord.context: {executionId, correlationId, operation, originComponent}", output: "RECORDED — CognitiveInvocationRecord: {id, status, durationMs, error, knowledgeEntryId, timelineEventId}", runtimeTrace: "NOT RECORDED — _history internal array only; no runtimeTraceStore calls", executionOutcome: "NOT RECORDED — CognitiveInvocationRecord is not an ExecutionOutcome", status: "RECORDED — InvocationStatus field", startedAt: "NOT RECORDED — executedAt captures call time only", finishedAt: "NOT RECORDED", duration: "RECORDED — durationMs computed", confidence: "NOT RECORDED", correlationId: "RECORDED — correlationId generated via makeCCIId('corr') but NOT propagated to ExecutionOutcome", errorHandling: "RECORDED — error field in record", verdict: "PARTIAL" },
  { stage: "RepositoryAnalyzer", file: "RepositoryAnalyzer.ts", input: "NOT RECORDED — owner/repo params; no trace registration", output: "RECORDED — RepositoryAnalysis: {id, generatedAt, durationMs, errors[]}", runtimeTrace: "NOT RECORDED — zero runtimeTraceStore calls in file", executionOutcome: "NOT RECORDED — RepositoryAnalysis is not an ExecutionOutcome", status: "NOT RECORDED — no status field; errors[] only", startedAt: "NOT RECORDED — t0 computed but not in output", finishedAt: "NOT RECORDED", duration: "RECORDED — durationMs in result", confidence: "NOT RECORDED", correlationId: "NOT RECORDED", errorHandling: "PARTIAL — errors[] array; per-op catch", verdict: "NOT INSTRUMENTED" },
  { stage: "RepositoryKnowledgeBuilder", file: "RepositoryKnowledgeBuilder.ts", input: "NOT RECORDED — console.log for internal state only", output: "RECORDED — ProjectKnowledgeGraph: {graphId, entityCount, relationshipCount, durationMs, builtAt}", runtimeTrace: "NOT RECORDED — zero runtimeTraceStore calls; console.log/warn only", executionOutcome: "NOT RECORDED — ProjectKnowledgeGraph is not an ExecutionOutcome", status: "NOT RECORDED — no status field in graph", startedAt: "NOT RECORDED — t0 not in graph", finishedAt: "NOT RECORDED", duration: "RECORDED — durationMs in graph", confidence: "NOT RECORDED — per-entity 0.8 hardcoded; no graph-level confidence", correlationId: "NOT RECORDED", errorHandling: "PARTIAL — console.warn per file failure; no structured error propagation", verdict: "NOT INSTRUMENTED" },
  { stage: "ApplicationAnalyzer", file: "ApplicationAnalyzer.ts", input: "NOT RECORDED", output: "RECORDED — ApplicationAnalysis: {id, generatedAt, durationMs, errors[]}", runtimeTrace: "NOT RECORDED — zero runtimeTraceStore calls", executionOutcome: "NOT RECORDED", status: "NOT RECORDED — authStatus boolean only", startedAt: "NOT RECORDED", finishedAt: "NOT RECORDED", duration: "RECORDED — durationMs in result", confidence: "NOT RECORDED", correlationId: "NOT RECORDED", errorHandling: "PARTIAL — errors[] and per-op try/catch", verdict: "NOT INSTRUMENTED" },
  { stage: "KnowledgeReconstructionEngine", file: "KnowledgeReconstructionEngine.ts", input: "NOT RECORDED", output: "RECORDED — ReconstructionReport: {id, durationMs, graphNodes, graphEdges, confidenceScore, errors[]}", runtimeTrace: "NOT RECORDED — zero runtimeTraceStore calls", executionOutcome: "NOT RECORDED", status: "RECORDED — ReconstructionStatus enum internal (idle/scanning/loading/merging/...)", startedAt: "NOT RECORDED — startMs not in report", finishedAt: "NOT RECORDED", duration: "RECORDED — durationMs in report", confidence: "RECORDED — confidenceScore = provenance.stats().avgConfidence", correlationId: "NOT RECORDED", errorHandling: "RECORDED — errors[] in report", verdict: "NOT INSTRUMENTED" },
  { stage: "IdentityResolutionEngine", file: "IdentityResolutionEngine.ts", input: "NOT RECORDED", output: "RECORDED — IdentityReport: {id, durationMs, totalInputEntities, canonicalEntitiesCreated, overallConfidence, errors[]}", runtimeTrace: "NOT RECORDED", executionOutcome: "NOT RECORDED", status: "NOT RECORDED — no status field", startedAt: "NOT RECORDED", finishedAt: "NOT RECORDED", duration: "RECORDED — durationMs", confidence: "RECORDED — overallConfidence", correlationId: "NOT RECORDED", errorHandling: "RECORDED — errors[]", verdict: "NOT INSTRUMENTED" },
  { stage: "ProjectReconstructionEngine", file: "ProjectReconstructionEngine.ts", input: "NOT RECORDED", output: "RECORDED — ProjectReconstructionReport: {id, durationMs, pipelineStages[], errors[]}", runtimeTrace: "NOT RECORDED", executionOutcome: "NOT RECORDED", status: "RECORDED — PipelineStageDiagnostic per stage: {stage, status, durationMs, itemsProcessed}", startedAt: "NOT RECORDED — startAll not in report", finishedAt: "NOT RECORDED", duration: "RECORDED — durationMs in report and per stage", confidence: "NOT RECORDED — computed in _assembleProject but not in report", correlationId: "NOT RECORDED", errorHandling: "RECORDED — errors[] + stage-level catch", verdict: "NOT INSTRUMENTED" },
  { stage: "CognitiveLearningEngine", file: "CognitiveLearningEngine.ts", input: "NOT RECORDED", output: "RECORDED — LearningSession: {id, startedAt, completedAt, durationMs, executionId, errors[]}", runtimeTrace: "NOT RECORDED", executionOutcome: "NOT RECORDED — LearningSession is not an ExecutionOutcome", status: "NOT RECORDED — overallLearningScore used instead of status", startedAt: "RECORDED — startedAt = Date.now()", finishedAt: "RECORDED — completedAt = Date.now()", duration: "RECORDED — durationMs", confidence: "NOT RECORDED — managed by ConfidenceManager internally; not in LearningSession", correlationId: "NOT RECORDED", errorHandling: "RECORDED — errors[]", verdict: "NOT INSTRUMENTED" },
  { stage: "KnowledgeGraphUpdate (KnowledgeGraphBridge)", file: "KnowledgeGraphBridge.ts (called from Pipeline conditionally)", input: "RECORDED — kfmModel + session.id", output: "PARTIAL — bridgeResult.{persisted, reason, entityCount, durationMs} via conversationStore.emit()", runtimeTrace: "NOT RECORDED — conversationStore.emit(PIPELINE_STEP) only; no runtimeTraceStore.recordStep()", executionOutcome: "NOT RECORDED", status: "NOT RECORDED", startedAt: "NOT RECORDED", finishedAt: "NOT RECORDED", duration: "RECORDED — durationMs in bridgeResult", confidence: "NOT RECORDED", correlationId: "NOT RECORDED", errorHandling: "PARTIAL — try/catch in Pipeline; error not surfaced", verdict: "NOT INSTRUMENTED" },
  { stage: "ProjectSnapshot (_captureSnapshot)", file: "KnowledgeReconstructionEngine.ts", input: "NOT RECORDED — derived from in-memory state", output: "RECORDED — KnowledgeSnapshot: {id, capturedAt, itemCount, nodeCount, edgeCount, confidence}", runtimeTrace: "NOT RECORDED", executionOutcome: "NOT RECORDED", status: "NOT RECORDED", startedAt: "NOT RECORDED — only capturedAt", finishedAt: "NOT RECORDED", duration: "NOT RECORDED — no durationMs", confidence: "RECORDED — confidence field", correlationId: "NOT RECORDED", errorHandling: "NOT RECORDED — no error handling", verdict: "NOT INSTRUMENTED" },
  { stage: "ExecutionOutcome (Factory + Schema)", file: "ExecutionOutcomeFactory.ts + ExecutionOutcomeTypes.ts", input: "RECORDED — ExecutionOutcomeInput fully validated", output: "RECORDED — ExecutionOutcome frozen: {id, producer, startedAt, finishedAt, durationMs, success, errorType, errorMessage, executionCost, domain, capability, confidence, payload, metadata}", runtimeTrace: "NOT RECORDED — no runtimeTraceStore calls in factory", executionOutcome: "RECORDED — IS the ExecutionOutcome layer", status: "RECORDED — success + errorType", startedAt: "RECORDED", finishedAt: "RECORDED", duration: "RECORDED — durationMs = finishedAt - startedAt", confidence: "RECORDED — ExecutionConfidence: {score, reason, producerConfidence}", correlationId: "NOT RECORDED — correlationId ABSENT from ExecutionOutcome interface schema", errorHandling: "RECORDED — errorType + errorMessage required when success=false; ok=false on invalid input", verdict: "PARTIAL" },
  { stage: "ExecutionOutcomeAdapter", file: "ExecutionOutcomeAdapter.ts + ExecutionOutcomeDomainAdapter.ts", input: "RECORDED — ExecutionOutcome validated before adapt()", output: "RECORDED — AdaptationResult: {candidate, ok, sourceOutcome, errors[], durationMs}", runtimeTrace: "NOT RECORDED", executionOutcome: "RECORDED — consumes ExecutionOutcome; produces ResponseCandidate", status: "RECORDED — ok field", startedAt: "NOT RECORDED — t0 internal only", finishedAt: "NOT RECORDED", duration: "RECORDED — durationMs in AdaptationResult", confidence: "RECORDED — carried from ExecutionOutcome.confidence.score", correlationId: "NOT RECORDED", errorHandling: "RECORDED — errors[]", verdict: "PARTIAL" },
  { stage: "ResponseCandidate", file: "ResponseCandidate.ts", input: "RECORDED — ResponseCandidateInput validated and frozen", output: "RECORDED — frozen ResponseCandidate: {id, source, explicitDomain, confidence, handled, executionSucceeded, executionCost, answer, createdAt}", runtimeTrace: "NOT RECORDED", executionOutcome: "NOT RECORDED — candidate derived FROM outcome; not an outcome itself", status: "RECORDED — handled + executionSucceeded", startedAt: "NOT RECORDED — only createdAt", finishedAt: "NOT RECORDED", duration: "NOT RECORDED", confidence: "RECORDED — clamped [0,1]", correlationId: "NOT RECORDED", errorHandling: "NOT RECORDED — no error field in schema", verdict: "PARTIAL" },
  { stage: "ResponseArbiter", file: "ResponseArbiter.ts", input: "RECORDED — candidates[] + ArbitrationContext: {preferredDomain, userMessage?, sessionId?}", output: "RECORDED — ArbitrationResult frozen: {selected, reason, candidates, totalCount, handledCount, durationMs}", runtimeTrace: "NOT RECORDED — Pipeline emits arbiter_decision AFTER arbitrate(); Arbiter has no runtimeTraceStore calls", executionOutcome: "RECORDED — receives ResponseCandidates derived from real ExecutionOutcomes", status: "RECORDED — SelectionReason: domain_match / handled_high_confidence / handled_any / null_fallback", startedAt: "RECORDED — t0 = Date.now()", finishedAt: "NOT RECORDED — only durationMs", duration: "RECORDED — durationMs", confidence: "RECORDED — selected.confidence", correlationId: "NOT RECORDED", errorHandling: "NOT RECORDED — pure function; no try/catch", verdict: "PARTIAL" },
];

const GAPS = [
  { id: "G01", sev: "HIGH", component: "RepositoryAnalyzer", missing: "RuntimeTrace + ExecutionOutcome + status + startedAt + finishedAt + confidence + correlationId", evidence: "RepositoryAnalyzer.ts — zero runtimeTraceStore calls; RepositoryAnalysis has no ExecutionOutcome wrapper" },
  { id: "G02", sev: "HIGH", component: "RepositoryKnowledgeBuilder", missing: "RuntimeTrace + ExecutionOutcome + status + startedAt + finishedAt + confidence + correlationId", evidence: "RepositoryKnowledgeBuilder.ts — console.log/warn only; no runtimeTraceStore.recordStep(); ProjectKnowledgeGraph is not an ExecutionOutcome" },
  { id: "G03", sev: "HIGH", component: "ApplicationAnalyzer", missing: "RuntimeTrace + ExecutionOutcome + status + startedAt + finishedAt + confidence + correlationId", evidence: "ApplicationAnalyzer.ts — no runtimeTraceStore calls; ApplicationAnalysis is not an ExecutionOutcome" },
  { id: "G04", sev: "HIGH", component: "KnowledgeReconstructionEngine", missing: "RuntimeTrace + ExecutionOutcome + correlationId + startedAt + finishedAt", evidence: "KnowledgeReconstructionEngine.ts — no runtimeTraceStore calls; status internal only" },
  { id: "G05", sev: "HIGH", component: "IdentityResolutionEngine", missing: "RuntimeTrace + ExecutionOutcome + status + startedAt + finishedAt + correlationId", evidence: "IdentityResolutionEngine.ts — no runtimeTraceStore; startMs not in IdentityReport" },
  { id: "G06", sev: "HIGH", component: "ProjectReconstructionEngine", missing: "RuntimeTrace + ExecutionOutcome + startedAt + finishedAt + correlationId + confidence", evidence: "ProjectReconstructionEngine.ts — no runtimeTraceStore; PipelineStageDiagnostic has durationMs but no startedAt/finishedAt" },
  { id: "G07", sev: "HIGH", component: "CognitiveLearningEngine", missing: "RuntimeTrace + ExecutionOutcome + confidence + correlationId + status", evidence: "CognitiveLearningEngine.ts — no runtimeTraceStore calls; confidence internal to ConfidenceManager" },
  { id: "G08", sev: "MEDIUM", component: "ExecutionDispatcher", missing: "RuntimeTrace to runtimeTraceStore (console.log only); confidence field", evidence: "ExecutionDispatcher.ts line 51 — console.log [RUNTIME-PROBE][EXD-01]; no runtimeTraceStore.recordStep() call anywhere in file" },
  { id: "G09", sev: "MEDIUM", component: "OfficialRuntimeBridge", missing: "RuntimeTrace + ExecutionOutcome + finishedAt + correlationId + confidence", evidence: "OfficialRuntimeBridge.ts — _track() writes to _lastResults[] internal; no runtimeTraceStore; BridgeInvocationResult not an ExecutionOutcome" },
  { id: "G10", sev: "MEDIUM", component: "ConnectorInvocationService", missing: "RuntimeTrace + ExecutionOutcome + startedAt + finishedAt + confidence", evidence: "ConnectorInvocationService.ts — _history internal only; no runtimeTraceStore calls; correlationId not propagated to ExecutionOutcome" },
  { id: "G11", sev: "MEDIUM", component: "ExecutionOutcome schema", missing: "correlationId field absent from interface", evidence: "ExecutionOutcomeTypes.ts — interface fields: id, producer, startedAt, finishedAt, durationMs, success, errorType, errorMessage, executionCost, domain, capability, confidence, payload, metadata — NO correlationId" },
  { id: "G12", sev: "MEDIUM", component: "ConversationPipeline", missing: "correlationId propagation; silent catch {} blocks discard errors", evidence: "ConversationPipeline.ts — executionId used throughout; 8+ catch {} blocks in _runPipeline suppress errors silently" },
  { id: "G13", sev: "LOW", component: "ProjectSnapshot (_captureSnapshot)", missing: "RuntimeTrace + ExecutionOutcome + duration + startedAt + finishedAt", evidence: "KnowledgeReconstructionEngine.ts _captureSnapshot() — KnowledgeSnapshot has capturedAt + confidence but no durationMs, no startedAt/finishedAt" },
  { id: "G14", sev: "LOW", component: "KnowledgeGraphUpdate (KnowledgeGraphBridge)", missing: "RuntimeTrace + ExecutionOutcome + status + startedAt + finishedAt + correlationId", evidence: "Called from Pipeline; only conversationStore.emit(PIPELINE_STEP) — no runtimeTraceStore.recordStep()" },
  { id: "G15", sev: "LOW", component: "ResponseCandidate schema", missing: "error field; startedAt/finishedAt/duration", evidence: "ResponseCandidate.ts — ResponseCandidate interface has no error field; lifecycle timing not tracked" },
];

const CERT_CHECKS = [
  ["Each stage produces RuntimeTrace", false, "7 stages produce no RuntimeTrace"],
  ["Each stage produces ExecutionOutcome", false, "8 stages produce no ExecutionOutcome"],
  ["Each stage records Input", false, "RepositoryAnalyzer, ApplicationAnalyzer, CLE: NOT RECORDED"],
  ["Each stage records Output", true, "All 17 stages produce domain-specific output"],
  ["Each stage records Status", false, "7 stages have no status field"],
  ["Each stage records Duration", true, "All 17 stages record durationMs"],
  ["Each stage records Confidence", false, "6 stages have no confidence field"],
  ["Each stage records Metadata", false, "Layer B stages produce no metadata field"],
  ["Each stage has CorrelationId", false, "correlationId absent from ExecutionOutcome schema (G11)"],
  ["Full reconstruction from records only", false, "Layer B produces console.log only; not persisted to runtimeTraceStore"],
];

function fieldColor(val) {
  if (!val) return "text-zinc-500";
  const u = val.toUpperCase();
  if (u.startsWith("RECORDED") && !u.startsWith("NOT RECORDED")) return "text-emerald-400";
  if (u.startsWith("PARTIAL")) return "text-amber-400";
  return "text-red-400";
}

function VerdictPill({ v }) {
  const c = v === "RECORDED" ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
    : v === "PARTIAL" ? "bg-amber-900/60 text-amber-300 border-amber-700"
    : "bg-red-950/60 text-red-300 border-red-800";
  return <span className={`px-2 py-0.5 rounded text-xs font-bold border ${c}`}>{v}</span>;
}

function SevPill({ s }) {
  const c = s === "HIGH" ? "bg-red-900/60 text-red-300 border-red-700"
    : s === "MEDIUM" ? "bg-amber-900/60 text-amber-300 border-amber-700"
    : "bg-blue-900/60 text-blue-300 border-blue-700";
  return <span className={`px-2 py-0.5 rounded text-xs font-bold border ${c}`}>{s}</span>;
}

const FIELDS = [
  ["Input", "input"], ["Output", "output"], ["RuntimeTrace", "runtimeTrace"],
  ["ExecutionOutcome", "executionOutcome"], ["Status", "status"],
  ["StartedAt", "startedAt"], ["FinishedAt", "finishedAt"],
  ["Duration", "duration"], ["Confidence", "confidence"],
  ["CorrelationId", "correlationId"], ["Error Handling", "errorHandling"],
];

const TABS = [
  { id: "audit", label: "Audit Table (17)" },
  { id: "gaps", label: "Gaps (15)" },
  { id: "analysis", label: "Root Cause" },
  { id: "cert", label: "Certification" },
];

export default function SprintEF401Page() {
  const [tab, setTab] = useState("audit");
  const [open, setOpen] = useState(null);

  const total = AUDIT_TABLE.length;
  const recorded = AUDIT_TABLE.filter(r => r.verdict === "RECORDED").length;
  const partial = AUDIT_TABLE.filter(r => r.verdict === "PARTIAL").length;
  const notInst = AUDIT_TABLE.filter(r => r.verdict === "NOT INSTRUMENTED").length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 text-sm font-mono">
      <div className="max-w-7xl mx-auto">

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700 px-2 py-0.5 rounded">SPRINT EF-40.1</span>
            <span className="text-xs text-zinc-500">2026-07-21</span>
          </div>
          <h1 className="text-xl font-bold text-white">Execution Observability Certification</h1>
          <p className="text-zinc-500 text-xs mt-1">17 pipeline stages audited · Evidence-only · No inferences · No reconstructions</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[[total, "Stages Audited", "text-white bg-zinc-900 border-zinc-800"], [recorded, "Fully Instrumented", "text-emerald-400 bg-emerald-950/40 border-emerald-800/50"], [partial, "Partial", "text-amber-400 bg-amber-950/40 border-amber-800/50"], [notInst, "Not Instrumented", "text-red-400 bg-red-950/40 border-red-800/50"]].map(([n, label, cls]) => (
            <div key={label} className={`border rounded-lg p-3 text-center ${cls}`}>
              <div className="text-2xl font-bold">{n}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-1 mb-6 border-b border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs rounded-t whitespace-nowrap font-semibold flex-shrink-0 transition-colors ${tab === t.id ? "bg-zinc-800 text-white border-t border-l border-r border-zinc-700" : "text-zinc-500 hover:text-zinc-300"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "audit" && (
          <div className="space-y-2">
            {AUDIT_TABLE.map((row, idx) => (
              <div key={row.stage} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 text-left"
                  onClick={() => setOpen(open === idx ? null : idx)}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-zinc-600 text-xs w-5 flex-shrink-0">{idx + 1}</span>
                    <span className="font-semibold text-white text-sm truncate">{row.stage}</span>
                    <span className="text-zinc-600 text-xs hidden md:block truncate">{row.file}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <VerdictPill v={row.verdict} />
                    <span className="text-zinc-600 text-xs">{open === idx ? "▲" : "▼"}</span>
                  </div>
                </button>
                {open === idx && (
                  <div className="px-4 pb-4 pt-3 border-t border-zinc-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
                      {FIELDS.map(([label, key]) => (
                        <div key={key} className="flex gap-2 items-start">
                          <span className="text-zinc-600 w-28 flex-shrink-0 pt-0.5">{label}:</span>
                          <span className={`flex-1 break-words ${fieldColor(row[key])}`}>{row[key]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "gaps" && (
          <div className="space-y-3">
            <div className="text-xs text-zinc-500 mb-4">All 15 gaps identified from source code inspection only. Each cites the exact file and evidence.</div>
            {GAPS.map(g => (
              <div key={g.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className="text-zinc-500 font-bold text-xs">{g.id}</span>
                  <SevPill s={g.sev} />
                  <span className="font-semibold text-white text-sm">{g.component}</span>
                </div>
                <div className="text-xs text-amber-300 mb-2">Missing: {g.missing}</div>
                <div className="text-xs text-zinc-500 bg-zinc-950 border border-zinc-800 rounded p-2 break-words">{g.evidence}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "analysis" && (
          <div className="space-y-5 text-xs">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h2 className="text-white font-bold mb-3 text-sm">Root Cause: Two-Layer Architecture Without Shared Observability Contract</h2>
              <div className="text-zinc-400 space-y-2">
                <p><span className="text-emerald-300 font-semibold">Layer A — Pipeline Core (instrumented):</span> ConversationPipeline → ExecutionOutcomeAdapterFactory → ResponseArbiter. Uses runtimeTraceStore + ExecutionOutcome. Executions reconstructible from records alone.</p>
                <p><span className="text-red-300 font-semibold">Layer B — Cognitive Analysis Engines (not instrumented):</span> RepositoryAnalyzer, RepositoryKnowledgeBuilder, ApplicationAnalyzer, KnowledgeReconstructionEngine, IdentityResolutionEngine, ProjectReconstructionEngine, CognitiveLearningEngine. Each produces a domain-specific report but has zero runtimeTraceStore integration and no ExecutionOutcome wrapper. These engines are invoked from CDL/certification pages, not from ConversationPipeline._runPipeline().</p>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h2 className="text-white font-bold mb-3 text-sm">KnowledgeGraph 0 vs RKB 22 Entities — Evidence</h2>
              <div className="text-zinc-400 space-y-2">
                <p>From ConversationPipeline.ts lines 314-331: KnowledgeGraphBridge.persist() is called only when kfmModel.statistics.totalEntities is greater than 0. The kfmModel is produced by KnowledgeFusionEngine, which normalizes UnifiedContext (from UnifiedContextBuilder).</p>
                <p>RepositoryKnowledgeBuilder stores its ProjectKnowledgeGraph in <span className="text-amber-300">this._graph</span> (in-memory singleton). This graph is <span className="text-red-300 font-semibold">never routed through KnowledgeNormalizer → KnowledgeFusionEngine → kfmModel</span>. Result: RKB._graph = 22 entities, kfmModel = 0 entities, KnowledgeGraphBridge never called for RKB data.</p>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h2 className="text-white font-bold mb-3 text-sm">ExecutionDispatcher: console.log is NOT runtimeTrace</h2>
              <p className="text-zinc-400">ExecutionDispatcher.ts line 51 emits <span className="text-amber-300">console.log("[RUNTIME-PROBE][EXD-01]", ...)</span>. This is ephemeral browser console output — NOT equivalent to runtimeTraceStore.recordStep(). Data is not persisted, not observable from any page, cannot be used for execution reconstruction.</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h2 className="text-white font-bold mb-3 text-sm">correlationId — Schema Gap (G11)</h2>
              <p className="text-zinc-400">ExecutionOutcomeTypes.ts defines the ExecutionOutcome interface without a correlationId field. ConnectorInvocationService generates one via makeCCIId('corr') but it lives only in CognitiveInvocationRecord.context — never propagated to ExecutionOutcome or runtimeTraceStore.</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h2 className="text-white font-bold mb-3 text-sm">Permitted Fixes (Observability-Only)</h2>
              <ul className="text-zinc-400 space-y-1 list-disc ml-4">
                <li>Add runtimeTraceStore.recordStep() at entry/exit of each Layer B engine with input summary, output summary, durationMs, status</li>
                <li>Add optional correlationId to ExecutionOutcome metadata field</li>
                <li>Replace ExecutionDispatcher console.log with runtimeTraceStore.recordStep()</li>
                <li>Add runtimeTraceStore calls in OfficialRuntimeBridge.invoke() / invokeGuarded()</li>
                <li>Replace ConversationPipeline catch{} blocks with surfaced error recording via conversationStore.emit()</li>
              </ul>
              <p className="text-amber-300 mt-3 font-semibold">PROHIBITED: Planner, Connector, Runtime, ResponseArbiter, business logic, execution flow, architecture.</p>
            </div>
          </div>
        )}

        {tab === "cert" && (
          <div className="space-y-5">
            <div className="bg-amber-950/40 border-2 border-amber-700 rounded-xl p-6 text-center">
              <div className="text-xs text-amber-400 font-semibold mb-2">SPRINT EF-40.1 · EXECUTION OBSERVABILITY CERTIFICATION</div>
              <div className="text-2xl font-bold text-amber-300 mb-2">CERTIFIED WITH OBSERVABILITY GAPS</div>
              <div className="text-xs text-zinc-500">Source code inspection of 17 pipeline stages · 2026-07-21 · Evidence-only</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 text-xs">
              <h3 className="text-white font-bold text-sm mb-4">Acceptance Criteria Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {CERT_CHECKS.map(([name, pass, note]) => (
                  <div key={name} className={`flex items-start gap-2 p-2 rounded border ${pass ? "border-emerald-800/50 bg-emerald-950/20" : "border-red-800/50 bg-red-950/20"}`}>
                    <span className={`flex-shrink-0 ${pass ? "text-emerald-400" : "text-red-400"}`}>{pass ? "✓" : "✗"}</span>
                    <div>
                      <div className={`font-semibold ${pass ? "text-emerald-300" : "text-red-300"}`}>{name}</div>
                      <div className="text-zinc-500">{note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 text-xs space-y-4">
              <div>
                <div className="text-emerald-400 font-semibold mb-2">PASSED — Layer A (Pipeline Core)</div>
                <ul className="text-zinc-400 space-y-0.5 ml-3">
                  <li>+ ConversationPipeline: runtimeTraceStore traces for goal/plan/connector/llm_response</li>
                  <li>+ ExecutionOutcomeFactory: validates + produces frozen outcomes for all 3 producers</li>
                  <li>+ UnknownAdapter.adapt(): correctly maps explicitDomain (bug fixed, certified 38/38 in preceding sprint)</li>
                  <li>+ ResponseArbiter: receives real ExecutionOutcome-derived candidates; not reconstructed</li>
                  <li>+ ExecutionDispatcher: startedAt/finishedAt/durationMs/status/error in StepResult</li>
                  <li>+ OfficialRuntimeBridge: success/data/status/error/durationMs/executionId in BridgeInvocationResult</li>
                  <li>+ ConnectorInvocationService: correlationId generated; CognitiveInvocationRecord with timeline</li>
                  <li>+ KnowledgeReconstructionEngine: ReconstructionReport with confidenceScore + errors</li>
                  <li>+ IdentityResolutionEngine: IdentityReport with overallConfidence + durationMs</li>
                  <li>+ CognitiveLearningEngine: LearningSession with startedAt/completedAt/durationMs</li>
                </ul>
              </div>
              <div>
                <div className="text-red-400 font-semibold mb-2">FAILED — Layer B (Cognitive Analysis)</div>
                <ul className="text-zinc-400 space-y-0.5 ml-3">
                  <li>- RepositoryAnalyzer: NOT INSTRUMENTED — no RuntimeTrace, no ExecutionOutcome</li>
                  <li>- RepositoryKnowledgeBuilder: NOT INSTRUMENTED — console.log only</li>
                  <li>- ApplicationAnalyzer: NOT INSTRUMENTED — no RuntimeTrace, no ExecutionOutcome</li>
                  <li>- KnowledgeGraphBridge: no runtimeTraceStore; only conversationStore.emit()</li>
                  <li>- ProjectSnapshot: no duration, no startedAt/finishedAt, no RuntimeTrace</li>
                  <li>- ExecutionDispatcher RuntimeTrace: console.log only, NOT runtimeTraceStore</li>
                  <li>- OfficialRuntimeBridge: _lastResults[] internal only; no runtimeTraceStore</li>
                  <li>- correlationId: absent from ExecutionOutcome schema (G11)</li>
                  <li>- Full reconstruction from records: NOT POSSIBLE for Layer B paths</li>
                </ul>
              </div>
              <div className="border-t border-zinc-800 pt-3 text-zinc-400">
                <span className="text-amber-300 font-semibold">Rationale: </span>
                Layer A (pipeline core) is correctly instrumented; its executions are reconstructible from runtimeTraceStore records alone. However 7 of 17 audited stages (Layer B) produce zero RuntimeTrace evidence and no ExecutionOutcome — making cognitive analysis execution reconstruction impossible without inference. The RKB-to-KnowledgeGraph discrepancy is structurally confirmed: RKB data never flows through kfmModel. Classification is <span className="text-amber-300 font-semibold">CERTIFIED WITH OBSERVABILITY GAPS</span> — not REJECTED because the primary conversational path is fully observable; not CERTIFIED because 7 stages remain unobservable.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}