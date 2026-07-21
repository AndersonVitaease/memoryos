/**
 * SprintEF404Page.jsx
 * Sprint EF-40.4 — Certificacao dos Consumidores do UCME
 * Evidence-only. Zero inferencia. Somente codigo-fonte.
 */

import React, { useState } from "react";

const Section = ({ id, title, children }) => {
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
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-3 bg-zinc-950/60 space-y-2 text-xs">{children}</div>}
    </div>
  );
};

const Row = ({ label, value, mono }) => (
  <div className="flex gap-3 text-xs border-b border-zinc-800/40 py-1.5 last:border-0">
    <span className="text-zinc-500 w-36 flex-shrink-0">{label}</span>
    <span className={mono ? "text-violet-300 font-mono break-all" : "text-zinc-300 break-words"}>{value}</span>
  </div>
);

const SIM = () => <span className="px-2 py-0.5 rounded border text-xs font-bold bg-emerald-950/60 text-emerald-300 border-emerald-700">SIM</span>;
const NAO = () => <span className="px-2 py-0.5 rounded border text-xs font-bold bg-red-950/60 text-red-400 border-red-800">NAO</span>;
const Ev = ({ children }) => (
  <div className="flex items-start gap-2 text-xs mt-1">
    <span className="text-violet-500 flex-shrink-0">✓</span>
    <span className="text-zinc-400 break-words font-mono">{children}</span>
  </div>
);
const NoEv = ({ children }) => (
  <div className="flex items-start gap-2 text-xs mt-1">
    <span className="text-red-600 flex-shrink-0">✗</span>
    <span className="text-zinc-500 break-words">{children}</span>
  </div>
);

// ── PASSO 1+2: todas as referencias a UnifiedMemoryEngine ─────────────────────

const REFS_UME = [
  {
    arquivo: "src/lib/ucme/UnifiedMemoryEngine.ts",
    tipo: "DEFINICAO",
    classe: "—",
    metodo: "export const UnifiedMemoryEngine = { query, buildContext, remember, healthCheck, providers }",
    linha: "77",
    detalhe: "Definicao do objeto exportado. Nao e consumidor.",
  },
  {
    arquivo: "src/lib/ucme/MemoryContextBuilder.ts",
    tipo: "IMPORT + INSTANCE CALL",
    classe: "MemoryContextBuilder",
    metodo: "build() → UnifiedMemoryEngine.buildContext(query) [linha 38]",
    linha: "12 (import), 38 (call)",
    detalhe: "CONSUMIDOR CONFIRMADO. MemoryContextBuilder chama UnifiedMemoryEngine.buildContext().",
  },
  {
    arquivo: "src/lib/ucme/UCMETests.ts",
    tipo: "IMPORT + STATIC CALL",
    classe: "suite3, suite4, suite5",
    metodo: "UnifiedMemoryEngine.query() [linhas 145, 149, 167, 205]",
    linha: "18 (import), 145/149/167/205 (calls)",
    detalhe: "CONSUMIDOR: arquivo de testes. Execucao: runUCMETests() chamado explicitamente — nao e chamado pela pipeline conversacional.",
  },
];

// ── PASSO 4: metodos publicos chamados ────────────────────────────────────────

const METHODS_CALLED = [
  {
    metodo: "UnifiedMemoryEngine.query()",
    chamado: true,
    por: "MemoryContextBuilder.build() (linha 38) e UCMETests.ts (linhas 145, 149, 167, 205)",
    evidencia: "MemoryContextBuilder.ts linha 38: return UnifiedMemoryEngine.buildContext(query) — que internamente chama this.query()",
  },
  {
    metodo: "UnifiedMemoryEngine.buildContext()",
    chamado: true,
    por: "MemoryContextBuilder.ts linha 38",
    evidencia: "MemoryContextBuilder.ts linha 38: return UnifiedMemoryEngine.buildContext(query)",
  },
  {
    metodo: "UnifiedMemoryEngine.remember()",
    chamado: false,
    por: "—",
    evidencia: "NAO EXISTE EVIDENCIA de chamada a UnifiedMemoryEngine.remember() fora do proprio arquivo",
  },
  {
    metodo: "UnifiedMemoryEngine.healthCheck()",
    chamado: false,
    por: "—",
    evidencia: "NAO EXISTE EVIDENCIA de chamada a UnifiedMemoryEngine.healthCheck() fora de testes",
  },
  {
    metodo: "UnifiedMemoryEngine.providers()",
    chamado: false,
    por: "—",
    evidencia: "NAO EXISTE EVIDENCIA de chamada a UnifiedMemoryEngine.providers() fora do proprio arquivo",
  },
];

// ── PASSO 5: MemoryProviderRegistry, MemoryFusionEngine, OfficialLibraryProvider, OfficialLibraryIndexer ─────

