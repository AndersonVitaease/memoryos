import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  Loader2, RefreshCw, MessageCircle, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight,
} from "lucide-react";

/**
 * BugHunterRunsList — lista runs recentes do Bug Hunter com transcript completo.
 *
 * Persistido na entidade BugHunterRun pelo backend (bugHunterRun). Cada run
 * mostra: status, perguntas enviadas vs respondidas (lidas), findings count,
 * e o transcript expandivel (pergunta + evidencia de resposta lida da pagina).
 *
 * Isto e a prova de que "0 findings" e legitimo — se questions_answered >= 1
 * e o transcript mostra respostas reais, o teste foi concluido com conversa.
 * Se questions_answered=0, o resultado e inconclusivo (hunter nao conversou).
 */
export default function BugHunterRunsList() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const recs = await base44.entities.BugHunterRun.list("-created_date", 10);
      setRuns(recs || []);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Runs recentes (transcript)</span>
        </div>
        <button onClick={load} disabled={loading} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          atualizar
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-600" /></div>
        ) : runs.length === 0 ? (
          <p className="text-xs text-zinc-600 italic text-center py-4">Nenhuma run registrada ainda.</p>
        ) : (
          runs.map((r) => {
            const verified = (r.questions_answered || 0) >= 1;
            let transcript = [];
            try { transcript = JSON.parse(r.transcript || "[]"); } catch { /* */ }
            return (
              <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                <button onClick={() => toggle(r.id)} className="w-full flex items-center gap-2 p-3 text-left hover:bg-zinc-800/40 transition">
                  {expanded[r.id] ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                  <span className="text-xs font-mono text-zinc-400">{(r.run_id || "").slice(-10)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0 ${
                    r.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    r.status === "running" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                    "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>{r.status}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border shrink-0 ${
                    verified ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`} title="Perguntas enviadas E com resposta lida. 0 findings so e confiavel se >= 1.">
                    {verified ? <CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5" /> : <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
                    {r.questions_answered || 0} respondidas
                  </span>
                  <span className="text-[10px] text-zinc-500 shrink-0">{r.questions_sent || 0} enviadas</span>
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium shrink-0">
                    {r.findings_count || 0} findings
                  </span>
                </button>
                {expanded[r.id] && (
                  <div className="px-3 pb-3 space-y-1.5">
                    <p className="text-[10px] text-zinc-600 font-mono break-all">{r.target_url}</p>
                    {r.scenario && <p className="text-[10px] text-zinc-500 italic">Cenario: {r.scenario.slice(0, 120)}</p>}
                    {r.duration_ms != null && <p className="text-[10px] text-zinc-600">{r.duration_ms}ms</p>}
                    {transcript.length > 0 ? (
                      transcript.map((t, i) => (
                        <div key={i} className="p-2 rounded-lg bg-zinc-950/50 border border-zinc-800">
                          <p className="text-[11px] text-violet-300 font-medium break-words">P{t.step || i+1}: {t.question}</p>
                          {t.response_evidence ? (
                            <p className="text-[10px] text-zinc-500 mt-1 line-clamp-4 font-mono break-words">{t.response_evidence.slice(0, 300)}</p>
                          ) : (
                            <p className="text-[10px] text-amber-500 mt-1">resposta nao lida (run terminou antes do snapshot)</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-zinc-600 italic">Sem transcript (modo explore ou erro de persistencia).</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}