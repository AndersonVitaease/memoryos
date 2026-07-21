/**
 * SprintEF403Page.jsx
 * Sprint EF-40.3 - Certificacao da Integracao da Biblioteca Oficial com a Pipeline Oficial
 * Evidence-only. Zero inferencia.
 */

import React, { useState } from "react";

const Ev = ({ children }) => (
  <div className="flex items-start gap-2 text-xs mt-1">
    <span className="text-emerald-600 flex-shrink-0">✓</span>
    <span className="text-zinc-400 break-words">{children}</span>
  </div>
);

const Section = ({ title, children, id }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/40 text-left"
      >
        <span className="text-xs font-bold text-zinc-300">
          {id && <span className="text-violet-400 mr-2">{id}</span>}
          {title}
        </span>
        <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-3 bg-zinc-950/50 space-y-3 text-xs">{children}</div>}
    </div>
  );
};

const Row = ({ label, value, mono }) => (
  <div className="flex gap-3 text-xs border-b border-zinc-800/50 py-1.5 last:border-0">
    <span className="text-zinc-500 w-32 flex-shrink-0">{label}</span>
    <span className={mono ? "text-violet-300 font-mono break-all" : "text-zinc-300"}>{value}</span>
  </div>
);

const SIM_BADGE = () => <span className="text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-700 px-2 py-0.5 rounded">SIM</span>;
const NAO_BADGE = () => <span className="text-xs font-bold text-red-400 bg-red-950/40 border border-red-800 px-2 py-0.5 rounded">NAO</span>;

const STEPS = [
  {
    step: "1", name: "ConversationPipeline.ts",
    arquivo: "src/lib/conversation-platform/ConversationPipeline.ts",
    metodo: "_runPipeline() — step route",
    entrada: "userMessage: string, session, historyMessages[]",
    saida: "finalResponse: string (via ResponseArbiter)",
    chamadoPor: "ConversationPipeline.send()",
    consome: "runReasoningPlan() via import dinamico",
  },
  {
    step: "2", name: "memoryReasoningPlanner.js",
    arquivo: "src/lib/reasoning/memoryReasoningPlanner.js",
    metodo: "runReasoningPlan({ userMsg, session, historyMessages, kfmContext })",
    entrada: "userMsg, session, historyMessages[], kfmContext",
    saida: "{ response: string, plan: object, sources: array }",
    chamadoPor: "ConversationPipeline.ts (import dinamico)",
    consome: "runMemoryPipeline, detectSkills, detectGoal, SpecialistRouter, orchestrateCapabilities, buildReasoningContext, InvokeLLM",
  },
  {
    step: "3", name: "memoryPipeline.js",
    arquivo: "src/lib/memoryPipeline.js",
    metodo: "runMemoryPipeline(question, sessionId, projectId)",
    entrada: "question: string, sessionId, projectId",
    saida: "{ context, sources, intent, sessionSummary, mip }",
    chamadoPor: "memoryReasoningPlanner.js line 55",
    consome: "base44.entities.* (banco de dados), buildEnrichedContext()",
  },
  {
    step: "4", name: "capabilityOrchestrator.js",
    arquivo: "src/lib/reasoning/capabilityOrchestrator.js",
    metodo: "orchestrateCapabilities({ message, memory, goal, sessionId, projectId })",
    entrada: "message, memory, goal, sessionId, projectId",
    saida: "{ capabilities, capabilityResults, needsMoreInfo, serviceInfo }",
    chamadoPor: "memoryReasoningPlanner.js line 128",
    consome: "detectCapabilities(), executeCapabilities()",
  },
  {
    step: "5", name: "capabilityExecutor.js",
    arquivo: "src/lib/reasoning/capabilityExecutor.js",
    metodo: "executeCapabilities(capabilities, { message, sessionId, projectId })",
    entrada: "capabilities: { official_library: bool, ... }",
    saida: "{ officialLibrary: {...}, webSearch, calculation, documents }",
    chamadoPor: "capabilityOrchestrator.js line 104",
    consome: "executeOfficialLibraryQuery() [CONDICIONAL: so se capabilities.official_library = true]",
  },
  {
    step: "6", name: "officialLibraryCapability.js",
    arquivo: "src/lib/reasoning/capabilities/officialLibraryCapability.js",
    metodo: "executeOfficialLibraryQuery(message)",
    entrada: "message: string",
    saida: "{ ready, version, docNames, docCount, selectedDocs: Array<{name, content}> }",
    chamadoPor: "capabilityExecutor.js line 166",
    consome: "OfficialLibraryManager.isReady(), .getDocNames(), .getDoc(name)",
  },
  {
    step: "7", name: "officialLibraryManager.js",
    arquivo: "src/lib/officialLibraryManager.js",
    metodo: "getDoc(name), getDocNames(), isReady()",
    entrada: "name: string",
    saida: "string (conteudo do documento embutido como JS string)",
    chamadoPor: "officialLibraryCapability.js",
    consome: "EMBEDDED_DOCS (objeto JS com 5 documentos embutidos como strings nativas)",
  },
  {
    step: "8", name: "contextBuilder.js",
    arquivo: "src/lib/reasoning/contextBuilder.js",
    metodo: "buildReasoningContext({ ..., capabilityResults })",
    entrada: "capabilityResults.officialLibrary: { selectedDocs: [{name, content}], ... }",
    saida: "prompt: string — inclui bloco BIBLIOTECA OFICIAL DO MEMORYOS",
    chamadoPor: "memoryReasoningPlanner.js line 144",
    consome: "Nada — pure function que constroi string de prompt",
  },
  {
    step: "9", name: "InvokeLLM",
    arquivo: "src/lib/reasoning/memoryReasoningPlanner.js",
    metodo: "base44.integrations.Core.InvokeLLM({ prompt })",
    entrada: "prompt: string (inclui conteudo da Biblioteca Oficial quando ativado)",
    saida: "rawResponse: string",
    chamadoPor: "memoryReasoningPlanner.js line 163",
    consome: "— (chamada de integracao externa)",
  },
];

