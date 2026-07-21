/**
 * OfficialLibraryFlowPage.jsx
 * Fluxo completo da Biblioteca Oficial — do download à resposta.
 * Evidence-only. Nenhuma inferência.
 */

import React, { useState } from "react";

const STEPS = [
  {
    num: 1,
    name: "Discovery",
    component: "ViteDocumentDiscovery",
    file: "src/lib/official-library/ViteDocumentDiscovery.ts",
    status: "IMPLEMENTADO",
    desc: "Descobre os arquivos .md disponíveis usando import.meta.glob. Produz uma lista de DiscoveredDocument[] — descritores com id, name, path, authority e a função load() que fará o download lazy.",
    input: "— (module load)",
    output: "DiscoveryResult { documents: DiscoveredDocument[], durationMs, runtimeId, diagnostics }",
    consumer: "OfficialLibraryCatalog.discover()",
    evidence: [
      "ViteDocumentDiscovery.ts lines 16-34: import.meta.glob para /src/docs/00-official-library/*.md, /foundation/*.md, /adr/*.md, /rfc/*.md",
      "ViteDocumentDiscovery.ts line 61: priority = 100 — selecionado como descoberta primária",
      "DocumentDiscovery.ts: interface IDocumentDiscovery define discover() → Promise<DiscoveryResult>",
      "ViteDocumentDiscovery.ts: isAvailable retorna true quando import.meta.glob existe (ambiente Vite/browser)",
    ],
    models: [
      { name: "DiscoveredDocument", fields: "id · name · path · authority · load(): Promise<string>" },
      { name: "DiscoveryResult", fields: "documents[] · durationMs · discoveredAt · runtimeId · diagnostics[]" },
    ],
    gap: null,
  },
  {
    num: 2,
    name: "Catalog",
    component: "OfficialLibraryCatalog",
    file: "src/lib/official-library/OfficialLibraryCatalog.ts",
    status: "IMPLEMENTADO",
    desc: "Thin facade sobre DocumentDiscoveryRegistry. Obtém a descoberta ativa (ViteDocumentDiscovery), chama discover(), converte DiscoveredDocument[] → DocumentSource[] e mantém cache após primeira chamada.",
    input: "— (chamado por Bootstrap)",
    output: "DocumentSource[] { id, name, path, load(): Promise<string> }",
    consumer: "OfficialLibraryBootstrap.run() — step 1",
    evidence: [
      "OfficialLibraryCatalog.ts line 31: async discover() → cached after first call",
      "OfficialLibraryCatalog.ts line 34-36: DocumentDiscoveryRegistry.getActive() → discovery.discover()",
      "OfficialLibraryCatalog.ts line 40: result.documents.map(toDocumentSource)",
      "OfficialLibraryBootstrap.ts line 73: const sources = await OfficialLibraryCatalog.discover()",
    ],
    models: [
      { name: "DocumentSource", fields: "id · name · path · load(): Promise<string>" },
    ],
    gap: null,
  },
  {
    num: 3,
    name: "Load",
    component: "DocumentLoader (via loader.loadAll)",
    file: "src/lib/official-library/DocumentLoader.ts",
    status: "IMPLEMENTADO",
    desc: "Executa source.load() para cada DocumentSource em paralelo (Promise.all). Cada chamada load() dispara o import.meta.glob lazy — este é o momento em que o arquivo .md é efetivamente baixado do bundle. Produz LoadedDocument[] com o conteúdo raw.",
    input: "DocumentSource[]",
    output: "LoadedDocument[] { id, name, path, raw: string, loadedAt, error }",
    consumer: "OfficialLibraryBootstrap.run() — step 2",
    evidence: [
      "DocumentLoader.ts line 54: async loadAll(sources) → Promise.all(sources.map(s => DocumentLoader.load(s)))",
      "DocumentLoader.ts line 30: async load(source) → const raw = await source.load()",
      "ViteDocumentDiscovery.ts line 51-54: load: async () => { const content = await importer(); return typeof content === 'string' ? content : content.default ?? '' }",
      "OfficialLibraryBootstrap.ts line 76: const loaded = await loader.loadAll(sources)",
      "OfficialLibraryBootstrap.ts line 77: const successful = loader.successful(loaded)",
    ],
    models: [
      { name: "LoadedDocument", fields: "id · name · path · raw: string · loadedAt · error: string|null" },
    ],
    gap: null,
  },
  {
    num: 4,
    name: "Parse",
    component: "OfficialLibraryParser",
    file: "src/lib/official-library/OfficialLibraryParser.ts",
    status: "IMPLEMENTADO",
    desc: "Converte o raw string de cada LoadedDocument em ParsedDocument estruturado. Detecta formato (.md → markdown, .json → json, outro → txt). Para markdown, percorre linha a linha identificando headings (##...) e separa em ParsedSection[]. Extrai version, authority e tags do path.",
    input: "LoadedDocument[] (apenas os successful — error === null)",
    output: "ParsedDocument[] { documentId, documentName, path, rawContent, sections: ParsedSection[], version, authority, sourceType, detectedAt, tags }",
    consumer: "OfficialLibraryBootstrap.run() — step 3 + step 5 (meta construction)",
    evidence: [
      "OfficialLibraryBootstrap.ts line 81-83: const parsed = successful.map(doc => OfficialLibraryParser.parse(doc.raw, doc.path, doc.name))",
      "OfficialLibraryParser.ts line 38: HEADING_RE = /^(#{1,6})\\s+(.+)$/",
      "OfficialLibraryParser.ts line 64-111: parseMarkdown() — splits by heading, produces ParsedSection[]",
      "OfficialLibraryParser.ts line 175: return Object.freeze({ documentId, documentName, path, rawContent, sections, version, authority, sourceType, detectedAt, tags })",
    ],
    models: [
      { name: "ParsedSection", fields: "title · level · content · chapter · section · lineStart" },
      { name: "ParsedDocument", fields: "documentId · documentName · path · rawContent · sections[] · version · authority · sourceType · detectedAt · tags[]" },
    ],
    gap: null,
  },
  {
    num: 5,
    name: "Chunk",
    component: "OfficialLibraryChunker",
    file: "src/lib/official-library/OfficialLibraryChunker.ts",
    status: "IMPLEMENTADO",
    desc: "Divide cada ParsedDocument em OfficialChunk[] independentemente pesquisáveis. Usa as ParsedSection[] como fronteiras naturais. Seções grandes (>1200 chars) são subdivididas em janelas sobrepostas (overlap 150 chars). Cada chunk recebe id único, summary (primeira sentença) e metadados de localização.",
    input: "ParsedDocument[]",
    output: "OfficialChunk[] { id, documentId, documentName, version, chapter, section, title, content, summary, authority, sourceType, createdAt, updatedAt, tags, metadata }",
    consumer: "OfficialLibraryBootstrap.run() — step 4; depois Indexer e GraphBuilder",
    evidence: [
      "OfficialLibraryBootstrap.ts line 86: const allChunks: OfficialChunk[] = OfficialLibraryChunker.chunkAll(parsed)",
      "OfficialLibraryChunker.ts line 17-19: MAX_CHUNK_CHARS = 1200, OVERLAP_CHARS = 150, MIN_CHUNK_CHARS = 40",
      "OfficialLibraryChunker.ts line 47-87: chunk(doc) — for each section, splitLargeSection(content), produces OfficialChunk per part",
      "OfficialLibraryChunker.ts line 91-92: chunkAll(docs) → docs.flatMap(d => OfficialLibraryChunker.chunk(d))",
    ],
    models: [
      { name: "OfficialChunk", fields: "id · documentId · documentName · version · chapter · section · title · content · summary · authority · sourceType · createdAt · updatedAt · tags[] · metadata{path,level,lineStart,partIndex,partTotal}" },
    ],
    gap: null,
  },
  {
    num: 6,
    name: "Index",
    component: "OfficialLibraryIndexer",
    file: "src/lib/official-library/OfficialLibraryIndexer.ts",
    status: "IMPLEMENTADO",
    desc: "Mantém o índice em memória de OfficialChunk[] e OfficialDocumentMeta[]. Recebe os dados via _injectFromBootstrap() (chamado exclusivamente pelo Bootstrap). Expõe search() que delega à SearchStrategy injetada (padrão: KeywordSearchStrategy).",
    input: "OfficialChunk[] + OfficialDocumentMeta[] (via _injectFromBootstrap)",
    output: "OfficialChunk[] (via search(queryText, maxResults))",
    consumer: "OfficialLibraryProvider.search() → via MemoryProvider interface",
    evidence: [
      "OfficialLibraryBootstrap.ts line 103: OfficialLibraryIndexer._injectFromBootstrap(allChunks, metas)",
      "OfficialLibraryIndexer.ts line 65-70: _injectFromBootstrap(chunks, metas) — sets this._chunks, this._metas, this._indexed = true",
      "OfficialLibraryIndexer.ts line 82-84: search(queryText, maxResults) → this._strategy.search(queryText, this._chunks, maxResults)",
      "OfficialLibraryIndexer.ts line 36: _strategy: SearchStrategy = defaultSearchStrategy (KeywordSearchStrategy)",
    ],
    models: [
      { name: "OfficialDocumentMeta", fields: "documentId · documentName · version · createdAt · updatedAt · deprecated · authority · tags[] · path" },
    ],
    gap: null,
  },
  {
    num: 7,
    name: "Graph Build",
    component: "GraphBuilder → GraphStorage",
    file: "src/lib/official-library/GraphBuilder.ts + GraphStorage.ts",
    status: "IMPLEMENTADO",
    desc: "GraphBuilder.build() cria um grafo de conhecimento a partir dos chunks: nós Document (um por documentId) + nós Component (13 componentes do sistema definidos em COMPONENT_KEYWORDS). Arestas doc→component criadas quando keywords do componente aparecem no conteúdo do chunk. GraphStorage armazena o grafo. GraphQuery permite consulta.",
    input: "OfficialChunk[]",
    output: "KnowledgeGraphData { nodes: Map<string, KnowledgeGraphNode>, edges: KnowledgeGraphEdge[] }",
    consumer: "GraphStorage.store(graphData); GraphQuery.getDocumentLinks() → OfficialLibraryProvider (link enrichment)",
    evidence: [
      "OfficialLibraryBootstrap.ts line 106-107: const graphData = GraphBuilder.build(allChunks); _graphStorage.store(graphData)",
      "GraphBuilder.ts line 23-37: COMPONENT_KEYWORDS — 13 system components mapped to keywords",
      "GraphBuilder.ts line 42-107: build(chunks) — document nodes + component nodes + doc→component edges",
      "OfficialLibraryBootstrap.ts line 44: export const graphQuery = new GraphQuery(_graphStorage)",
      "OfficialLibraryProvider.ts line 46-54: const graphData = graphQuery → getLinks = id => graphQuery.getDocumentLinks(id)",
    ],
    models: [
      { name: "KnowledgeGraphNode", fields: "id · label · type(document|component) · documentId · version · tags[]" },
      { name: "KnowledgeGraphEdge", fields: "from · to · relationship(documents|governs) · strength: number" },
      { name: "KnowledgeGraphData", fields: "nodes: Map<string, Node> · edges: Edge[]" },
    ],
    gap: null,
  },
  {
    num: 8,
    name: "Search",
    component: "KeywordSearchStrategy (via OfficialLibraryIndexer.search)",
    file: "src/lib/official-library/SearchStrategy.ts",
    status: "IMPLEMENTADO",
    desc: "Quando OfficialLibraryProvider.search(query) é chamado, delega ao Indexer que usa KeywordSearchStrategy. A estratégia tokeniza a query, conta hits por chunk (title + summary + content), ordena por score decrescente e retorna até maxResults chunks.",
    input: "queryText: string + chunks: OfficialChunk[] + maxResults: number",
    output: "OfficialChunk[] (top-k por score de relevância keyword)",
    consumer: "OfficialLibraryProvider.search() — converte OfficialChunk[] → MemoryEvidence[]",
    evidence: [
      "SearchStrategy.ts line 27-43: KeywordSearchStrategy.search() — words = queryText.split(/\\s+/), scored = chunks.map(c => hits/words.length), filter score > 0, sort desc, slice(0,maxResults)",
      "OfficialLibraryIndexer.ts line 82: search(queryText, maxResults) → this._strategy.search(queryText, this._chunks, maxResults)",
      "OfficialLibraryProvider.ts line 40: const results = OfficialLibraryIndexer.search(query.text, query.maxPerProvider ?? 10)",
      "SearchStrategy.ts line 31-32: haystack = chunk.title + chunk.summary + chunk.content",
    ],
    models: [],
    gap: null,
  },
  {
    num: 9,
    name: "MemoryEvidence",
    component: "OfficialLibraryProvider",
    file: "src/lib/official-library/OfficialLibraryProvider.ts",
    status: "IMPLEMENTADO",
    desc: "Converte OfficialChunk[] em MemoryEvidence[] para o UCME. Calcula relevance (0.3 + hits/words * 0.7), fixa confidence=0.85 e recency=0.90. Enriquece cada evidence com citation (documentId/name/chapter/section/version/authority) e links do grafo (até 3 nós conectados). Registra-se automaticamente no MemoryProviderRegistry.",
    input: "MemoryQuery { text: string, maxPerProvider?: number }",
    output: "MemoryEvidence[] { memoryId, providerId, providerName, content, summary, confidence, relevance, recency, weight, lastUpdated, justification, tags, metadata{citation, authority, chunkId, ...} }",
    consumer: "UnifiedMemoryEngine (UCME) via MemoryProviderRegistry",
    evidence: [
      "OfficialLibraryProvider.ts line 155: MemoryProviderRegistry.register(OfficialLibraryProvider) — auto self-register",
      "OfficialLibraryProvider.ts line 57-104: results.map(chunk => { ... return { memoryId, providerId, content: chunk.content, ... } satisfies MemoryEvidence })",
      "OfficialLibraryProvider.ts line 60-61: confidence = 0.85 (fixed); relevance = 0.3 + (hits/words)*0.7",
      "OfficialLibraryProvider.ts line 67-75: citation: OfficialCitation = { sourceType, documentId, documentName, chapter, section, version, authority }",
      "OfficialLibraryProvider.ts line 77-78: links = getLinks(chunk.documentId) — from GraphQuery",
    ],
    models: [
      { name: "MemoryEvidence", fields: "memoryId · providerId · providerName · content · summary · confidence · relevance · recency · weight · lastUpdated · justification · tags[] · metadata" },
      { name: "OfficialCitation", fields: "sourceType · documentId · documentName · chapter · section · version · authority" },
    ],
    gap: null,
  },
  {
    num: 10,
    name: "UCME Fusion",
    component: "UnifiedMemoryEngine (UCME) → MemoryFusionEngine",
    file: "src/lib/ucme/UnifiedMemoryEngine.ts + MemoryFusionEngine.ts",
    status: "PARCIALMENTE IMPLEMENTADO",
    desc: "O UCME coleta MemoryEvidence[] de todos os providers registrados (OfficialLibraryProvider entre eles). A MemoryFusionEngine funde os resultados — deduplica, rankeia por authority + relevance + recency, calcula weight final. O resultado é um contexto unificado de memória.",
    input: "MemoryQuery via MemoryProviderRegistry.getAll()",
    output: "MemoryContext { evidences: MemoryEvidence[], unifiedContext: string, confidence, sources }",
    consumer: "memoryReasoningPlanner.js → buildReasoningContext()",
    evidence: [
      "OfficialLibraryProvider.ts line 155: MemoryProviderRegistry.register(OfficialLibraryProvider) — confirma participação no UCME",
      "MemoryFusionEngine.ts: existe no projeto (src/lib/ucme/MemoryFusionEngine.ts)",
      "PARCIALMENTE IMPLEMENTADO: não foi possível confirmar via código se o UCME está sendo chamado na path do ConversationPipeline atual (v2) — apenas na path legada do memoryReasoningPlanner.js",
    ],
    models: [],
    gap: "O UCME (UnifiedMemoryEngine) é registrado e o OfficialLibraryProvider está no registry, mas a integração com ConversationPipeline.ts v2 (path oficial) NÃO FOI CONFIRMADA. A path legada (memoryReasoningPlanner.js) chama officialLibraryCapability diretamente — não via UCME.",
  },
  {
    num: 11,
    name: "LLM Context (legado)",
    component: "capabilityOrchestrator → officialLibraryCapability → buildReasoningContext",
    file: "src/lib/reasoning/capabilityOrchestrator.js + contextBuilder.js",
    status: "IMPLEMENTADO (path legada)",
    desc: "Na path legada (memoryReasoningPlanner.js), o Capability Orchestrator detecta se a pergunta requer Biblioteca Oficial, chama officialLibraryCapability.js para buscar chunks relevantes, e passa o resultado para buildReasoningContext() que injeta o bloco '## BIBLIOTECA OFICIAL DO MEMORYOS' no prompt do LLM. O LLM recebe o conteúdo completo dos documentos selecionados e usa como fonte autoritativa.",
    input: "capabilityResults.officialLibrary { ready, docCount, docNames, selectedDocs[{name, content}] }",
    output: "String no prompt LLM — bloco '## BIBLIOTECA OFICIAL DO MEMORYOS (consultada automaticamente)'",
    consumer: "InvokeLLM() (via base44.integrations.Core.InvokeLLM)",
    evidence: [
      "contextBuilder.js lines 75-102: if (capabilityResults?.officialLibrary) → capabilityBlocks.push('## BIBLIOTECA OFICIAL DO MEMORYOS...')",
      "contextBuilder.js line 83-85: selectedDocs.map(d => '### '+d.name+'\\n\\n'+d.content) — conteúdo completo inserido no prompt",
      "contextBuilder.js line 95-98: 'Utilize o conteúdo completo abaixo como fonte autoritativa...'",
      "contextBuilder.js line 294: '${capabilityBlocks.join(...)}' — bloco incluído no prompt final enviado ao LLM",
    ],
    models: [],
    gap: null,
  },
  {
    num: 12,
    name: "Resposta ao Usuário",
    component: "ConversationPipeline → ResponseArbiter → stream",
    file: "src/lib/conversation-platform/ConversationPipeline.ts",
    status: "PARCIALMENTE IMPLEMENTADO",
    desc: "Na path oficial (ConversationPipeline v2), a resposta final é selecionada pelo ResponseArbiter a partir dos ExecutionOutcome candidates. Na path legada, o LLM responde diretamente usando o prompt enriquecido com chunks da Biblioteca Oficial. A integração direta do OfficialLibraryProvider com o ConversationPipeline v2 via UCME NÃO FOI CONFIRMADA no código.",
    input: "finalResponse (string) do ResponseArbiter ou LLM path",
    output: "Streaming de texto ao usuário via conversationStreaming",
    consumer: "ChatInterface (UI)",
    evidence: [
      "ConversationPipeline.ts: integração com OfficialLibraryProvider NÃO encontrada via import direto",
      "contextBuilder.js: integração confirma path legada (memoryReasoningPlanner.js → buildReasoningContext → LLM)",
      "OfficialLibraryProvider.ts line 155: auto-register no MemoryProviderRegistry (disponível para UCME mas não confirmado no pipeline v2)",
    ],
    models: [],
    gap: "A integração final (OfficialLibraryProvider → ConversationPipeline v2 via UCME/memoryReasoningPlanner) NÃO ESTÁ CONFIRMADA no código lido. O fluxo está comprovado apenas para a path legada (memoryReasoningPlanner.js). Na path v2 (ConversationPipeline.ts), a Biblioteca Oficial pode não estar sendo consultada.",
  },
];