const PASSO5 = [
  {
    componente: "MemoryProviderRegistry",
    refs: [
      { arquivo: "src/lib/ucme/UnifiedMemoryEngine.ts", tipo: "IMPORT + STATIC CALL", metodo: "MemoryProviderRegistry.getAll() [linhas 88, 91, 150, 165]", linha: "26" },
      { arquivo: "src/lib/ucme/UCMETests.ts", tipo: "IMPORT + STATIC CALL", metodo: "MemoryProviderRegistry.listIds(), .getAll(), .get(), .has(), .register(), .unregister()", linha: "16" },
      { arquivo: "src/lib/ucme/providers/ConversationMemoryProvider.ts", tipo: "IMPORT + STATIC CALL", metodo: "MemoryProviderRegistry.register(ConversationMemoryProvider) [linha 99]", linha: "10" },
      { arquivo: "src/lib/ucme/providers/GoogleDriveMemoryProvider.ts", tipo: "IMPORT + STATIC CALL", metodo: "MemoryProviderRegistry.register(GoogleDriveMemoryProvider) [linha 154]", linha: "14" },
      { arquivo: "src/lib/ucme/providers/GmailMemoryProvider.ts", tipo: "IMPORT + STATIC CALL", metodo: "MemoryProviderRegistry.register(GmailMemoryProvider) [linha 170]", linha: "11" },
      { arquivo: "src/lib/ucme/providers/KnowledgeGraphMemoryProvider.ts", tipo: "IMPORT + STATIC CALL", metodo: "MemoryProviderRegistry.register(KnowledgeGraphMemoryProvider) [linha 104]", linha: "9" },
      { arquivo: "src/lib/official-library/OfficialLibraryProvider.ts", tipo: "IMPORT + STATIC CALL", metodo: "MemoryProviderRegistry.register(OfficialLibraryProvider) [linha 156]", linha: "14" },
    ],
    consumidorConversacional: false,
    nota: "MemoryProviderRegistry e consumido por UnifiedMemoryEngine e pelos proprios Providers (auto-registro). NAO e importado por ConversationPipeline, memoryReasoningPlanner, capabilityExecutor, capabilityOrchestrator.",
  },
  {
    componente: "MemoryFusionEngine",
    refs: [
      { arquivo: "src/lib/ucme/UnifiedMemoryEngine.ts", tipo: "IMPORT + STATIC CALL", metodo: "MemoryFusionEngine.fuse(), MemoryFusionEngine.buildContext()", linha: "27 (import), 94/98/114/115 (calls)" },
      { arquivo: "src/lib/ucme/UCMETests.ts", tipo: "IMPORT + STATIC CALL", metodo: "MemoryFusionEngine.fuse(), MemoryFusionEngine.buildContext()", linha: "17 (import), 106/112/113/114/115/116 (calls)" },
    ],
    consumidorConversacional: false,
    nota: "MemoryFusionEngine e consumido apenas por UnifiedMemoryEngine e UCMETests. NAO e importado por ConversationPipeline nem por nenhum componente da cadeia conversacional ativa.",
  },
  {
    componente: "OfficialLibraryProvider",
    refs: [
      { arquivo: "src/lib/official-library/OfficialLibraryProvider.ts", tipo: "DEFINICAO + AUTO-REGISTRO", metodo: "MemoryProviderRegistry.register(OfficialLibraryProvider) [linha 156 — execucao no nivel do modulo]", linha: "156" },
    ],
    consumidorConversacional: false,
    nota: "OfficialLibraryProvider auto-registra-se no MemoryProviderRegistry ao ser importado. Nao existe evidencia de import do OfficialLibraryProvider por ConversationPipeline, memoryReasoningPlanner, capabilityExecutor, ou qualquer componente da cadeia conversacional ativa.",
  },
  {
    componente: "OfficialLibraryIndexer",
    refs: [
      { arquivo: "src/lib/official-library/OfficialLibraryProvider.ts", tipo: "IMPORT + STATIC CALL", metodo: "OfficialLibraryIndexer.setSearchStrategy(), OfficialLibraryIndexer.initialize(), OfficialLibraryIndexer.search(), OfficialLibraryIndexer.stats()", linha: "15 (import), 30/38/40/120/127 (calls)" },
      { arquivo: "src/lib/official-library/OfficialLibraryBootstrap.ts", tipo: "IMPORT + STATIC CALL", metodo: "OfficialLibraryIndexer._reset(), OfficialLibraryIndexer._injectFromBootstrap()", linha: "23 (import), 89/103 (calls)" },
    ],
    consumidorConversacional: false,
    nota: "OfficialLibraryIndexer e consumido por OfficialLibraryProvider e OfficialLibraryBootstrap. NAO e importado por ConversationPipeline nem por nenhum componente da cadeia conversacional ativa.",
  },
];

// ── PASSO 6: existe consumidor? ───────────────────────────────────────────────

