import React, { useState } from "react";
import { runKFECertificationSuite } from "@/lib/knowledge-fusion-engine/KnowledgeFusionCertificationSuite";

const STATUS = {
  idle:    { label: "Ready", color: "bg-zinc-700 text-zinc-300" },
  running: { label: "Running...", color: "bg-yellow-900 text-yellow-300 animate-pulse" },
  done:    { label: "Complete", color: "bg-emerald-900 text-emerald-300" },
};

export default function Sprint812Page() {
  const [status, setStatus]   = useState("idle");
  const [report, setReport]   = useState(null);
  const [elapsed, setElapsed] = useState(null);

  async function runCert() {
    setStatus("running");
    setReport(null);
    const t0 = Date.now();
    const r  = await runKFECertificationSuite();
    setReport(r);
    setElapsed(Date.now() - t0);
    setStatus("done");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs bg-violet-900 text-violet-300 px-2 py-0.5 rounded">SPRINT 8.12</span>
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS[status].color}`}>{STATUS[status].label}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Knowledge Fusion Engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Transforms UnifiedContext sources into a deterministic, immutable UnifiedKnowledgeModel.
            No LLM · No Network · No Mocks · MDS v2.0
          </p>
        </div>

        {/* Architecture */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
          <p className="text-xs text-zinc-500 uppercase mb-3">Pipeline Integration</p>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            {[
              "ConversationPipeline",
              "PrimaryConversationRouter",
              "UnifiedContextBuilder",
              "KnowledgeFusionEngine ★",
              "ConversationGoalBridge",
              "ConversationPlanningEngine",
              "ConversationRuntimeEngine",
            ].map((step, i, arr) => (
              <React.Fragment key={step}>
                <span className={`px-2 py-1 rounded text-xs ${step.includes("★") ? "bg-violet-900 text-violet-200 font-bold" : "bg-zinc-800 text-zinc-300"}`}>
                  {step.replace(" ★", "")}
                </span>
                {i < arr.length - 1 && <span className="text-zinc-600">↓</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Modules */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {[
            { name: "KFETypes",                     desc: "All type contracts — no logic" },
            { name: "KnowledgeDeduplicator",         desc: "Eliminate duplicates across sources" },
            { name: "KnowledgeConflictResolver",     desc: "Detect & record source conflicts" },
            { name: "KnowledgeRelationshipBuilder",  desc: "Discover entity relationships" },
            { name: "KnowledgeConfidenceCalculator", desc: "Deterministic confidence scoring" },
            { name: "KnowledgeFusionEngine",         desc: "Orchestrator → UnifiedKnowledgeModel" },
          ].map((m) => (
            <div key={m.name} className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <p className="text-violet-300 text-xs font-semibold">{m.name}</p>
              <p className="text-zinc-500 text-xs mt-1">{m.desc}</p>
            </div>
          ))}
        </div>

        {/* Run button */}
        <button
          onClick={runCert}
          disabled={status === "running"}
          className="mb-6 px-6 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-sm font-semibold transition"
        >
          {status === "running" ? "Running 25 certification tests..." : "Run Certification Suite"}
        </button>

        {/* Report */}
        {report && (
          <div className="space-y-4">
            {/* Summary */}
            <div className={`border rounded-lg p-4 ${report.certified ? "border-emerald-700 bg-emerald-950" : "border-red-700 bg-red-950"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-lg font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                  {report.certified ? "✓ CERTIFIED" : "✗ FAILED"}
                </span>
                <span className="text-zinc-400 text-sm">{elapsed}ms total</span>
              </div>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">{report.passed}</p>
                  <p className="text-xs text-zinc-500">Passed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{report.failed}</p>
                  <p className="text-xs text-zinc-500">Failed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-zinc-300">{report.total}</p>
                  <p className="text-xs text-zinc-500">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-violet-400">{report.passRate}%</p>
                  <p className="text-xs text-zinc-500">Pass Rate</p>
                </div>
              </div>
            </div>

            {/* Test cases */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800">
                <p className="text-xs text-zinc-400 uppercase">Test Cases</p>
              </div>
              <div className="divide-y divide-zinc-800">
                {report.cases.map((c) => (
                  <div key={c.id} className="px-4 py-2 flex items-start gap-3 text-xs">
                    <span className={`mt-0.5 font-bold shrink-0 ${c.passed ? "text-emerald-400" : "text-red-400"}`}>
                      {c.passed ? "✓" : "✗"}
                    </span>
                    <span className="text-zinc-500 shrink-0 w-10">{c.id}</span>
                    <span className="text-zinc-300 flex-1">{c.description}</span>
                    {c.evidence && <span className="text-zinc-500 shrink-0 max-w-xs text-right">{c.evidence}</span>}
                    <span className="text-zinc-600 shrink-0">{c.durationMs}ms</span>
                    {c.error && <span className="text-red-400 shrink-0 max-w-xs truncate" title={c.error}>{c.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}