const STATUS_STYLE = {
  "IMPLEMENTADO": "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  "PARCIALMENTE IMPLEMENTADO": "bg-amber-900/60 text-amber-300 border-amber-700",
  "NÃO IMPLEMENTADO": "bg-red-950/60 text-red-300 border-red-800",
  "NÃO DOCUMENTADO": "bg-zinc-800 text-zinc-400 border-zinc-600",
};

export default function OfficialLibraryFlowPage() {
  const [open, setOpen] = useState(null);

  const implemented = STEPS.filter(s => s.status === "IMPLEMENTADO").length;
  const partial = STEPS.filter(s => s.status === "PARCIALMENTE IMPLEMENTADO").length;
  const gaps = STEPS.filter(s => s.gap).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 text-sm font-mono">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700 px-2 py-0.5 rounded">OFFICIAL LIBRARY FLOW</span>
            <span className="text-xs text-zinc-500">2026-07-21 · Evidence-only</span>
          </div>
          <h1 className="text-xl font-bold text-white">Fluxo Completo da Biblioteca Oficial</h1>
          <p className="text-zinc-500 text-xs mt-1">Do download do documento até a resposta ao usuário · 12 etapas auditadas</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">{implemented}</div>
            <div className="text-xs text-zinc-500 mt-0.5">Implementado</div>
          </div>
          <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-400">{partial}</div>
            <div className="text-xs text-zinc-500 mt-0.5">Parcial</div>
          </div>
          <div className="bg-red-950/40 border border-red-800/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{gaps}</div>
            <div className="text-xs text-zinc-500 mt-0.5">Gaps Identificados</div>
          </div>
        </div>

        {/* Pipeline visual */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 overflow-x-auto">
          <div className="text-xs text-zinc-500 mb-3">Pipeline completo</div>
          <div className="flex items-center gap-1 flex-nowrap min-w-max">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.num}>
                <div className={`text-xs px-2 py-1 rounded border whitespace-nowrap ${
                  s.status === "IMPLEMENTADO" ? "bg-emerald-950/60 text-emerald-300 border-emerald-700" :
                  "bg-amber-950/60 text-amber-300 border-amber-700"
                }`}>
                  {s.num}. {s.name}
                </div>
                {i < STEPS.length - 1 && <span className="text-zinc-600 flex-shrink-0">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {STEPS.map((step, idx) => (
            <div key={step.num} className={`border rounded-lg overflow-hidden ${step.gap ? "border-amber-800/40" : "border-zinc-800"}`}>
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 text-left bg-zinc-900"
                onClick={() => setOpen(open === idx ? null : idx)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-zinc-600 w-6 flex-shrink-0 font-bold">{step.num}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{step.name}</div>
                    <div className="text-zinc-600 text-xs">{step.component}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${STATUS_STYLE[step.status]}`}>{step.status}</span>
                  {step.gap && <span className="text-amber-400 text-xs">⚠</span>}
                  <span className="text-zinc-600">{open === idx ? "▲" : "▼"}</span>
                </div>
              </button>

              {open === idx && (
                <div className="border-t border-zinc-800 bg-zinc-950/50 px-4 pb-4 pt-3 space-y-4">
                  {/* Description */}
                  <div className="text-xs text-zinc-300 leading-relaxed">{step.desc}</div>

                  {/* File */}
                  <div className="text-xs">
                    <span className="text-zinc-600">Arquivo: </span>
                    <span className="text-violet-400">{step.file}</span>
                  </div>

                  {/* Input / Output / Consumer */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-2">
                      <div className="text-zinc-500 mb-1">INPUT</div>
                      <div className="text-blue-300 break-words">{step.input}</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-2">
                      <div className="text-zinc-500 mb-1">OUTPUT</div>
                      <div className="text-emerald-300 break-words">{step.output}</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-2">
                      <div className="text-zinc-500 mb-1">CONSUMIDO POR</div>
                      <div className="text-amber-300 break-words">{step.consumer}</div>
                    </div>
                  </div>

                  {/* Models */}
                  {step.models.length > 0 && (
                    <div>
                      <div className="text-xs text-zinc-500 mb-2">Modelos de dados produzidos</div>
                      <div className="space-y-1">
                        {step.models.map(m => (
                          <div key={m.name} className="bg-zinc-900 border border-zinc-700 rounded p-2 text-xs">
                            <span className="text-white font-semibold">{m.name}</span>
                            <span className="text-zinc-500 ml-2">{m.fields}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evidence */}
                  <div>
                    <div className="text-xs text-zinc-500 mb-2">Evidências no código</div>
                    <div className="space-y-1">
                      {step.evidence.map((e, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="text-emerald-600 flex-shrink-0 mt-0.5">✓</span>
                          <span className="text-zinc-400 break-words">{e}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Gap */}
                  {step.gap && (
                    <div className="bg-amber-950/30 border border-amber-700/50 rounded p-3 text-xs">
                      <div className="text-amber-300 font-bold mb-1">⚠ GAP IDENTIFICADO</div>
                      <div className="text-amber-200/80 break-words">{step.gap}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-5 text-xs space-y-3">
          <h3 className="text-white font-bold text-sm">Resumo dos Gaps</h3>

          <div className="space-y-2 text-zinc-400">
            <div className="bg-amber-950/20 border border-amber-800/40 rounded p-3">
              <div className="text-amber-300 font-semibold mb-1">GAP 1 — Etapa 10: UCME → ConversationPipeline v2</div>
              <p>OfficialLibraryProvider está registrado no MemoryProviderRegistry. O UCME existe (UnifiedMemoryEngine.ts). Mas a integração entre UCME e ConversationPipeline.ts v2 NÃO foi confirmada via código. Na path v2, buildConversationContext() e memoryReasoningPlanner.js são chamados — a Biblioteca Oficial pode estar chegando ao LLM via path legada, não via UCME oficial.</p>
            </div>
            <div className="bg-amber-950/20 border border-amber-800/40 rounded p-3">
              <div className="text-amber-300 font-semibold mb-1">GAP 2 — Etapa 12: Path v2 vs path legada</div>
              <p>O fluxo completo está comprovado para a PATH LEGADA: memoryReasoningPlanner.js → capabilityOrchestrator → officialLibraryCapability → buildReasoningContext → bloco no prompt LLM. Para o ConversationPipeline v2 (path oficial), a passagem dos chunks da Biblioteca Oficial para o LLM NÃO FOI CONFIRMADA via código-fonte lido.</p>
            </div>
            <div className="bg-emerald-950/20 border border-emerald-800/40 rounded p-3">
              <div className="text-emerald-300 font-semibold mb-1">CONFIRMADO — Etapas 1-9</div>
              <p>O pipeline de ingestão (Discovery → Load → Parse → Chunk → Index → GraphBuild → Search → MemoryEvidence) está completamente implementado e comprovado por evidências diretas no código. A Biblioteca Oficial está disponível como MemoryProvider funcional.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}