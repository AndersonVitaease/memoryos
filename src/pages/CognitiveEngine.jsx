import React, { useState } from "react";
import { Network, Workflow, Brain, GitBranch } from "lucide-react";
import CognitiveTestRunner from "@/components/cognitive-engine/CognitiveTestRunner";
import PipelineTestRunner from "@/components/cognitive-engine/PipelineTestRunner";
import ReasoningTestRunner from "@/components/cognitive-engine/ReasoningTestRunner";
import DecisionTestRunner from "@/components/cognitive-engine/DecisionTestRunner";

const TABS = [
  { id: "sprint14", label: "Sprint 14 · Orchestrator", icon: Network },
  { id: "sprint15", label: "Sprint 15 · Pipeline", icon: Workflow },
  { id: "sprint16", label: "Sprint 16 · Reasoning", icon: Brain },
  { id: "sprint17", label: "Sprint 17 · Decision", icon: GitBranch },
];

export default function CognitiveEngine() {
  const [tab, setTab] = useState("sprint17");

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-8 lg:py-12 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg shadow-fuchsia-200">
          <Network className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-zinc-900">Cognitive Engine</h1>
          <p className="text-sm text-zinc-500">Fase 3 · Coordenação e Execução Cognitiva</p>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-6 space-y-3">
        <p className="text-sm text-zinc-500">
          O Cognitive Engine é a camada de coordenação cognitiva do MemoryOS.
          O Orchestrator decide quais componentes participam do processamento e
          constrói um plano. O Pipeline executa esse plano etapa por etapa.
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition ${
                active
                  ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "sprint14" ? (
        <CognitiveTestRunner />
      ) : tab === "sprint15" ? (
        <PipelineTestRunner />
      ) : tab === "sprint16" ? (
        <ReasoningTestRunner />
      ) : (
        <DecisionTestRunner />
      )}
    </div>
  );
}