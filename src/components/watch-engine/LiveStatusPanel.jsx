/**
 * LiveStatusPanel.jsx — Watch Engine real-time status
 * Mostra execucoes recentes, acoes pendentes e saude dos watches com auto-refresh.
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_COLOR = {
  active:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  paused:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  error:     "bg-red-500/10 text-red-400 border-red-500/20",
  invalid:   "bg-zinc-500/10 text-zinc-400 border-zinc-700",
  completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const ACTION_STATUS_COLOR = {
  pending:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  dispatched: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  failed:     "bg-red-500/10 text-red-400 border-red-500/20",
  expired:    "bg-zinc-500/10 text-zinc-500 border-zinc-700",
};

const PROVIDER_ICON = {
  clock:    "⏰",
  gmail:    "📧",
  calendar: "📅",
  drive:    "📁",
  github:   "🐙",
  slack:    "💬",
  unknown:  "❓",
};

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
}

function fmtShort(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
}

export default function LiveStatusPanel({ onRefresh }) {
  const [executions, setExecutions]   = useState([]);
  const [actions, setActions]         = useState([]);
  const [watches, setWatches]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [execs, acts, ws] = await Promise.all([
        base44.entities.WatchExecution.list("-created_date", 20),
        base44.entities.PendingWatchAction.list("-created_date", 20),
        base44.entities.Watch.filter({ status: "active" }),
      ]);
      setExecutions(execs);
      setActions(acts);
      setWatches(ws);
      setLastRefresh(new Date());
    } catch (e) {
      console.error("[LiveStatusPanel] Erro ao carregar:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh) {
      intervalRef.current = setInterval(load, 15_000);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh]);

  // Watches com provider extraído
  const watchesWithProvider = watches.map(w => {
    let provider = "unknown";
    try { provider = JSON.parse(w.condition_tree || "{}").provider ?? "unknown"; } catch {}
    return { ...w, provider };
  });

  // Contagens
  const pendingCount    = actions.filter(a => a.status === "pending").length;
  const dispatchedCount = actions.filter(a => a.status === "dispatched").length;
  const triggeredCount  = executions.filter(e => e.triggered).length;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${loading ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
          <span className="text-xs text-zinc-400">
            {loading ? "Carregando..." : `Atualizado às ${lastRefresh ? fmtShort(lastRefresh.toISOString()) : "—"}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`text-xs px-3 py-1 rounded transition ${autoRefresh ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-500"}`}
          >
            Auto-refresh {autoRefresh ? "ON" : "OFF"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1 rounded disabled:opacity-50"
          >
            Atualizar agora
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Watches ativos",    value: watches.length,   color: "text-emerald-400" },
          { label: "Execuções recentes",value: executions.length,color: "text-white" },
          { label: "Disparos",          value: triggeredCount,   color: "text-violet-400" },
          { label: "Ações pendentes",   value: pendingCount,     color: pendingCount > 0 ? "text-amber-400" : "text-zinc-400" },
        ].map((m, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
            <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Watches ativos com status */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Watches Ativos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {watchesWithProvider.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-3">Nenhum Watch ativo.</p>
          )}
          {watchesWithProvider.map(w => (
            <div key={w.id} className="bg-zinc-800/50 rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap">
              <span className="text-base">{PROVIDER_ICON[w.provider] ?? "❓"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate font-medium">{w.name}</div>
                <div className="text-xs text-zinc-500 flex gap-3 flex-wrap mt-0.5">
                  <span>Provider: <span className="text-zinc-400">{w.provider}</span></span>
                  <span>Freq: {w.frequency_minutes}min</span>
                  <span>Disparos: {w.trigger_count ?? 0}</span>
                  {w.next_execution_at && (
                    <span>Próxima: {fmtShort(w.next_execution_at)}</span>
                  )}
                </div>
              </div>
              <Badge className={`border text-xs shrink-0 ${STATUS_COLOR[w.status] ?? ""}`}>
                {w.status}
              </Badge>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.last_evaluation_result ? "bg-emerald-400" : "bg-zinc-600"}`}
                title={`Última avaliação: ${w.last_evaluation_result ? "true" : "false"}`} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Execuções recentes */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Execuções Recentes (últimas 20)</CardTitle>
        </CardHeader>
        <CardContent>
          {executions.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-3">Nenhuma execução registrada.</p>
          )}
          <div className="space-y-1">
            {executions.map(e => {
              const provider = (e.providers_called ?? [])[0] ?? "unknown";
              return (
                <div key={e.id} className="flex items-center gap-2 text-xs py-1 border-b border-zinc-800 last:border-0">
                  <span>{PROVIDER_ICON[provider] ?? "❓"}</span>
                  <span className="text-zinc-500 font-mono w-14 shrink-0">{e.watch_id?.slice(-6)}</span>
                  <Badge className={`border text-xs shrink-0 px-1.5 py-0 ${
                    e.status === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : e.status === "failure" ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-zinc-800 text-zinc-500 border-zinc-700"
                  }`}>
                    {e.status}
                  </Badge>
                  <span className={e.triggered ? "text-violet-400 font-semibold" : "text-zinc-600"}>
                    {e.triggered ? "⚡ DISPAROU" : `result=${e.evaluation_result ? "true" : "false"}`}
                  </span>
                  {e.duration_ms != null && (
                    <span className="text-zinc-600">{e.duration_ms}ms</span>
                  )}
                  <span className="text-zinc-600 ml-auto">{fmtShort(e.created_date)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Ações pendentes / outbox */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-sm">Outbox — Ações Recentes (últimas 20)</CardTitle>
            {pendingCount > 0 && (
              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">
                {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {actions.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-3">Nenhuma ação no Outbox.</p>
          )}
          <div className="space-y-1">
            {actions.map(a => {
              let payload = {};
              try { payload = JSON.parse(a.payload || "{}"); } catch {}
              return (
                <div key={a.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-800 last:border-0 flex-wrap">
                  <Badge className={`border text-xs shrink-0 px-1.5 py-0 ${ACTION_STATUS_COLOR[a.status] ?? ""}`}>
                    {a.status}
                  </Badge>
                  <span className="text-zinc-300 flex-1 min-w-0 truncate">
                    {payload.watchName ?? payload.watchId ?? a.watch_id?.slice(-6) ?? "—"}
                  </span>
                  <span className="text-zinc-500">{a.action_type}</span>
                  <span className="text-zinc-600 ml-auto shrink-0">{fmtShort(a.created_date)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}