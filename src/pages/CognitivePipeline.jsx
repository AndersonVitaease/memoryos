import React from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ExternalLink } from "lucide-react";

const PIPELINE_STAGES = [
  {
    number: 1,
    label: "Goal",
    sublabel: "Goal Runtime v0.1",
    path: "/goal-runtime",
    color: "from-blue-600 to-blue-700",
    border: "border-blue-700/50",
    bg: "bg-blue-950/30",
    text: "text-blue-300",
    dot: "bg-blue-500",
    description: "Define e gerencia o ciclo de vida do objetivo cognitivo",
  },
  {
    number: 2,
    label: "Decision",
    sublabel: "Decision Engine v1.0",
    path: "/decision-engine",
    color: "from-indigo-600 to-indigo-700",
    border: "border-indigo-700/50",
    bg: "bg-indigo-950/30",
    text: "text-indigo-300",
    dot: "bg-indigo-500",
    description: "Avalia candidatos, pontua e seleciona a melhor decisão",
  },
  {
    number: 3,
    label: "Planning",
    sublabel: "Planning Engine v1.0",
    path: "/planning-engine",
    color: "from-violet-600 to-violet-700",
    border: "border-violet-700/50",
    bg: "bg-violet-950/30",
    text: "text-violet-300",
    dot: "bg-violet-500",
    description: "Transforma decisões em planos de execução imutáveis",
  },
  {
    number: 4,
    label: "Reflection",
    sublabel: "Reflection Engine v1.0",
    path: "/reflection-engine",
    color: "from-purple-600 to-purple-700",
    border: "border-purple-700/50",
    bg: "bg-purple-950/30",
    text: "text-purple-300",
    dot: "bg-purple-500",
    description: "Produz avaliações imutáveis dos resultados de execução",
  },
  {
    number: 5,
    label: "Self Evaluation",
    sublabel: "Self Evaluation Engine v1.0",
    path: "/self-evaluation-engine",
    color: "from-fuchsia-600 to-fuchsia-700",
    border: "border-fuchsia-700/50",
    bg: "bg-fuchsia-950/30",
    text: "text-fuchsia-300",
    dot: "bg-fuchsia-500",
    description: "Pontua qualidade, confiabilidade e performance da execução",
  },
  {
    number: 6,
    label: "Knowledge",
    sublabel: "Knowledge Engine v1.0",
    path: "/knowledge-engine",
    color: "from-pink-600 to-pink-700",
    border: "border-pink-700/50",
    bg: "bg-pink-950/30",
    text: "text-pink-300",
    dot: "bg-pink-500",
    description: "Filtra avaliações aprovadas em objetos de conhecimento estruturados",
  },
  {
    number: 7,
    label: "Learning",
    sublabel: "Learning Engine v1.0",
    path: "/learning-engine",
    color: "from-rose-600 to-rose-700",
    border: "border-rose-700/50",
    bg: "bg-rose-950/30",
    text: "text-rose-300",
    dot: "bg-rose-500",
    description: "Transforma conhecimento aprovado em estruturas Learning imutáveis",
  },
  {
    number: 8,
    label: "Memory",
    sublabel: "Memory Engine v1.0",
    path: "/memory-engine-v1",
    color: "from-orange-600 to-orange-700",
    border: "border-orange-700/50",
    bg: "bg-orange-950/30",
    text: "text-orange-300",
    dot: "bg-orange-500",
    description: "Persiste Learnings aprovados como objetos Memory imutáveis",
  },
  {
    number: 9,
    label: "Retrieval",
    sublabel: "Retrieval Engine v1.0",
    path: "/retrieval-engine",
    color: "from-emerald-600 to-emerald-700",
    border: "border-emerald-700/50",
    bg: "bg-emerald-950/30",
    text: "text-emerald-300",
    dot: "bg-emerald-500",
    description: "Acesso final — consulta a memória persistida por critério",
  },
];

export default function CognitivePipeline() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-zinc-500 mb-3">
            <span className="text-violet-400">Foundation v1.0</span>
            <span>·</span>
            <span className="text-emerald-400">Engineering First</span>
            <span>·</span>
            <span>Sprint EF-13</span>
          </div>
          <h1 className="text-2xl font-bold text-white font-heading mb-2">Cognitive Pipeline</h1>
          <p className="text-zinc-400 text-sm">9 engines · fluxo determinístico · dados imutáveis</p>
        </div>

        {/* Pipeline */}
        <div className="flex flex-col items-center">
          {PIPELINE_STAGES.map((stage, i) => (
            <React.Fragment key={stage.number}>
              {/* Stage card */}
              <Link
                to={stage.path}
                className={`w-full rounded-xl border ${stage.border} ${stage.bg} px-4 py-3.5 flex items-center gap-4 group hover:brightness-110 transition-all`}
              >
                {/* Number badge */}
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stage.color} flex items-center justify-center text-white text-xs font-bold font-mono shrink-0`}>
                  {stage.number}
                </div>

                {/* Labels */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={`font-bold text-sm ${stage.text}`}>{stage.label}</span>
                    <span className="text-zinc-600 text-xs font-mono">{stage.sublabel}</span>
                  </div>
                  <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{stage.description}</p>
                </div>

                {/* Arrow */}
                <ExternalLink className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
              </Link>

              {/* Connector arrow (not after last) */}
              {i < PIPELINE_STAGES.length - 1 && (
                <div className="flex flex-col items-center my-1">
                  <div className={`w-0.5 h-3 ${stage.dot} opacity-40`} />
                  <ArrowDown className={`w-3.5 h-3.5 ${stage.text} opacity-50`} />
                  <div className={`w-0.5 h-3 ${PIPELINE_STAGES[i + 1].dot} opacity-40`} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Footer badge */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs font-mono text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            9 engines certificados · 28 cenarios PASS · 0 falhas
          </div>
        </div>

      </div>
    </div>
  );
}