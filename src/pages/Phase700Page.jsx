/**
 * Phase700Page — Sprint 7.0.0
 * Unified Cognitive Memory Engine (UCME) Dashboard
 */

import React, { useState } from "react";

async function runTests() {
  const { runUCMETests } = await import("@/lib/ucme/UCMETests");
  return runUCMETests();
}

function Badge({ ok }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

const SUITE_COLORS = {
  "1 — Provider Registry":          "border-violet-700 text-violet-300",
  "2 — Fusion Engine":              "border-blue-700 text-blue-300",
  "3 — UnifiedMemoryEngine":        "border-cyan-700 text-cyan-300",
  "4 — MemoryContextBuilder":       "border-teal-700 text-teal-300",
  "5 — Explainability & Evidence":  "border-yellow-700 text-yellow-300",
  "6 — Architecture Compliance":    "border-emerald-700 text-emerald-300",
};

export default function Phase700Page() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState(null);
  const [health, setHealth]   = useState(null);
  const [demoResult, setDemoResult] = useState(null);

  async function run() {
    setRunning(true); setErr(null); setReport(null);
    try { setReport(await runTests()); }
    catch (e) { setErr(e?.message ?? String(e)); }
    finally { setRunning(false); }
  }

  async function checkHealth() {
    try {
      const { UnifiedMemoryEngine } = await import("@/lib/ucme/UnifiedMemoryEngine");
      await import("@/lib/ucme/providers/ConversationMemoryProvider");
      await import("@/lib/ucme/providers/GoogleDriveMemoryProvider");
      await import("@/lib/ucme/providers/GmailMemoryProvider");
      await import("@/lib/ucme/providers/KnowledgeGraphMemoryProvider");
      setHealth(await UnifiedMemoryEngine.healthCheck());
    } catch (e) { setErr(e?.message ?? String(e)); }
  }

  async function runDemo(question) {
    try {
      const { MemoryContextBuilder } = await import("@/lib/ucme/MemoryContextBuilder");
      await import("@/lib/ucme/providers/ConversationMemoryProvider");
      await import("@/lib/ucme/providers/GoogleDriveMemoryProvider");
      await import("@/lib/ucme/providers/GmailMemoryProvider");
      await import("@/lib/ucme/providers/KnowledgeGraphMemoryProvider");
      const ctx = await MemoryContextBuilder.build(question, { maxResults: 5, timeoutMs: 3000 });
      setDemoResult(ctx);
    } catch (e) { setErr(e?.message ?? String(e)); }
  }

  const suites = report
    ? [...new Set(report.results.map(r => r.suite))].map(s => ({ suite: s, rows: report.results.filter(r => r.suite === s) }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">SPRINT 7.0.0 — UNIFIED COGNITIVE MEMORY ENGINE</div>
          <h1 className="text-3xl font-bold">UCME — Unified Cognitive Memory</h1>
          <p className="text-zinc-400 text-sm mt-1">Uma interface · Todos os provedores · O usuário apenas pergunta</p>
        </div>

        {/* Architecture */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-3">ARQUITETURA</div>
          <div className="flex items-start gap-2 flex-wrap">
            {[
              ["Conversation", "Planner", "→"],
              ["Planner", "MemoryContextBuilder", "→"],
              ["MemoryContextBuilder", "UnifiedMemoryEngine", "→"],
              ["UnifiedMemoryEngine", "ProviderRegistry", "→"],
              ["ProviderRegistry", "4 Providers", "→"],
            ].map(([from, to, arrow], i) => (
              <React.Fragment key={i}>
                <div className="border border-zinc-700 rounded px-2 py-1 text-zinc-300">{from}</div>
                <span className="text-zinc-600 self-center">{arrow}</span>
                {i === 4 && <div className="border border-violet-700 rounded px-2 py-1 text-violet-300">{to}</div>}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              ["conversation", "Conversation Memory", "Mensagens DB", "violet"],
              ["knowledge-graph", "Knowledge Graph", "Entities, Decisions, Tasks", "blue"],
              ["google-drive", "Google Drive", "Índice cognitivo (TTL 30min)", "cyan"],
              ["gmail", "Gmail", "Subject+sender+labels (sem corpo)", "teal"],
            ].map(([id, name, desc, color]) => (
              <div key={id} className={`border border-${color}-800 rounded p-2`}>
                <div className={`text-${color}-400 font-bold text-xs`}>{name}</div>
                <div className="text-zinc-500 text-xs mt-0.5">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={run} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors">
            {running ? "Running UCME Tests…" : "▶  Run Full Test Suite (6 Suites)"}
          </button>
          <button onClick={checkHealth}
            className="bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors">
            🏥 Health Check
          </button>
          <button onClick={() => runDemo("Onde está meu RG?")}
            className="bg-teal-700 hover:bg-teal-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors">
            🧠 Demo: "Onde está meu RG?"
          </button>
          <button onClick={() => runDemo("Últimos emails do cliente")}
            className="bg-blue-700 hover:bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors">
            📧 Demo: "Últimos emails do cliente"
          </button>
        </div>

        {err && <div className="border border-red-700 bg-red-950/20 rounded p-4 text-red-300 text-sm">Error: {err}</div>}

        {/* Health */}
        {health && (
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
            <div className="text-zinc-400 tracking-widest mb-2">PROVIDER HEALTH</div>
            <div className="grid grid-cols-2 gap-2">
              {health.map(h => (
                <div key={h.providerId} className={`flex items-center justify-between border rounded p-2 ${h.healthy ? "border-emerald-800 bg-emerald-950/20" : "border-zinc-800"}`}>
                  <span className={h.healthy ? "text-emerald-300" : "text-zinc-500"}>{h.providerName}</span>
                  <span className={`text-xs ${h.healthy ? "text-emerald-500" : "text-red-400"}`}>{h.healthy ? "✓ HEALTHY" : h.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Demo result */}
        {demoResult && (
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs space-y-3">
            <div className="text-violet-400 font-bold">🧠 MEMORY CONTEXT — "{demoResult.query.text}"</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-zinc-400">Evidências: <span className="text-zinc-200">{demoResult.result.evidence.length}</span></div>
              <div className="text-zinc-400">Providers: <span className="text-zinc-200">{demoResult.result.providerStats.length}</span></div>
              <div className="text-zinc-400">Duração: <span className="text-zinc-200">{demoResult.result.durationMs}ms</span></div>
            </div>
            {demoResult.result.evidence.slice(0, 4).map((ev, i) => (
              <div key={i} className="border border-zinc-800 rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-violet-400">{ev.providerName}</span>
                  <span className="text-zinc-500">conf: {(ev.confidence * 100).toFixed(0)}% · rel: {(ev.relevance * 100).toFixed(0)}% · w: {ev.weight}</span>
                </div>
                <div className="text-zinc-300">{ev.content.slice(0, 200)}</div>
                <div className="text-zinc-600 italic">{ev.justification}</div>
              </div>
            ))}
            {demoResult.result.evidence.length === 0 && (
              <div className="text-zinc-500 italic">Nenhuma evidência encontrada para esta query (provedores sem dados locais)</div>
            )}
          </div>
        )}

        {/* Summary */}
        {report && (
          <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
            <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified ? "✓ UCME SPRINT 7.0.0 CERTIFIED" : "✗ TEST SUITE FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-2">{report.passed}/{report.total} passed · {report.failed} failed</div>
          </div>
        )}

        {/* Suite tables */}
        {suites.map(({ suite, rows }) => {
          const sp  = rows.filter(r => r.passed).length;
          const cls = SUITE_COLORS[suite] ?? "border-zinc-700 text-zinc-300";
          return (
            <div key={suite} className="space-y-1">
              <div className={`border rounded-lg px-4 py-2 flex justify-between bg-zinc-900 ${cls}`}>
                <span className="font-bold text-sm">{suite}</span>
                <span className="text-xs font-mono">{sp}/{rows.length}</span>
              </div>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-zinc-500">
                    <tr>
                      <th className="text-left p-2 pl-3 w-96">Test</th>
                      <th className="text-left p-2">Detail</th>
                      <th className="text-center p-2 pr-3 w-14">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.passed ? "" : "bg-red-950/20"}>
                        <td className="p-2 pl-3 text-zinc-300">{r.name}</td>
                        <td className="p-2 text-zinc-500 truncate max-w-xs" title={r.detail}>{r.detail}</td>
                        <td className="p-2 pr-3 text-center"><Badge ok={r.passed} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.filter(r => !r.passed).map((r, i) => (
                  <div key={i} className="border-t border-red-800 bg-red-950/10 px-3 py-1.5 text-red-300 text-xs">
                    ✗ [{r.name}] {r.error}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Compliance summary */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-2">CRITÉRIOS DE ACEITE</div>
          {[
            "Existe apenas uma interface pública de memória (UnifiedMemoryEngine + MemoryContextBuilder)",
            "Todos os tipos de memória implementam MemoryProvider (7 métodos: search, remember, forget, update, explain, health, capabilities)",
            "O Planner não conhece nenhuma memória específica — usa apenas MemoryContextBuilder",
            "O usuário pergunta naturalmente — UCME decide onde procurar",
            "Resultados são fundidos automaticamente via MemoryFusionEngine (merge + dedup + rank)",
            "Toda resposta possui evidências: memoryId, confidence, relevance, weight, justification",
            "Novos Memory Providers: apenas MemoryProviderRegistry.register() — o núcleo não muda",
          ].map((item, i) => (
            <div key={i} className="text-zinc-300 py-0.5">✓ {item}</div>
          ))}
        </div>

      </div>
    </div>
  );
}