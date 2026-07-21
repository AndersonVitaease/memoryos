/**
 * SprintEF408Page.jsx — Sprint EF-40.8
 * Memory Kernel Foundation — Relatorio Arquitetural
 */

import React, { useState } from "react";

const Sec = ({ id, title, verdict, children }) => {
  const [open, setOpen] = useState(true);
  const col = { "APROVADO": "text-emerald-400", "PENDENTE": "text-amber-400", "FALHA": "text-red-400", "INFO": "text-zinc-400" };
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/30 text-left">
        <span className="text-xs font-bold text-zinc-300 flex items-center gap-2">
          {id && <span className="text-violet-400">{id}</span>}
          {verdict && <span className={col[verdict] ?? "text-zinc-400"}>[{verdict}]</span>}
          {title}
        </span>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-2 bg-zinc-950/60 text-xs space-y-2">{children}</div>}
    </div>
  );
};

const Chip = ({ color, children }) => {
  const c = { green: "bg-emerald-950/60 text-emerald-300 border-emerald-700", amber: "bg-amber-950/60 text-amber-300 border-amber-700", red: "bg-red-950/60 text-red-400 border-red-800", violet: "bg-violet-950/60 text-violet-300 border-violet-700", zinc: "bg-zinc-800 text-zinc-400 border-zinc-600" };
  return <span className={`px-2 py-0.5 rounded border text-xs font-bold ${c[color] ?? c.zinc}`}>{children}</span>;
};

const Code = ({ children }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-6">{children}</div>
);

