/**
 * Phase710Page.jsx — Conversation Experience Platform Dashboard
 * Sprint 7.1.0 · Conversation Center
 */

import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  Zap,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Activity,
  Database,
  GitBranch,
  BarChart2,
  Radio,
  XCircle,
} from "lucide-react";
import { conversationManager } from "@/lib/conversation-platform/ConversationManager";
import { runCXPTests } from "@/lib/conversation-platform/cxpTests";

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Badge({ children, color = "zinc" }) {
  const colors = {
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    yellow: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
    zinc: "bg-zinc-100 text-zinc-600",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "violet" }) {
  const colors = {
    violet: "text-violet-500 bg-violet-50",
    emerald: "text-emerald-500 bg-emerald-50",
    amber: "text-amber-500 bg-amber-50",
    red: "text-red-500 bg-red-50",
    blue: "text-blue-500 bg-blue-50",
  };
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="text-lg font-bold text-zinc-800 font-heading">{value ?? "—"}</p>
        {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function TestRow({ result }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-50 last:border-0">
      {result.passed
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      <span className={`text-sm flex-1 ${result.passed ? "text-zinc-700" : "text-red-700"}`}>
        {result.name}
      </span>
      <span className="text-xs text-zinc-400">{result.durationMs}ms</span>
    </div>
  );
}

// ─── Phase710Page ─────────────────────────────────────────────────────────────

export default function Phase710Page() {
  const [activeTab, setActiveTab] = useState("overview");
  const [metrics, setMetrics] = useState(null);
  const [detailedMetrics, setDetailedMetrics] = useState([]);
  const [events, setEvents] = useState([]);
  const [recovery, setRecovery] = useState([]);
  const [testReport, setTestReport] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [liveState, setLiveState] = useState(null);

  useEffect(() => {
    loadData();
    const unsub = conversationManager.subscribe((s) => setLiveState({ ...s }));
    return unsub;
  }, []);

  const loadData = () => {
    setMetrics(conversationManager.getMetrics());
    setDetailedMetrics(conversationManager.getDetailedMetrics());
    setEvents(conversationManager.getEventHistory().slice(-50).reverse());
    setRecovery(conversationManager.getRecoveryHistory());
  };

  const runTests = async () => {
    setTestRunning(true);
    setTestReport(null);
    try {
      const report = await runCXPTests();
      setTestReport(report);
    } catch (e) {
      setTestReport({ error: e.message });
    } finally {
      setTestRunning(false);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "streaming", label: "Streaming", icon: Radio },
    { id: "recovery", label: "Recovery", icon: RotateCcw },
    { id: "events", label: "Eventos", icon: Database },
    { id: "metrics", label: "Metricas", icon: BarChart2 },
    { id: "tests", label: "Testes", icon: GitBranch },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">Conversation Center</h1>
            <p className="text-xs text-zinc-500">Sprint 7.1.0 · Conversation Experience Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={liveState?.isInitialized ? "green" : "zinc"}>
            {liveState?.isInitialized ? "Inicializado" : "Aguardando"}
          </Badge>
          <Badge color={liveState && !["idle", "error"].includes(liveState.status) ? "violet" : "zinc"}>
            {liveState?.status ?? "idle"}
          </Badge>
          <button
            onClick={loadData}
            className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={MessageSquare} label="Total Conversas" value={metrics?.total ?? 0} color="violet" />
        <StatCard icon={Clock} label="Latencia Media" value={metrics?.avgLatencyMs ? `${metrics.avgLatencyMs}ms` : "—"} color="blue" />
        <StatCard icon={Zap} label="Tokens/s" value={metrics?.avgTokensPerSecond ?? "—"} color="emerald" />
        <StatCard icon={TrendingUp} label="Primeiro Token" value={metrics?.avgTimeToFirstToken ? `${metrics.avgTimeToFirstToken}ms` : "—"} color="amber" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                activeTab === tab.id
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Live state */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Estado Atual</h3>
            {liveState ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">Status</span><Badge color={liveState.status === "error" ? "red" : liveState.status === "idle" ? "zinc" : "violet"}>{liveState.status}</Badge></div>
                <div className="flex justify-between"><span className="text-zinc-500">Fase</span><Badge color="blue">{liveState.reasoningPhase || "idle"}</Badge></div>
                <div className="flex justify-between"><span className="text-zinc-500">Sessao</span><span className="text-zinc-700 font-medium text-xs truncate max-w-[120px]">{liveState.session?.title ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Mensagens</span><span className="text-zinc-700 font-medium">{liveState.messages?.length ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Inicializado</span><Badge color={liveState.isInitialized ? "green" : "zinc"}>{liveState.isInitialized ? "Sim" : "Nao"}</Badge></div>
                <div className="flex justify-between"><span className="text-zinc-500">Streaming</span><Badge color={liveState.streamSession ? "violet" : "zinc"}>{liveState.streamSession ? "Ativo" : "Inativo"}</Badge></div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Nenhuma sessao ativa</p>
            )}
          </div>

          {/* Architecture map */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Arquitetura CXP</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                { name: "ConversationStore", desc: "Estado central", color: "violet" },
                { name: "ConversationPipeline", desc: "Orquestrador de etapas", color: "blue" },
                { name: "ConversationStreaming", desc: "Tokens em tempo real", color: "emerald" },
                { name: "ConversationRecovery", desc: "Recuperacao de falhas", color: "amber" },
                { name: "ConversationMetrics", desc: "Telemetria completa", color: "zinc" },
                { name: "ConversationPersistence", desc: "SDK centralizado", color: "violet" },
                { name: "ConversationContext", desc: "Contexto inteligente", color: "blue" },
                { name: "ConversationSessionManager", desc: "Ciclo de sessoes", color: "emerald" },
                { name: "ConversationManager", desc: "API publica unica", color: "amber" },
              ].map((m) => (
                <div key={m.name} className="border border-zinc-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-zinc-800">{m.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline steps */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Pipeline de Etapas</h3>
            <div className="flex flex-wrap gap-2 items-center">
              {["Prepare", "Persist User", "Context", "Route", "Synthesize", "Stream", "Finalize"].map((step, i, arr) => (
                <React.Fragment key={step}>
                  <span className="px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-700">{step}</span>
                  {i < arr.length - 1 && <span className="text-zinc-300 text-xs">→</span>}
                </React.Fragment>
              ))}
            </div>
            <p className="text-xs text-zinc-400 mt-3">Cada etapa possui timeout, metricas e recuperacao automatica.</p>
          </div>

          {/* Error/recovery stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Taxa de Erro</p>
              <p className="text-2xl font-bold text-zinc-800">{metrics?.errorRate ?? "0%"}</p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Cancelamentos</p>
              <p className="text-2xl font-bold text-zinc-800">{metrics?.cancellationRate ?? "0%"}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Streaming ── */}
      {activeTab === "streaming" && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Sessao de Streaming Atual</h3>
            {liveState?.streamSession ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">Estado</span><Badge color="violet">{liveState.streamSession.state}</Badge></div>
                <div className="flex justify-between"><span className="text-zinc-500">Tokens</span><span className="font-medium">{liveState.streamSession.totalTokens}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Tokens/s</span><span className="font-medium">{liveState.streamSession.tokensPerSecond?.toFixed(1) ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Primeiro Token</span><span className="font-medium">{liveState.streamSession.firstTokenAt ? `${liveState.streamSession.firstTokenAt - (liveState.streamSession.startedAt ?? 0)}ms` : "—"}</span></div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Nenhuma sessao de streaming ativa</p>
            )}
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Como o Streaming Funciona</h3>
            <div className="space-y-2 text-sm text-zinc-600">
              <p>1. LLM retorna resposta completa via <code className="bg-zinc-100 px-1 rounded text-xs">InvokeLLM()</code></p>
              <p>2. <code className="bg-zinc-100 px-1 rounded text-xs">ConversationStreaming</code> divide em tokens (palavras)</p>
              <p>3. Cada token e emitido com delay variavel (8-18ms) para efeito natural</p>
              <p>4. <code className="bg-zinc-100 px-1 rounded text-xs">StreamingMessage</code> renderiza parcialmente com cursor piscando</p>
              <p>5. Ao terminar, mensagem e persistida e placeholder substituido</p>
              <p className="text-xs text-zinc-400 mt-2">Infraestrutura pronta para SSE e WebSocket reais — apenas o body muda.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Recovery ── */}
      {activeTab === "recovery" && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Historico de Recuperacao</h3>
            {recovery.length === 0 ? (
              <p className="text-sm text-zinc-400">Nenhuma recuperacao registrada — sistema estavel.</p>
            ) : (
              <div className="space-y-2">
                {recovery.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-2 border-b border-zinc-50">
                    {r.success
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : <AlertTriangle className="w-4 h-4 text-red-500" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-700">{r.strategy} — tentativa {r.attemptNumber}</p>
                      <p className="text-xs text-zinc-400 truncate">{r.reason}</p>
                    </div>
                    <Badge color={r.success ? "green" : "red"}>{r.success ? "OK" : "FALHOU"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Garantias de Recovery</h3>
            <ul className="space-y-1.5 text-sm text-zinc-600">
              {[
                "Nenhuma excecao deixa loading=true permanentemente",
                "Timeout de 30s por execucao de pipeline",
                "safeReset() sempre chamado no finally",
                "Backoff exponencial entre tentativas",
                "Status resetado para idle ou error sempre",
              ].map((g) => (
                <li key={g} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Events ── */}
      {activeTab === "events" && (
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-800">Historico de Eventos</h3>
            <button onClick={loadData} className="text-xs text-violet-600 hover:text-violet-700">Atualizar</button>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhum evento registrado ainda.</p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {events.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-zinc-50 last:border-0">
                  <span className="text-xs font-mono text-zinc-400 shrink-0 w-20 truncate">
                    {new Date(ev.timestamp).toLocaleTimeString("pt-BR", { hour12: false })}
                  </span>
                  <Badge color={
                    ev.type.includes("ERROR") || ev.type.includes("FAIL") ? "red" :
                    ev.type.includes("STREAM") ? "violet" :
                    ev.type.includes("RECOVERY") ? "amber" :
                    ev.type.includes("SAVE") || ev.type.includes("MESSAGE") ? "blue" : "zinc"
                  }>{ev.type}</Badge>
                  {ev.executionId && (
                    <span className="text-xs text-zinc-300 font-mono truncate">{ev.executionId.slice(-8)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Metrics ── */}
      {activeTab === "metrics" && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Metricas Recentes</h3>
            {detailedMetrics.length === 0 ? (
              <p className="text-sm text-zinc-400">Nenhuma conversa registrada ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-400 border-b border-zinc-100">
                      <th className="text-left py-2 pr-3">ID</th>
                      <th className="text-right py-2 pr-3">Total</th>
                      <th className="text-right py-2 pr-3">1o Token</th>
                      <th className="text-right py-2 pr-3">Tokens/s</th>
                      <th className="text-right py-2 pr-3">Recovery</th>
                      <th className="text-right py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedMetrics.map((m) => (
                      <tr key={m.executionId} className="border-b border-zinc-50">
                        <td className="py-2 pr-3 font-mono text-zinc-400">{m.executionId.slice(-8)}</td>
                        <td className="text-right py-2 pr-3">{m.totalDurationMs}ms</td>
                        <td className="text-right py-2 pr-3">{m.timeToFirstToken ?? "—"}ms</td>
                        <td className="text-right py-2 pr-3">{m.tokensPerSecond?.toFixed(1) ?? "—"}</td>
                        <td className="text-right py-2 pr-3">{m.recoveryAttempts}</td>
                        <td className="text-right py-2">
                          <Badge color={m.error ? "red" : m.cancelled ? "amber" : "green"}>
                            {m.error ? "Erro" : m.cancelled ? "Cancelado" : "OK"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tests ── */}
      {activeTab === "tests" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={runTests}
              disabled={testRunning}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition"
            >
              {testRunning
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Executando...</>
                : <><GitBranch className="w-4 h-4" /> Executar Suite CXP</>}
            </button>

            {testReport && !testReport.error && (
              <Badge color={testReport.verdict === "PASS" ? "green" : "red"}>
                {testReport.verdict} — {testReport.totalPassed}/{testReport.totalTests}
              </Badge>
            )}
          </div>

          {testReport?.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700">{testReport.error}</p>
            </div>
          )}

          {testReport && !testReport.error && (
            <>
              {/* Architectural verdict */}
              <div className={`rounded-xl p-4 border ${testReport.verdict === "PASS" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <p className={`text-sm font-bold ${testReport.verdict === "PASS" ? "text-emerald-700" : "text-red-700"}`}>
                  {testReport.architecturalStatus}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {testReport.totalPassed} aprovados · {testReport.totalFailed} reprovados · {testReport.durationMs}ms
                </p>
              </div>

              {testReport.suites.map((suite) => (
                <div key={suite.suite} className="bg-white border border-zinc-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-zinc-800">{suite.suite}</h4>
                    <div className="flex items-center gap-2">
                      <Badge color={suite.failed === 0 ? "green" : "red"}>
                        {suite.passed}/{suite.total}
                      </Badge>
                      <span className="text-xs text-zinc-400">{suite.durationMs}ms</span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {suite.results.map((r) => <TestRow key={r.name} result={r} />)}
                  </div>
                  {suite.results.filter((r) => !r.passed).map((r) => (
                    <div key={r.name} className="mt-2 bg-red-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-red-700">{r.name}</p>
                      <p className="text-xs text-red-500 mt-1">{r.error}</p>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}