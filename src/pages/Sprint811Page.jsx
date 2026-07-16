import React, { useState } from "react";
import { runUCBCertification } from "@/lib/unified-context/UnifiedContextCertificationSuite";
import { unifiedContextBuilder } from "@/lib/unified-context/UnifiedContextBuilder";
import { unifiedContextPolicy, classifyIntent } from "@/lib/unified-context/UnifiedContextPolicy";

const BADGE = (ok) => (
  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${ok ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
    {ok ? "PASS" : "FAIL"}
  </span>
);

const PROBE_MESSAGES = [
  { label: "Code / GitHub", msg: "show me the github repository and fix the bug in the function" },
  { label: "Email / Gmail", msg: "check my gmail inbox and reply to the latest email" },
  { label: "Drive",         msg: "find the document about the project in google drive" },
  { label: "Calendar",      msg: "what meetings do I have tomorrow on my calendar?" },
  { label: "Base44",        msg: "how do I configure entities and backend functions in base44?" },
  { label: "Memory",        msg: "what did we decide last week about the project?" },
  { label: "General",       msg: "what is the weather like today?" },
];

export default function Sprint811Page() {
  const [certReport, setCertReport]     = useState(null);
  const [certLoading, setCertLoading]   = useState(false);
  const [probeResults, setProbeResults] = useState([]);
  const [probeLoading, setProbeLoading] = useState(false);
  const [selectedBuild, setSelectedBuild] = useState(null);

  const runCert = async () => {
    setCertLoading(true);
    setCertReport(null);
    try {
      const report = await runUCBCertification();
      setCertReport(report);
    } finally {
      setCertLoading(false);
    }
  };

  const runProbes = async () => {
    setProbeLoading(true);
    setProbeResults([]);
    const results = [];
    for (const { label, msg } of PROBE_MESSAGES) {
      const t0 = Date.now();
      try {
        const ctx = await unifiedContextBuilder.build(
          msg,
          "probe-session-811",
          null,
          "Test session for Sprint 8.11 probes.",
          [{ role: "user", content: "Previous message for context" }],
        );
        results.push({ label, msg, ctx, error: null, durationMs: Date.now() - t0 });
      } catch (err) {
        results.push({ label, msg, ctx: null, error: err.message, durationMs: Date.now() - t0 });
      }
    }
    setProbeResults(results);
    setProbeLoading(false);
  };

  const policyStats = unifiedContextPolicy.getStats();
  const builderMetrics = unifiedContextBuilder.getMetrics();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="text-xs text-zinc-500 mb-1">Sprint 8.11 — Unified Context Builder</div>
        <h1 className="text-2xl font-bold text-white">Unified Context Builder</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Phase 1–8 · Evidence Required · Zero Mock · Production Only
        </p>
      </div>

      {/* Architecture overview */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <div className="text-xs text-zinc-500 mb-2 font-mono">PIPELINE FLOW</div>
        <div className="font-mono text-sm text-zinc-300 space-y-1">
          {[
            "ConversationPipeline",
            "↓  PrimaryRouter",
            "↓  UnifiedContextBuilder  ← Sprint 8.11 (NEW)",
            "↓  GoalBridge",
            "↓  Planning Engine",
            "↓  Runtime",
          ].map((line, i) => (
            <div key={i} className={line.includes("NEW") ? "text-violet-400 font-bold" : ""}>{line}</div>
          ))}
        </div>
      </div>

      {/* Phase 1: Source Audit */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <div className="text-xs text-zinc-500 mb-3 font-mono">PHASE 1 — SOURCE AUDIT</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-1 pr-4">Source</th>
                <th className="text-left py-1 pr-4">Interface</th>
                <th className="text-left py-1 pr-4">Format</th>
                <th className="text-left py-1 pr-4">Tokens</th>
                <th className="text-left py-1 pr-4">Cost</th>
                <th className="text-left py-1">When</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["memory.entities",       "base44.entities.KnowledgeEntity", "list[]",   "~200", "1 DB read",  "All intents"],
                ["memory.keywords",       "base44.entities.Keyword",         "list[]",   "~100", "1 DB read",  "Memory/General"],
                ["memory.topics",         "base44.entities.Topic",           "list[]",   "~150", "1 DB read",  "All intents"],
                ["memory.decisions",      "base44.entities.Decision",        "list[]",   "~100", "1 DB read",  "Memory/Calendar/General"],
                ["memory.tasks",          "base44.entities.Task",            "list[]",   "~100", "1 DB read",  "Email/Memory/General"],
                ["memory.session_summary","ChatSession.summary",             "string",   "~300", "0 (cached)", "Always"],
                ["working_memory",        "ConversationStore.messages",      "last 6",   "~400", "0 (in-mem)", "Always"],
                ["official_library",      "FoundationKnowledgeAPI",          "text",     "~500", "0 (in-mem)", "Code/Drive/Base44/General"],
                ["github_connector",      "ConnectorRegistry",               "availability","~50","0 (no exec)","Code/Base44"],
                ["base44_connector",      "ConnectorRegistry",               "availability","~50","0 (no exec)","Base44"],
                ["gmail_connector",       "ConnectorRegistry",               "availability","~50","0 (no exec)","Email"],
                ["drive_connector",       "ConnectorRegistry",               "availability","~50","0 (no exec)","Drive"],
                ["calendar_connector",    "ConnectorRegistry",               "availability","~50","0 (no exec)","Calendar"],
              ].map(([src, iface, fmt, tok, cost, when]) => (
                <tr key={src} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-1 pr-4 text-violet-300">{src}</td>
                  <td className="py-1 pr-4 text-zinc-400">{iface}</td>
                  <td className="py-1 pr-4 text-zinc-300">{fmt}</td>
                  <td className="py-1 pr-4 text-yellow-400">{tok}</td>
                  <td className="py-1 pr-4 text-green-400">{cost}</td>
                  <td className="py-1 text-zinc-400">{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phase 3: Policy Table */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <div className="text-xs text-zinc-500 mb-3 font-mono">PHASE 3 — SELECTION POLICY (DETERMINISTIC, NO LLM)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {["code","email","drive","calendar","base44","memory","general"].map((intent) => {
            const policy = unifiedContextPolicy.policyFor(intent);
            return (
              <div key={intent} className="bg-zinc-800 rounded p-3">
                <div className="font-mono text-sm font-bold text-violet-300 mb-1 capitalize">{intent}</div>
                <div className="text-xs text-zinc-400 mb-2">{policy.reason}</div>
                <div className="flex flex-wrap gap-1">
                  {policy.selectedSources.map((s) => (
                    <span key={s} className="bg-zinc-700 text-zinc-300 text-xs px-1.5 py-0.5 rounded font-mono">{s}</span>
                  ))}
                </div>
                <div className="text-xs text-zinc-600 mt-1">timeout: {policy.timeoutMs}ms</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-zinc-600">
          Total evaluations: {policyStats.total} · Intent distribution: {JSON.stringify(policyStats.intentCounts)}
        </div>
      </div>

      {/* Phase 8: Live Probes */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-zinc-500 font-mono">PHASE 8 — REAL EXECUTION PROBES</div>
          <button
            onClick={runProbes}
            disabled={probeLoading}
            className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs px-4 py-1.5 rounded font-mono"
          >
            {probeLoading ? "Running..." : "RUN ALL PROBES"}
          </button>
        </div>

        {probeResults.length === 0 && !probeLoading && (
          <div className="text-zinc-600 text-sm text-center py-6">Click RUN ALL PROBES to execute real builds.</div>
        )}

        <div className="space-y-3">
          {probeResults.map(({ label, msg, ctx, error, durationMs }) => (
            <div
              key={label}
              className="bg-zinc-800 rounded p-3 cursor-pointer hover:bg-zinc-700/50"
              onClick={() => setSelectedBuild(selectedBuild === label ? null : label)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm text-violet-300">{label}</span>
                <div className="flex items-center gap-2">
                  {BADGE(!error)}
                  <span className="text-xs text-zinc-500">{durationMs}ms</span>
                </div>
              </div>
              <div className="text-xs text-zinc-500 italic mb-2">"{msg.slice(0, 70)}..."</div>
              {error && <div className="text-xs text-red-400">{error}</div>}
              {ctx && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="bg-zinc-700 rounded p-2">
                    <div className="text-zinc-500">Intent</div>
                    <div className="text-yellow-300 font-bold">{ctx.intent}</div>
                  </div>
                  <div className="bg-zinc-700 rounded p-2">
                    <div className="text-zinc-500">Confidence</div>
                    <div className="text-green-300 font-bold">{(ctx.confidence * 100).toFixed(0)}%</div>
                  </div>
                  <div className="bg-zinc-700 rounded p-2">
                    <div className="text-zinc-500">Sources</div>
                    <div className="text-blue-300 font-bold">{ctx.sources.length}</div>
                  </div>
                  <div className="bg-zinc-700 rounded p-2">
                    <div className="text-zinc-500">Build Time</div>
                    <div className="text-white font-bold">{ctx.durationMs}ms</div>
                  </div>
                </div>
              )}

              {/* Expanded detail */}
              {selectedBuild === label && ctx && (
                <div className="mt-3 space-y-2 border-t border-zinc-700 pt-3">
                  <div className="text-xs text-zinc-500 font-mono">SOURCES CONSULTED:</div>
                  <div className="space-y-1">
                    {ctx.sources.map((s) => (
                      <div key={s.sourceId} className="flex items-center gap-2 text-xs font-mono">
                        <span className={s.available ? "text-green-400" : "text-zinc-600"}>
                          {s.available ? "✓" : "○"}
                        </span>
                        <span className="text-zinc-300 w-40">{s.sourceId}</span>
                        <span className="text-zinc-500">{s.durationMs}ms</span>
                        <span className="text-zinc-600">~{s.tokenCount}tok</span>
                        {s.error && <span className="text-red-400">{s.error.slice(0, 40)}</span>}
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-zinc-500 font-mono mt-2">CONNECTOR AVAILABILITY:</div>
                  <div className="flex gap-3 text-xs font-mono">
                    {Object.entries(ctx.connectorAvailability).map(([k, v]) => (
                      <span key={k} className={v ? "text-green-400" : "text-zinc-600"}>
                        {v ? "✓" : "○"} {k}
                      </span>
                    ))}
                  </div>

                  <div className="text-xs text-zinc-500 font-mono mt-2">MEMORY CONTEXT:</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(ctx.memoryContext.rawCounts).map(([k, v]) => (
                      <div key={k} className="text-zinc-400">{k}: <span className="text-white">{v}</span></div>
                    ))}
                  </div>

                  <div className="text-xs text-zinc-500 font-mono mt-2">WORKING MEMORY:</div>
                  <div className="text-xs text-zinc-400">
                    {ctx.workingMemory.entries.length > 0
                      ? ctx.workingMemory.entries.map((e, i) => <div key={i}>{e.slice(0, 80)}</div>)
                      : <span className="text-zinc-600">empty</span>}
                  </div>

                  <div className="text-xs text-zinc-500 font-mono mt-2">OFFICIAL KNOWLEDGE:</div>
                  <div className="text-xs text-zinc-400">
                    {ctx.officialKnowledge.available
                      ? ctx.officialKnowledge.summary?.slice(0, 200) + "..."
                      : <span className="text-zinc-600">not available</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Certification Suite */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-zinc-500 font-mono">CERTIFICATION SUITE — 20 CASES</div>
          <button
            onClick={runCert}
            disabled={certLoading}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs px-4 py-1.5 rounded font-mono"
          >
            {certLoading ? "Running..." : "RUN CERTIFICATION"}
          </button>
        </div>

        {certReport && (
          <>
            <div className={`rounded p-3 mb-4 ${certReport.certified ? "bg-emerald-900/30 border border-emerald-700" : "bg-red-900/30 border border-red-700"}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{certReport.certified ? "✅" : "❌"}</span>
                <div>
                  <div className="font-bold text-sm">{certReport.certified ? "CERTIFIED" : "CERTIFICATION FAILED"}</div>
                  <div className="text-xs text-zinc-400">
                    {certReport.passed}/{certReport.total} passed ({certReport.passRate}%) · {certReport.durationMs}ms
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              {certReport.cases.map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-xs font-mono py-1 border-b border-zinc-800/50">
                  {BADGE(c.passed)}
                  <span className="text-zinc-500 w-8">{c.id}</span>
                  <span className="text-zinc-300 flex-1">{c.description}</span>
                  <span className="text-zinc-600">{c.durationMs}ms</span>
                  {c.evidence && <span className="text-zinc-500 text-right max-w-xs truncate">{c.evidence}</span>}
                  {c.error && <span className="text-red-400 max-w-xs truncate">{c.error}</span>}
                </div>
              ))}
            </div>
          </>
        )}

        {!certReport && !certLoading && (
          <div className="text-zinc-600 text-sm text-center py-6">Click RUN CERTIFICATION to validate all 20 cases.</div>
        )}
      </div>

      {/* Builder Metrics */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <div className="text-xs text-zinc-500 mb-2 font-mono">BUILDER METRICS</div>
        <div className="text-sm text-zinc-300">
          Total builds: <span className="text-white font-bold">{builderMetrics.totalBuilds}</span>
        </div>
        {builderMetrics.lastBuilds.length > 0 && (
          <div className="mt-2 space-y-1">
            {builderMetrics.lastBuilds.slice(0, 5).map((b) => (
              <div key={b.buildId} className="text-xs font-mono text-zinc-500">
                {b.buildId} · intent={b.intent} · {b.durationMs}ms · {b.sourceCount} sources
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}