const PASSO6 = [
  {
    componente: "UnifiedMemoryEngine",
    consumidor: true,
    consumidorId: "MemoryContextBuilder.ts",
    conversacional: false,
    evidencia: "MemoryContextBuilder.ts linha 12: import { UnifiedMemoryEngine } from './UnifiedMemoryEngine'. MemoryContextBuilder.ts linha 38: UnifiedMemoryEngine.buildContext(query). MemoryContextBuilder NAO e importado por ConversationPipeline.",
  },
  {
    componente: "MemoryFusionEngine",
    consumidor: true,
    consumidorId: "UnifiedMemoryEngine.ts",
    conversacional: false,
    evidencia: "UnifiedMemoryEngine.ts linha 27: import { MemoryFusionEngine } from './MemoryFusionEngine'. UnifiedMemoryEngine.ts linhas 94/98/114/115: MemoryFusionEngine.fuse(), MemoryFusionEngine.buildContext(). Cadeia: MemoryFusionEngine <- UnifiedMemoryEngine <- MemoryContextBuilder. MemoryContextBuilder NAO e importado por ConversationPipeline.",
  },
  {
    componente: "MemoryProviderRegistry",
    consumidor: true,
    consumidorId: "UnifiedMemoryEngine.ts + providers/* (auto-registro)",
    conversacional: false,
    evidencia: "UnifiedMemoryEngine.ts linha 26: import { MemoryProviderRegistry }. Providers registram-se via MemoryProviderRegistry.register() ao ser importados. NAO e importado por ConversationPipeline.",
  },
  {
    componente: "OfficialLibraryProvider",
    consumidor: true,
    consumidorId: "MemoryProviderRegistry (auto-registro ao ser importado)",
    conversacional: false,
    evidencia: "OfficialLibraryProvider.ts linha 156: MemoryProviderRegistry.register(OfficialLibraryProvider) — execucao no nivel do modulo (module-level side effect). Para ser executado, o modulo precisa ser importado. NAO EXISTE EVIDENCIA de import por ConversationPipeline.",
  },
  {
    componente: "OfficialLibraryIndexer",
    consumidor: true,
    consumidorId: "OfficialLibraryProvider.ts e OfficialLibraryBootstrap.ts",
    conversacional: false,
    evidencia: "OfficialLibraryProvider.ts linha 15: import { OfficialLibraryIndexer }. OfficialLibraryBootstrap.ts linha 23: import { OfficialLibraryIndexer }. Cadeia: OfficialLibraryIndexer <- OfficialLibraryProvider <- MemoryProviderRegistry <- UnifiedMemoryEngine <- MemoryContextBuilder. MemoryContextBuilder NAO e importado por ConversationPipeline.",
  },
];

// ── PASSO 7: arvore completa do consumidor existente ─────────────────────────

// (MemoryContextBuilder -> UnifiedMemoryEngine)
// Quem chama MemoryContextBuilder?

// ── PASSO 9: importacoes mortas ───────────────────────────────────────────────

const MORTAS = [
  {
    arquivo: "src/lib/ucme/MemoryContextBuilder.ts",
    importa: "UnifiedMemoryEngine",
    usado: true,
    detalhe: "Nao e importacao morta — MemoryContextBuilder USA UnifiedMemoryEngine. MAS o proprio MemoryContextBuilder NAO e importado por ConversationPipeline.",
  },
  {
    arquivo: "src/lib/official-library/OfficialLibraryProvider.ts",
    importa: "MemoryProviderRegistry",
    usado: true,
    detalhe: "Nao e morta internamente — usa registro. MAS o arquivo inteiro NAO e importado por ConversationPipeline.",
  },
  {
    arquivo: "src/lib/ucme/UCMETests.ts",
    importa: "UnifiedMemoryEngine, MemoryProviderRegistry, MemoryFusionEngine",
    usado: true,
    detalhe: "Usado dentro do arquivo de testes. runUCMETests() existe mas NAO EXISTE EVIDENCIA de chamada por ConversationPipeline.",
  },
];

// ── PASSO 10: MATRIZ ──────────────────────────────────────────────────────────

