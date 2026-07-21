/**
 * SprintEF492Page.jsx — Sprint EF-49.2
 * Official Runtime Pipeline Certification
 *
 * Exibe a PIPELINE REAL de produção com evidência de instrumentação do runtime,
 * e documenta honestamente quais camadas EF-43→EF-49 estão ou não integradas.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  PRODUCTION_PIPELINE,
  EF_DEMO_LAYERS,
  ef492Store,
} from "@/lib/ef492/RuntimePipelineInstrument";

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Badge({ label, color = "zinc" }) {
  const C = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    sky:    "bg-sky-950/60 text-sky-300 border-sky-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
  };
  return <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold font-mono ${C[color] ?? C.zinc}`}>{label}</span>;
}

function IntegrationBadge({ integrated }) {
  if (integrated === "production") return <Badge label="✓ Produção" color="green" />;
  if (integrated === "demo_only")  return <Badge label="⚠ Demo only" color="amber" />;
  return <Badge label="✗ Não integrado" color="red" />;
}

// ── Layer card ─────────────────────────────────────────────────────────────────

function LayerCard({ layer, liveEvent, index, isLast }) {
  const [open, setOpen] = useState(index < 3);
  const isProduction = layer.integrated === "production";
  const borderColor = isProduction ? "border-emerald-800/40" : "border-amber-700/40";
  const dotColor    = isProduction ? "bg-emerald-500" : "bg-amber-500";

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs
          ${isProduction ? "border-emerald-600 bg-emerald-950/50 text-emerald-400" : "border-amber-600 bg-amber-950/50 text-amber-400"}`}>
          {index + 1}
        </div>
        {!isLast && <div className="w-px flex-1 min-h-5 bg-zinc-800 mt-1" />}
      </div>

      <div className={`flex-1 mb-3 border rounded-xl overflow-hidden ${borderColor} bg-zinc-900/50`}>
        <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5">
          <Badge label={layer.sprint} color="violet" />
          <span className="text-sm font-black font-mono flex-1 text-zinc-200">{layer.label}</span>
          <IntegrationBadge integrated={layer.integrated} />
          {liveEvent && (
            <span className="text-emerald-400 text-xs font-mono ml-1">LIVE ●</span>
          )}
          <span className="text-zinc-700 text-xs">{open ? "▼" : "▶"}</span>
        </button>
        {open && (
          <div className="px-4 pb-4 space-y-2 border-t border-zinc-800/40 pt-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-zinc-600">Arquivo: </span><span className="text-violet-400 font-mono">{layer.file}</span></div>
              <div><span className="text-zinc-600">Método: </span><span className="text-zinc-300 font-mono">{layer.method}</span></div>
              <div><span className="text-zinc-600">Entrada: </span><span className="text-sky-400">{layer.input}</span></div>
              <div><span className="text-zinc-600">Saída: </span><span className="text-emerald-400">{layer.output}</span></div>
              <div><span className="text-zinc-600">Chamado por: </span><span className="text-zinc-400">{layer.caller}</span></div>
              <div><span className="text-zinc-600">Próximo: </span><span className="text-zinc-400">{layer.next}</span></div>
            </div>
            {layer.bypassNote && (
              <div className="border-l-2 border-amber-600/40 pl-3 text-xs text-amber-400">
                ⚠ {layer.bypassNote}
              </div>
            )}
            {/* Live evidence */}
            {liveEvent && (
              <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-2 space-y-1">
                <p className="text-emerald-400 text-xs font-bold">Evidência LIVE do Runtime Oficial:</p>
                <div className="flex gap-2 text-xs">
                  <span className="text-zinc-600 w-24 shrink-0">input:</span>
                  <span className="text-zinc-300 font-mono">{liveEvent.input}</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="text-zinc-600 w-24 shrink-0">output:</span>
                  <span className="text-zinc-300 font-mono">{liveEvent.output}</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="text-zinc-600 w-24 shrink-0">caller:</span>
                  <span className="text-zinc-300 font-mono">{liveEvent.caller}</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="text-zinc-600 w-24 shrink-0">source:</span>
                  <Badge label={liveEvent.source} color={liveEvent.source === "production_runtime" ? "green" : "amber"} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Certification answers ──────────────────────────────────────────────────────

const CERT_ANSWERS = [
  {
    q: "1. Existe apenas uma pipeline?",
    a: "NÃO. Existem duas pipelines distintas: (A) Pipeline de produção real (ConversationPipeline) e (B) Pipeline cognitiva EF-43→EF-49 (demos/certificação). Elas não se cruzam.",
    status: "amber",
  },
  {
    q: "2. O Runtime Oficial utiliza EF-43 → EF-49?",
    a: "NÃO. O runtime usa ConversationGoalBridge (E-02.1) + ConversationPlanningEngine (E-02.2) + ConversationRuntimeEngine (E-02.3). GoalEngine, CRE, CBE, SGE, SSE, CognitiveOrchestrator e PlannerEngine NÃO são chamados em produção.",
    status: "red",
  },
  {
    q: "3. Existe algum bypass?",
    a: "SIM — por design. ConversationGoalBridge substitui GoalEngine, ConversationPlanningEngine substitui PlannerEngine. São implementações paralelas (lightweight vs cognitiva completa), não bugs.",
    status: "amber",
  },
  {
    q: "4. Existe algum componente morto?",
    a: "NÃO. Os componentes EF-43→EF-49 são ativos: têm testes, são certificados entre si, e chamados pelos dashboards. São 'demo-only', não 'dead code'.",
    status: "green",
  },
  {
    q: "5. Existe alguma engine duplicada?",
    a: "SIM — por decisão arquitetural. ConversationGoalBridge (lightweight, runtime) e GoalEngine (completo, cognitivo). ConversationPlanningEngine (runtime) e PlannerEngine (cognitivo). São especializações, não duplicações acidentais.",
    status: "amber",
  },
  {
    q: "6. Existe algum módulo das últimas sprints nunca chamado?",
    a: "CapabilityBindingEngine (EF-49), CapabilityReasoningEngine (EF-48), StrategyGenerationEngine (EF-47), StrategySelectionEngine (EF-46), CognitiveOrchestrator (EF-43) e PlannerEngine (EF-43) nunca são chamados pelo runtime de produção — apenas pelos dashboards /sprint-efXX.",
    status: "amber",
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "production", label: "Pipeline Real" },
  { id: "ef",         label: "EF-43→EF-49 (Demo)" },
  { id: "live",       label: "Evidências LIVE" },
  { id: "cert",       label: "Certificação Final" },
];

export default function SprintEF492Page() {
  const [tab,    setTab]    = useState("production");
  const [traces, setTraces] = useState([]);
  const [tick,   setTick]   = useState(0);

  // Poll for live traces every 2s
  useEffect(() => {
    const id = setInterval(() => {
      setTraces(ef492Store.getAll());
      setTick(t => t + 1);
    }, 2000);
    setTraces(ef492Store.getAll());
    return () => clearInterval(id);
  }, []);

  const handleClear = useCallback(() => {
    ef492Store.clear();
    setTraces([]);
  }, []);

  const lastTrace = traces[traces.length - 1] ?? null;

  // Build a map of layer → live event from last trace
  const liveMap = {};
  if (lastTrace) {
    for (const ev of lastTrace.layers) {
      liveMap[ev.layer] = ev;
    }
  }

  const hasLiveData = lastTrace && lastTrace.layers.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/20 to-zinc-950 border border-violet-700/30 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-2 items-center text-xs">
            <Badge label="SPRINT EF-49.2" color="violet" />
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Official Runtime Pipeline Certification</span>
          </div>
          <h1 className="text-xl font-black text-white">Certificação da Pipeline de Produção Real</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Auditoria do código real · Instrumentação não-bloqueante · Honestidade arquitetural
          </p>
        </div>

        {/* Live status bar */}
        <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap
          ${hasLiveData ? "border-emerald-700/50 bg-emerald-950/10" : "border-zinc-700/40 bg-zinc-900/40"}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${hasLiveData ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
            <span className={`text-sm font-bold ${hasLiveData ? "text-emerald-300" : "text-zinc-500"}`}>
              {hasLiveData
                ? `Runtime instrumentado — ${lastTrace.layers.length} layers capturadas · executionId: ${lastTrace.executionId.slice(-12)}`
                : "Aguardando execução real... Envie uma mensagem no Chat para capturar"}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-600 text-xs">{traces.length} trace(s)</span>
            {traces.length > 0 && (
              <button onClick={handleClear} className="text-xs text-zinc-600 hover:text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded">
                limpar
              </button>
            )}
          </div>
        </div>

        {/* Audit finding banner */}
        <div className="bg-amber-950/20 border border-amber-700/40 rounded-xl p-4 space-y-2">
          <p className="text-amber-300 text-xs font-bold uppercase tracking-wider">Resultado da auditoria EF-49.2 — Achado principal</p>
          <p className="text-zinc-400 text-xs">
            A pipeline de produção real (<code className="text-violet-400">ConversationPipeline.ts</code>) usa uma cadeia própria (E-02.x) que NÃO invoca as engines EF-43→EF-49. As engines cognitivas existem, são certificadas entre si, mas nunca são chamadas durante uma conversa real. Esta página documenta esse fato com evidência de instrumentação.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                ${tab === t.id ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* PRODUCTION PIPELINE */}
        {tab === "production" && (
          <div className="space-y-1">
            <p className="text-zinc-500 text-xs mb-3">
              Cadeia real reconstruída por auditoria de código · {hasLiveData ? "Evidências LIVE disponíveis" : "Sem evidência LIVE ainda — envie uma mensagem no Chat"}
            </p>
            {PRODUCTION_PIPELINE.map((layer, i) => (
              <LayerCard
                key={layer.id}
                layer={layer}
                liveEvent={liveMap[layer.label.split(" ")[0]] ?? liveMap[layer.label] ?? null}
                index={i}
                isLast={i === PRODUCTION_PIPELINE.length - 1}
              />
            ))}
          </div>
        )}

        {/* EF DEMO LAYERS */}
        {tab === "ef" && (
          <div className="space-y-2">
            <div className="bg-amber-950/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-400">
              ⚠ Estas camadas são chamadas APENAS pelos dashboards de demonstração (/sprint-ef43…ef49). Não fazem parte da pipeline de produção.
            </div>
            {EF_DEMO_LAYERS.map((layer, i) => (
              <LayerCard
                key={layer.id}
                layer={layer}
                liveEvent={null}
                index={i}
                isLast={i === EF_DEMO_LAYERS.length - 1}
              />
            ))}
          </div>
        )}

        {/* LIVE EVIDENCE */}
        {tab === "live" && (
          <div className="space-y-3">
            {!hasLiveData ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
                <div className="w-6 h-6 border-4 border-zinc-700 border-t-violet-500 rounded-full animate-spin mx-auto" />
                <p className="text-zinc-400 text-sm">Nenhuma execução capturada ainda.</p>
                <p className="text-zinc-600 text-xs">Envie uma mensagem no Chat e volte aqui para ver a evidência LIVE.</p>
              </div>
            ) : (
              traces.slice().reverse().map((trace, ti) => (
                <div key={trace.executionId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge label="RUNTIME OFICIAL" color="green" />
                    <span className="text-zinc-300 text-xs font-mono">{trace.executionId.slice(-16)}</span>
                    <span className="text-zinc-500 text-xs">"{trace.userMessage.slice(0, 60)}"</span>
                    {trace.finishedAt && (
                      <span className="text-sky-400 text-xs font-mono ml-auto">{trace.finishedAt - trace.startedAt}ms</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {trace.layers.map((ev, ei) => (
                      <div key={ei} className="flex items-start gap-3 text-xs border-b border-zinc-800/40 pb-1.5">
                        <span className="text-zinc-700 w-5 shrink-0">{ei + 1}</span>
                        <span className="text-emerald-400 font-bold w-40 shrink-0">{ev.layer}</span>
                        <Badge label={ev.source === "production_runtime" ? "PROD" : "DEMO"} color={ev.source === "production_runtime" ? "green" : "amber"} />
                        <div className="flex-1 space-y-0.5">
                          <div><span className="text-zinc-600">in: </span><span className="text-zinc-400">{ev.input}</span></div>
                          <div><span className="text-zinc-600">caller: </span><span className="text-zinc-500">{ev.caller}</span></div>
                          <div><span className="text-zinc-600">next: </span><span className="text-zinc-500">{ev.next}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* CERTIFICATION */}
        {tab === "cert" && (
          <div className="space-y-3">
            {CERT_ANSWERS.map((item, i) => (
              <div key={i} className={`border rounded-xl p-4 space-y-1
                ${item.status === "green" ? "border-emerald-800/40 bg-emerald-950/10" :
                  item.status === "red"   ? "border-red-800/40 bg-red-950/10" :
                  "border-amber-700/40 bg-amber-950/10"}`}>
                <p className={`text-xs font-bold ${item.status === "green" ? "text-emerald-300" : item.status === "red" ? "text-red-300" : "text-amber-300"}`}>
                  {item.q}
                </p>
                <p className="text-zinc-400 text-xs">{item.a}</p>
              </div>
            ))}

            <div className="bg-zinc-900 border border-zinc-700/40 rounded-xl p-4 space-y-2 mt-2">
              <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Veredicto EF-49.2</p>
              <p className="text-zinc-400 text-xs">
                A pipeline cognitiva EF-43→EF-49 está <span className="text-emerald-400 font-bold">internamente certificada</span> (CBE→SGE integrado, EF-49.1). Porém, ela <span className="text-amber-400 font-bold">não está integrada ao runtime de produção</span>. O runtime usa a cadeia E-02.x (ConversationGoalBridge → ConversationPlanningEngine → ConversationRuntimeEngine).
              </p>
              <p className="text-zinc-400 text-xs mt-2">
                A integração das engines EF ao runtime de produção é o próximo passo arquitetural a ser definido — substituindo progressivamente a cadeia E-02.x pelas engines cognitivas completas.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge label="Pipeline produção: 9 layers instrumentadas" color="green" />
                <Badge label="EF-43→49: 8 engines demo-only" color="amber" />
                <Badge label="CBE→SGE: certificado internamente" color="green" />
                <Badge label="Runtime→EF: não integrado" color="red" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}