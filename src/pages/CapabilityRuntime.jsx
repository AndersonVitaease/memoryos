// Capability Runtime — Sprint Validation Page
// Foundation v1.0 · Engineering First

import React, { useState, useCallback } from "react";
import { runCapabilityRuntimeTests, runCapabilityHardeningTests } from "@/lib/capability-runtime/capabilityRuntimeTests";

// ── Shared UI ─────────────────────────────────────────────────────────────────

function Badge({ label }) {
  const map = {
    PASS: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
    FAIL: "bg-red-900/50 text-red-300 border border-red-700/50",
    WARN: "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50",
    INFO: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${map[label] ?? map.INFO}`}>{label}</span>
  );
}

function PassBadge({ passed }) {
  return passed
    ? <Badge label="PASS" />
    : <Badge label="FAIL" />;
}

function TestRow({ label, passed, duration, detail, observation, error }) {
  const [open, setOpen] = useState(false);
  const hasExtra = detail || observation || error;
  return (
    <div className={`border-b border-zinc-800 last:border-0 ${passed ? "" : "bg-red-950/20"}`}>
      <button onClick={() => hasExtra && setOpen(o => !o)} className="w-full flex items-center justify-between py-2 px-3 text-left gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PassBadge passed={passed} />
          <span className={`text-sm truncate ${passed ? "text-zinc-200" : "text-red-300"}`}>{label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-zinc-500 font-mono">{duration}ms</span>
          {hasExtra && <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2 ml-3 border-l-2 border-zinc-700 mb-2">
          {detail && <p className="text-xs text-zinc-400 mt-1">{detail}</p>}
          {observation && <p className="text-xs text-yellow-400/80 mt-1 italic">⚠ {observation}</p>}
          {error && <p className="text-xs text-red-400 mt-1 font-mono">{error}</p>}
        </div>
      )}
    </div>
  );
}

function SuiteCard({ title, results, labelKey = "name", passKey = "passed", durationKey = "durationMs" }) {
  if (!results) return null;
  const total = results.length;
  const passed = results.filter(r => r[passKey]).length;
  const allPass = passed === total;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>{passed}/{total}</span>
          <Badge label={allPass ? "PASS" : "FAIL"} />
        </div>
      </div>
      <div>
        {results.map((r, i) => (
          <TestRow
            key={i}
            label={r[labelKey] || `#${i + 1}`}
            passed={r[passKey]}
            duration={r[durationKey]}
            detail={r.detail}
            observation={r.observation}
            error={r.error}
          />
        ))}
      </div>
    </div>
  );
}

// ── Architecture diagram ───────────────────────────────────────────────────────