const MATRIZ = [
  { comp: "UnifiedMemoryEngine",    impl: true, consumidor: true, quem: "MemoryContextBuilder.ts", conv: false, ev: "MemoryContextBuilder.ts linha 38: UnifiedMemoryEngine.buildContext(). MemoryContextBuilder NAO e chamado por ConversationPipeline." },
  { comp: "MemoryFusionEngine",     impl: true, consumidor: true, quem: "UnifiedMemoryEngine.ts", conv: false, ev: "UnifiedMemoryEngine.ts linhas 94/98/114/115: MemoryFusionEngine.fuse() / .buildContext(). Cadeia termina em MemoryContextBuilder — nao conectada a ConversationPipeline." },
  { comp: "MemoryProviderRegistry", impl: true, consumidor: true, quem: "UnifiedMemoryEngine.ts + providers (auto-registro)", conv: false, ev: "UnifiedMemoryEngine.ts linha 88: MemoryProviderRegistry.getAll(). NAO importado por ConversationPipeline." },
  { comp: "OfficialLibraryProvider",impl: true, consumidor: true, quem: "MemoryProviderRegistry (module-level side effect)", conv: false, ev: "OfficialLibraryProvider.ts linha 156: MemoryProviderRegistry.register(). Executado quando modulo e importado. NAO EXISTE EVIDENCIA de import por ConversationPipeline." },
  { comp: "OfficialLibraryIndexer", impl: true, consumidor: true, quem: "OfficialLibraryProvider.ts + OfficialLibraryBootstrap.ts", conv: false, ev: "OfficialLibraryProvider.ts linha 15: import OfficialLibraryIndexer. Cadeia nao conectada a ConversationPipeline." },
  { comp: "OfficialLibraryBootstrap",impl: true, consumidor: true, quem: "OfficialLibraryIndexer.ts (via import dinamico)", conv: false, ev: "OfficialLibraryIndexer.ts linha 51: await import('./OfficialLibraryBootstrap'). Cadeia nao conectada a ConversationPipeline." },
  { comp: "GraphBuilder",            impl: true, consumidor: true, quem: "OfficialLibraryBootstrap.ts", conv: false, ev: "OfficialLibraryBootstrap.ts linha 24: import { GraphBuilder }. Linha 106: GraphBuilder.build(allChunks)." },
  { comp: "DocumentLoader",          impl: true, consumidor: true, quem: "OfficialLibraryBootstrap.ts (via runtime.loader())", conv: false, ev: "OfficialLibraryBootstrap.ts linha 76: loader.loadAll(sources). loader e obtido de OfficialLibraryRuntimeProvider. NAO e DocumentLoader diretamente importado — e obtido via runtime abstraction." },
  { comp: "OfficialLibraryChunker",  impl: true, consumidor: true, quem: "OfficialLibraryBootstrap.ts", conv: false, ev: "OfficialLibraryBootstrap.ts linha 21: import { OfficialLibraryChunker }. Linha 86: OfficialLibraryChunker.chunkAll(parsed)." },
  { comp: "OfficialLibraryParser",   impl: true, consumidor: true, quem: "OfficialLibraryBootstrap.ts", conv: false, ev: "OfficialLibraryBootstrap.ts linha 20: import { OfficialLibraryParser }. Linha 82: OfficialLibraryParser.parse(doc.raw, doc.path, doc.name)." },
];

// ── PASSO 11: perguntas diretas ───────────────────────────────────────────────

const PASSO11 = [
  {
    origem: "ConversationPipeline.ts",
    alvo: "UnifiedMemoryEngine",
    resposta: false,
    evidencia: "ConversationPipeline.ts foi lido integralmente (932 linhas). NAO EXISTE nenhum import de 'UnifiedMemoryEngine' nem de 'MemoryContextBuilder'. Os imports sao: initializePlatform, conversationStore, conversationStreaming, conversationRecovery, conversationMetrics, persistMessage, buildConversationContext, CXPTypes, executionOutcomeAdapterFactory, responseArbiter, ResponseCandidate, ArbitrationContext, ExecutionDomain — e imports dinamicos: memoryReasoningPlanner, primaryRouter, responseTracer, conversationGoalBridge, unifiedContextBuilder, knowledgeFusionEngine, knowledgeNormalizer, knowledgeGraphBridge, conversationPlanningEngine, getRealRuntimeEngine, getRealConnectorRegistry, synthesizeConnectorResult, driveAuditStore, runtimeTraceStore, staticAnalysisEngine, processConversationBatch, sessionManager. UnifiedMemoryEngine NAO aparece em nenhum desses.",
  },
  {
    origem: "memoryReasoningPlanner.js",
    alvo: "UnifiedMemoryEngine",
    resposta: false,
    evidencia: "memoryReasoningPlanner.js imports: buildReasoningContext, runMemoryPipeline, detectSkills, detectGoal, SpecialistRouter, orchestrateCapabilities, base44 — e InvokeLLM. NAO EXISTE import de UnifiedMemoryEngine nem de MemoryContextBuilder.",
  },
  {
    origem: "capabilityExecutor.js",
    alvo: "UnifiedMemoryEngine",
    resposta: false,
    evidencia: "capabilityExecutor.js imports: executeOfficialLibraryQuery. NAO EXISTE import de UnifiedMemoryEngine nem de MemoryContextBuilder.",
  },
  {
    origem: "officialLibraryCapability.js",
    alvo: "UnifiedMemoryEngine",
    resposta: false,
    evidencia: "officialLibraryCapability.js imports: OfficialLibraryManager (de officialLibraryManager.js). NAO EXISTE import de UnifiedMemoryEngine nem de MemoryContextBuilder.",
  },
];

