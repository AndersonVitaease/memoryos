/**
 * SprintWE01Page.jsx — Watch Engine WE-01 Dashboard
 * Sprint WE-01 | RFC-005 | ADR-012 | EPIC-017
 * Foundation: Entidades + WatchTypes + WatchValidator + WatchRegistry
 */

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import LiveStatusPanel from "@/components/watch-engine/LiveStatusPanel";

const STATUS_COLOR = {
  active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  paused:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  error:     "bg-red-500/10 text-red-400 border-red-500/20",
  invalid:   "bg-zinc-500/10 text-zinc-400 border-zinc-700",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const PRIORITY_COLOR = {
  critical: "text-red-400",
  high:     "text-orange-400",
  normal:   "text-zinc-300",
  low:      "text-zinc-500",
};

function PlannerAuditPanel() {
  const [msg, setMsg]           = useState("me avise quando chegar um email novo");
  const [plannerLog, setPlannerLog] = useState([]);
  const [dedupLog, setDedupLog]     = useState([]);
  const [auditData, setAuditData]   = useState(null);
  const [running, setRunning]       = useState(false);

  const testPlanner = async () => {
    setRunning(true);
    const logs = [];
    try {
      const { watchPlannerBridge } = await import("@/lib/watch-engine/WatchPlannerBridge");
      const hasIntent = watchPlannerBridge.hasMonitoringIntent(msg);
      logs.push({ ok: true, msg: `hasMonitoringIntent: ${hasIntent}` });
      if (hasIntent) {
        const result = await watchPlannerBridge.processMessage(msg, "demo-session");
        logs.push({ ok: result.detected, msg: `detected=${result.detected} | created=${result.created} | wasDuplicate=${result.wasDuplicate}` });
        logs.push({ ok: true, msg: result.message });
        if (result.watchId) logs.push({ ok: true, msg: `Watch ID: ${result.watchId}` });
      }
    } catch (e) {
      logs.push({ ok: false, msg: `Erro: ${e.message}` });
    } finally {
      setRunning(false);
    }
    setPlannerLog(logs);
  };

  const testDedup = async () => {
    setRunning(true);
    const logs = [];
    try {
      const { watchDeduplicator } = await import("@/lib/watch-engine/WatchDeduplicator");
      const tree1 = { kind: "leaf", provider: "gmail", action: "count_unread", params: {}, result_path: "count", comparator: "gt", value: 0 };
      const r1 = await watchDeduplicator.check(tree1, "demo-session");
      logs.push({ ok: true, msg: `Check gmail/count_unread → isDuplicate=${r1.isDuplicate} | matchType=${r1.matchType}` });
      if (r1.isDuplicate) logs.push({ ok: true, msg: `Duplicata: "${r1.existingWatchName}" (${Math.round((r1.similarity ?? 1)*100)}% similar)` });

      const tree2 = { kind: "leaf", provider: "drive", action: "list_recent", params: {}, result_path: "count", comparator: "gt", value: 0 };
      const r2 = await watchDeduplicator.check(tree2, "demo-session");
      logs.push({ ok: true, msg: `Check drive/list_recent → isDuplicate=${r2.isDuplicate} | matchType=${r2.matchType}` });
    } catch (e) {
      logs.push({ ok: false, msg: `Erro: ${e.message}` });
    } finally {
      setRunning(false);
    }
    setDedupLog(logs);
  };

  const loadAudit = async () => {
    setRunning(true);
    try {
      const { watchAuditStore } = await import("@/lib/watch-engine/WatchAuditStore");
      const [exec, actions] = await Promise.all([
        watchAuditStore.getExecutionSummary(),
        watchAuditStore.getPendingActionSummary(),
      ]);
      setAuditData({ exec, actions });
    } catch (e) {
      setAuditData({ error: e.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Planner Bridge */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">WatchPlannerBridge — Detecção "me avise quando..."</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-zinc-400 text-sm">Simula o Planner cognitivo detectando intenção de monitoramento e criando Watch automaticamente.</p>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 rounded"
              placeholder="Digite uma mensagem..."
            />
            <button onClick={testPlanner} disabled={running}
              className="text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded disabled:opacity-50 shrink-0">
              {running ? "..." : "Testar"}
            </button>
          </div>
          <div className="flex gap-1 flex-wrap text-xs">
            {["me avise quando chegar um email", "monitore o Drive por arquivos novos", "fique de olho no calendar", "qual é o tempo hoje"].map((s) => (
              <button key={s} onClick={() => setMsg(s)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-2 py-1 rounded">
                {s}
              </button>
            ))}
          </div>
          {plannerLog.length > 0 && (
            <div className="bg-zinc-800 rounded p-3 space-y-1">
              {plannerLog.map((l, i) => (
                <div key={i} className={`text-xs font-mono ${l.ok ? "text-emerald-400" : "text-red-400"}`}>{l.ok ? "✓" : "✗"} {l.msg}</div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deduplicator */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">WatchDeduplicator — Hash exato + Jaccard semântico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-zinc-400 text-sm">Verifica se existem Watches semanticamente equivalentes antes de criar um novo (threshold Jaccard ≥ 80%).</p>
          <button onClick={testDedup} disabled={running}
            className="text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded disabled:opacity-50">
            {running ? "..." : "Testar Deduplicação"}
          </button>
          {dedupLog.length > 0 && (
            <div className="bg-zinc-800 rounded p-3 space-y-1">
              {dedupLog.map((l, i) => (
                <div key={i} className={`text-xs font-mono ${l.ok ? "text-emerald-400" : "text-red-400"}`}>{l.ok ? "✓" : "✗"} {l.msg}</div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Dashboard */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-sm">WatchAuditStore — Dashboard de Auditoria</CardTitle>
            <button onClick={loadAudit} disabled={running}
              className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 px-3 py-1 rounded disabled:opacity-50">
              {running ? "..." : "Carregar"}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {!auditData && <p className="text-zinc-500 text-sm">Clique em "Carregar" para ver os dados de auditoria.</p>}
          {auditData?.error && <p className="text-red-400 text-sm">Erro: {auditData.error}</p>}
          {auditData?.exec && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {[
                  { label: "Execuções",  value: auditData.exec.totalExecutions,   color: "text-white" },
                  { label: "Sucesso",    value: auditData.exec.successExecutions,  color: "text-emerald-400" },
                  { label: "Falhas",     value: auditData.exec.failureExecutions,  color: "text-red-400" },
                  { label: "Disparos",   value: auditData.exec.triggeredExecutions,color: "text-violet-400" },
                  { label: "Avg ms",     value: auditData.exec.avgDurationMs,      color: "text-zinc-300" },
                ].map((m, i) => (
                  <div key={i} className="bg-zinc-800 rounded p-2 text-center">
                    <div className={`font-bold text-base ${m.color}`}>{m.value}</div>
                    <div className="text-zinc-500">{m.label}</div>
                  </div>
                ))}
              </div>
              {auditData.exec.topProviders.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Top Providers</div>
                  <div className="flex gap-2 flex-wrap">
                    {auditData.exec.topProviders.map((p, i) => (
                      <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">{p.provider}: {p.calls}</span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-zinc-500 mb-1">Outbox Actions</div>
                <div className="flex gap-4 text-xs text-zinc-400">
                  <span>Total: {auditData.actions.total}</span>
                  <span className="text-amber-400">Pendentes: {auditData.actions.pending}</span>
                  <span className="text-emerald-400">Despachados: {auditData.actions.dispatched}</span>
                  <span className="text-red-400">Falhas: {auditData.actions.failed}</span>
                  <span className="text-zinc-500">Expirados: {auditData.actions.expired}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OutboxStatePanel() {
  const [log, setLog]     = useState([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus]   = useState(null);

  const runCycle = async () => {
    setRunning(true);
    const logs = [];
    try {
      const { watchCognitiveBridge } = await import("@/lib/watch-engine/WatchCognitiveBridge");
      await watchCognitiveBridge.init();
      const cycle = await watchCognitiveBridge.runCycle();
      logs.push({ ok: true, msg: `Scheduler: processados=${cycle.schedulerProcessed} | disparados=${cycle.schedulerTriggered}` });
      logs.push({ ok: true, msg: `Outbox: despachados=${cycle.outboxDispatched} | falhas=${cycle.outboxFailed}` });
      logs.push({ ok: true, msg: `Ciclo completo em ${cycle.durationMs}ms` });
      const s = await watchCognitiveBridge.getSystemStatus();
      setStatus(s);
    } catch (e) {
      logs.push({ ok: false, msg: `Erro: ${e.message}` });
    } finally {
      setRunning(false);
    }
    setLog(logs);
  };

  const testStateTracker = async () => {
    setRunning(true);
    const logs = [];
    try {
      const { WatchStateTrackerClass } = await import("@/lib/watch-engine/WatchStateTracker");
      const tracker = new WatchStateTrackerClass();
      const s1 = tracker.record("demo", false);
      logs.push({ ok: true, msg: `record(false) → triggered=${s1.isTriggered} | consecutiveFalse=${s1.consecutiveFalse}` });
      const s2 = tracker.record("demo", true);
      logs.push({ ok: s2.isTriggered, msg: `record(true) → triggered=${s2.isTriggered} (transição false→true detectada)` });
      const s3 = tracker.record("demo", true);
      logs.push({ ok: !s3.isTriggered, msg: `record(true) novamente → triggered=${s3.isTriggered} (anti-spam: correto)` });
      const m = tracker.getMetrics();
      logs.push({ ok: true, msg: `Métricas: trackedWatches=${m.trackedWatches} | currentlyTrue=${m.currentlyTrue}` });
    } catch (e) {
      logs.push({ ok: false, msg: `Erro: ${e.message}` });
    } finally {
      setRunning(false);
    }
    setLog(logs);
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white text-sm">WatchOutbox + WatchStateTracker — Demo WE-03</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-zinc-400 text-sm">
          Testa o ciclo completo Scheduler → Outbox via WatchCognitiveBridge e o StateTracker com detecção de transição false→true.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={runCycle}
            disabled={running}
            className="text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {running ? "Executando..." : "Rodar Ciclo Completo"}
          </button>
          <button
            onClick={testStateTracker}
            disabled={running}
            className="text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-4 py-2 rounded disabled:opacity-50"
          >
            {running ? "..." : "Testar StateTracker"}
          </button>
        </div>

        {status && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { label: "Watches ativos",   value: status.registry.activeWatches },
              { label: "Rastreados",        value: status.tracker.trackedWatches },
              { label: "Currently true",    value: status.tracker.currentlyTrue },
              { label: "Outbox runs",       value: status.outbox.runCount },
            ].map((m, i) => (
              <div key={i} className="bg-zinc-800 rounded p-2 text-center">
                <div className="text-zinc-200 font-bold">{m.value}</div>
                <div className="text-zinc-500">{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {log.length > 0 && (
          <div className="bg-zinc-800 rounded-lg p-3 space-y-1">
            {log.map((l, i) => (
              <div key={i} className={`text-xs font-mono ${l.ok ? "text-emerald-400" : "text-red-400"}`}>
                {l.ok ? "✓" : "✗"} {l.msg}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EvaluatorPanel() {
  const [evalLog, setEvalLog] = useState([]);
  const [gwMetrics, setGwMetrics] = useState(null);
  const [isEval, setIsEval] = useState(false);

  const runEval = async () => {
    setIsEval(true);
    const logs = [];
    try {
      const { WatchEvaluatorClass } = await import("@/lib/watch-engine/WatchEvaluator");
      const { ConnectorGatewayClass } = await import("@/lib/watch-engine/ConnectorGateway");
      const { serializeConditionTree } = await import("@/lib/watch-engine/WatchValidator");

      const gw = new ConnectorGatewayClass();
      const ev = new WatchEvaluatorClass();

      const tree = {
        kind: "AND",
        conditions: [
          { kind: "leaf", provider: "gmail", action: "count_unread", params: {}, result_path: "count", comparator: "gt", value: 0 },
          { kind: "OR", conditions: [
            { kind: "leaf", provider: "drive", action: "list_recent", params: {}, result_path: "count", comparator: "gt", value: 0 },
            { kind: "NOT", condition: { kind: "leaf", provider: "calendar", action: "get_event_count", params: {}, result_path: "count", comparator: "eq", value: 0 } },
          ]},
        ],
      };

      const compiled = ev.compile("demo-eval", serializeConditionTree(tree));
      logs.push({ ok: true, msg: `Compilado: ${compiled.pipeline.length} steps no pipeline` });

      // Executa cada step via gateway stub
      const providerResults = {};
      for (const step of compiled.pipeline) {
        try {
          const r = await gw.execute(step.provider, step.action, step.params);
          providerResults[step.resultKey] = r;
          logs.push({ ok: true, msg: `${step.provider}.${step.action} → ${JSON.stringify(r)}` });
        } catch (e) {
          logs.push({ ok: false, msg: `${step.provider}.${step.action} FALHOU: ${e.message}` });
        }
      }

      const result = compiled.evaluate(providerResults);
      logs.push({ ok: true, msg: `Resultado final: ${result} (stubs retornam count=0)` });

      setGwMetrics(gw.getMetrics());
    } catch (e) {
      logs.push({ ok: false, msg: `Erro: ${e.message}` });
    } finally {
      setIsEval(false);
    }
    setEvalLog(logs);
  };

  const runSchedulerTick = async () => {
    setIsEval(true);
    try {
      const { watchScheduler } = await import("@/lib/watch-engine/WatchScheduler");
      const result = await watchScheduler.tick();
      setEvalLog([{ ok: true, msg: `Tick concluído: processados=${result.processed} | disparados=${result.triggered} | falhas=${result.failed} | ${result.durationMs}ms` }]);
    } catch (e) {
      setEvalLog([{ ok: false, msg: `Erro no tick: ${e.message}` }]);
    } finally {
      setIsEval(false);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white text-sm">WatchEvaluator + ConnectorGateway — Demo WE-02</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-zinc-400 text-sm">
          Testa o compilador de ConditionTree (AND/OR/NOT → função JS pura) e o ConnectorGateway com Token Bucket e Circuit Breaker.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={runEval}
            disabled={isEval}
            className="text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {isEval ? "Executando..." : "Testar Compilador + Gateway"}
          </button>
          <button
            onClick={runSchedulerTick}
            disabled={isEval}
            className="text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-4 py-2 rounded disabled:opacity-50"
          >
            {isEval ? "Executando..." : "Disparar Scheduler Tick"}
          </button>
        </div>
        {gwMetrics && (
          <div className="flex gap-4 text-xs text-zinc-400">
            <span>Calls totais: {gwMetrics.totalCalls}</span>
            <span>Erros: {gwMetrics.totalErrors}</span>
            <span>Providers registrados: {gwMetrics.registeredCount}</span>
          </div>
        )}
        {evalLog.length > 0 && (
          <div className="bg-zinc-800 rounded-lg p-3 space-y-1">
            {evalLog.map((l, i) => (
              <div key={i} className={`text-xs font-mono ${l.ok ? "text-emerald-400" : "text-red-400"}`}>
                {l.ok ? "✓" : "✗"} {l.msg}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, color = "text-white" }) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-zinc-400 mt-1">{label}</div>
    </div>
  );
}

export default function SprintWE01Page() {
  const [testResult, setTestResult]   = useState(null);
  const [isRunning, setIsRunning]     = useState(false);
  const [metrics, setMetrics]         = useState(null);
  const [watches, setWatches]         = useState([]);
  const [isCreating, setIsCreating]   = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [activeTab, setActiveTab]     = useState("overview");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { watchRegistry } = await import("@/lib/watch-engine/WatchRegistry");
      const [m, list] = await Promise.all([
        watchRegistry.getMetrics(),
        watchRegistry.list({ limit: 20 }),
      ]);
      setMetrics(m);
      setWatches(list.watches);
    } catch (err) {
      console.error("[WE-01] Falha ao carregar dados:", err);
    }
  };

  const runTests = async () => {
    setIsRunning(true);
    setTestResult(null);
    try {
      const { runWatchEngineTests } = await import("@/lib/watch-engine/watchEngineTests");
      setTestResult(runWatchEngineTests());
    } finally {
      setIsRunning(false);
    }
  };

  const createSampleWatch = async () => {
    setIsCreating(true);
    setCreateResult(null);
    try {
      const { watchRegistry } = await import("@/lib/watch-engine/WatchRegistry");
      const result = await watchRegistry.create({
        name: "Monitor Gmail — Demo WE-01",
        description: "Verifica se há novos emails não lidos no inbox",
        condition: {
          kind: "leaf",
          provider: "gmail",
          action: "count_unread",
          params: { label: "INBOX" },
          result_path: "count",
          comparator: "gt",
          value: 0,
        },
        frequency_minutes: 15,
        priority: "normal",
        on_trigger: { type: "notify_user" },
      });
      setCreateResult(result);
      if (result.ok) await loadData();
    } finally {
      setIsCreating(false);
    }
  };

  const createComplexWatch = async () => {
    setIsCreating(true);
    setCreateResult(null);
    try {
      const { watchRegistry } = await import("@/lib/watch-engine/WatchRegistry");
      const result = await watchRegistry.create({
        name: "Monitor Complexo — Gmail AND Drive",
        description: "Dispara quando há emails E arquivos novos",
        condition: {
          kind: "AND",
          conditions: [
            {
              kind: "leaf",
              provider: "gmail",
              action: "count_unread",
              params: { label: "INBOX" },
              result_path: "count",
              comparator: "gt",
              value: 0,
            },
            {
              kind: "OR",
              conditions: [
                {
                  kind: "leaf",
                  provider: "drive",
                  action: "list_recent",
                  params: { days: 1 },
                  result_path: "count",
                  comparator: "gt",
                  value: 0,
                },
                {
                  kind: "NOT",
                  condition: {
                    kind: "leaf",
                    provider: "calendar",
                    action: "get_event_count",
                    params: { today: true },
                    result_path: "count",
                    comparator: "eq",
                    value: 0,
                  },
                },
              ],
            },
          ],
        },
        frequency_minutes: 30,
        priority: "high",
        on_trigger: { type: "emit_event", payload: { event: "WatchTriggered" } },
      });
      setCreateResult(result);
      if (result.ok) await loadData();
    } finally {
      setIsCreating(false);
    }
  };

  const handlePause = async (id) => {
    const { watchRegistry } = await import("@/lib/watch-engine/WatchRegistry");
    await watchRegistry.pause(id);
    await loadData();
  };

  const handleResume = async (id) => {
    const { watchRegistry } = await import("@/lib/watch-engine/WatchRegistry");
    await watchRegistry.resume(id);
    await loadData();
  };

  const handleDelete = async (id) => {
    const { watchRegistry } = await import("@/lib/watch-engine/WatchRegistry");
    await watchRegistry.delete(id);
    await loadData();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">👁️</span>
              <h1 className="text-2xl font-bold text-white">Watch Engine — WE-01 a WE-04</h1>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-xs">
                EPIC-017 COMPLETO
              </Badge>
            </div>
            <p className="text-zinc-400 text-sm">
              WE-01 Foundation · WE-02 Evaluator · WE-03 Outbox+State · WE-04 Planner+Dedup+Audit
            </p>
          </div>
          <Button
            onClick={runTests}
            disabled={isRunning}
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm"
          >
            {isRunning ? "Testando..." : "Executar Testes WE-01"}
          </Button>
        </div>

        {/* Métricas */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Total"     value={metrics.totalWatches}   color="text-white" />
            <MetricCard label="Ativos"    value={metrics.activeWatches}  color="text-emerald-400" />
            <MetricCard label="Pausados"  value={metrics.pausedWatches}  color="text-amber-400" />
            <MetricCard label="Erros"     value={metrics.errorWatches}   color="text-red-400" />
            <MetricCard label="Inválidos" value={metrics.invalidWatches} color="text-zinc-400" />
            <MetricCard label="Disparos"  value={metrics.totalTriggers}  color="text-violet-400" />
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-400">{testResult.passed}</div>
                  <div className="text-xs text-zinc-500">Passou</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${testResult.failed > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {testResult.failed}
                  </div>
                  <div className="text-xs text-zinc-500">Falhou</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-zinc-300">{testResult.durationMs}ms</div>
                  <div className="text-xs text-zinc-500">Duração</div>
                </div>
                <div className="ml-auto">
                  <Badge className={testResult.certified
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border"
                    : "bg-red-500/10 text-red-400 border-red-500/20 border"}>
                    {testResult.certified ? "WE-01 CERTIFICADO" : "FALHOU"}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                {testResult.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={r.passed ? "text-emerald-400" : "text-red-400"}>
                      {r.passed ? "✓" : "✗"}
                    </span>
                    <span className={r.passed ? "text-zinc-400" : "text-red-400"}>{r.scenario}</span>
                    {r.error && <span className="text-red-500">— {r.error}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
          {[
            { id: "overview",  label: "Watches Ativos" },
            { id: "create",    label: "Criar Watch" },
            { id: "evaluator", label: "Evaluator WE-02" },
            { id: "we03",      label: "Outbox+State WE-03" },
            { id: "we04",      label: "Planner+Audit WE-04" },
            { id: "live",      label: "Status ao Vivo" },
            { id: "arch",      label: "Arquitetura" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? "text-violet-400 border-b-2 border-violet-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Watches */}
        {activeTab === "overview" && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">
                Watches Registrados ({watches.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {watches.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-4">
                  Nenhum Watch criado ainda. Use a aba "Criar Watch" para começar.
                </p>
              )}
              {watches.map((w) => (
                <div key={w.id} className="bg-zinc-800/50 rounded-lg px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-200 font-medium">{w.name}</span>
                        <span className={`text-xs font-semibold ${PRIORITY_COLOR[w.priority] ?? ""}`}>
                          {w.priority}
                        </span>
                      </div>
                      {w.description && (
                        <p className="text-xs text-zinc-500 mt-0.5">{w.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={`border text-xs ${STATUS_COLOR[w.status] ?? ""}`}>
                        {w.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span>Frequência: {w.frequency_minutes}min</span>
                    <span>Disparos: {w.trigger_count ?? 0}</span>
                    <span>Falhas: {w.consecutive_failures ?? 0}</span>
                    {w.last_execution_at && (
                      <span>Última execução: {new Date(w.last_execution_at).toLocaleString("pt-BR")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {w.status === "active" && (
                      <button
                        onClick={() => handlePause(w.id)}
                        className="text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2 py-1 rounded"
                      >
                        Pausar
                      </button>
                    )}
                    {(w.status === "paused" || w.status === "error") && (
                      <button
                        onClick={() => handleResume(w.id)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded"
                      >
                        Retomar
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(w.id)}
                      className="text-xs text-red-400 hover:text-red-300 bg-red-500/10 px-2 py-1 rounded"
                    >
                      Deletar
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Tab: Criar */}
        {activeTab === "create" && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Criar Watch de Demonstração</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-zinc-400 text-sm">
                Teste o WatchRegistry criando Watches de exemplo — um simples (leaf) e um complexo (AND/OR/NOT aninhado).
              </p>

              <div className="flex gap-3 flex-wrap">
                <Button
                  onClick={createSampleWatch}
                  disabled={isCreating}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-sm"
                >
                  {isCreating ? "Criando..." : "Criar Watch Simples (leaf)"}
                </Button>
                <Button
                  onClick={createComplexWatch}
                  disabled={isCreating}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm"
                >
                  {isCreating ? "Criando..." : "Criar Watch Complexo (AND/OR/NOT)"}
                </Button>
              </div>

              {createResult && (
                <div className={`rounded-lg px-4 py-3 text-sm ${
                  createResult.ok
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                    : "bg-red-500/10 border border-red-500/20 text-red-300"
                }`}>
                  {createResult.ok ? (
                    <span>✓ Watch criado com sucesso — ID: <code className="font-mono">{createResult.watchId}</code></span>
                  ) : (
                    <div>
                      <div>✗ Falha: {createResult.error}</div>
                      {createResult.validationErrors?.length > 0 && (
                        <ul className="mt-1 ml-4 list-disc text-xs">
                          {createResult.validationErrors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab: Evaluator WE-02 */}
        {activeTab === "evaluator" && (
          <EvaluatorPanel />
        )}

        {/* Tab: WE-03 */}
        {activeTab === "we03" && (
          <OutboxStatePanel />
        )}

        {/* Tab: WE-04 */}
        {activeTab === "we04" && (
          <PlannerAuditPanel />
        )}

        {/* Tab: Live Status */}
        {activeTab === "live" && (
          <LiveStatusPanel onRefresh={loadData} />
        )}

        {/* Tab: Arquitetura */}
        {activeTab === "arch" && (
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Entregáveis WE-01</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { file: "base44/entities/Watch.jsonc",             status: "done", label: "Entidade Watch" },
                  { file: "base44/entities/WatchExecution.jsonc",    status: "done", label: "Entidade WatchExecution" },
                  { file: "base44/entities/PendingWatchAction.jsonc",status: "done", label: "Entidade PendingWatchAction (Outbox)" },
                  { file: "src/lib/watch-engine/WatchTypes.ts",      status: "done", label: "WatchTypes — todos os tipos imutáveis" },
                  { file: "src/lib/watch-engine/WatchValidator.ts",  status: "done", label: "WatchValidator — validação + serialização" },
                  { file: "src/lib/watch-engine/WatchRegistry.ts",   status: "done", label: "WatchRegistry — CRUD + Dry Run (singleton)" },
                  { file: "src/lib/watch-engine/watchEngineTests.ts",status: "done", label: "watchEngineTests — 23 cenários WE-01+WE-02" },
                  { file: "src/docs/foundation/rfc/RFC-005-Watch-Engine.md", status: "done", label: "RFC-005 — Aceita" },
                  { file: "src/docs/foundation/adr/ADR-012.md",      status: "done", label: "ADR-012 — 7 decisões arquiteturais" },
                  { file: "src/lib/watch-engine/WatchEvaluator.ts",  status: "done", label: "WatchEvaluator — Compilador ConditionTree → fn JS pura" },
                  { file: "src/lib/watch-engine/ConnectorGateway.ts",status: "done", label: "ConnectorGateway — Token Bucket + Circuit Breaker por provider" },
                  { file: "src/lib/watch-engine/WatchScheduler.ts",  status: "done", label: "WatchScheduler — Fila por prioridade + Outbox enqueue" },
                  { file: "src/lib/watch-engine/WatchOutbox.ts",      status: "done", label: "WatchOutbox — Durable Worker com retry, TTL e fire-and-forget" },
                  { file: "src/lib/watch-engine/WatchStateTracker.ts",status: "done", label: "WatchStateTracker — Transição false→true, anti-spam, hydration" },
                  { file: "src/lib/watch-engine/WatchCognitiveBridge.ts",  status: "done", label: "WatchCognitiveBridge — Interface para Planner + runCycle()" },
                  { file: "src/lib/watch-engine/WatchDeduplicator.ts",    status: "done", label: "WatchDeduplicator — Hash FNV-1a + Jaccard semantico (WE-04)" },
                  { file: "src/lib/watch-engine/WatchPlannerBridge.ts",   status: "done", label: "WatchPlannerBridge — Deteccao automatica de 'me avise quando' (WE-04)" },
                  { file: "src/lib/watch-engine/WatchAuditStore.ts",      status: "done", label: "WatchAuditStore — Dashboard de auditoria de execucoes (WE-04)" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={item.status === "done" ? "text-emerald-400" : "text-amber-400"}>
                      {item.status === "done" ? "✓" : "○"}
                    </span>
                    <span className="text-zinc-300">{item.label}</span>
                    <span className="text-zinc-600 font-mono ml-auto">{item.file}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Próximos Sprints</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { sprint: "WE-02", label: "WatchEvaluator (Compilador) + WatchScheduler + ConnectorGateway (Token Bucket)", status: "planned" },
                  { sprint: "WE-03", label: "WatchOutbox + WatchStateTracker + WatchCognitiveBridge", status: "done" },
                  { sprint: "WE-04", label: "WatchDeduplicator + WatchPlannerBridge + WatchAuditStore + Dashboard", status: "done" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 border text-xs shrink-0">
                      {item.sprint}
                    </Badge>
                    <span className="text-zinc-400">{item.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="text-center text-xs text-zinc-700 pt-2">
          Watch Engine WE-01+WE-02+WE-03+WE-04 · RFC-005 · ADR-012 · EPIC-017 COMPLETO · MemoryOS Engineering First · 2026-08-02
        </div>
      </div>
    </div>
  );
}