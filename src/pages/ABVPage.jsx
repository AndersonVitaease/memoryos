// ABV v2 — Architectural Boundary Validation Page
// Foundation v1.0 · Engineering First · Source Code Analyzer

import React, { useState, useCallback } from "react";
import { runABVTests } from "@/lib/abv/abvTests";

// ── UI primitives ──────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  PASS: "bg-emerald-900/50 text-emerald-300 border-emerald-700/50",
  FAIL: "bg-red-900/50 text-red-300 border-red-700/50",
  WARN: "bg-yellow-900/50 text-yellow-300 border-yellow-700/50",
  ERROR:"bg-red-900/50 text-red-300 border-red-700/50",
  INFO: "bg-sky-900/50 text-sky-300 border-sky-700/50",
};

function Tag({ label }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${STATUS_COLORS[label] ?? STATUS_COLORS.INFO}`}>{label}</span>;
}

function Pill({ label, color }) {
  const c = {
    green:  "bg-emerald-900/30 border-emerald-800/40 text-emerald-400",
    red:    "bg-red-900/30 border-red-800/40 text-red-400",
    blue:   "bg-sky-900/30 border-sky-800/40 text-sky-400",
    violet: "bg-violet-900/30 border-violet-800/40 text-violet-400",
    zinc:   "bg-zinc-800 border-zinc-700/40 text-zinc-400",
  }[color] ?? "bg-zinc-800 border-zinc-700 text-zinc-400";
  return <span className={`px-1.5 py-0.5 rounded text-xs font-mono border ${c}`}>{label}</span>;
}

function Metric({ label, value, color = "text-zinc-200" }) {
  return (
    <div className="bg-zinc-800 rounded px-3 py-2">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{label}</div>
    </div>
  );
}

function TestRow({ n, name, passed, duration, detail, observation, error }) {
  const [open, setOpen] = useState(false);
  const hasExtra = detail || observation || error;
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${!passed ? "bg-red-950/10" : ""}`}>
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
      {open && hasExtra && (
        <div className="px-3 pb-2 ml-10 border-l-2 border-zinc-700 mb-1 space-y-1">
          {detail && <p className="text-xs text-zinc-400">{detail}</p>}
          {observation && <p className="text-xs text-yellow-400/80 italic">obs: {observation}</p>}
          {error && <p className="text-xs text-red-400 font-mono">error: {error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Dependency Graph tab ───────────────────────────────────────────────────────

function LayerCard({ layer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Tag label={layer.status} />
          <span className="font-semibold text-sm text-white">{layer.label}</span>
          <span className="text-zinc-500 text-xs">({layer.filesAnalyzed} arquivos)</span>
        </div>
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="p-3 space-y-3">
          <div>
            <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Imports detectados no codigo</p>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {layer.detectedImports.map((d, i) => <Pill key={i} label={d} color="blue" />)}
              {layer.detectedImports.length === 0 && <span className="text-zinc-600 text-xs italic">nenhum</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Deps permitidas</p>
              <div className="flex flex-wrap gap-1">
                {layer.allowedDeps.map(d => <Pill key={d} label={d} color="green" />)}
              </div>
            </div>
            <div>
              <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Deps proibidas</p>
              <div className="flex flex-wrap gap-1">
                {layer.forbiddenDeps.map(d => <Pill key={d} label={d} color="red" />)}
              </div>
            </div>
          </div>
          <div>
            <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Camadas detectadas no codigo</p>
            <div className="flex flex-wrap gap-1">
              {layer.detectedDeps.map(d => {
                const isForbidden = layer.forbiddenDeps.includes(d);
                return <Pill key={d} label={d} color={isForbidden ? "red" : "green"} />;
              })}
              {layer.detectedDeps.length === 0 && <span className="text-zinc-600 text-xs italic">nenhuma dep externa detectada</span>}
            </div>
          </div>
          {layer.publicApi.length > 0 && (
            <div>
              <p className="text-zinc-500 text-xs mb-1 uppercase tracking-wider">Exports / API publica</p>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {layer.publicApi.map((m, i) => <Pill key={i} label={m} color="violet" />)}
              </div>
            </div>
          )}
          {layer.violations.length > 0 && (
            <div className="bg-red-950/20 border border-red-800/30 rounded p-2 space-y-1">
              <p className="text-red-400 text-xs font-semibold">Violacoes ({layer.violations.length})</p>
              {layer.violations.map((v, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Tag label={v.severity} />
                  <span className="text-xs text-red-300">{v.detail}</span>
                </div>
              ))}
            </div>
          )}
          {layer.responsibilityViolations.length > 0 && (
            <div className="bg-yellow-950/20 border border-yellow-800/30 rounded p-2 space-y-1">
              <p className="text-yellow-400 text-xs font-semibold">Responsabilidade ({layer.responsibilityViolations.length})</p>
              {layer.responsibilityViolations.map((v, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Tag label={v.severity} />
                  <span className="text-xs text-yellow-300">{v.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Source Analysis tab ────────────────────────────────────────────────────────

function SourceAnalysisTab({ analysis }) {
  const [selected, setSelected] = useState(null);
  if (!analysis) return null;

  const layerEntries = Object.entries(analysis.layerMap).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric label="Arquivos"  value={analysis.filesAnalyzed}  color="text-zinc-200" />
        <Metric label="Imports"   value={analysis.importsFound}   color="text-sky-400" />
        <Metric label="Exports"   value={analysis.exportsFound}   color="text-violet-400" />
        <Metric label="Ciclos"    value={analysis.circularDependencies.length} color={analysis.circularDependencies.length > 0 ? "text-red-400" : "text-zinc-400"} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* Layer file counts */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Arquivos por camada</p>
          <div className="space-y-1">
            {layerEntries.map(([layer, mods]) => (
              <div
                key={layer}
                className={`flex justify-between items-center px-2 py-1 rounded cursor-pointer transition-colors ${selected === layer ? "bg-violet-900/30" : "hover:bg-zinc-800"}`}
                onClick={() => setSelected(selected === layer ? null : layer)}
              >
                <span className="text-xs font-mono text-zinc-300">{layer}</span>
                <span className="text-xs text-zinc-500">{mods.length} files</span>
              </div>
            ))}
          </div>
        </div>

        {/* File list when layer is selected */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">
            {selected ? `Arquivos — ${selected}` : "Selecione uma camada"}
          </p>
          {selected && (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {(analysis.layerMap[selected] ?? []).map(mod => (
                <div key={mod.path} className="px-2 py-1 hover:bg-zinc-800 rounded">
                  <p className="text-xs font-mono text-zinc-300 truncate">{mod.path.split("/src/lib/")[1] ?? mod.path}</p>
                  <p className="text-xs text-zinc-600">{mod.imports.length} imports · {mod.exports.length} exports</p>
                </div>
              ))}
            </div>
          )}
          {!selected && (
            <p className="text-zinc-600 text-xs italic">Clique em uma camada para ver os arquivos</p>
          )}
        </div>
      </div>

      {/* Circular dependencies */}
      {analysis.circularDependencies.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-3">
          <p className="text-red-400 text-xs font-semibold mb-2">Dependencias Circulares ({analysis.circularDependencies.length})</p>
          {analysis.circularDependencies.map((cycle, i) => (
            <div key={i} className="text-xs font-mono text-red-300 py-0.5">
              {cycle.map(p => p.split("/src/lib/")[1] ?? p).join(" -> ")}
            </div>
          ))}
        </div>
      )}
      {analysis.circularDependencies.length === 0 && (
        <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-3">
          <p className="text-emerald-400 text-xs">Nenhuma dependencia circular detectada no codigo-fonte.</p>
        </div>
      )}
    </div>
  );
}

// ── Report Summary ─────────────────────────────────────────────────────────────

function ReportSummary({ report }) {
  if (!report) return null;
  const ok = report.boundariesViolated === 0 && report.forbiddenDeps === 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric label="Arquivos analisados" value={report.filesAnalyzed}    color="text-zinc-200" />
        <Metric label="Imports analisados"  value={report.importsAnalyzed}  color="text-sky-400" />
        <Metric label="Exports analisados"  value={report.exportsAnalyzed}  color="text-violet-400" />
        <Metric label="Modulos auditados"   value={report.modulesAudited}   color="text-zinc-200" />
        <Metric label="Deps validas"        value={report.validDeps}        color="text-emerald-400" />
        <Metric label="Deps proibidas"      value={report.forbiddenDeps}    color={report.forbiddenDeps > 0 ? "text-red-400" : "text-zinc-400"} />
        <Metric label="Boundaries OK"       value={report.boundariesApproved}  color="text-emerald-400" />
        <Metric label="Boundaries violados" value={report.boundariesViolated}   color={report.boundariesViolated > 0 ? "text-red-400" : "text-zinc-400"} />
        <Metric label="Circulares"          value={report.circularDependencies} color={report.circularDependencies > 0 ? "text-red-400" : "text-zinc-400"} />
        <Metric label="Duracao"             value={`${report.durationMs}ms`}    color="text-violet-400" />
      </div>
      <div className={`rounded px-3 py-2 text-xs border ${ok ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300" : "bg-amber-950/30 border-amber-800/40 text-amber-300"}`}>
        <strong>Conclusao:</strong> {report.conclusion}
      </div>
      <p className="text-zinc-600 text-xs font-mono">Executado: {new Date(report.runAt).toISOString()}</p>

      {report.allViolations.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
          <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Todas as violacoes</p>
          {report.allViolations.map((v, i) => (
            <div key={i} className="flex gap-2 items-start py-0.5 border-b border-zinc-800 last:border-0">
              <Tag label={v.severity} />
              <div>
                <span className="text-xs text-zinc-500 font-mono mr-2">[{v.rule}]</span>
                <span className="text-xs text-zinc-300">{v.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ABVPage() {
  const [running, setRunning]   = useState(false);
  const [data, setData]         = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [elapsed, setElapsed]   = useState(null);

  const runAudit = useCallback(async () => {
    setRunning(true);
    setData(null);
    const start = Date.now();
    try {
      const result = await runABVTests();
      setElapsed(Date.now() - start);
      setData(result);
      setActiveTab("results");
    } catch (e) {
      console.error("ABV audit error:", e);
    } finally {
      setRunning(false);
    }
  }, []);

  const summary = data ? (() => {
    const passed = data.results.filter(r => r.passed).length;
    return { passed, total: data.results.length, failed: data.results.length - passed };
  })() : null;

  const TABS = [
    { id: "overview",  label: "Visao Geral" },
    { id: "results",   label: data ? `Criterios (${summary.passed}/${summary.total})` : "Criterios" },
    { id: "graph",     label: "Dep. Graph" },
    { id: "source",    label: "Source Analysis" },
    { id: "report",    label: "Relatorio" },
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
              <span className="text-zinc-600">·</span>
              <span className="text-emerald-400 text-xs font-mono">Source Code Analyzer v2</span>
            </div>
            <h1 className="text-xl font-bold text-white">ABV — Architectural Boundary Validation</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Auditoria 100% automatica baseada em codigo-fonte real. Nenhuma lista manual.
            </p>
          </div>
          <button
            onClick={runAudit}
            disabled={running}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            {running ? "Analisando codigo-fonte..." : "▶ Executar Auditoria"}
          </button>
        </div>

        {summary && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Metric label="Total"     value={summary.total}  color="text-zinc-200" />
            <Metric label="Aprovados" value={summary.passed} color="text-emerald-400" />
            <Metric label="Falhos"    value={summary.failed} color={summary.failed === 0 ? "text-zinc-400" : "text-red-400"} />
            <Metric label="Duracao"   value={`${elapsed}ms`} color="text-violet-400" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${activeTab === t.id ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Source Code Analyzer v2</p>
              {[
                "Carrega automaticamente todos os arquivos via import.meta.glob",
                "Extrai imports estaticos, absolutos, relativos e dinamicos",
                "Extrai exports e API publica de cada modulo",
                "Constroi Dependency Graph (nos + arestas) do codigo real",
                "Detecta ciclos com algoritmo DFS sobre o grafo",
                "Mapeia cada arquivo para sua camada arquitetural",
                "Nenhuma lista manual — toda evidencia do codigo-fonte",
                "Erros de leitura nao interrompem a auditoria (hardening)",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                  <span className="text-violet-400 shrink-0">→</span>
                  {item}
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Boundaries auditados</p>
              {[
                { label: "Connector Runtime", forbidden: ["capability-runtime","goal-engine","planner-engine","pie","wme","memory-engine"] },
                { label: "Capability Runtime", forbidden: ["goal-engine","planner-engine","pie","wme","memory-engine"] },
                { label: "Goal Runtime (future)", forbidden: ["planner-engine","pie"] },
              ].map(b => (
                <div key={b.label} className="bg-zinc-800/50 rounded p-2">
                  <p className="font-semibold text-xs text-white mb-1">{b.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {b.forbidden.map(d => <Pill key={d} label={d} color="red" />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {activeTab === "results" && (
        <div>
          {!data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
              <p className="text-zinc-400 text-sm mb-3">Execute a auditoria para ver os criterios.</p>
              <button onClick={runAudit} disabled={running} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-semibold">
                {running ? "Analisando..." : "▶ Executar"}
              </button>
            </div>
          )}
          {data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-200">ABV v2 — 10 Criterios de Aceitacao</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold ${summary.failed === 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {summary.passed}/{summary.total}
                  </span>
                  <Tag label={summary.failed === 0 ? "PASS" : "FAIL"} />
                </div>
              </div>
              {data.results.map(r => <TestRow key={r.criterion} {...r} n={r.criterion} />)}
            </div>
          )}
        </div>
      )}

      {/* Dependency Graph */}
      {activeTab === "graph" && (
        <div>
          {!data && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {data && (
            <div className="space-y-3">
              {data.report.layers.map(layer => <LayerCard key={layer.layer} layer={layer} />)}
            </div>
          )}
        </div>
      )}

      {/* Source Analysis */}
      {activeTab === "source" && (
        <div>
          {!data && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {data && <SourceAnalysisTab analysis={data.analysis} />}
        </div>
      )}

      {/* Report */}
      {activeTab === "report" && (
        <div>
          {!data && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center"><p className="text-zinc-400 text-sm">Execute a auditoria primeiro.</p></div>}
          {data && <ReportSummary report={data.report} />}
        </div>
      )}
    </div>
  );
}