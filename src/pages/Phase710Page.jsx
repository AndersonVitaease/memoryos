/**
 * Phase710Page — Sprint 7.1.0
 * Memory Reasoning Engine (MRE) Dashboard
 */

import React, { useState } from "react";

async function runTests() {
  const { runMRETests } = await import("@/lib/mre/MRETests");
  return runMRETests();
}

function Badge({ ok }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

const SUITE_COLORS = {
  "1 — EvidenceAnalyzer":                      "border-violet-700 text-violet-300",
  "2 — ConflictResolver":                      "border-red-700 text-red-300",
  "3 — HypothesisGenerator":                   "border-yellow-700 text-yellow-300",
  "4 — ConfidenceAdjuster":                    "border-blue-700 text-blue-300",
  "5 — MemoryReasoningEngine (full pipeline)": "border-emerald-700 text-emerald-300",
  "6 — Architecture Compliance":               "border-zinc-600 text-zinc-400",
  "7 — SimilarityEngine":                      "border-cyan-700 text-cyan-300",
  "8 — ReasoningRuleRegistry":                 "border-orange-700 text-orange-300",
  "9 — StructuredContext":                     "border-pink-700 text-pink-300",
  "10 — Duplicate Merge":                      "border-teal-700 text-teal-300",
  "11 — ConfidencePolicy":                     "border-indigo-700 text-indigo-300",
};

export default function Phase710Page() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState(null);
  const [demo, setDemo]       = useState(null);

  async function run() {
    setRunning(true); setErr(null); setReport(null);
    try { setReport(await runTests()); }
    catch (e) { setErr(e?.message ?? String(e)); }
    finally { setRunning(false); }
  }

  async function runDemo(scenario) {
    try {
      const { MemoryReasoningEngine } = await import("@/lib/mre/MemoryReasoningEngine");

      const now = new Date().toISOString();
      const old = new Date(Date.now() - 3 * 86400000).toISOString();

      const scenarios = {
        rg: {
          query: "Onde está meu RG?",
          evidence: [
            { memoryId: "1", providerId: "conversation", providerName: "Conversation", content: "O RG está na pasta documentos do Google Drive", summary: "RG no Drive", confidence: 0.85, relevance: 0.9, recency: 0.9, weight: 0.87, lastUpdated: old, justification: "test", tags: ["conv"], metadata: {} },
            { memoryId: "2", providerId: "google-drive", providerName: "Google Drive", content: "RG.pdf encontrado no Google Drive em /documentos/pessoal", summary: "RG.pdf no Drive", confidence: 0.9, relevance: 0.95, recency: 0.8, weight: 0.9, lastUpdated: now, justification: "test", tags: ["drive"], metadata: {} },
            { memoryId: "3", providerId: "knowledge-graph", providerName: "Knowledge Graph", content: "Documento pessoal do tipo RG, categoria documentos pessoais", summary: "RG é documento pessoal", confidence: 0.8, relevance: 0.85, recency: 0.7, weight: 0.82, lastUpdated: old, justification: "test", tags: ["kg"], metadata: {} },
          ],
        },
        conflict: {
          query: "Onde está o contrato com a empresa ABC?",
          evidence: [
            { memoryId: "c1", providerId: "conversation", providerName: "Conversation", content: "O contrato com a ABC foi assinado e está no Drive pasta Contratos", summary: "Contrato ABC no Drive", confidence: 0.7, relevance: 0.85, recency: 0.6, weight: 0.72, lastUpdated: old, justification: "test", tags: ["conv"], metadata: {} },
            { memoryId: "c2", providerId: "gmail", providerName: "Gmail", content: "Email: contrato ABC foi cancelado e arquivo deletado", summary: "Contrato ABC cancelado", confidence: 0.85, relevance: 0.9, recency: 0.95, weight: 0.88, lastUpdated: now, justification: "test", tags: ["gmail"], metadata: {} },
          ],
        },
        empty: {
          query: "Qual é o número da minha CNH?",
          evidence: [],
        },
      };

      const s = scenarios[scenario];
      const result = MemoryReasoningEngine.reason(s.query, s.evidence);
      setDemo({ scenario, result });
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
          <div className="text-xs text-violet-400 tracking-widest mb-1">SPRINT EF-7.1.1 — MRE REFINEMENT</div>
          <h1 className="text-3xl font-bold">Memory Reasoning Engine v1.1</h1>
          <p className="text-zinc-400 text-sm mt-1">SimilarityEngine · RuleRegistry · StructuredContext · DuplicateMerge · ConfidencePolicy</p>
        </div>

        {/* Architecture */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs">
          <div className="text-zinc-400 tracking-widest mb-3">PIPELINE</div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {["MemoryEvidence[]", "SimilarityEngine", "RuleRegistry", "ConflictResolver", "ConfidencePolicy", "ExplanationBuilder", "ReasoningResult + StructuredContext"].map((step, i, arr) => (
              <React.Fragment key={step}>
                <span className={`border rounded px-2 py-1 ${i === 0 || i === arr.length - 1 ? "border-violet-700 text-violet-300" : "border-zinc-700 text-zinc-400"}`}>{step}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {[
              ["SimilarityEngine",  "Algoritmo desacoplado — swap para Embeddings/BM25 sem mudar Analyzer"],
              ["RuleRegistry",      "Regras registradas externamente — Engine nunca conhece regras individuais"],
              ["StructuredContext", "Contexto estruturado machine-readable além do texto plain"],
              ["ConfidencePolicy",  "Zero pesos hardcoded — todos configuráveis via política"],
              ["DuplicateMerge",    "Duplicatas são fundidas com audit trail — nenhuma evidência perdida silenciosamente"],
            ].map(([k, v]) => (
              <div key={k} className="border border-zinc-800 rounded p-2">
                <div className="text-violet-300 font-bold">{k}</div>
                <div className="text-zinc-500 mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={run} disabled={running}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm">
            {running ? "Running MRE Tests…" : "▶  Run Full Test Suite (11 Suites)"}
          </button>
          <button onClick={() => runDemo("rg")}
            className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm">
            🔍 Demo: RG (3 fontes)
          </button>
          <button onClick={() => runDemo("conflict")}
            className="bg-red-800 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm">
            ⚠ Demo: Conflito
          </button>
          <button onClick={() => runDemo("empty")}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm">
            ? Demo: Sem evidências
          </button>
        </div>

        {err && <div className="border border-red-700 bg-red-950/20 rounded p-4 text-red-300 text-sm">{err}</div>}

        {/* Demo output */}
        {demo && (
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 text-xs space-y-3">
            <div className="text-violet-400 font-bold text-sm">🧠 REASONING RESULT — "{demo.result.session.query}"</div>

            <div className="grid grid-cols-4 gap-2">
              {[
                ["Confiança", `${(demo.result.confidence * 100).toFixed(0)}%`, demo.result.confidence > 0.7 ? "text-emerald-400" : "text-yellow-400"],
                ["Evidências", demo.result.reasoning.length, "text-zinc-300"],
                ["Conflitos", demo.result.conflicts.length, demo.result.conflicts.length > 0 ? "text-red-400" : "text-zinc-500"],
                ["Hipóteses", demo.result.hypotheses.length, demo.result.hypotheses.length > 0 ? "text-yellow-400" : "text-zinc-500"],
              ].map(([label, val, cls]) => (
                <div key={label} className="border border-zinc-800 rounded p-2 text-center">
                  <div className="text-zinc-500 text-xs">{label}</div>
                  <div className={`font-bold text-lg ${cls}`}>{val}</div>
                </div>
              ))}
            </div>

            <div className="border border-zinc-800 rounded p-3">
              <div className="text-zinc-400 text-xs mb-1">CONHECIMENTO CONSOLIDADO</div>
              <div className="text-zinc-200">{demo.result.consolidated.summary}</div>
              {demo.result.consolidated.sources.length > 0 && (
                <div className="text-zinc-600 mt-1">Fontes: {demo.result.consolidated.sources.join(", ")}</div>
              )}
            </div>

            {demo.result.conflicts.map(c => (
              <div key={c.id} className="border border-red-800 bg-red-950/20 rounded p-3">
                <div className="text-red-400 font-bold">⚠ CONFLITO: {c.description}</div>
                <div className="text-zinc-400 mt-1">{c.explanation}</div>
                <div className="text-zinc-600">Resolução: {c.resolution} {c.winner ? `→ winner: ${c.winner}` : "(não resolvido)"}</div>
              </div>
            ))}

            {demo.result.hypotheses.map(h => (
              <div key={h.id} className="border border-yellow-800 bg-yellow-950/20 rounded p-3">
                <div className="text-yellow-400 font-bold">? HIPÓTESE ({(h.probability * 100).toFixed(0)}%): {h.statement}</div>
                <div className="text-zinc-600 mt-1">Limitações: {h.limitations}</div>
              </div>
            ))}

            <div className="border border-zinc-800 rounded p-3">
              <div className="text-zinc-400 text-xs mb-2">EXPLICAÇÃO</div>
              {demo.result.explanation.steps.map((s, i) => (
                <div key={i} className="text-zinc-500 text-xs py-0.5">• {s}</div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {report && (
          <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
            <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
              {report.certified ? "✓ MRE EF-7.1.1 CERTIFIED" : "✗ TEST SUITE FAILED"}
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

      </div>
    </div>
  );
}