// ── PASSO 12: chamadas ao UCME fora da ConversationPipeline ──────────────────

const PASSO12_CHAMADAS = [
  {
    arquivo: "src/lib/ucme/MemoryContextBuilder.ts",
    classe: "MemoryContextBuilder",
    metodo: "build(question, opts) → UnifiedMemoryEngine.buildContext(query)",
    objetivo: "Construir MemoryContext completo para o LLM a partir de uma pergunta",
    quando: "Quando runUCMETests() for chamado (Suite 4), ou se algum consumidor externo importar MemoryContextBuilder e chamar build().",
    consumidorExterno: "NAO EXISTE EVIDENCIA de import de MemoryContextBuilder por ConversationPipeline ou por qualquer componente da cadeia conversacional ativa.",
  },
  {
    arquivo: "src/lib/ucme/UCMETests.ts",
    classe: "suite3, suite4, suite5",
    metodo: "UnifiedMemoryEngine.query() — linhas 145, 149, 167, 205",
    objetivo: "Validacao funcional do UCME (suite de testes)",
    quando: "Quando runUCMETests() for chamado explicitamente. NAO e chamado automaticamente pela pipeline conversacional.",
    consumidorExterno: "NAO EXISTE EVIDENCIA de chamada automatica de runUCMETests() pela ConversationPipeline.",
  },
];