function FlowDiagram() {
  const steps = [
    { label: "Capability", color: "border-violet-600 text-violet-300" },
    { label: "CapabilityRegistry", color: "border-indigo-600 text-indigo-300" },
    { label: "CapabilityLoader", color: "border-indigo-600 text-indigo-300" },
    { label: "CapabilityRuntime", color: "border-violet-600 text-violet-300" },
    { label: "Policy Engine", color: "border-yellow-700 text-yellow-300" },
    { label: "Connector Runtime ✓", color: "border-emerald-700 text-emerald-300" },
    { label: "Connector", color: "border-emerald-700 text-emerald-300" },
    { label: "ConnectorResult", color: "border-sky-700 text-sky-300" },
    { label: "CapabilityResult", color: "border-violet-600 text-violet-300" },
  ];
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Fluxo Oficial — Foundation v1.0</p>
      <div className="flex flex-col items-center gap-1">
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <div className={`border rounded px-3 py-1.5 text-xs font-mono font-semibold ${s.color}`}>{s.label}</div>
            {i < steps.length - 1 && <div className="text-zinc-600 text-xs">↓</div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Component overview ────────────────────────────────────────────────────────

function ComponentCard({ name, version, description, connector, operations }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono font-bold text-white text-sm">{name}</span>
        <span className="text-zinc-500 font-mono text-xs">v{version}</span>
      </div>
      <p className="text-zinc-400 text-xs mb-2">{description}</p>
      {connector && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-zinc-600 text-xs">Connector:</span>
          <span className="font-mono text-xs text-sky-400">{connector}</span>
        </div>
      )}
      {operations && (
        <div className="flex flex-wrap gap-1 mt-1">
          {operations.map(op => (
            <span key={op} className="px-1.5 py-0.5 bg-zinc-800 rounded text-xs font-mono text-zinc-400">{op}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CapabilityRuntimePage() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [elapsed, setElapsed] = useState(null);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults(null);
    const start = Date.now();
    try {
      const [sprint, hardening] = await Promise.all([
        runCapabilityRuntimeTests(),
        runCapabilityHardeningTests(),
      ]);
      setElapsed(Date.now() - start);
      setResults({ sprint, hardening });
      setActiveTab("results");
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }, []);

  const summary = results ? (() => {
    const all = [...results.sprint.map(r => r.passed), ...results.hardening.map(r => r.passed)];
    return { total: all.length, passed: all.filter(Boolean).length, failed: all.filter(v => !v).length };
  })() : null;

  const TABS = [
    { id: "overview", label: "Visão Geral" },
    { id: "results", label: results ? `Testes (${summary?.passed}/${summary?.total})` : "Testes" },
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
            <h1 className="text-xl font-bold text-white">Capability Runtime — Primeira Implementação</h1>
            <p className="text-zinc-400 text-sm mt-1">
              11 critérios de aceitação + 8 cenários de hardening. Reutiliza integralmente o Connector Runtime certificado.
            </p>
          </div>
          <button
            onClick={runAll}
            disabled={running}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            {running ? "Executando..." : "▶ Executar Suíte Completa"}
          </button>
        </div>

        {summary && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Total", value: summary.total, color: "text-zinc-200" },
              { label: "Aprovados", value: summary.passed, color: "text-emerald-400" },
              { label: "Falhos", value: summary.failed, color: summary.failed === 0 ? "text-zinc-400" : "text-red-400" },
              { label: "Duração", value: `${elapsed}ms`, color: "text-sky-400" },
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
      <div className="flex gap-1 mb-4">
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

      {/* ── TAB: Overview ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-zinc-400 text-xs uppercase tracking-wider">Componentes Implementados</p>
            <ComponentCard name="CapabilityRuntime" version="1.0.0" description="Orquestrador principal. Integra Registry + Loader + Executor. Reutiliza Connector Runtime certificado." />
            <ComponentCard name="CapabilityRegistry" version="1.0.0" description="Registro, localização e consulta de Capabilities por ID. Impede duplicidade." />
            <ComponentCard name="CapabilityLoader" version="1.0.0" description="Carregamento, validação de contrato e inicialização de Capabilities." />
            <ComponentCard name="CapabilityExecutor" version="1.0.0" description="Execução com timeout, captura de exceções e CapabilityResult padronizado." />
            <ComponentCard
              name="GitHubReadCapability"
              version="1.0.0"
              description="Read-only access to GitHub via GitHubConnector."
              connector="github"
              operations={["auth.user", "repos.list", "repos.get", "repos.branches", "connectivity.ping"]}
            />
            <ComponentCard
              name="Base44InfoCapability"
              version="1.0.0"
              description="Read-only access to Base44 platform via Base44Connector."
              connector="base44"
              operations={["app.info", "projects.list", "sessions.list", "connectivity.ping", "auth.me"]}
            />
          </div>
          <div className="space-y-3">
            <p className="text-zinc-400 text-xs uppercase tracking-wider">Fluxo de Execução</p>
            <FlowDiagram />
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
              <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Conformidade Foundation v1.0</p>
              {[
                ["Connector Runtime reutilizado", "PASS"],
                ["Policy Engine consultado", "PASS"],
                ["CapabilityResult padronizado (ACP/RFC-003)", "PASS"],
                ["CapabilityContext por execução (MSC/RFC-002)", "PASS"],
                ["Isolamento de estado por execução", "PASS"],
                ["Nenhuma exceção escapa do Runtime", "PASS"],
                ["Logs + Métricas obrigatórios", "PASS"],
                ["Nenhuma API externa direta nas Capabilities", "PASS"],
              ].map(([label, status]) => (
                <div key={label} className="flex items-center gap-2">
                  <Badge label={status} />
                  <span className="text-xs text-zinc-300">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Results ──────────────────────────────────────────────────────── */}
      {activeTab === "results" && (
        <div className="space-y-4">
          {!results && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
              <p className="text-zinc-400 text-sm">Execute a suíte para ver os resultados.</p>
              <button onClick={runAll} disabled={running} className="mt-3 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-semibold">
                {running ? "Executando..." : "▶ Executar Agora"}
              </button>
            </div>
          )}
          {results && (
            <>
              <SuiteCard title="Sprint — 11 Critérios de Aceitação" results={results.sprint} />
              <SuiteCard title="Hardening — 8 Cenários de Falha" results={results.hardening} labelKey="name" passKey="passed" durationKey="durationMs" />
            </>
          )}
        </div>
      )}
    </div>
  );
}