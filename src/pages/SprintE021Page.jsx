/**
 * SprintE021Page — Engineering Sprint E-02.1
 * Conversation → Goal Bridge — Validation UI
 */

import React, { useState } from "react";
import { ArrowLeft, Play, CheckCircle, XCircle, Clock } from "lucide-react";
import { Link } from "react-router-dom";

export default function SprintE021Page() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [liveGoal, setLiveGoal] = useState(null);
  const [liveInput, setLiveInput] = useState("Leia meus ultimos 5 emails");

  const runTests = async () => {
    setRunning(true);
    setResults(null);
    try {
      const { runConversationGoalBridgeTests } = await import(
        "@/lib/conversation-goal-bridge/conversationGoalBridgeTests"
      );
      const res = await runConversationGoalBridgeTests();
      setResults(res);
    } catch (e) {
      setResults({ verdict: "FAIL", error: e.message, passed: 0, failed: 1, total: 1, results: [] });
    } finally {
      setRunning(false);
    }
  };

  const deriveGoal = async () => {
    const { conversationGoalBridge } = await import(
      "@/lib/conversation-goal-bridge/ConversationGoalBridge"
    );
    const { goal, durationMs } = conversationGoalBridge.derive(
      liveInput,
      "general_conversation",
      0.5,
    );
    setLiveGoal({ goal, durationMs });
  };

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition mb-4">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <h1 className="text-2xl font-bold font-heading">Sprint E-02.1 — Conversation → Goal Bridge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Valida que toda mensagem gera um ConversationGoal estruturado. Nenhum Connector e chamado.
          </p>
        </div>

        {/* Live demo */}
        <div className="mb-6 p-4 rounded-xl border border-border bg-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Demo ao vivo</h2>
          <div className="flex gap-2 mb-3">
            <input
              value={liveInput}
              onChange={(e) => setLiveInput(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              placeholder="Digite uma mensagem..."
            />
            <button
              onClick={deriveGoal}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition"
            >
              Derivar Goal
            </button>
          </div>
          {liveGoal && (
            <pre className="text-xs bg-zinc-950 text-green-400 p-4 rounded-lg overflow-auto">
{JSON.stringify(liveGoal.goal, null, 2)}
            </pre>
          )}
        </div>

        {/* Test runner */}
        <div className="mb-6 p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Suite de Testes (15 casos)
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
                  ? "bg-emerald-50 border border-emerald-200"
                  : "bg-red-50 border border-red-200"
              }`}>
                {results.verdict === "PASS"
                  ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                  : <XCircle className="w-5 h-5 text-red-500" />}
                <div>
                  <p className={`text-sm font-bold ${results.verdict === "PASS" ? "text-emerald-700" : "text-red-700"}`}>
                    {results.verdict} — {results.passed}/{results.total} testes passaram
                  </p>
                  {results.error && <p className="text-xs text-red-600 mt-0.5">{results.error}</p>}
                </div>
              </div>

              <div className="space-y-2">
                {results.results?.map((r) => (
                  <div key={r.name} className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${
                    r.passed ? "bg-emerald-50/50" : "bg-red-50"
                  }`}>
                    {r.passed
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium ${r.passed ? "text-emerald-800" : "text-red-800"}`}>{r.name}</p>
                      {r.error && <p className="text-xs text-red-600 mt-0.5 break-words">{r.error}</p>}
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

        {/* Architecture note */}
        <div className="p-4 rounded-xl border border-border bg-muted/30 text-sm">
          <p className="font-semibold text-foreground mb-2">Ponto de integracão no ConversationPipeline</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            O <code className="bg-muted px-1 py-0.5 rounded">conversationGoalBridge.derive()</code> e chamado
            no <strong>step "route"</strong> do <code className="bg-muted px-1 py-0.5 rounded">ConversationPipeline._runPipeline()</code>,
            imediatamente apos o <code className="bg-muted px-1 py-0.5 rounded">primaryRouter.route()</code> retornar.
            O Goal e emitido como evento <code className="bg-muted px-1 py-0.5 rounded">PIPELINE_STEP / goal_derived</code>
            e nao altera nenhum outro comportamento. Nenhum Connector e chamado.
          </p>
        </div>
      </div>
    </div>
  );
}