export default function SprintEF404Page() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 text-sm font-mono">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700 px-2 py-0.5 rounded">SPRINT EF-40.4</span>
            <span className="text-xs text-zinc-500">2026-07-21 · Evidence-only · Somente codigo-fonte</span>
          </div>
          <h1 className="text-xl font-bold text-white">Certificacao dos Consumidores do UCME</h1>
          <p className="text-zinc-500 text-xs mt-1">Objetivo: QUEM CHAMA O UCME. Nao quem implementa. Nao quem registra. Somente quem chama.</p>
        </div>

        {/* PASSO 1+2 */}
        <Section id="PASSOS 1+2" title="Todas as referencias a UnifiedMemoryEngine">
          <div className="space-y-3">
            {REFS_UME.map((r, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <Row label="Arquivo" value={r.arquivo} mono />
                <Row label="Tipo" value={r.tipo} />
                <Row label="Classe" value={r.classe} />
                <Row label="Metodo/Linha" value={r.metodo} mono />
                <Row label="Linha" value={r.linha} />
                <div className="text-xs text-zinc-500 mt-1">{r.detalhe}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* PASSO 3: arvore de chamadas */}
        <Section id="PASSO 3" title="Arvore de chamadas — reconstrucao completa">
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4 text-xs space-y-0.5">
            <div className="text-zinc-400 mb-3 font-bold">Arvore 1 — UCME via MemoryContextBuilder (componentes do UCME)</div>
            <div className="text-blue-300">MemoryContextBuilder.ts — build(question, opts)</div>
            <div className="text-zinc-600 pl-4">↓ linha 38: UnifiedMemoryEngine.buildContext(query)</div>
            <div className="text-blue-300">UnifiedMemoryEngine.ts — buildContext(query)</div>
            <div className="text-zinc-600 pl-4">↓ linha 132: this.query(query)</div>
            <div className="text-blue-300">UnifiedMemoryEngine.ts — query(query)</div>
            <div className="text-zinc-600 pl-4">↓ linha 88: MemoryProviderRegistry.getAll()</div>
            <div className="text-blue-300">MemoryProviderRegistry.ts — getAll()</div>
            <div className="text-zinc-600 pl-4">↓ retorna: MemoryProvider[]</div>
            <div className="text-blue-300">UnifiedMemoryEngine.ts — queryProvider() para cada provider</div>
            <div className="text-zinc-600 pl-4">↓ provider.search(query)</div>
            <div className="text-zinc-600 pl-4">  ├ ConversationMemoryProvider.search()</div>
            <div className="text-zinc-600 pl-4">  ├ GoogleDriveMemoryProvider.search()</div>
            <div className="text-zinc-600 pl-4">  ├ GmailMemoryProvider.search()</div>
            <div className="text-zinc-600 pl-4">  ├ KnowledgeGraphMemoryProvider.search()</div>
            <div className="text-zinc-600 pl-4">  └ OfficialLibraryProvider.search() → OfficialLibraryIndexer.search()</div>
            <div className="text-zinc-600 pl-4">↓ linha 114: MemoryFusionEngine.fuse(allEvidence)</div>
            <div className="text-blue-300">MemoryFusionEngine.ts — fuse()</div>
            <div className="text-zinc-600 pl-4">↓ retorna: MemoryEvidence[] (merged, ranked)</div>
            <div className="text-blue-300">UnifiedMemoryEngine.ts — retorna MemoryResult</div>
            <div className="text-zinc-600 pl-4">↓ retorna MemoryContext</div>
            <div className="text-blue-300">MemoryContextBuilder.ts — retorna MemoryContext</div>
            <div className="text-red-400 font-bold pl-4">↓ PARA AQUI — MemoryContextBuilder NAO e importado por ConversationPipeline</div>

            <div className="text-zinc-400 mt-4 mb-2 font-bold">Arvore 2 — UCME via UCMETests.ts (arquivo de testes)</div>
            <div className="text-blue-300">UCMETests.ts — runUCMETests()</div>
            <div className="text-zinc-600 pl-4">↓ suite3() linha 145: UnifiedMemoryEngine.query(query)</div>
            <div className="text-blue-300">UnifiedMemoryEngine.ts — query()</div>
            <div className="text-zinc-600 pl-4">↓ [mesma cadeia acima]</div>
            <div className="text-red-400 font-bold pl-4">↓ PARA AQUI — NAO EXISTE EVIDENCIA de chamada automatica de runUCMETests() por ConversationPipeline</div>

            <div className="text-zinc-400 mt-4 mb-2 font-bold">Arvore que NAO existe (para verificacao)</div>
            <div className="text-zinc-600">ConversationPipeline.ts → ??? → UnifiedMemoryEngine</div>
            <div className="text-red-400 font-bold">NAO EXISTE EVIDENCIA DESSA CADEIA.</div>
          </div>
        </Section>

        {/* PASSO 4 */}
        <Section id="PASSO 4" title="Metodos publicos de UnifiedMemoryEngine — chamados?">
          <div className="space-y-2">
            {METHODS_CALLED.map((m, i) => (
              <div key={i} className={`border rounded p-3 ${m.chamado ? "border-emerald-800/40 bg-emerald-950/10" : "border-zinc-800 bg-zinc-900/30"}`}>
                <div className="flex items-center gap-2 mb-1">
                  {m.chamado ? <SIM /> : <NAO />}
                  <span className="text-white font-mono font-bold text-xs">{m.metodo}</span>
                </div>
                <div className="text-zinc-400 text-xs">{m.chamado ? `Por: ${m.por}` : ""}</div>
                <div className="text-zinc-500 text-xs mt-0.5">{m.evidencia}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* PASSO 5 */}
        <Section id="PASSO 5" title="MemoryProviderRegistry, MemoryFusionEngine, OfficialLibraryProvider, OfficialLibraryIndexer">
          <div className="space-y-4">
            {PASSO5.map((item, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="font-bold text-amber-300 mb-2 text-xs">{item.componente}</div>
                <div className="space-y-2 mb-2">
                  {item.refs.map((r, j) => (
                    <div key={j} className="bg-zinc-800/40 rounded p-2">
                      <Row label="Arquivo" value={r.arquivo} mono />
                      <Row label="Tipo" value={r.tipo} />
                      <Row label="Metodo" value={r.metodo} mono />
                      <Row label="Linha" value={r.linha} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-zinc-500 text-xs">Consumidor conversacional:</span>
                  {item.consumidorConversacional ? <SIM /> : <NAO />}
                </div>
                <div className="text-zinc-500 text-xs mt-1">{item.nota}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* PASSO 6 */}
        <Section id="PASSO 6" title="Existe consumidor? — SIM / NAO por componente">
          <div className="space-y-2">
            {PASSO6.map((item, i) => (
              <div key={i} className={`border rounded p-3 ${item.consumidor ? "border-zinc-700 bg-zinc-900/30" : "border-red-900/30 bg-red-950/10"}`}>
                <div className="flex items-center gap-3 mb-1">
                  <SIM />
                  <span className="text-white font-bold text-xs">{item.componente}</span>
                  <span className="text-zinc-500 text-xs">— mas conversacional:</span>
                  <NAO />
                </div>
                <div className="text-xs text-zinc-400">Consumidor: {item.consumidorId}</div>
                <div className="text-xs text-zinc-500 mt-0.5 break-words">{item.evidencia}</div>
              </div>
            ))}
          </div>
          <div className="bg-red-950/20 border border-red-800 rounded p-3 mt-3">
            <div className="text-red-400 font-bold text-xs mb-1">CONCLUSAO DO PASSO 6</div>
            <div className="text-xs text-zinc-400">Todos os componentes do UCME possuem consumidores tecnicos. POREM nenhum desses consumidores e chamado pela pipeline conversacional ativa (ConversationPipeline → memoryReasoningPlanner → InvokeLLM).</div>
          </div>
        </Section>

        {/* PASSO 7: arvore do consumidor existente */}
        <Section id="PASSO 7" title="Arvore completa do consumidor existente">
          <div className="text-xs text-zinc-400 mb-3">O unico consumidor externo confirmado de UnifiedMemoryEngine e MemoryContextBuilder. Abaixo: quem chama MemoryContextBuilder?</div>
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4 text-xs space-y-0.5">
            <div className="text-white font-bold mb-2">Quem chama MemoryContextBuilder?</div>
            <Ev>UCMETests.ts linha 182: await MemoryContextBuilder.build(...) — dentro da suite4()</Ev>
            <NoEv>ConversationPipeline.ts: NAO EXISTE import de MemoryContextBuilder</NoEv>
            <NoEv>memoryReasoningPlanner.js: NAO EXISTE import de MemoryContextBuilder</NoEv>
            <NoEv>capabilityOrchestrator.js: NAO EXISTE import de MemoryContextBuilder</NoEv>
            <NoEv>capabilityExecutor.js: NAO EXISTE import de MemoryContextBuilder</NoEv>
            <NoEv>UnifiedContextBuilder.ts: NAO EXISTE import de MemoryContextBuilder (usa base44.entities.* diretamente)</NoEv>

            <div className="text-zinc-400 mt-3 font-bold">Arvore completa do consumidor tecnico (testes):</div>
            <div className="text-blue-300 mt-1">UCMETests.ts — runUCMETests()</div>
            <div className="text-zinc-600 pl-4">↓ suite4() linha 182</div>
            <div className="text-blue-300">MemoryContextBuilder.ts — build()</div>
            <div className="text-zinc-600 pl-4">↓ linha 38</div>
            <div className="text-blue-300">UnifiedMemoryEngine.ts — buildContext()</div>
            <div className="text-zinc-600 pl-4">↓ linha 132</div>
            <div className="text-blue-300">UnifiedMemoryEngine.ts — query()</div>
            <div className="text-zinc-600 pl-4">↓ linha 88</div>
            <div className="text-blue-300">MemoryProviderRegistry.ts — getAll()</div>
            <div className="text-zinc-600 pl-4">↓ providers[].search()</div>
            <div className="text-zinc-600 pl-4">↓ linha 114</div>
            <div className="text-blue-300">MemoryFusionEngine.ts — fuse()</div>
            <div className="text-zinc-600 pl-4">↓ retorna MemoryEvidence[]</div>
            <div className="text-blue-300">MemoryContextBuilder.ts — retorna MemoryContext</div>
            <div className="text-red-400 font-bold pl-4">↓ PARA AQUI — runUCMETests() nao e chamado por ConversationPipeline</div>
          </div>

          <div className="bg-amber-950/20 border border-amber-700 rounded p-3 mt-3 text-xs">
            <div className="text-amber-300 font-bold mb-1">PASSO 8 — NAO EXISTE CONSUMIDOR CONVERSACIONAL IDENTIFICADO</div>
            <div className="text-zinc-400">
              Pode ser comprovado: ConversationPipeline.ts (932 linhas, lido integralmente) nao importa MemoryContextBuilder, UnifiedMemoryEngine, MemoryProviderRegistry, MemoryFusionEngine, OfficialLibraryProvider, nem OfficialLibraryIndexer.
              Os consumidores existentes (MemoryContextBuilder, UCMETests) nao sao chamados pela pipeline conversacional.
            </div>
          </div>
        </Section>

        {/* PASSO 9 */}
        <Section id="PASSO 9" title="Importacoes mortas (nivel de subsistema)">
          <div className="space-y-3">
            {MORTAS.map((item, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <Row label="Arquivo" value={item.arquivo} mono />
                <Row label="Importa" value={item.importa} mono />
                <Row label="Usado internamente" value={item.usado ? "SIM" : "NAO"} />
                <div className="text-xs text-zinc-500 mt-1">{item.detalhe}</div>
              </div>
            ))}
            <div className="bg-zinc-900 border border-amber-800/40 rounded p-3">
              <div className="text-amber-300 font-bold text-xs mb-1">OBSERVACAO SOBRE IMPORTACOES MORTAS</div>
              <div className="text-xs text-zinc-400">
                As importacoes nao sao "mortas" no sentido classico (importar algo e nao usar no mesmo arquivo). O problema e estrutural: o subsistema UCME completo (MemoryContextBuilder → UnifiedMemoryEngine → MemoryProviderRegistry → providers → MemoryFusionEngine) existe e e internamente coeso, mas nenhum componente externo a ele o importa dentro da cadeia conversacional.
                O subsistema e um ilha — funcional internamente, sem ponto de entrada a partir de ConversationPipeline.
              </div>
            </div>
          </div>
        </Section>

        {/* PASSO 10 */}
        <Section id="PASSO 10" title="Matriz — Implementado × Possui consumidor × Consumidor × Evidencia">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Componente</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Implementado</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Possui consumidor</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Consumidor</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Conversacional</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Evidencia</th>
                </tr>
              </thead>
              <tbody>
                {MATRIZ.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                    <td className="px-2 py-2 text-white font-bold">{row.comp}</td>
                    <td className="px-2 py-2"><SIM /></td>
                    <td className="px-2 py-2"><SIM /></td>
                    <td className="px-2 py-2 text-zinc-400 text-xs">{row.quem}</td>
                    <td className="px-2 py-2"><NAO /></td>
                    <td className="px-2 py-2 text-zinc-500 text-xs break-words max-w-xs">{row.ev}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* PASSO 11 */}
        <Section id="PASSO 11" title="Perguntas diretas — chama UnifiedMemoryEngine?">
          <div className="space-y-3">
            {PASSO11.map((item, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-white font-bold text-xs">{item.origem}</span>
                  <span className="text-zinc-600 text-xs">→ chama</span>
                  <span className="text-violet-300 font-mono text-xs">{item.alvo}?</span>
                  <NAO />
                </div>
                <div className="text-xs text-zinc-500 leading-relaxed">{item.evidencia}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* PASSO 12 */}
        <Section id="PASSO 12" title="Chamadas ao UCME fora da ConversationPipeline">
          <div className="space-y-3">
            {PASSO12_CHAMADAS.map((item, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <Row label="Arquivo" value={item.arquivo} mono />
                <Row label="Classe" value={item.classe} />
                <Row label="Metodo" value={item.metodo} mono />
                <Row label="Objetivo" value={item.objetivo} />
                <Row label="Quando executa" value={item.quando} />
                <div className="text-xs text-red-400 mt-1">{item.consumidorExterno}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* PASSO 13 — CERTIFICACAO FINAL */}
        <div className="border-2 border-red-700 rounded-xl p-6 bg-red-950/10 mb-4">
          <div className="text-xs text-red-400 font-bold mb-2">PASSO 13 — CERTIFICACAO FINAL</div>
          <div className="text-4xl font-black text-white mb-3">C</div>
          <div className="text-xl font-bold text-red-300 mb-4">UCME esta implementado mas nenhum consumidor conversacional foi identificado.</div>

          <div className="bg-zinc-900 border border-zinc-700 rounded p-4 text-xs space-y-2 mb-4">
            <div className="text-white font-bold mb-2">Base factual — evidencias que sustentam C:</div>
            <Ev>ConversationPipeline.ts (932 linhas, lido integralmente): NAO importa UnifiedMemoryEngine, MemoryContextBuilder, MemoryProviderRegistry, MemoryFusionEngine, OfficialLibraryProvider, OfficialLibraryIndexer</Ev>
            <Ev>memoryReasoningPlanner.js: NAO importa UnifiedMemoryEngine nem MemoryContextBuilder</Ev>
            <Ev>capabilityExecutor.js: NAO importa UnifiedMemoryEngine nem MemoryContextBuilder</Ev>
            <Ev>capabilityOrchestrator.js: NAO importa UnifiedMemoryEngine nem MemoryContextBuilder</Ev>
            <Ev>officialLibraryCapability.js: importa OfficialLibraryManager (de officialLibraryManager.js — EMBEDDED_DOCS). NAO importa OfficialLibraryProvider nem UnifiedMemoryEngine</Ev>
            <Ev>UnifiedContextBuilder.ts (importado por ConversationPipeline via import dinamico): usa base44.entities.* diretamente e FoundationKnowledgeAPI. NAO importa UnifiedMemoryEngine nem MemoryContextBuilder</Ev>
            <Ev>MemoryContextBuilder.ts: unico consumidor externo de UnifiedMemoryEngine. MAS nao e importado por ConversationPipeline</Ev>
            <Ev>UCMETests.ts: chama UnifiedMemoryEngine.query() diretamente em testes. NAO e chamado por ConversationPipeline</Ev>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-emerald-950/30 border border-emerald-700/40 rounded p-3">
              <div className="text-emerald-300 font-bold mb-1">IMPLEMENTADO</div>
              <div className="text-zinc-400">UnifiedMemoryEngine, MemoryFusionEngine, MemoryProviderRegistry, 4 providers, OfficialLibraryProvider, OfficialLibraryIndexer, OfficialLibraryBootstrap, GraphBuilder, DocumentLoader, OfficialLibraryChunker, OfficialLibraryParser, MemoryContextBuilder — todos implementados e coesos internamente.</div>
            </div>
            <div className="bg-amber-950/30 border border-amber-700/40 rounded p-3">
              <div className="text-amber-300 font-bold mb-1">CONSUMIDORES EXISTEM</div>
              <div className="text-zinc-400">MemoryContextBuilder consome UnifiedMemoryEngine. UCMETests consome diretamente. Os providers se auto-registram. OfficialLibraryProvider consome OfficialLibraryIndexer. A cadeia interna e funcional.</div>
            </div>
            <div className="bg-red-950/30 border border-red-700/40 rounded p-3">
              <div className="text-red-400 font-bold mb-1">NENHUM CONVERSACIONAL</div>
              <div className="text-zinc-400">Nenhum componente da cadeia ConversationPipeline → memoryReasoningPlanner → capabilityOrchestrator → capabilityExecutor → officialLibraryCapability → InvokeLLM importa ou chama qualquer componente do UCME.</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}