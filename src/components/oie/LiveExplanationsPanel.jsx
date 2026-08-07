/**
 * LiveExplanationsPanel.jsx — Track 2 (UI de consumo do Explainer)
 *
 * Painel "ao vivo" das explicacoes geradas pelo OIEOrchestrator apos cada
 * execucao do pipeline. Le o rolling cache do OIEAlertBus — nao exige que
 * o usuario digite session_id (diferente do SessionExplainerSection manual).
 *
 * Cada alerta mostra severidade, titulo, cadeia causal, recomendacao e
 * evidencia colapsavel. Botao "Analisar sessao completa" repassa o
 * sessionId para o SessionExplainerSection via onPickSession (drill-in).
 *
 * CONSULTIVO: so exibe. Nenhum botao executa acao mutativa.
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OIEAlertBus } from "@/lib/operational-intelligence/OIEAlertBus";
import { Activity, RefreshCw } from "lucide-react";

const SEVERITY_COLOR = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  warning:  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  info:     "bg-zinc-500/10 text-zinc-300 border-zinc-700",
};

const SEVERITY_LABEL = {
  critical: "CRÍTICO",
  warning:  "ATENÇÃO",
  info:     "INFO",
};

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s atrás`;
  if (s < 3600) return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return `${Math.floor(s / 86400)}d atrás`;
}

export default function LiveExplanationsPanel({ onPickSession }) {
  const [alerts, setAlerts] = useState(() => OIEAlertBus.getRecent(20));
  const [tick, setTick] = useState(0); // forca refresh do "time ago"

  // Subscreve novos alertas em tempo real
  useEffect(() => {
    const unsub = OIEAlertBus.subscribe(() => {
      setAlerts(OIEAlertBus.getRecent(20));
    });
    return unsub;
  }, []);

  // Atualiza o "Xs atrás" a cada 15s
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  void tick; // referencia p/ re-render

  const refresh = () => setAlerts(OIEAlertBus.getRecent(20));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-zinc-300">
            {alerts.length === 0
              ? "Nenhuma anomalia detectada ainda — o OIE observa cada execução do pipeline."
              : `${alerts.length} explicação(ões) recente(s) do OIE`}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} className="text-zinc-400 hover:text-zinc-200">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
        </Button>
      </div>

      {alerts.length === 0 && (
        <div className="text-xs text-zinc-500 border border-dashed border-zinc-800 rounded p-4">
          O motor rodou e não encontrou anomalias nas execuções recentes, ou o pipeline
          ainda não gerou findings critical/warning. Findings <code className="text-zinc-400">info</code> não
          disparam alertas — consulte a aba de sessão manual para o conjunto completo.
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className={`border rounded p-3 text-xs ${SEVERITY_COLOR[a.severity]}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={SEVERITY_COLOR[a.severity]}>
                    {SEVERITY_LABEL[a.severity]}
                  </Badge>
                  <span className="font-medium">{a.title}</span>
                </div>
                <span className="opacity-60 whitespace-nowrap">{timeAgo(a.createdAt)}</span>
              </div>

              <ul className="list-disc list-inside space-y-0.5 opacity-90 mb-2">
                {a.causalChain.map((step, j) => <li key={j}>{step}</li>)}
              </ul>

              <p className="opacity-80 mb-2">
                <strong>Recomendação:</strong> {a.recommendation}
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="opacity-50">
                  finding: <code className="text-zinc-400">{a.findingType}</code>
                </span>
                {a.executionId && (
                  <span className="opacity-50">
                    exec: <code className="text-zinc-400">{a.executionId.slice(0, 18)}…</code>
                  </span>
                )}
                {onPickSession && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-zinc-400 hover:text-zinc-200 h-6 px-2 text-xs"
                    onClick={() => onPickSession(a.sessionId)}
                  >
                    Analisar sessão completa →
                  </Button>
                )}
              </div>

              {a.evidenceRefs.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer opacity-60">
                    {a.evidenceRefs.length} evidência(s)
                  </summary>
                  <ul className="mt-1 space-y-0.5 opacity-70">
                    {a.evidenceRefs.map((r, k) => <li key={k}>{r}</li>)}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}