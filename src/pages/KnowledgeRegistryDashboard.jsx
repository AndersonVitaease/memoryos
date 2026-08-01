/**
 * KnowledgeRegistryDashboard — Painel de Diagnóstico Fase 1+2+3
 *
 * Visualiza em tempo real:
 *   - Métricas do KnowledgeRegistry (commits, falhas, por nature/scope)
 *   - StateView da sessão atual (objetos, observações ativas)
 *   - Métricas do CognitivePruningService
 *
 * ACESSO: /knowledge-registry (somente para builder/admin)
 */

import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const NATURE_COLORS = {
  Evidence:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Inference:  "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Hypothesis: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

const SCOPE_COLORS = {
  session:  "text-violet-300",
  project:  "text-blue-300",
  global:   "text-emerald-300",
  github:   "text-slate-300",
  drive:    "text-yellow-300",
  gmail:    "text-red-300",
  calendar: "text-cyan-300",
  memory:   "text-pink-300",
};

function MetricCard({ label, value, sub }) {
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
      <div className="text-zinc-400 text-xs mb-1">{label}</div>
      <div className="text-white text-2xl font-mono font-bold">{value ?? "—"}</div>
      {sub && <div className="text-zinc-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function ObsBadge({ nature }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${NATURE_COLORS[nature] ?? "bg-zinc-700 text-zinc-300 border-zinc-600"}`}>
      {nature}
    </span>
  );
}

export default function KnowledgeRegistryDashboard() {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [sessionId, setSessionId]       = useState("");
  const [filter, setFilter]             = useState("all");
  const [metrics, setMetrics]           = useState(null);

  const loadObservations = useCallback(async () => {
    setLoading(true);
    try {
      const obs = await base44.entities.KnowledgeObservation.list("-created_date", 100);
      setObservations(obs ?? []);

      // Calcula métricas localmente
      const total     = obs.length;
      const refuted   = obs.filter(o => o.is_refuted).length;
      const byNature  = { Evidence: 0, Inference: 0, Hypothesis: 0 };
      const byScope   = {};
      for (const o of obs) {
        byNature[o.nature] = (byNature[o.nature] ?? 0) + 1;
        byScope[o.context_scope] = (byScope[o.context_scope] ?? 0) + 1;
      }
      setMetrics({ total, active: total - refuted, refuted, byNature, byScope });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadObservations(); }, [loadObservations]);

  const filtered = filter === "all"
    ? observations
    : filter === "active"
      ? observations.filter(o => !o.is_refuted)
      : filter === "refuted"
        ? observations.filter(o => o.is_refuted)
        : observations.filter(o => o.nature === filter);

  const parseData = (raw) => {
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch { return {}; }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Knowledge Registry</h1>
            <p className="text-zinc-400 text-sm mt-1">Fase 1+2+3 — Shadow Mode · Append-Only</p>
          </div>
          <button
            onClick={loadObservations}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm transition-colors"
          >
            Atualizar
          </button>
        </div>

        {/* Métricas */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Observações" value={metrics.total} />
            <MetricCard label="Ativas" value={metrics.active} sub="is_refuted=false" />
            <MetricCard label="Refutadas" value={metrics.refuted} sub="is_refuted=true" />
            <MetricCard
              label="Por Nature"
              value={`${metrics.byNature.Evidence}E · ${metrics.byNature.Inference}I · ${metrics.byNature.Hypothesis}H`}
            />
          </div>
        )}

        {/* Por Scope */}
        {metrics?.byScope && Object.keys(metrics.byScope).length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-zinc-400 text-xs mb-3 uppercase tracking-wider">Por Scope</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metrics.byScope).map(([scope, count]) => (
                <span key={scope} className={`text-sm font-mono ${SCOPE_COLORS[scope] ?? "text-zinc-300"}`}>
                  {scope}: <span className="font-bold">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          {["all","active","refuted","Evidence","Inference","Hypothesis"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                filter === f
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {f}
            </button>
          ))}
          <span className="text-zinc-600 text-xs self-center ml-2">{filtered.length} registros</span>
        </div>

        {/* Lista de Observações */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <div className="text-4xl mb-3">🧠</div>
            <div>Nenhuma observação registrada ainda.</div>
            <div className="text-sm mt-1">Envie uma mensagem no chat para gerar observações.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((obs) => {
              const data = parseData(obs.data);
              return (
                <div
                  key={obs.id}
                  className={`bg-zinc-900 border rounded-lg p-4 ${obs.is_refuted ? "border-zinc-800 opacity-50" : "border-zinc-700"}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <ObsBadge nature={obs.nature} />
                    <span className="text-xs text-zinc-500 font-mono bg-zinc-800 px-2 py-0.5 rounded">
                      {obs.payload_type}
                    </span>
                    <span className={`text-xs ${SCOPE_COLORS[obs.context_scope] ?? "text-zinc-400"}`}>
                      {obs.context_scope}
                    </span>
                    <span className="text-xs text-zinc-600 ml-auto">
                      conf: {Math.round((obs.confidence ?? 0) * 100)}%
                    </span>
                    {obs.is_refuted && (
                      <span className="text-xs text-red-400 border border-red-800 px-2 py-0.5 rounded">
                        refutada
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="text-zinc-500">
                      <span className="text-zinc-600">target: </span>
                      <span className="text-zinc-300 font-mono">{obs.target_object_type}/{String(obs.target_object_id).slice(0, 12)}…</span>
                    </div>
                    <div className="text-zinc-500">
                      <span className="text-zinc-600">producer: </span>
                      <span className="text-zinc-300">{obs.producer_id}</span>
                    </div>
                    {obs.session_id && (
                      <div className="text-zinc-500 col-span-2">
                        <span className="text-zinc-600">session: </span>
                        <span className="text-zinc-400 font-mono">{String(obs.session_id).slice(0, 20)}…</span>
                      </div>
                    )}
                  </div>

                  {/* Data preview */}
                  {Object.keys(data).length > 0 && (
                    <div className="mt-2 bg-zinc-950 rounded p-2 text-xs font-mono text-zinc-400 overflow-x-auto">
                      {Object.entries(data).slice(0, 4).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-zinc-600">{k}: </span>
                          <span className="text-zinc-300">
                            {typeof v === "string" ? v.slice(0, 80) : JSON.stringify(v)?.slice(0, 80)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-zinc-700 text-xs mt-2">
                    {new Date(obs.created_date).toLocaleString("pt-BR")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}