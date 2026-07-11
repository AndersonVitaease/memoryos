// ABV — Architectural Boundary Validation Page
// Foundation v1.0 · Engineering First

import React, { useState, useCallback } from "react";
import { runABVTests } from "@/lib/abv/abvTests";

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Tag({ label, color }) {
  const colors = {
    PASS:   "bg-emerald-900/50 text-emerald-300 border-emerald-700/50",
    FAIL:   "bg-red-900/50 text-red-300 border-red-700/50",
    WARN:   "bg-yellow-900/50 text-yellow-300 border-yellow-700/50",
    ERROR:  "bg-red-900/50 text-red-300 border-red-700/50",
    INFO:   "bg-sky-900/50 text-sky-300 border-sky-700/50",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${colors[color ?? label] ?? colors.INFO}`}>{label}</span>;
}

function TestRow({ n, name, passed, duration, detail, observation, error, data }) {
  const [open, setOpen] = useState(false);
  const hasExtra = detail || observation || error || data;
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!passed ? "bg-red-950/20" : ""}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)} className="w-full flex items-center justify-between py-2 px-3 gap-2 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <Tag label={passed ? "PASS" : "FAIL"} />
          <span className="text-xs text-zinc-500 font-mono w-5 shrink-0">C{n}</span>
          <span className={`text-sm truncate ${passed ? "text-zinc-200" : "text-red-300"}`}>{name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-500 font-mono">{duration}ms</span>
          {hasExtra && <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2 ml-10 border-l-2 border-zinc-700 mb-2 space-y-1">
          {detail && <p className="text-xs text-zinc-400">{detail}</p>}
          {observation && <p className="text-xs text-yellow-400/80 italic">⚠ {observation}</p>}
          {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Dependency Graph ───────────────────────────────────────────────────────────

function DependencyGraph({ layers }) {
  if (!layers) return null;
  return (
    <div className="space-y-3">
      {layers.map(layer => (
        <div key={layer.layer} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
            <span className="font-semibold text-sm text-white">{layer.layer}</span>
            <Tag label={layer.status} />
          </div>
          <div className="p-3 space-y-2">
            <div>
              <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">API Pública</p>
              <div className="flex flex-wrap gap-1">
                {layer.publicApi.map(m => (
                  <span key={m} className="px-1.5 py-0.5 bg-zinc-800 rounded text-xs font-mono text-zinc-300">{m}</span>
                ))}
                {layer.publicApi.length === 0 && <span className="text-zinc-600 text-xs italic">nenhum</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Deps Permitidas</p>
                <div className="flex flex-wrap gap-1">
                  {layer.allowedDeps.map(d => (
                    <span key={d} className="px-1.5 py-0.5 bg-emerald-900/30 border border-emerald-800/40 rounded text-xs font-mono text-emerald-400">{d}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Deps Proibidas</p>
                <div className="flex flex-wrap gap-1">
                  {layer.forbiddenDeps.map(d => (
                    <span key={d} className="px-1.5 py-0.5 bg-red-900/30 border border-red-800/40 rounded text-xs font-mono text-red-400">{d}</span>
                  ))}
                </div>
              </div>
            </div>
            {layer.detectedDeps.length > 0 && (
              <div>
                <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Deps Detectadas</p>
                <div className="flex flex-wrap gap-1">
                  {layer.detectedDeps.map(d => (
                    <span key={d} className="px-1.5 py-0.5 bg-sky-900/30 border border-sky-800/40 rounded text-xs font-mono text-sky-400">{d}</span>
                  ))}
                </div>
              </div>
            )}
            {layer.violations.length > 0 && (
              <div className="bg-red-950/20 border border-red-800/30 rounded p-2">
                <p className="text-red-400 text-xs font-semibold mb-1">Violações ({layer.violations.length})</p>
                {layer.violations.map((v, i) => (
                  <div key={i} className="flex gap-2 items-start mb-0.5">
                    <Tag label={v.severity} />
                    <span className="text-xs text-red-300">{v.detail}</span>
                  </div>
                ))}
              </div>
            )}
            {layer.responsibilityViolations.filter(v => v.rule === "API_EXPANSION").map((v, i) => (
              <div key={i} className="bg-yellow-950/20 border border-yellow-800/30 rounded p-2">
                <div className="flex gap-2 items-start">
                  <Tag label="WARN" />
                  <span className="text-xs text-yellow-300">{v.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Report Summary ─────────────────────────────────────────────────────────────

function ReportSummary({ report }) {
  if (!report) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <p className="text-zinc-400 text-xs uppercase tracking-wider">Relatório de Auditoria Arquitetural</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "Módulos",   value: report.modulesAudited,      color: "text-zinc-200" },
          { label: "Imports",   value: report.importsAnalyzed,     color: "text-sky-400" },
          { label: "Deps OK",   value: report.validDeps,           color: "text-emerald-400" },
          { label: "Proibidas", value: report.forbiddenDeps,       color: report.forbiddenDeps > 0 ? "text-red-400" : "text-zinc-400" },
          { label: "Bound OK",  value: report.boundariesApproved,  color: "text-emerald-400" },
          { label: "Violados",  value: report.boundariesViolated,  color: report.boundariesViolated > 0 ? "text-red-400" : "text-zinc-400" },
          { label: "Circulares",value: report.circularDependencies,color: report.circularDependencies > 0 ? "text-red-400" : "text-zinc-400" },
          { label: "Duração",   value: `${report.durationMs}ms`,   color: "text-violet-400" },
        ].map(m => (
          <div key={m.label} className="bg-zinc-800 rounded px-3 py-2">
            <div className={`text-sm font-bold font-mono ${m.color}`}>{m.value}</div>
            <div className="text-zinc-500 text-xs">{m.label}</div>
          </div>
        ))}
      </div>
      <div className={`rounded px-3 py-2 text-xs border ${
        report.boundariesViolated === 0 && report.forbiddenDeps === 0
          ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
          : "bg-amber-950/30 border-amber-800/40 text-amber-300"
      }`}>
        <strong>Conclusão:</strong> {report.conclusion}
      </div>
      <p className="text-zinc-600 text-xs font-mono">
        Executado em: {new Date(report.runAt).toISOString()}
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ABVPage() {
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [elapsed, setElapsed] = useState(null);

  const run = useCallback(async () => {
    setRunning(true);
    setData(null);
    const start = Date.now();
    try {
      const result = await runABVTests();
      setElapsed(Date.now() - start);
      setData(result);
      setActiveTab("results");
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }, []);

  const summary = data ? (() => {
    const passed = data.results.filter(r => r.passed).length;
    return { passed, total: data.results.length, failed: data.results.length - passed };
  })() : null;

  const TABS = [
    { id: "overview", label: "Visão Geral" },
    { id: "results",  label: data ? `Testes (${summary.passed}/${summary.total})` : "Testes" },
    { id: "graph",    label: "Dependency Graph" },
    { id: "report",   label: "Relatório" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-violet-400 text-xs font-mono uppercase tracking-widest">Engineering First</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400 text-xs font-mono">Foundation v1.0</span>
            </div>
            <h1 className="text-xl font-bold text-white">ABV — Architectural Boundary Validation</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Auditoria automática de fronteiras arquiteturais. 10 critérios. Baseada em evidências objetivas do código implementado.
            </p>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            {running ? "Auditando..." : "▶ Executar Auditoria"}
          </button>
        </div>

        {summary && (
          <div className="mt-4 grid grid-cols-3 md:grid-cols-4 gap-2">
            {[
              { label: "Total",    value: summary.total,  color: "text-zinc-200" },
              { label: "Aprovados",value: summary.passed,  color: "text-emerald-400" },
              { label: "Falhos",   value: summary.failed,  color: summary.failed === 0 ? "text-zinc-400" : "text-red-400" },
              { label: "Duração",  value: `${elapsed}ms`, color: "text-violet-400" },
            ].map(m => (
              <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                <div className={`text-base font-bold font-mono ${m.color}`}>{m.value}</div>
                <div className="text-zinc-500 text-xs">{m.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              activeTab === t.id ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ──────────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Boundaries Auditados</p>
              {[
                {
                  layer: "Connector Runtime",
                  allowed: ["policies"],
                  forbidden: ["capability-runtime", "goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
                },
                {
                  layer: "Capability Runtime",
                  allowed: ["connector-runtime", "policies"],
                  forbidden: ["goal-engine", "planner-engine", "pie", "wme", "memory-engine"],
                },
                {
                  layer: "Goal Runtime (future)",
                  allowed: ["connector-runtime", "capability-runtime", "wme", "policies"],
                  forbidden: ["planner-engine", "pie"],
                },
              ].map(b => (
                <div key={b.layer} className="bg-zinc-800/50 rounded p-3">
                  <p className="font-semibold text-sm text-white mb-2">{b.layer}</p>
                  <div className="flex flex-wrap gap-1 mb-1">
                    <span className="text-zinc-500 text-xs mr-1">OK:</span>
                    {b.allowed.map(d => <span key={d} className="text-xs font-mono bg-emerald-900/30 text-emerald-400 border border-emerald-800/40 px-1.5 py-0.5 rounded">{d}</span>)}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="text-zinc-500 text-xs mr-1">Proibido:</span>
                    {b.forbidden.map(d => <span key={d} className="text-xs font-mono bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded">{d}</span>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Verificações Automáticas</p>
              {[
                "Imports diretos auditados por camada",
                "Dependências proibidas detectadas",
                "Dependências circulares detectadas",
                "API pública auditada contra contrato esperado",
                "Expansões indevidas da API registradas",
                "Responsabilidades proibidas por camada verificadas",
                "Dependency Graph gerado automaticamente",
                "Relatório padronizado ao final da auditoria",
                "Nenhuma correção automática — apenas evidências",
                "Encaminhamento para Engineering Review se violação",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-violet-400 shrink-0">→</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────────── */}
      {activeTab === "results" && (
        <div className="space-y-4">
          {!data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
              <p className="text-zinc-400 text-sm mb-3">Execute a auditoria para ver os resultados.</p>
              <button onClick={run} disabled={running} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-semibold">
                {running ? "Auditando..." : "▶ Executar Agora"}
              </button>
            </div>
          )}
          {data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-200">ABV — 10 Critérios de Aceitação</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold ${summary.failed === 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {summary.passed}/{summary.total}
                  </span>
                  <Tag label={summary.failed === 0 ? "PASS" : "FAIL"} />
                </div>
              </div>
              {data.results.map(r => (
                <TestRow
                  key={r.criterion}
                  n={r.criterion}
                  name={r.name}
                  passed={r.passed}
                  duration={r.durationMs}
                  detail={r.detail}
                  observation={r.observation}
                  error={r.error}
                  data={r.data}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dependency Graph ──────────────────────────────────────────────────── */}
      {activeTab === "graph" && (
        <div>
          {!data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
              <p className="text-zinc-400 text-sm">Execute a auditoria primeiro para gerar o grafo.</p>
            </div>
          )}
          {data && <DependencyGraph layers={data.report.layers} />}
        </div>
      )}

      {/* ── Report ────────────────────────────────────────────────────────────── */}
      {activeTab === "report" && (
        <div>
          {!data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
              <p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p>
            </div>
          )}
          {data && <ReportSummary report={data.report} />}
        </div>
      )}
    </div>
  );
}