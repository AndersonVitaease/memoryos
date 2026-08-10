/**
 * WebSessionPicker — seletor de WebSession ativa (Topico A, multi-site).
 *
 * Lista todas as WebSessions ativas do usuario, cada uma com host + expiracao,
 * botao "Retomar" e botao "Conectar novo site" que leva ao fluxo existente.
 *
 * Componente isolado — nao modifica WebConnectorPage diretamente (pai decide
 * o que renderizar quando uma sessao e retomada ou quando criar nova).
 */
import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Globe, CheckCircle2, Clock, Plus, RefreshCw, XCircle } from 'lucide-react';

function hostOf(url) {
  try { return new URL(url).host; } catch (e) { return url || ''; }
}

function fmtExpiry(expiresAt) {
  if (!expiresAt) return '';
  try {
    const d = new Date(expiresAt);
    const now = new Date();
    const diffMin = Math.round((d.getTime() - now.getTime()) / 60000);
    if (diffMin < 0) return 'expirada';
    if (diffMin < 60) return `expira em ${diffMin}min`;
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

export default function WebSessionPicker({ onRetomar, onNew, currentSessionId }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const recs = await base44.entities.WebSession.filter({ status: 'active' }, '-created_date', 20);
      setSessions(recs || []);
    } catch (e) {
      setError(e.message || 'Falha ao carregar sessoes ativas');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> Sessoes conectadas ({sessions.length})
        </p>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && sessions.length === 0 && !error && (
        <p className="text-[11px] text-zinc-600">Nenhuma sessao ativa. Conecte um novo site abaixo.</p>
      )}

      <div className="space-y-2">
        {sessions.map((s) => {
          const host = hostOf(s.site_url);
          const isCurrent = currentSessionId === s.id;
          const expiry = fmtExpiry(s.expires_at);
          const expired = expiry === 'expirada';
          return (
            <div key={s.id} className={"rounded-lg border p-2.5 flex items-center justify-between gap-2 " + (isCurrent ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/50")}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className={"w-3.5 h-3.5 shrink-0 " + (expired ? "text-amber-400" : "text-emerald-400")} />
                  <span className="text-xs font-mono text-zinc-200 truncate">{host}</span>
                  {isCurrent && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase tracking-wide">ativa</span>}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className={"w-3 h-3 " + (expired ? "text-amber-400" : "text-zinc-600")} />
                  <span className={"text-[10px] " + (expired ? "text-amber-400" : "text-zinc-500")}>{expiry}</span>
                </div>
              </div>
              <button
                onClick={() => onRetomar(s)}
                disabled={isCurrent}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-violet-500/90 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
              >
                {isCurrent ? 'atual' : 'Retomar'}
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={onNew}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition"
      >
        <Plus className="w-3.5 h-3.5" />
        Conectar novo site
      </button>
    </div>
  );
}