const PERGUNTAS = [
  {
    pergunta: "ConversationPipeline v2 -> CONSULTA OfficialLibraryProvider?",
    resposta: false,
    ev: "NAO EXISTE EVIDENCIA. OfficialLibraryProvider nao e importado nem referenciado em nenhum arquivo da cadeia ConversationPipeline -> InvokeLLM.",
  },
  {
    pergunta: "ConversationPipeline v2 -> CONSULTA MemoryProviderRegistry?",
    resposta: false,
    ev: "NAO EXISTE EVIDENCIA. MemoryProviderRegistry nao aparece em nenhum arquivo da cadeia ConversationPipeline -> InvokeLLM.",
  },
  {
    pergunta: "ConversationPipeline v2 -> CONSULTA UnifiedMemoryEngine?",
    resposta: false,
    ev: "NAO EXISTE EVIDENCIA. UnifiedMemoryEngine nao aparece em nenhum arquivo da cadeia ConversationPipeline -> InvokeLLM.",
  },
  {
    pergunta: "ConversationPipeline v2 -> CONSULTA MemoryFusionEngine?",
    resposta: false,
    ev: "NAO EXISTE EVIDENCIA. MemoryFusionEngine nao aparece em nenhum arquivo da cadeia ConversationPipeline -> InvokeLLM.",
  },
  {
    pergunta: "ConversationPipeline v2 -> CONSULTA buildReasoningContext()?",
    resposta: true,
    ev: "EVIDENCIA: memoryReasoningPlanner.js line 5: import { buildReasoningContext } from '@/lib/reasoning/contextBuilder'. memoryReasoningPlanner.js line 144: buildReasoningContext({...}). ConversationPipeline.ts chama runReasoningPlan() que chama buildReasoningContext().",
  },
  {
    pergunta: "ConversationPipeline v2 -> CONSULTA memoryReasoningPlanner?",
    resposta: true,
    ev: "EVIDENCIA: ConversationPipeline.ts: const { runReasoningPlan } = await import('@/lib/reasoning/memoryReasoningPlanner'). Chamada efetiva: const plan = await runReasoningPlan({...}).",
  },
  {
    pergunta: "ConversationPipeline v2 -> CONSOME MemoryEvidence?",
    resposta: false,
    ev: "NAO EXISTE EVIDENCIA. MemoryEvidence nao aparece em nenhum arquivo da cadeia. E um tipo do UCME — subsistema separado.",
  },
  {
    pergunta: "ConversationPipeline v2 -> CONSOME OfficialChunk?",
    resposta: false,
    ev: "NAO EXISTE EVIDENCIA. OfficialChunk nao aparece em nenhum arquivo da cadeia. E um tipo do subsistema EF-7.x (OfficialLibraryIndexer/Chunker) — completamente separado.",
  },
];

