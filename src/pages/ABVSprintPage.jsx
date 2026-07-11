// ABV v4.1 — Sprint Validation Page
// Hardening & Traceability · Foundation v1.0 · Engineering First

import React, { useState, useCallback } from "react";
import { runABVSprintTests } from "@/lib/abv/abvSprintTests";

// ── UI primitives ─────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  "Baseline Integrity":        "bg-violet-900/40 text-violet-300 border-violet-700/50",
  "Baseline Metadata":         "bg-blue-900/40 text-blue-300 border-blue-700/50",
  "Real Baseline Comparison":  "bg-cyan-900/40 text-cyan-300 border-cyan-700/50",
  "Timeline Evolution":        "bg-indigo-900/40 text-indigo-300 border-indigo-700/50",
  "Engineering Review State":  "bg-amber-900/40 text-amber-300 border-amber-700/50",
  "Immutable Audit History":   "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
};

function CategoryBadge({ category }) {
  const cls = CATEGORY_COLORS[category] ?? "bg-zinc-800 text-zinc-400 border-zinc-700";
  return <span className={`text-xs font-mono px-2 py-0.5 rounded border ${cls}`}>{category}</span>;
}

function PassBadge({ passed }) {
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${passed
      ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
      : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {passed ? "PASS" : "FAIL"}
    </span>
  );
}

function Metric({ label, value, color = "text-zinc-200", sub }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
      {sub && <div className="text-zinc-600 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function TestRow({ result }) {
  const [open, setOpen] = useState(false);
  const hasExtra = result.detail || result.observation || result.error;
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!result.passed ? "bg-red-950/10" : ""}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)} className="w-full flex items-start gap-2 py-2.5 px-3 text-left">
        <PassBadge passed={result.passed} />
        <span className="text-zinc-500 font-mono text-xs w-5 shrink-0 mt-0.5">C{result.criterion}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${result.passed ? "text-zinc-200" : "text-red-300"}`}>{result.name}</p>
          <CategoryBadge category={result.category} />
        </div>
        <span className="text-zinc-600 font-mono text-xs shrink-0">{result.durationMs}ms</span>
        {hasExtra && <span className="text-zinc-600 text-xs shrink-0">{open ? "▲" : "▼"}</span>}
      </button>
      {open && hasExtra && (
        <div className="px-3 pb-2 ml-12 border-l-2 border-zinc-700 space-y-1">
          {result.detail && <p className="text-xs text-zinc-400">{result.detail}</p>}
          {result.observation && <p className="text-xs text-yellow-400/80 italic">obs: {result.observation}</p>}
          {result.error && <p className="text-xs text-red-400 font-mono">error: {result.error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Category summary ──────────────────────────────────────────────────────────

function CategorySummary({ results }) {
  const categories = [...new Set(results.map(r => r.category))];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {categories.map(cat => {
        const catResults = results.filter(r => r.category === cat);
        const passed = catResults.filter(r => r.passed).length;
        const total  = catResults.length;
        const allPass = passed === total;
        return (
          <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex justify-between items-center mb-1">
              <span className={`text-xs font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>{passed}/{total}</span>
              <span className={`text-xs font-mono ${allPass ? "text-emerald-500" : "text-red-500"}`}>{allPass ? "OK" : "FAIL"}</span>
            </div>
            <p className="text-xs text-zinc-400 leading-tight">{cat}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const ACCEPTANCE_CRITERIA = [
  { n: 1,  cat: "Baseline Integrity",        name: "SHA-256 gerado para cada Baseline" },
  { n: 2,  cat: "Baseline Integrity",        name: "Hash representa payload completo" },
  { n: 3,  cat: "Baseline Integrity",        name: "Mudanca arquitetural produz hash diferente" },
  { n: 4,  cat: "Baseline Integrity",        name: "Registry rejeita duplicata pelo hash" },
  { n: 5,  cat: "Baseline Metadata",         name: "Metadata completa em cada Baseline" },
  { n: 6,  cat: "Baseline Metadata",         name: "Metadata reflete versoes da plataforma" },
  { n: 7,  cat: "Engineering Review State",  name: "ReviewState derivado automaticamente" },
  { n: 8,  cat: "Real Baseline Comparison",  name: "Comparacao real entre dois Baselines" },
  { n: 9,  cat: "Real Baseline Comparison",  name: "Regressoes com ArchitecturalEvidence" },
  { n: 10, cat: "Real Baseline Comparison",  name: "Compliance deltas por metrica" },
  { n: 11, cat: "Timeline Evolution",        name: "Timeline gerada automaticamente" },
  { n: 12, cat: "Immutable Audit History",   name: "Historico append-only, sem delecao" },
  { n: 13, cat: "Immutable Audit History",   name: "Integridade verificavel contra Registry" },
  { n: 14, cat: "Baseline Integrity",        name: "Registry integrity check: hashes unicos" },
  { n: 15, cat: "Baseline Integrity",        name: "Zero informacao manual em toda a cadeia" },
];

