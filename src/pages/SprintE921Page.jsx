/**
 * SprintE921Page — Engineering Sprint 9.2.1
 * ImplicitConnectorIntentDetector v2 — Evidence-Based Scoring Validation
 */

import React, { useState } from "react";
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, Trophy, BarChart2, FileText } from "lucide-react";
import { Link } from "react-router-dom";

export default function SprintE921Page() {
  const [results, setResults]   = useState(null);
  const [running, setRunning]   = useState(false);
  const [liveMsg, setLiveMsg]   = useState("email da Shopee");
  const [liveResult, setLive]   = useState(null);
  const [defs, setDefs]         = useState(null);

  const loadDefs = async () => {
    const { GoalRegistry } = await import("@/lib/goals/GoalRegistry");
    return GoalRegistry.listAll();
  };

  const runTests = async () => {
    setRunning(true);
    setResults(null);
    try {
      const { runImplicitDetectorV2Tests } = await import(
        "@/lib/conversation-goal-bridge/implicitDetectorV2Tests"
      );
      const res = await runImplicitDetectorV2Tests();
      setResults(res);
    } catch (e) {
      setResults({ verdict: "FAIL", error: e.message, passed: 0, failed: 1, total: 1, results: [] });
    } finally {
      setRunning(false);
    }
  };

  const runLive = async () => {
    const allDefs = defs ?? await loadDefs();
    if (!defs) setDefs(allDefs);
    const { implicitConnectorIntentDetector } = await import(
      "@/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector"
    );
    const r = implicitConnectorIntentDetector.resolve(liveMsg, allDefs);
    setLive(r);
  };

  const connectorColor = (id) => ({
    gmail:    "text-red-400",
    calendar: "text-blue-400",
    drive:    "text-green-400",
    memory:   "text-violet-400",
  }[id] ?? "text-zinc-400");

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition mb-4">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold font-heading">Sprint 9.2.1 — ImplicitDetector v2</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Eliminação do bug <code className="bg-muted px-1 rounded">gmail-first</code> — Evidence-Based Scoring.
            A decisão é agora independente da ordem de registro dos connectors.
          </p>
        </div>

        {/* Algorithm diff */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl border border-red-900/40 bg-red-950/20">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">v1 — Algoritmo antigo (BUGADO)</p>
            <pre className="text-xs text-red-300/80 leading-relaxed">{`for (connector of registered) {
  if (connectorHasSearch) {
    return connector  // ← gmail sempre vence
  }
}`}</pre>
          </div>
          <div className="p-4 rounded-xl border border-emerald-900/40 bg-emerald-950/20">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-2">v2 — Algoritmo novo (CORRETO)</p>
            <pre className="text-xs text-emerald-300/80 leading-relaxed">{`candidates = score_all(message)
ranking = sort_by_score(candidates)
winner = ranking[0]  // ← evidências vencem`}</pre>
          </div>
        </div>

        {/* Live demo */}
        <div className="mb-6 p-4 rounded-xl border border-border bg-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <BarChart2 className="w-4 h-4" /> Demo ao vivo — Evidence Scoring
          </h2>
          <div className="flex gap-2 mb-3">
            <input
              value={liveMsg}
              onChange={(e) => setLiveMsg(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 bg-background"
              placeholder="Digite uma mensagem..."
            />
            <button
              onClick={runLive}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition"
            >
              Analisar
            </button>
          </div>

          {liveResult && (
            <div className="space-y-3">
              {/* Winner */}
              {liveResult.detected ? (
                <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/40">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-300">
                      Winner: <span className={`font-mono ${connectorColor(liveResult.resolution?.winner?.connectorId)}`}>
                        {liveResult.resolution?.winner?.connectorId}
                      </span>
                    </span>
                    <span className="ml-auto text-xs text-emerald-400 font-mono">
                      score={liveResult.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    GoalType: <code className="bg-muted px-1 rounded">{liveResult.goalType}</code>
                    {" | "}SearchTerm: <code className="bg-muted px-1 rounded">{liveResult.searchTerm}</code>
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-700">
                  <p className="text-xs text-zinc-400">Não detectado — label: <code>{liveResult.label}</code></p>
                </div>
              )}

              {/* Ranking */}
              {liveResult.resolution?.ranking?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ranking completo</p>
                  <div className="space-y-1">
                    {liveResult.resolution.ranking.map((c, i) => (
                      <div key={c.connectorId} className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground w-4">#{i + 1}</span>
                        <span className={`font-mono font-semibold w-20 ${connectorColor(c.connectorId)}`}>{c.connectorId}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet-500 rounded-full"
                            style={{ width: `${Math.round(c.score * 100)}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground font-mono w-10 text-right">{c.score.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidences */}
              {liveResult.resolution?.winner?.evidences?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Evidências do vencedor</p>
                  <div className="flex flex-wrap gap-1">
                    {liveResult.resolution.winner.evidences.map((ev, i) => (
                      <span key={i} className="text-xs bg-violet-950/50 border border-violet-800/40 text-violet-300 px-2 py-0.5 rounded-full">
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Explanation */}
              {liveResult.resolution?.explanation && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Explicação auditável</p>
                  <div className="bg-zinc-950 rounded-lg p-3 space-y-0.5">
                    {liveResult.resolution.explanation.map((line, i) => (
                      <p key={i} className="text-xs text-zinc-400 font-mono">{line}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Test runner */}
        <div className="mb-6 p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" /> Suite v2 (15 testes — 8 critérios de aceite)
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
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50"
                  : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50"
              }`}>
                {results.verdict === "PASS"
                  ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                  : <XCircle className="w-5 h-5 text-red-500" />}
                <div>
                  <p className={`text-sm font-bold ${results.verdict === "PASS" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                    {results.verdict} — {results.passed}/{results.total} testes passaram
                  </p>
                  {results.error && <p className="text-xs text-red-600 mt-0.5">{results.error}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                {results.results?.map((r) => (
                  <div key={r.name} className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${
                    r.passed ? "bg-emerald-50/50 dark:bg-emerald-950/10" : "bg-red-50 dark:bg-red-950/20"
                  }`}>
                    {r.passed
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-xs ${r.passed ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300"}`}>
                        {r.name}
                      </p>
                      {r.error && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words">{r.error}</p>}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock className="w-3 h-3" />{r.durationMs}ms
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Audit summary */}
        <div className="p-4 rounded-xl border border-border bg-muted/30 text-sm">
          <p className="font-semibold text-foreground mb-3">Auditoria Sprint 9.2.1 — Comparação v1 vs v2</p>
          <div className="space-y-2 text-xs text-muted-foreground">
            {[
              ["Causa raiz eliminada", "v1 usava Object.entries() + break (ordem dep.). v2 itera todos os connectors e produz score independente por semantica."],
              ["Sem regressão funcional", "Contrato ImplicitIntentResult mantido. Campo resolution adicionado como extensao, nao breaking."],
              ["Sem regressão arquitetural", "ConversationGoalBridge.derive() nao foi alterado. ConversationPipeline intacto."],
              ["Pipeline oficial intacto", "Apenas ImplicitConnectorIntentDetector.ts foi substituido. Todos os outros componentes sao os mesmos."],
              ["Independencia de ordem", "Testes T1 e T10 verificam com ALL_DEFS_ORDER_A vs ALL_DEFS_ORDER_B. Scores identicos."],
              ["Determinismo", "T2: 100 execucoes identicas. Score calculado por funcoes puras sem estado mutavel por chamada."],
              ["Auditavel e explicavel", "resolution.explanation[] e resolution.ranking[] retornados em cada resolucao bem-sucedida."],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">{title}: </span>
                  {desc}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}