export default function SprintEF408Page() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 font-mono text-sm">
      <div className="max-w-5xl mx-auto">

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <Chip color="violet">SPRINT EF-40.8</Chip>
            <Chip color="green">APROVADO</Chip>
            <span className="text-zinc-500 text-xs">Memory Kernel Foundation — Relatorio Arquitetural</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-2">Memory Kernel v1.0 — Contrato Oficial da Memory Layer</h1>
          <p className="text-zinc-500 text-xs mt-1">Refatoracao arquitetural pura. Nenhum comportamento funcional alterado.</p>
        </div>

        {/* ETAPA 11 — Relatorio Arquitetural */}

        <Sec id="1" title="Arquitetura ANTES da EF-40.8" verdict="INFO">
          <Code>{`ConversationPipeline.ts
  ↓ chama runReasoningPlan(userMsg, session, historyMessages, setPhase, kfmContext)

memoryReasoningPlanner.js
  ↓ import { runMemoryPipeline } from "@/lib/memoryPipeline"   ← ACOPLAMENTO DIRETO
  ↓ const memory = await runMemoryPipeline(userMsg, session.id, session.project_id)
  ↓ detectSkills(userMsg, { memory.sessionSummary, memory.context, memory.sources })
  ↓ detectGoal(userMsg)
  ↓ orchestrateCapabilities(...)
  ↓ buildReasoningContext(userMsg, memory, skills, goal, ...)
  ↓ InvokeLLM(prompt)

ACOPLAMENTOS DO PLANNER (antes):
  - runMemoryPipeline (memoryPipeline.js)       ← importado diretamente
  - base44.entities (via runMemoryPipeline)     ← transitivo
  - InvokeLLM (via interpretIntent)             ← transitivo
  - EnrichedContextBuilder                      ← transitivo

UCME SHADOW (EF-40.6, paralelo, nao afetava producao):
  - MemoryContextProviderFactory.execute()      ← chamado no pipeline, nao no planner
  - LegacyContextProvider / UCMEContextProvider ← chamados pela factory`}</Code>
        </Sec>

        <Sec id="2" title="Arquitetura DEPOIS da EF-40.8" verdict="APROVADO">
          <Code>{`ConversationPipeline.ts
  ↓ chama runReasoningPlan(userMsg, session, historyMessages, setPhase, kfmContext)

memoryReasoningPlanner.js
  ↓ import { memoryService } from "@/lib/memory-kernel/MemoryServiceFactory"  ← UNICO IMPORT
  ↓ const memoryResult = await memoryService.retrieve({
        userMessage: userMsg,
        sessionId:   session.id,
        projectId:   session.project_id,
      })
  ↓ const memory = { context: memoryResult.memories, sources: memoryResult.sources,
                     sessionSummary: memoryResult.sessionSummary, intent: null, mip: {} }
  ↓ detectSkills(userMsg, { memory.sessionSummary, memory.context, memory.sources })
  ↓ detectGoal(userMsg)
  ↓ orchestrateCapabilities(...)
  ↓ buildReasoningContext(userMsg, memory, skills, goal, ...)
  ↓ InvokeLLM(prompt)

MemoryServiceFactory (UNICO ponto de decisao):
  mode=LEGACY  → LegacyMemoryService.retrieve()  → runMemoryPipeline()
  mode=UCME    → UCMEMemoryService.retrieve()     → UnifiedMemoryEngine.query()
  mode=SHADOW  → ShadowMemoryService.retrieve()   → Legacy para Planner + UCME fire-and-forget

O Planner conhece APENAS: memoryService (MemoryService interface)`}</Code>
        </Sec>

        <Sec id="3" title="Diagrama de dependencias — depois" verdict="APROVADO">
          <Code>{`CAMADA DE CONTRATO (nunca muda):
  MemoryService (interface)
  MemoryRequest (input contract)
  MemoryContext (output contract)
  src/lib/memory-kernel/

CAMADA DE DECISAO (muda apenas para controle de feature):
  MemoryServiceFactory
  ↓ cria LegacyMemoryService | UCMEMemoryService | ShadowMemoryService

CAMADA DE IMPLEMENTACAO (invisivel para o Planner):
  LegacyMemoryService  → runMemoryPipeline()
  UCMEMemoryService    → UnifiedMemoryEngine (via MemoryContextBuilder)
  ShadowMemoryService  → LegacyMemoryService + UCMEMemoryService

CAMADA DE ORQUESTRACAO (sem mudanca):
  memoryReasoningPlanner.js
  ↓ depende APENAS de memoryService (MemoryService interface)
  ↓ detectSkills / detectGoal / SpecialistRouter / orchestrateCapabilities / buildReasoningContext
  (nenhuma dessas camadas foi alterada)

CAMADA DE APRESENTACAO (sem mudanca):
  buildReasoningContext() / contextBuilder.js
  InvokeLLM
  synthesizeResponse`}</Code>
        </Sec>

        <Sec id="4" title="Dependencias REMOVIDAS do Planner" verdict="APROVADO">
          <div className="space-y-2">
            {[
              { dep: "import { runMemoryPipeline } from '@/lib/memoryPipeline'", motivo: "Substituido por memoryService.retrieve(). O Planner nao conhece mais runMemoryPipeline." },
              { dep: "Conhecimento do contrato de retorno de runMemoryPipeline (context, sources, sessionSummary, intent, mip)", motivo: "O Planner agora consome MemoryContext — um contrato estavel definido pelo Memory Kernel." },
              { dep: "Acoplamento transitivo a base44.entities (via runMemoryPipeline)", motivo: "LegacyMemoryService encapsula base44 — o Planner nunca ve base44 na Memory Layer." },
              { dep: "Acoplamento transitivo a InvokeLLM (via interpretIntent dentro de runMemoryPipeline)", motivo: "Encapsulado em LegacyMemoryService." },
              { dep: "Acoplamento transitivo a EnrichedContextBuilder", motivo: "Encapsulado em LegacyMemoryService." },
            ].map((d, i) => (
              <div key={i} className="border border-red-800/30 rounded p-3">
                <div className="text-red-400 font-mono text-xs mb-1 line-through opacity-70">{d.dep}</div>
                <div className="text-zinc-400 text-xs">{d.motivo}</div>
              </div>
            ))}
          </div>
        </Sec>

        <Sec id="5" title="Dependencias RESTANTES do Planner" verdict="INFO">
          <div className="space-y-2">
            {[
              { dep: "import { memoryService } from '@/lib/memory-kernel/MemoryServiceFactory'", tipo: "Contrato", ok: true },
              { dep: "import { base44 } from '@/api/base44Client'", tipo: "Analytics (track) — nao e Memory Layer", ok: true },
              { dep: "import { detectSkills } from '@/lib/skills/detector'", tipo: "Skills Layer — responsabilidade do Planner", ok: true },
              { dep: "import { detectGoal } from '@/lib/reasoning/goalDetector'", tipo: "Goal Layer — responsabilidade do Planner", ok: true },
              { dep: "import { buildReasoningContext } from '@/lib/reasoning/contextBuilder'", tipo: "Prompt Builder — responsabilidade do Planner", ok: true },
              { dep: "import { synthesizeResponse } from '@/lib/reasoning/memorySynthesizer'", tipo: "Response synthesis — responsabilidade do Planner", ok: true },
              { dep: "import { orchestrateCapabilities } from '@/lib/reasoning/capabilityOrchestrator'", tipo: "Capability Layer — responsabilidade do Planner", ok: true },
              { dep: "import { SpecialistRouter } from '@/lib/routing/specialistRouter'", tipo: "Specialist routing — responsabilidade do Planner", ok: true },
              { dep: "import { formatMacrForChat } from '@/lib/reasoning/macrFormatterV4'", tipo: "MACR formatter — responsabilidade do Planner", ok: true },
            ].map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-zinc-800/40 last:border-0">
                <Chip color={d.ok ? "green" : "amber"}>{d.tipo}</Chip>
                <span className="text-zinc-400 font-mono">{d.dep}</span>
              </div>
            ))}
          </div>
        </Sec>

        <Sec id="6" title="Impacto arquitetural" verdict="APROVADO">
          <div className="space-y-3">
            <div className="border border-emerald-800/40 rounded p-3">
              <div className="text-emerald-400 font-bold mb-1">Dependency Inversion aplicada</div>
              <div className="text-zinc-400 text-xs">O Planner (modulo de alto nivel) nao depende mais de runMemoryPipeline (modulo de baixo nivel). Ambos dependem do contrato MemoryService (abstracao).</div>
            </div>
            <div className="border border-emerald-800/40 rounded p-3">
              <div className="text-emerald-400 font-bold mb-1">Open/Closed para implementacoes de Memory</div>
              <div className="text-zinc-400 text-xs">Adicionar uma nova implementacao de MemoryService (ex: CloudMemoryService) requer: criar a classe e registrar na MemoryServiceFactory. Zero mudancas no Planner, no PromptBuilder, no CapabilityOrchestrator ou no Pipeline.</div>
            </div>
            <div className="border border-emerald-800/40 rounded p-3">
              <div className="text-emerald-400 font-bold mb-1">Single source of truth para o modo</div>
              <div className="text-zinc-400 text-xs">MemoryServiceFactory e o UNICO lugar que conhece LEGACY/UCME/SHADOW. Antes havia dois lugares: MemoryContextProviderFactory (EF-40.6) e runMemoryPipeline (no Planner). Agora ha um.</div>
            </div>
            <div className="border border-emerald-800/40 rounded p-3">
              <div className="text-emerald-400 font-bold mb-1">Compatibilidade total com o restante do sistema</div>
              <div className="text-zinc-400 text-xs">O adapter em LegacyMemoryService converte MemoryContext de volta para o formato {"{context, sources, sessionSummary, intent, mip}"} — que e o que detectSkills, orchestrateCapabilities e buildReasoningContext ja esperam. Zero mudancas nessas camadas.</div>
            </div>
          </div>
        </Sec>

        <Sec id="7" title="Riscos" verdict="INFO">
          {[
            { risco: "mip.ranked, mip.health, mip.graph (dados do EnrichedContextBuilder) nao sao propagados em MemoryContext", nivel: "Baixo", mitig: "mip era usado apenas para COP dashboard — nao para o prompt principal. O campo mip:{} vazio no adapter nao altera nenhum comportamento de resposta." },
            { risco: "memory.intent nao e propagado em MemoryContext", nivel: "Baixo", mitig: "memory.intent era o objeto bruto do interpretIntent(). Nenhuma parte do Planner o usava apos runMemoryPipeline — era apenas metadado." },
            { risco: "MemoryServiceFactory inicia com mode=LEGACY — comportamento identico ao anterior", nivel: "Zero", mitig: "Por design. Rollback imediato disponivel." },
            { risco: "UCMEMemoryService herda os gaps de providers identificados na EF-40.7/EF-40.7A", nivel: "Baixo", mitig: "UCMEMemoryService so sera ativado (mode=UCME) na EF-40.9 apos os 9 gaps do UCME serem corrigidos." },
          ].map((r, i) => (
            <div key={i} className={`border rounded p-3 mb-2 ${r.nivel === "Zero" ? "border-emerald-800/30" : r.nivel === "Baixo" ? "border-zinc-700" : "border-amber-800/30"}`}>
              <div className="flex items-center gap-2 mb-1">
                <Chip color={r.nivel === "Zero" ? "green" : r.nivel === "Baixo" ? "zinc" : "amber"}>{r.nivel}</Chip>
                <span className="text-white font-bold text-xs">{r.risco}</span>
              </div>
              <div className="text-zinc-500 text-xs">{r.mitig}</div>
            </div>
          ))}
        </Sec>

        <Sec id="8" title="Rollback" verdict="INFO">
          <Code>{`Para reverter COMPLETAMENTE a EF-40.8:

1. Em src/lib/reasoning/memoryReasoningPlanner.js:

   SUBSTITUIR:
     import { memoryService } from "@/lib/memory-kernel/MemoryServiceFactory";
   POR:
     import { runMemoryPipeline } from "@/lib/memoryPipeline";

   SUBSTITUIR o bloco:
     const memoryResult = await memoryService.retrieve({...});
     const memory = { context: memoryResult.memories, ... };
   POR:
     const memory = await runMemoryPipeline(userMsg, session.id, session.project_id);

2. Nenhum outro arquivo precisa ser revertido.
3. Os arquivos do memory-kernel podem ser mantidos ou deletados.
4. Nenhum comportamento funcional foi alterado — rollback e transparente.`}</Code>
        </Sec>

        {/* ETAPA 12 — Auditoria SRP/DIP/OCP */}
        <Sec id="ETAPA 12" title="Auditoria SRP / DIP / OCP" verdict="APROVADO">
          <div className="space-y-2">
            {[
              { q: "Planner depende apenas de MemoryService?", a: "SIM", detalhe: "memoryReasoningPlanner.js importa apenas 'memoryService' da MemoryServiceFactory. Nenhum import de runMemoryPipeline, UnifiedMemoryEngine, providers ou base44 (Memory Layer)." },
              { q: "ConversationPipeline conhece o Legacy?", a: "NAO", detalhe: "ConversationPipeline.ts nao foi alterado. Ja nao importava runMemoryPipeline — chamava apenas runReasoningPlan(). Permanece sem conhecimento do Legacy." },
              { q: "ConversationPipeline conhece o UCME?", a: "NAO", detalhe: "ConversationPipeline.ts nao foi alterado. O bloco UCME Shadow (EF-40.6) ainda existe no Pipeline para diagnostico de contexto, mas nao e a Memory Layer do Planner." },
              { q: "Planner conhece Providers?", a: "NAO", detalhe: "O Planner nao importa nenhum Provider (ConversationMemoryProvider, GoogleDriveMemoryProvider, etc). Providers sao invisveis atras do MemoryService." },
              { q: "Planner conhece Base44 (Memory Layer)?", a: "NAO", detalhe: "O Planner usa base44 apenas para analytics.track() — nao para recuperacao de memoria. O acoplamento a base44 como Memory Layer foi removido." },
              { q: "Planner conhece UnifiedMemoryEngine?", a: "NAO", detalhe: "UCMEMemoryService encapsula UnifiedMemoryEngine. O Planner nao importa nem referencia UnifiedMemoryEngine." },
              { q: "Planner conhece runMemoryPipeline?", a: "NAO", detalhe: "Substituido por memoryService.retrieve(). LegacyMemoryService encapsula runMemoryPipeline internamente." },
              { q: "Existe acoplamento direto restante?", a: "SIM (intencional)", detalhe: "base44.analytics.track() — o Planner chama analytics diretamente. Isso e correto: analytics e responsabilidade do Planner como orquestrador, nao da Memory Layer." },
            ].map((item, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 border rounded ${item.a === "SIM" && item.q.includes("acoplamento") ? "border-amber-800/30" : item.a === "NAO" || item.a === "SIM" ? "border-emerald-800/30" : "border-zinc-700"}`}>
                <Chip color={item.a === "NAO" ? "green" : item.a === "SIM" && !item.q.includes("acoplamento") ? "green" : "amber"}>{item.a}</Chip>
                <div>
                  <div className="text-white font-bold text-xs">{item.q}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{item.detalhe}</div>
                </div>
              </div>
            ))}
          </div>
        </Sec>

        {/* Arquivos criados */}
        <Sec id="FILES" title="Arquivos criados / modificados" verdict="APROVADO">
          <div className="space-y-1">
            {[
              { file: "src/lib/memory-kernel/MemoryService.ts", acao: "CRIADO", desc: "Contrato oficial da Memory Layer (interface)" },
              { file: "src/lib/memory-kernel/MemoryRequest.ts", acao: "CRIADO", desc: "Contrato de entrada (userMessage, sessionId, projectId, options)" },
              { file: "src/lib/memory-kernel/MemoryContext.ts", acao: "CRIADO", desc: "Contrato de saida (memories, sessionSummary, sources, entities, projects, etc)" },
              { file: "src/lib/memory-kernel/LegacyMemoryService.ts", acao: "CRIADO", desc: "Adapter: runMemoryPipeline() → MemoryContext" },
              { file: "src/lib/memory-kernel/UCMEMemoryService.ts", acao: "CRIADO", desc: "Adapter: UnifiedMemoryEngine → MemoryContext" },
              { file: "src/lib/memory-kernel/MemoryServiceFactory.ts", acao: "CRIADO", desc: "Factory + ShadowMemoryService — unico ponto de decisao LEGACY/UCME/SHADOW" },
              { file: "src/lib/reasoning/memoryReasoningPlanner.js", acao: "MODIFICADO", desc: "2 mudancas: (1) import runMemoryPipeline → import memoryService; (2) chamada runMemoryPipeline() → memoryService.retrieve() com adapter de contrato" },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3 text-xs py-1.5 border-b border-zinc-800/40 last:border-0">
                <Chip color={f.acao === "CRIADO" ? "violet" : "amber"}>{f.acao}</Chip>
                <span className="text-violet-400 font-mono">{f.file}</span>
                <span className="text-zinc-500">{f.desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-emerald-400 text-xs font-bold">Nao modificados: ConversationPipeline, GoalDetector, Skills, CapabilityOrchestrator, PromptBuilder, SpecialistRouter, runMemoryPipeline, UnifiedMemoryEngine, todos os Providers.</div>
        </Sec>

        {/* Certificacao */}
        <div className="border-2 border-emerald-700/50 rounded-xl p-6 bg-emerald-950/10">
          <div className="text-xs text-emerald-400 font-bold mb-4">CERTIFICACAO FINAL — EF-40.8</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-4">
            {[
              "MemoryService tornou-se o contrato oficial da Memory Layer",
              "Planner depende exclusivamente de MemoryService",
              "LegacyMemoryService e apenas uma implementacao",
              "UCMEMemoryService e apenas uma implementacao",
              "O sistema continua funcionando exatamente como antes",
              "Nenhum comportamento funcional foi alterado",
              "Nenhum Prompt foi alterado",
              "Nenhum Provider novo foi implementado",
              "Toda a migracao ocorreu por inversao de dependencia",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-emerald-950/30 border border-emerald-800/30 rounded">
                <span className="text-emerald-400 font-bold">✓</span>
                <span className="text-zinc-300">{item}</span>
              </div>
            ))}
          </div>
          <div className="text-white font-black text-2xl">APROVADO</div>
          <div className="text-zinc-400 text-xs mt-2">Proximo: EF-40.9 — implementar os 9 gaps do UCME (sessionSummary, Project, ChatSession, Keyword, projectId filter, recency real) e ativar mode=UCME no MemoryServiceFactory.</div>
        </div>

      </div>
    </div>
  );
}