const MAPA = [
  { name: "officialLibraryManager.js", resp: "Armazena 5 docs como EMBEDDED_DOCS", prod: "string (conteudo do doc)", cons: "—", connected: true, ev: "officialLibraryCapability.js line 18: import OfficialLibraryManager" },
  { name: "officialLibraryCapability.js", resp: "Seleciona e retorna docs da Biblioteca", prod: "{ selectedDocs[], docCount }", cons: "OfficialLibraryManager", connected: true, ev: "capabilityExecutor.js line 2: import executeOfficialLibraryQuery" },
  { name: "capabilityDetector.js", resp: "Detecta se official_library deve ativar", prod: "capabilities.official_library: bool", cons: "OFFICIAL_LIBRARY_KEYWORDS", connected: true, ev: "capabilityOrchestrator.js line 1: import detectCapabilities" },
  { name: "capabilityExecutor.js", resp: "Executa capacidades incluindo official_library", prod: "{ officialLibrary: {...} }", cons: "executeOfficialLibraryQuery() [condicional]", connected: true, ev: "capabilityOrchestrator.js line 1: import executeCapabilities" },
  { name: "capabilityOrchestrator.js", resp: "Orquestra capacidades", prod: "capabilityResults", cons: "detectCapabilities, executeCapabilities", connected: true, ev: "memoryReasoningPlanner.js line 7: import orchestrateCapabilities" },
  { name: "contextBuilder.js", resp: "Constroi o prompt final para o LLM", prod: "prompt: string (com bloco da Biblioteca)", cons: "capabilityResults.officialLibrary", connected: true, ev: "memoryReasoningPlanner.js line 5: import buildReasoningContext" },
  { name: "memoryReasoningPlanner.js", resp: "Orquestra toda a cadeia ate InvokeLLM", prod: "{ response, plan, sources }", cons: "todos os acima", connected: true, ev: "ConversationPipeline.ts: import memoryReasoningPlanner" },
  { name: "OfficialLibraryProvider.ts", resp: "Implementa MemoryProvider para UCME", prod: "MemoryEvidence[]", cons: "OfficialLibraryIndexer", connected: false, ev: "NAO EXISTE EVIDENCIA de importacao pela pipeline conversacional" },
  { name: "OfficialLibraryIndexer.ts", resp: "Indice em memoria de OfficialChunk[]", prod: "OfficialChunk[] via search()", cons: "OfficialLibraryBootstrap", connected: false, ev: "NAO EXISTE EVIDENCIA de importacao pela pipeline conversacional" },
  { name: "OfficialLibraryBootstrap.ts", resp: "Inicializa indice de chunks", prod: "chunks + metas no Indexer", cons: "DocumentLoader, Parser, Chunker, GraphBuilder", connected: false, ev: "NAO EXISTE EVIDENCIA de importacao pela pipeline conversacional" },
  { name: "MemoryProviderRegistry.ts", resp: "Registro de MemoryProviders", prod: "MemoryProvider[]", cons: "OfficialLibraryProvider (auto-register)", connected: false, ev: "NAO EXISTE EVIDENCIA de importacao pela pipeline conversacional" },
  { name: "UnifiedMemoryEngine.ts", resp: "Consulta todos os MemoryProviders", prod: "MemoryResult", cons: "MemoryProviderRegistry, MemoryFusionEngine", connected: false, ev: "NAO EXISTE EVIDENCIA de importacao pela pipeline conversacional" },
  { name: "MemoryFusionEngine.ts", resp: "Funde MemoryEvidence[]", prod: "MemoryEvidence[] fundido", cons: "UnifiedMemoryEngine", connected: false, ev: "NAO EXISTE EVIDENCIA de importacao pela pipeline conversacional" },
];

