/**
 * SprintE922Page — Engineering Sprint 9.2.2
 * Semantic Provider Registry — Validation Dashboard
 */

import React, { useState } from "react";
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, Layers, Plus } from "lucide-react";
import { Link } from "react-router-dom";

export default function SprintE922Page() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [providers, setProviders] = useState(null);

  const loadProviders = async () => {
    await import("@/lib/semantic-registry/index");
    const { ConnectorSemanticRegistry } = await import("@/lib/semantic-registry/ConnectorSemanticRegistry");
    setProviders(ConnectorSemanticRegistry.listAll().map((p) => ({
      id: p.connectorId,
      goalType: p.implicitGoalType,
    })));
  };

  const runTests = async () => {
    setRunning(true);
    setResults(null);
    try {
      const { runSemanticRegistryTests } = await import("@/lib/semantic-registry/semanticRegistryTests");
      const res = await runSemanticRegistryTests();
      setResults(res);
      await loadProviders();
    } catch (e) {
      setResults({ verdict: "FAIL", error: e.message, passed: 0, failed: 1, total: 1, results: [] });
    } finally {
      setRunning(false);
    }
  };

  const connectorColor = (id) => ({
    gmail:    "bg-red-950/40 border-red-800/40 text-red-300",
    calendar: "bg-blue-950/40 border-blue-800/40 text-blue-300",
    drive:    "bg-green-950/40 border-green-800/40 text-green-300",
    memory:   "bg-violet-950/40 border-violet-800/40 text-violet-300",
    slack:    "bg-amber-950/40 border-amber-800/40 text-amber-300",
  }[id] ?? "bg-zinc-900 border-zinc-700 text-zinc-300");

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition mb-4">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <Layers className="w-5 h-5 text-violet-400" />
            <h1 className="text-2xl font-bold font-heading">Sprint 9.2.2 — Semantic Provider Registry</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Desacoplamento arquitetural: o detector agora é um orquestrador puro.
            Todo conhecimento semântico encapsulado em <code className="bg-muted px-1 rounded">SemanticProvider</code>s independentes.
          </p>
        </div>

        {/* Architecture */}
        <div className="mb-6 p-4 rounded-xl border border-border bg-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Nova Arquitetura</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-red-950/20 border border-red-900/30">
              <p className="font-semibold text-red-400 mb-1">Antes (v2 — Sprint 9.2.1)</p>
              <p className="text-red-300/70">Detector continha GMAIL_SIGNALS, CALENDAR_SIGNALS, DRIVE_SIGNALS, MEMORY_SIGNALS e CONNECTOR_SCORERS. Novo connector = modificar o detector.</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/30">
              <p className="font-semibold text-emerald-400 mb-1">Agora (v3 — Sprint 9.2.2)</p>
              <p className="text-emerald-300/70">Detector tem ZERO tabelas. Consulta ConnectorSemanticRegistry. Novo connector = criar SemanticProvider + register(). Zero linhas do detector mudam.</p>
            </div>
          </div>
          <div className="mt-3 p-3 rounded-lg bg-zinc-900/50 font-mono text-xs text-zinc-400">
            <p className="text-violet-300 mb-1">// Para adicionar Slack:</p>
            <p>SlackSemanticProvider.ts  ← 1. criar provider</p>
            <p>ConnectorSemanticRegistry.register(SlackSemanticProvider)  ← 2. registrar</p>
            <p className="text-emerald-400 mt-1">// ImplicitConnectorIntentDetector.ts — zero alterações</p>
          </div>
        </div>

        {/* Registered providers */}
        <div className="mb-6 p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Providers Registrados</p>
            <button onClick={loadProviders} className="text-xs text-violet-400 hover:text-violet-300 transition">
              Carregar
            </button>
          </div>
          {providers ? (
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => (
                <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${connectorColor(p.id)}`}>
                  {p.id === "slack" && <Plus className="w-3 h-3" />}
                  <span>{p.id}</span>
                  <span className="opacity-60">→ {p.goalType}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Execute os testes para carregar os providers.</p>
          )}
        </div>

        {/* Test runner */}
        <div className="mb-6 p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Suite 9.2.2 (14 testes)
            </h2>
            <button
              onClick={runTests}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition"
            >
              <Play className="w-3.5 h-3.5" />
              {running ? "Executando..." : "Executar testes"}
            </button>
          </div>

          {results && (
            <>
              <div className={`flex items-center gap-3 p-3 rounded-lg mb-4 ${
                results.verdict === "PASS"
                  ? "bg-emerald-950/30 border border-emerald-900/50"
                  : "bg-red-950/30 border border-red-900/50"
              }`}>
                {results.verdict === "PASS"
                  ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                  : <XCircle className="w-5 h-5 text-red-500" />}
                <p className={`text-sm font-bold ${results.verdict === "PASS" ? "text-emerald-300" : "text-red-300"}`}>
                  {results.verdict} — {results.passed}/{results.total} testes passaram
                </p>
                {results.error && <p className="text-xs text-red-400 ml-2">{results.error}</p>}
              </div>

              <div className="space-y-1.5">
                {results.results?.map((r) => (
                  <div key={r.name} className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
                    r.passed ? "bg-emerald-950/10" : "bg-red-950/20"
                  }`}>
                    {r.passed
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium ${r.passed ? "text-emerald-300" : "text-red-300"}`}>{r.name}</p>
                      {r.error && <p className="text-red-400 mt-0.5 break-words">{r.error}</p>}
                    </div>
                    <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                      <Clock className="w-3 h-3" />{r.durationMs}ms
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Criteria */}
        <div className="p-4 rounded-xl border border-border bg-muted/30 text-xs">
          <p className="font-semibold text-foreground mb-2">Critérios de Aceite Sprint 9.2.2</p>
          <div className="space-y-1.5 text-muted-foreground">
            {[
              "Detector sem nenhuma tabela semântica",
              "Detector sem conhecimento de nenhum connector específico",
              "Todo conhecimento em SemanticProviders independentes",
              "Registry determinístico, imutável e auditável",
              "Testes da Sprint 9.2.1 continuam passando",
              "Novo connector (Slack) adicionado sem modificar o detector",
              "Ranking + explicação retornados em toda resolução bem-sucedida",
            ].map((c) => (
              <div key={c} className="flex gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}