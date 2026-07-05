import React, { useState } from "react";
import { Network } from "lucide-react";
import CognitiveTestRunner from "@/components/cognitive-engine/CognitiveTestRunner";

export default function CognitiveEngine() {
  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-8 lg:py-12 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg shadow-fuchsia-200">
          <Network className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading text-zinc-900">Cognitive Engine</h1>
          <p className="text-sm text-zinc-500">Fase 3 · Coordenação Cognitiva</p>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-6 mb-6 space-y-3">
        <p className="text-sm text-zinc-500">
          O Cognitive Engine é a camada de coordenação cognitiva do MemoryOS.
          Decide quais componentes participam do processamento de cada mensagem,
          construindo planos explícitos e determinísticos — sem executar nada diretamente.
        </p>
      </div>

      <CognitiveTestRunner />
    </div>
  );
}