export default function ABVSprintPage() {
  const [running, setRunning]     = useState(false);
  const [data, setData]           = useState(null);
  const [elapsed, setElapsed]     = useState(null);
  const [activeTab, setActiveTab] = useState("criteria");

  const runSuite = useCallback(async () => {
    setRunning(true);
    setData(null);
    const start = Date.now();
    try {
      const result = await runABVSprintTests();
      setElapsed(Date.now() - start);
      setData(result);
    } catch (e) {
      console.error("ABV Sprint error:", e);
    } finally {
      setRunning(false);
    }
  }, []);

  const allPass = data && data.passed === data.total;

  const TABS = [
    { id: "criteria",  label: "Criterios" },
    { id: "integrity", label: "Integridade" },
    { id: "scope",     label: "Escopo" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/60 to-indigo-950/60 border border-violet-800/50 rounded-xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex flex-wrap gap-2 mb-2 text-xs font-mono">
                <span className="text-violet-400">ABV v4.1</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">Foundation v1.0</span>
                <span className="text-zinc-600">·</span>
                <span className="text-emerald-400">Engineering First</span>
              </div>
              <h1 className="text-lg font-bold text-white">Sprint — Hardening & Traceability</h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Baseline Integrity · SHA-256 · Metadata · ImmutableAuditHistory · ReviewState
              </p>
            </div>
            <button
              onClick={runSuite}
              disabled={running}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors shrink-0"
            >
              {running ? "Executando..." : "▶ Executar Sprint"}
            </button>
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
              <Metric label="Criterios"   value={`${data.passed}/${data.total}`}    color={allPass ? "text-emerald-400" : "text-red-400"} />
              <Metric label="SHA-256"     value={data.sha256Confirmed ? "OK" : "FAIL"} color={data.sha256Confirmed ? "text-emerald-400" : "text-red-400"} />
              <Metric label="Integridade" value={data.integrityVerified ? "OK" : "FAIL"} color={data.integrityVerified ? "text-emerald-400" : "text-red-400"} />
              <Metric label="Historico"   value={`${data.historyEntries} entrada(s)`} color="text-indigo-400" />
              <Metric label="Duracao"     value={`${elapsed}ms`} color="text-violet-400" />
            </div>
          )}
        </div>

        {/* Running state */}
        {running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
            <div className="w-8 h-8 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Executando 15 criterios de aceitacao...</p>
            <p className="text-zinc-600 text-xs mt-1">SHA-256 · Registry · ImmutableHistory · ChangeDetection</p>
          </div>
        )}

        {/* Verdict */}
        {data && !running && (
          <div className={`rounded-xl border-2 p-5 text-center ${allPass
            ? "bg-gradient-to-br from-emerald-950/40 to-green-950/40 border-emerald-700"
            : "bg-gradient-to-br from-red-950/40 to-zinc-950/40 border-red-700"}`}>
            <p className={`text-lg font-black ${allPass ? "text-emerald-300" : "text-red-300"}`}>
              {allPass ? "Sprint Concluida com Sucesso" : `${data.total - data.passed} criterio(s) falharam`}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {allPass
                ? "SHA-256 confirmado · Metadata completa · ImmutableHistory verificado · Zero listas manuais"
                : "Criterios com falha devem ser analisados antes de promover para Engineering First."}
            </p>
          </div>
        )}

        {/* Tabs */}
        {(data || !running) && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Criteria tab ── */}
        {activeTab === "criteria" && !data && !running && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">15 Criterios de Aceitacao</p>
            <div className="space-y-1.5">
              {ACCEPTANCE_CRITERIA.map(c => (
                <div key={c.n} className="flex items-center gap-2 bg-zinc-800/40 rounded px-3 py-2">
                  <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">C{c.n}</span>
                  <CategoryBadge category={c.cat} />
                  <span className="text-zinc-300 text-xs">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "criteria" && data && (
          <div className="space-y-3">
            <CategorySummary results={data.results} />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-200">Criterios de Aceitacao — ABV v4.1</span>
                <span className={`text-xs font-mono font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                  {data.passed}/{data.total}
                </span>
              </div>
              {data.results.map(r => <TestRow key={r.criterion} result={r} />)}
            </div>
          </div>
        )}

        {/* ── Integrity tab ── */}
        {activeTab === "integrity" && (
          <div className="space-y-3">
            {!data && <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center"><p className="text-zinc-400 text-sm">Execute a sprint primeiro.</p></div>}
            {data && (
              <>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider">Baseline Integrity</p>
                  {[
                    ["Algoritmo de Hash",    "SHA-256 (Web Crypto API / djb2 fallback)"],
                    ["Tamanho do Hash",       "64 chars hex"],
                    ["Payload Coverage",     "files, imports, exports, compliance (6 metricas), evidences (todos), layers (api+deps+forbidden+boundary), abvVersion, foundationVersion"],
                    ["Dedup por Hash",       "Registry rejeita baselines com hash identico"],
                    ["Integridade OK",       data.integrityVerified ? "SIM" : "NAO"],
                    ["SHA-256 Confirmado",   data.sha256Confirmed   ? "SIM" : "NAO"],
                    ["Historico Entries",    String(data.historyEntries)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 border-b border-zinc-800 last:border-0 pb-2 last:pb-0">
                      <span className="text-zinc-500 text-xs shrink-0">{k}</span>
                      <span className="text-zinc-300 text-xs font-mono text-right break-all">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider">ImmutableAuditHistory</p>
                  <div className="space-y-1">
                    {[
                      "Append-only — nenhum metodo delete ou clear",
                      "Toda entrada possui entryId, baselineId, auditHash, hashAlgorithm",
                      "Verificacao cruzada contra BaselineRegistry",
                      "Hashes consistentes entre History e Registry",
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                        <span className="text-emerald-400 shrink-0">✓</span>{item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider">Engineering Review State</p>
                  <div className="space-y-1">
                    {[
                      ["APPROVED",            "Compliance >= 90% e sem CRITICAL"],
                      ["REQUIRES_ATTENTION",  "Evidencias CRITICAL detectadas"],
                      ["PENDING",             "Compliance < 90%, sem CRITICAL"],
                      ["REJECTED",            "Definido manualmente por Engineering Review"],
                    ].map(([state, rule]) => (
                      <div key={state} className="bg-zinc-800/40 rounded px-3 py-1.5 flex gap-3">
                        <span className="text-violet-400 font-mono text-xs w-28 shrink-0">{state}</span>
                        <span className="text-zinc-400 text-xs">{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Scope tab ── */}
        {activeTab === "scope" && (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Escopo da Sprint</p>
              {[
                ["Baseline Integrity",       "SHA-256 sobre payload canonico completo"],
                ["Baseline Metadata",        "16 campos: ID, versao, timestamp, hash, Foundation, ABV, sprint, gitCommit, duration, files, reviewState"],
                ["Real Baseline Comparison", "Diff real entre dois Baselines, com ChangeReport e ComplianceDeltas"],
                ["Timeline Evolution",       "Linha do tempo automatica derivada do Registry"],
                ["Engineering Review State", "Derivado automaticamente do ABVReport (PENDING/APPROVED/REQUIRES_ATTENTION)"],
                ["Immutable Audit History",  "Append-only, verificavel por integridade cruzada com o Registry"],
              ].map(([feature, desc]) => (
                <div key={feature} className="bg-zinc-800/40 rounded px-3 py-2">
                  <p className="text-violet-300 text-xs font-semibold font-mono">{feature}</p>
                  <p className="text-zinc-400 text-xs mt-0.5">{desc}</p>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Invariantes Mantidos</p>
              {[
                "Nenhuma lista manual introduzida",
                "Nenhuma funcionalidade arquitetural alterada",
                "Foundation v1.0 nao modificada",
                "ABV Read Only preservado",
                "Nenhuma nova RFC criada",
                "Nenhum comportamento do ABV existente alterado",
              ].map((inv, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-emerald-400 shrink-0">→</span>{inv}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}