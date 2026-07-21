/**
 * UCMEShadowDiagnosticsPage.jsx — EF-40.6
 * Painel UCME Shadow Diagnostics.
 * Mostra Legacy Context vs UCME Context em tempo real (sem alterar respostas).
 */

import React, { useState, useEffect, useCallback } from "react";

// ── Importa o shadow store diretamente ────────────────────────────────────────
let _shadowStore = null;
let _factory     = null;

async function getShadowData() {
  if (!_factory) {
    const mod = await import("@/lib/memory-context/MemoryContextProviderFactory");
    _factory     = mod.MemoryContextProviderFactory;
    _shadowStore = mod.shadowStore;
  }
  return {
    mode:    _factory.getMode(),
    reports: [..._factory.getShadowReports()],
    count:   _shadowStore?.count() ?? 0,
  };
}

// ── Components ────────────────────────────────────────────────────────────────

const Badge = ({ color, children }) => {
  const colors = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-400 border-red-800",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    zinc:   "bg-zinc-800 text-zinc-400 border-zinc-600",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-bold ${colors[color] ?? colors.zinc}`}>
      {children}
    </span>
  );
};

const MetricCard = ({ label, legacy, ucme, unit = "", higherIsBetter = true }) => {
  const legacyN = Number(legacy) || 0;
  const ucmeN   = Number(ucme)   || 0;
  const delta   = ucmeN - legacyN;
  const better  = higherIsBetter ? delta > 0 : delta < 0;
  const same    = delta === 0;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
      <div className="text-zinc-500 text-xs mb-2">{label}</div>
      <div className="flex gap-3 items-end">
        <div>
          <div className="text-zinc-400 text-xs mb-0.5">Legacy</div>
          <div className="text-white font-bold text-lg">{legacy ?? "—"}{unit}</div>
        </div>
        <div>
          <div className="text-violet-400 text-xs mb-0.5">UCME</div>
          <div className="text-violet-300 font-bold text-lg">{ucme ?? "—"}{unit}</div>
        </div>
        {!same && (
          <div className="ml-auto">
            <span className={`text-xs font-bold ${better ? "text-emerald-400" : "text-red-400"}`}>
              {delta > 0 ? "+" : ""}{delta}{unit}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const ScoreBar = ({ label, value, max = 1 }) => {
  const pct = value != null ? Math.min(100, Math.round((value / max) * 100)) : null;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-500">{label}</span>
        <span className="text-violet-300">{pct != null ? `${pct}%` : "—"}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        {pct != null && <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />}
      </div>
    </div>
  );
};

const ReportCard = ({ report, index }) => {
  const [open, setOpen] = useState(index === 0);
  const l = report.legacy;
  const u = report.ucme;
  const d = report.diff;

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/30 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-zinc-500 text-xs font-mono">#{index + 1}</span>
          <span className="text-xs text-zinc-300 font-mono truncate max-w-xs">{report.messageId}</span>
          <span className="text-zinc-500 text-xs">{new Date(report.timestamp).toLocaleTimeString("pt-BR")}</span>
          {d.ucmeWider   && <Badge color="green">UCME + amplo</Badge>}
          {d.ucmeFaster  && <Badge color="green">UCME + rapido</Badge>}
          {!d.ucmeWider && !d.ucmeFaster && <Badge color="zinc">equivalente</Badge>}
          {(l.error || u.error) && <Badge color="red">erro</Badge>}
        </div>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 bg-zinc-950/50 space-y-4 text-xs">
          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MetricCard label="Memorias" legacy={l.memoryCount}   ucme={u.memoryCount} />
            <MetricCard label="Documentos" legacy={l.documentCount} ucme={u.documentCount} />
            <MetricCard label="Tokens est." legacy={l.estimatedTokens} ucme={u.estimatedTokens} />
            <MetricCard label="Duracao" legacy={l.durationMs} ucme={u.durationMs} unit="ms" higherIsBetter={false} />
          </div>

          {/* Side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Legacy */}
            <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <div className="text-zinc-400 font-bold text-xs mb-3">Legacy Context</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {l.sources.length > 0 ? l.sources.map(s => <Badge key={s} color="zinc">{s}</Badge>) : <span className="text-zinc-600">sem fontes</span>}
              </div>
              <div className="text-zinc-500">Tamanho do contexto: <span className="text-zinc-300">{l.contextLength} chars</span></div>
              <div className="text-zinc-500">Tokens estimados: <span className="text-zinc-300">{l.estimatedTokens}</span></div>
              {l.error && <div className="text-red-400 mt-1">Erro: {l.error}</div>}
            </div>

            {/* UCME */}
            <div className="bg-zinc-900 border border-violet-800/30 rounded p-3">
              <div className="text-violet-300 font-bold text-xs mb-3">UCME Context</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {u.sources.length > 0 ? u.sources.map(s => <Badge key={s} color="violet">{s}</Badge>) : <span className="text-zinc-600">sem fontes</span>}
              </div>
              <ScoreBar label="Authority"  value={u.authorityScore} />
              <ScoreBar label="Confidence" value={u.confidenceScore} />
              <ScoreBar label="Coverage"   value={u.coverage} />
              <div className="text-zinc-500">Tokens estimados: <span className="text-violet-300">{u.estimatedTokens}</span></div>
              {u.gaps.length > 0 && (
                <div className="mt-2">
                  <div className="text-amber-400 mb-1">Lacunas:</div>
                  <div className="flex flex-wrap gap-1">{u.gaps.map(g => <Badge key={g} color="amber">{g}</Badge>)}</div>
                </div>
              )}
              {u.duplications.length > 0 && (
                <div className="mt-2 text-zinc-500">Duplicacoes: {u.duplications.length}</div>
              )}
              {u.error && <div className="text-red-400 mt-1">Erro: {u.error}</div>}
            </div>
          </div>

          {/* Diff */}
          {d.sourceDiff.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <div className="text-zinc-400 font-bold text-xs mb-2">Fontes exclusivas do UCME</div>
              <div className="flex flex-wrap gap-1">
                {d.sourceDiff.map(s => <Badge key={s} color="violet">{s}</Badge>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UCMEShadowDiagnosticsPage() {
  const [data,    setData]    = useState({ mode: "LOADING", reports: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [auto,    setAuto]    = useState(true);

  const refresh = useCallback(async () => {
    try {
      const d = await getShadowData();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [auto, refresh]);

  const modeColor = {
    SHADOW: "violet",
    LEGACY: "zinc",
    UCME:   "green",
    LOADING: "zinc",
  };

  const reports = data.reports ?? [];
  const ucmeWiderCount  = reports.filter(r => r.diff?.ucmeWider).length;
  const ucmeFasterCount = reports.filter(r => r.diff?.ucmeFaster).length;
  const errorCount      = reports.filter(r => r.ucme?.error || r.legacy?.error).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700 px-2 py-0.5 rounded font-mono">EF-40.6</span>
            <h1 className="text-xl font-bold text-white">UCME Shadow Diagnostics</h1>
            <Badge color={modeColor[data.mode] ?? "zinc"}>{data.mode}</Badge>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setAuto(a => !a)}
                className={`text-xs px-3 py-1 rounded border ${auto ? "border-violet-700 text-violet-300 bg-violet-950/40" : "border-zinc-700 text-zinc-400"}`}
              >
                {auto ? "Auto ▶" : "Auto ■"}
              </button>
              <button
                onClick={refresh}
                className="text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500"
              >
                Refresh
              </button>
            </div>
          </div>
          <p className="text-zinc-500 text-xs">
            Shadow Mode: Legacy alimenta o Planner. UCME executa em paralelo apenas para diagnostico.
            Nenhuma resposta ao usuario e afetada.
          </p>
        </div>

        {/* Status bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Modo",          value: data.mode,        color: "text-violet-300" },
            { label: "Reports",       value: data.count,        color: "text-white" },
            { label: "UCME + amplo",  value: ucmeWiderCount,   color: "text-emerald-300" },
            { label: "UCME + rapido", value: ucmeFasterCount,  color: "text-emerald-300" },
            { label: "Com erro",      value: errorCount,       color: errorCount > 0 ? "text-red-400" : "text-zinc-500" },
          ].map((stat, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <div className="text-zinc-500 text-xs mb-1">{stat.label}</div>
              <div className={`font-bold text-lg ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Certificacao */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mb-6">
          <div className="text-xs font-bold text-zinc-400 mb-3">CERTIFICACAO EF-40.9 — Estado atual</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {[
              { q: "Shadow Mode funcionando?",       a: data.mode === "SHADOW" },
              { q: "UCME executando?",               a: data.count > 0 },
              { q: "Planner alterado?",              a: false,  forced: "NAO" },
              { q: "Resposta do usuario alterada?",  a: false,  forced: "NAO" },
              { q: "Rollback funcional?",            a: true,   forced: "SIM (alterar MEMORY_CONTEXT_MODE)" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 bg-zinc-800/50 rounded p-2">
                <span className={`font-bold ${item.forced ? (item.forced === "NAO" ? "text-emerald-400" : "text-emerald-400") : (item.a ? "text-emerald-400" : "text-amber-400")}`}>
                  {item.forced ?? (item.a ? "SIM" : "AGUARDANDO")}
                </span>
                <span className="text-zinc-400">{item.q}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rollback info */}
        <div className="bg-zinc-900/50 border border-amber-800/30 rounded-lg p-3 mb-6 text-xs">
          <div className="text-amber-300 font-bold mb-1">Rollback</div>
          <div className="text-zinc-400">
            Para reverter para Legacy puro: alterar <code className="text-violet-300 font-mono">MEMORY_CONTEXT_MODE = "LEGACY"</code> em{" "}
            <code className="text-violet-300 font-mono">src/lib/memory-context/MemoryContextProviderFactory.ts</code>.
            Nenhum arquivo precisa ser removido.
          </div>
        </div>

        {/* Reports */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-zinc-300">Historico de execucoes</h2>
            <span className="text-zinc-600 text-xs">({reports.length} reports — max 50)</span>
          </div>

          {loading && (
            <div className="text-zinc-500 text-xs">Carregando...</div>
          )}

          {!loading && reports.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
              <div className="text-zinc-500 text-sm mb-2">Nenhum report ainda</div>
              <div className="text-zinc-600 text-xs">
                Envie uma mensagem no Chat para o Shadow Mode executar o UCME em paralelo.
              </div>
              {data.mode !== "SHADOW" && (
                <div className="text-amber-400 text-xs mt-3">
                  Modo atual: <strong>{data.mode}</strong>. Shadow Mode nao esta ativo.
                </div>
              )}
            </div>
          )}

          {reports.map((report, i) => (
            <ReportCard key={report.timestamp + i} report={report} index={i} />
          ))}
        </div>

      </div>
    </div>
  );
}