export default function SprintEF403Page() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 text-sm font-mono">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700 px-2 py-0.5 rounded">SPRINT EF-40.3</span>
            <span className="text-xs text-zinc-500">2026-07-21 · Evidence-only · Zero inferencia</span>
          </div>
          <h1 className="text-xl font-bold text-white">Certificacao da Integracao — Biblioteca Oficial vs Pipeline Oficial</h1>
          <p className="text-zinc-500 text-xs mt-1">Objetivo unico: A Pipeline Oficial realmente consulta a Biblioteca Oficial durante uma conversa?</p>
        </div>

        {/* PASSO 1 */}
        <Section id="PASSO 1" title="Ponto de construcao do contexto do LLM">
          <Row label="Arquivo" value="src/lib/reasoning/memoryReasoningPlanner.js" mono />
          <Row label="Classe" value="— (modulo .js, sem classe)" />
          <Row label="Funcao" value="runReasoningPlan({ userMsg, session, historyMessages, setPhase, kfmContext })" mono />
          <Row label="Quem chama" value="ConversationPipeline.ts via import dinamico: const { runReasoningPlan } = await import('@/lib/reasoning/memoryReasoningPlanner')" />
          <Row label="Objeto produzido" value="{ response: string, plan: object, sources: array }" mono />
          <Row label="InvokeLLM em" value="memoryReasoningPlanner.js line 163: base44.integrations.Core.InvokeLLM({ prompt })" mono />
          <Row label="Prompt construido por" value="buildReasoningContext() — src/lib/reasoning/contextBuilder.js line 38" mono />
          <Ev>memoryReasoningPlanner.js line 163: base44.integrations.Core.InvokeLLM — unica chamada LLM na path</Ev>
          <Ev>memoryReasoningPlanner.js line 144: buildReasoningContext({"{...}"}) — monta o prompt completo</Ev>
          <Ev>ConversationPipeline.ts: const {"{ runReasoningPlan }"} = await import('@/lib/reasoning/memoryReasoningPlanner')</Ev>
        </Section>

        {/* PASSO 2 */}
        <Section id="PASSO 2" title="Cadeia completa — ConversationPipeline ate InvokeLLM">
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4 text-xs space-y-0.5 leading-relaxed">
            <div className="text-zinc-400 mb-2 text-xs">Reconstruida por evidencia de codigo. Path ativa confirmada.</div>
            <div className="text-violet-300 font-bold">ConversationPipeline.ts — _runPipeline() [step route]</div>
            <div className="text-zinc-600 pl-4">↓ import dinamico (linha ~160)</div>
            <div className="text-violet-300 font-bold">memoryReasoningPlanner.js — runReasoningPlan()</div>
            <div className="text-zinc-600 pl-4">↓ await runMemoryPipeline() [line 55]</div>
            <div className="text-blue-300">memoryPipeline.js — runMemoryPipeline()</div>
            <div className="text-zinc-600 pl-8">interpretIntent() → InvokeLLM [intent]</div>
            <div className="text-zinc-600 pl-8">queryEntities() → base44.entities.*</div>
            <div className="text-zinc-600 pl-8">buildEnrichedContext() → contexto</div>
            <div className="text-zinc-600 pl-4">↓ detectSkills(), detectGoal(), SpecialistRouter</div>
            <div className="text-zinc-600 pl-4">↓ orchestrateCapabilities() [line 128]</div>
            <div className="text-blue-300">capabilityOrchestrator.js — orchestrateCapabilities()</div>
            <div className="text-zinc-600 pl-8">detectCapabilities() → official_library: bool</div>
            <div className="text-zinc-600 pl-8">executeCapabilities() SE flag = true</div>
            <div className="text-blue-300">capabilityExecutor.js — executeCapabilities()</div>
            <div className="text-zinc-600 pl-8">SE capabilities.official_library = true:</div>
            <div className="text-emerald-300 pl-12">executeOfficialLibraryQuery(message)</div>
            <div className="text-blue-300 pl-12">officialLibraryCapability.js</div>
            <div className="text-zinc-600 pl-16">OfficialLibraryManager.isReady()</div>
            <div className="text-zinc-600 pl-16">OfficialLibraryManager.getDoc(name)</div>
            <div className="text-zinc-600 pl-16">→ retorna: {"{ selectedDocs: [{name, content}] }"}</div>
            <div className="text-zinc-600 pl-4">↓ capabilityResults.officialLibrary</div>
            <div className="text-violet-300 font-bold">memoryReasoningPlanner.js — buildReasoningContext() [line 144]</div>
            <div className="text-blue-300">contextBuilder.js — buildReasoningContext()</div>
            <div className="text-zinc-600 pl-8">SE capabilityResults.officialLibrary existir:</div>
            <div className="text-emerald-300 pl-12">injeta bloco BIBLIOTECA OFICIAL no prompt</div>
            <div className="text-zinc-600 pl-12">inclui selectedDocs[].content completo</div>
            <div className="text-zinc-600 pl-4">↓ prompt: string</div>
            <div className="text-yellow-300 font-bold">base44.integrations.Core.InvokeLLM({"{ prompt }"})</div>
          </div>
        </Section>

        {/* PASSO 3 */}
        <Section id="PASSO 3" title="Detalhamento de cada etapa">
          <div className="space-y-3">
            {STEPS.map(s => (
              <div key={s.step} className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-white font-bold mb-2 text-xs">Etapa {s.step} — {s.name}</div>
                <Row label="Arquivo" value={s.arquivo} mono />
                <Row label="Metodo" value={s.metodo} mono />
                <Row label="Entrada" value={s.entrada} mono />
                <Row label="Saida" value={s.saida} mono />
                <Row label="Chamado por" value={s.chamadoPor} />
                <Row label="Consome" value={s.consome} />
              </div>
            ))}
          </div>
        </Section>

        {/* PASSO 4+5 */}
        <Section id="PASSOS 4+5" title="Ocorrencias dos componentes da Biblioteca Oficial na cadeia">
          <div className="space-y-3">

            <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
              <div className="font-bold text-amber-300 mb-1 text-xs">OfficialLibraryManager (officialLibraryManager.js)</div>
              <Ev>officialLibraryCapability.js line 18: import OfficialLibraryManager — IMPORT</Ev>
              <Ev>officialLibraryCapability.js line 151: OfficialLibraryManager.isReady() — EXECUCAO</Ev>
              <Ev>officialLibraryCapability.js line 153: OfficialLibraryManager.getDocNames() — EXECUCAO</Ev>
              <Ev>officialLibraryCapability.js line 161: OfficialLibraryManager.getDoc(name) — EXECUCAO</Ev>
              <div className="text-xs text-zinc-500 mt-1">Conteudo: EMBEDDED_DOCS — 5 docs embutidos como strings JS nativas. NAO usa ViteDocumentDiscovery nem OfficialLibraryIndexer.</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
              <div className="font-bold text-amber-300 mb-1 text-xs">executeOfficialLibraryQuery (officialLibraryCapability.js)</div>
              <Ev>capabilityExecutor.js line 2: import {"{ executeOfficialLibraryQuery }"} from "./capabilities/officialLibraryCapability" — IMPORT</Ev>
              <Ev>capabilityExecutor.js line 165-167: if (capabilities.official_library) {"{ tasks.officialLibrary = executeOfficialLibraryQuery(message) }"} — EXECUCAO CONDICIONAL</Ev>
            </div>

            <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
              <div className="font-bold text-amber-300 mb-1 text-xs">buildReasoningContext (contextBuilder.js)</div>
              <Ev>memoryReasoningPlanner.js line 5: import {"{ buildReasoningContext }"} from "@/lib/reasoning/contextBuilder" — IMPORT</Ev>
              <Ev>memoryReasoningPlanner.js line 144: buildReasoningContext({"{..., capabilityResults}"}) — EXECUCAO</Ev>
              <Ev>contextBuilder.js line 75: if (capabilityResults?.officialLibrary) — CONSOME resultado</Ev>
              <Ev>contextBuilder.js line 83-85: selectedDocs.map inject no prompt — ENTREGA AO LLM</Ev>
            </div>

            <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
              <div className="font-bold text-amber-300 mb-1 text-xs">memoryReasoningPlanner (entry point da cadeia)</div>
              <Ev>ConversationPipeline.ts: const {"{ runReasoningPlan }"} = await import('@/lib/reasoning/memoryReasoningPlanner') — IMPORT DINAMICO</Ev>
              <Ev>ConversationPipeline.ts: const plan = await runReasoningPlan({"{...}"}) — EXECUCAO</Ev>
            </div>

            <div className="bg-zinc-900 border border-red-900/30 rounded p-3">
              <div className="font-bold text-red-400 mb-1 text-xs">
                OfficialLibraryProvider / OfficialLibraryIndexer / OfficialLibraryCatalog / OfficialLibraryBootstrap / MemoryProviderRegistry / UnifiedMemoryEngine / MemoryFusionEngine / MemoryEvidence / MemoryQuery / OfficialChunk / DocumentLoader / GraphBuilder / OfficialLibraryParser
              </div>
              <div className="text-xs text-red-400 font-bold">NAO EXISTE EVIDENCIA</div>
              <div className="text-xs text-zinc-500 mt-1">Nenhum desses componentes aparece em qualquer ponto da cadeia ConversationPipeline.ts → InvokeLLM. Sao componentes do subsistema UCME/EF-7.x — completamente separado da path conversacional ativa.</div>
            </div>
          </div>
        </Section>

        {/* PASSO 6 */}
        <Section id="PASSO 6" title="Respostas objetivas — SIM / NAO">
          <div className="space-y-2">
            {PERGUNTAS.map((item, i) => (
              <div key={i} className={`border rounded p-3 ${item.resposta ? "border-emerald-800/40 bg-emerald-950/20" : "border-zinc-800 bg-zinc-900/30"}`}>
                <div className="flex items-center gap-2 mb-1">
                  {item.resposta ? <SIM_BADGE /> : <NAO_BADGE />}
                  <div className="text-white text-xs font-semibold">{item.pergunta}</div>
                </div>
                <div className="text-xs text-zinc-500">{item.ev}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* PASSO 7 */}
        <Section id="PASSO 7" title="Fluxo completo quando integracao existe (path ativa)">
          <div className="text-xs text-zinc-400 mb-2">Condicao: usuario menciona keyword da Biblioteca (ex: segundo o MAS, service layer, biblioteca oficial)</div>
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4 text-xs space-y-0.5">
            <div className="text-white font-bold">Usuario</div>
            <div className="text-zinc-600 pl-4">↓ mensagem com keyword da Biblioteca Oficial</div>
            <div className="text-violet-300">ConversationPipeline.ts — _runPipeline()</div>
            <div className="text-zinc-600 pl-4">↓ import dinamico de runReasoningPlan</div>
            <div className="text-violet-300">memoryReasoningPlanner.js — runReasoningPlan()</div>
            <div className="text-zinc-600 pl-4">↓ runMemoryPipeline() — banco de dados</div>
            <div className="text-zinc-600 pl-4">↓ detectSkills(), detectGoal(), SpecialistRouter</div>
            <div className="text-zinc-600 pl-4">↓ orchestrateCapabilities()</div>
            <div className="text-blue-300">capabilityOrchestrator.js</div>
            <div className="text-zinc-600 pl-4">↓ detectCapabilities() → official_library = true [keyword match]</div>
            <div className="text-zinc-600 pl-4">↓ executeCapabilities()</div>
            <div className="text-blue-300">capabilityExecutor.js</div>
            <div className="text-zinc-600 pl-4">↓ executeOfficialLibraryQuery(message)</div>
            <div className="text-emerald-300">officialLibraryCapability.js → OfficialLibraryManager.getDoc(name)</div>
            <div className="text-emerald-300">officialLibraryManager.js → EMBEDDED_DOCS[nome-do-doc]</div>
            <div className="text-zinc-600 pl-4">↓ retorna selectedDocs: [{"{name, content}"}]</div>
            <div className="text-blue-300">contextBuilder.js — buildReasoningContext()</div>
            <div className="text-zinc-600 pl-4">↓ injeta BIBLIOTECA OFICIAL + selectedDocs[].content no prompt</div>
            <div className="text-yellow-300 font-bold">base44.integrations.Core.InvokeLLM({"{ prompt: '...conteudo da Biblioteca...' }"})</div>
            <div className="text-zinc-600 pl-4">↓ rawResponse</div>
            <div className="text-violet-300">synthesizeResponse() → response: string</div>
            <div className="text-violet-300">ConversationPipeline.ts → ResponseArbiter → stream</div>
            <div className="text-zinc-600 pl-4">↓</div>
            <div className="text-white font-bold">Usuario recebe resposta fundamentada na Biblioteca Oficial</div>
          </div>
        </Section>

        {/* PASSO 8 */}
        <Section id="PASSO 8" title="Onde o subsistema UCME/EF-7.x para">
          <div className="bg-zinc-900 border border-red-900/30 rounded p-4 text-xs space-y-1">
            <div className="text-zinc-400 mb-2">Subsistema NAO conectado a pipeline conversacional ativa:</div>
            <div className="text-blue-300">OfficialLibraryProvider.ts</div>
            <div className="text-zinc-600 pl-4">↓ auto-registra via MemoryProviderRegistry.register()</div>
            <div className="text-blue-300">MemoryProviderRegistry.ts</div>
            <div className="text-zinc-600 pl-4">↓ getAll() seria chamado por UnifiedMemoryEngine.query()</div>
            <div className="text-blue-300">UnifiedMemoryEngine.ts</div>
            <div className="text-red-400 font-bold pl-4">↓ PARA AQUI — UnifiedMemoryEngine.query() NAO e chamado por nenhum componente da cadeia conversacional</div>
            <div className="text-zinc-500 mt-2 space-y-0.5">
              <div>✗ ConversationPipeline.ts NAO importa UnifiedMemoryEngine</div>
              <div>✗ memoryReasoningPlanner.js NAO importa UnifiedMemoryEngine</div>
              <div>✗ capabilityOrchestrator.js NAO importa UnifiedMemoryEngine</div>
              <div>✗ nenhum arquivo da cadeia importa MemoryProviderRegistry</div>
            </div>
          </div>
        </Section>

        {/* PASSO 9 */}
        <Section id="PASSO 9" title="Mapa de integracao">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left px-3 py-2 text-zinc-500 font-normal">Componente</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-normal">Responsabilidade</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-normal">Produz</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-normal">Consome</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-normal">Pipeline?</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-normal">Evidencia</th>
                </tr>
              </thead>
              <tbody>
                {MAPA.map((row, i) => (
                  <tr key={i} className={`border-b border-zinc-800/50 ${row.connected ? "bg-emerald-950/5" : "bg-red-950/5"}`}>
                    <td className="px-3 py-2 text-white font-semibold break-all">{row.name}</td>
                    <td className="px-3 py-2 text-zinc-400">{row.resp}</td>
                    <td className="px-3 py-2 text-zinc-400 break-all">{row.prod}</td>
                    <td className="px-3 py-2 text-zinc-400">{row.cons}</td>
                    <td className="px-3 py-2">
                      {row.connected
                        ? <span className="px-2 py-0.5 rounded border text-xs font-bold bg-emerald-950/60 text-emerald-300 border-emerald-700">SIM</span>
                        : <span className="px-2 py-0.5 rounded border text-xs font-bold bg-red-950/60 text-red-400 border-red-800">NAO</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-zinc-500 break-words">{row.ev}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* PASSO 10 — CERTIFICACAO FINAL */}
        <div className="border-2 border-amber-700 rounded-xl p-6 bg-amber-950/20 mb-4">
          <div className="text-xs text-amber-400 font-bold mb-2">PASSO 10 — CERTIFICACAO FINAL</div>
          <div className="text-3xl font-black text-white mb-3">B — PARCIALMENTE INTEGRADA</div>
          <div className="text-sm text-amber-200 mb-4 leading-relaxed">
            A Biblioteca Oficial esta integrada a ConversationPipeline v2, porem por dois subsistemas paralelos com mecanismos completamente diferentes.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-emerald-950/40 border border-emerald-700 rounded-lg p-4">
              <div className="text-emerald-300 font-bold text-xs mb-2">SUBSISTEMA ATIVO (comprovado)</div>
              <div className="text-xs text-zinc-300 space-y-1">
                <div><span className="text-zinc-500">Path:</span> officialLibraryManager.js → officialLibraryCapability.js → capabilityExecutor.js → capabilityOrchestrator.js → contextBuilder.js → InvokeLLM</div>
                <div><span className="text-zinc-500">Ativacao:</span> keyword matching em OFFICIAL_LIBRARY_KEYWORDS</div>
                <div><span className="text-zinc-500">Conteudo:</span> 5 documentos embutidos como JS strings (EMBEDDED_DOCS)</div>
                <div><span className="text-zinc-500">Entrega ao LLM:</span> selectedDocs[].content injetado diretamente no prompt</div>
                <div className="text-emerald-400 font-semibold mt-1">CONFIRMADO por cadeia de evidencias direta</div>
              </div>
            </div>
            <div className="bg-red-950/30 border border-red-800 rounded-lg p-4">
              <div className="text-red-400 font-bold text-xs mb-2">SUBSISTEMA UCME/EF-7.x (nao conectado)</div>
              <div className="text-xs text-zinc-300 space-y-1">
                <div><span className="text-zinc-500">Path:</span> OfficialLibraryProvider → MemoryProviderRegistry → UnifiedMemoryEngine → MemoryFusionEngine → ConversationPipeline</div>
                <div><span className="text-zinc-500">Ativacao:</span> auto-registro no MemoryProviderRegistry</div>
                <div><span className="text-zinc-500">Conteudo:</span> OfficialChunk[] via OfficialLibraryIndexer (ViteDocumentDiscovery, Parser, Chunker)</div>
                <div><span className="text-zinc-500">Entrega ao LLM:</span> MemoryEvidence[] via MemoryFusionEngine</div>
                <div className="text-red-400 font-semibold mt-1">NAO EXISTE EVIDENCIA de consumo pela pipeline conversacional</div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded p-3 text-xs text-zinc-400 space-y-1">
            <div className="text-white font-bold mb-1">Base factual da classificacao B:</div>
            <Ev>A Biblioteca Oficial CHEGA ao LLM via officialLibraryManager.js → capabilityExecutor.js → contextBuilder.js (quando keyword ativada)</Ev>
            <Ev>O subsistema UCME (OfficialLibraryProvider, UnifiedMemoryEngine, MemoryFusionEngine) esta implementado mas NAO e consumido pela pipeline conversacional — nenhuma evidencia de import pela cadeia ativa</Ev>
            <Ev>officialLibraryManager.js usa EMBEDDED_DOCS (5 docs estaticos em JS); OfficialLibraryIndexer/EF-7.x usa ViteDocumentDiscovery + Parser + Chunker — dois mecanismos distintos de acesso ao mesmo conteudo</Ev>
            <Ev>Classificacao B (Parcialmente integrada): integracao existe e funciona via mecanismo legado; integracao via UCME/EF-7.x nao esta conectada</Ev>
          </div>
        </div>

      </div>
    </div>
  );
}