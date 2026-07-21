/**
 * SprintEF407Page.jsx — Sprint EF-40.7
 * UCME Functional Certification — Evidence First
 * Somente evidencias de codigo-fonte. Nenhuma hipotese.
 */

import React, { useState } from "react";

const Sec = ({ id, title, verdict, children }) => {
  const [open, setOpen] = useState(true);
  const col = { "OK": "text-emerald-400", "PARCIAL": "text-amber-400", "FALHA": "text-red-400", "INFO": "text-zinc-400" };
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/30 text-left">
        <span className="text-xs font-bold text-zinc-300">
          {id && <span className="text-violet-400 mr-2">{id}</span>}
          {verdict && <span className={`mr-2 ${col[verdict] ?? "text-zinc-400"}`}>[{verdict}]</span>}
          {title}
        </span>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-2 bg-zinc-950/60 text-xs space-y-2">{children}</div>}
    </div>
  );
};

const Ev = ({ file, children }) => (
  <div className="bg-zinc-800/50 rounded p-2 text-xs space-y-0.5">
    {file && <div className="text-violet-400 font-mono">{file}</div>}
    <div className="text-zinc-300 break-words">{children}</div>
  </div>
);

const Row = ({ label, value, color }) => (
  <div className="flex gap-3 py-1.5 border-b border-zinc-800/40 last:border-0 text-xs">
    <span className="text-zinc-500 w-44 flex-shrink-0">{label}</span>
    <span className={color ?? "text-zinc-300"}>{value}</span>
  </div>
);

const Chip = ({ color, children }) => {
  const c = { green: "bg-emerald-950/60 text-emerald-300 border-emerald-700", amber: "bg-amber-950/60 text-amber-300 border-amber-700", red: "bg-red-950/60 text-red-400 border-red-800", violet: "bg-violet-950/60 text-violet-300 border-violet-700", zinc: "bg-zinc-800 text-zinc-400 border-zinc-600" };
  return <span className={`px-2 py-0.5 rounded border text-xs font-bold ${c[color] ?? c.zinc}`}>{children}</span>;
};

const TABLE_COMPARISON = [
  { field: "Contexto bruto de memorias estruturadas (Projetos/Decisoes/Tarefas/Topicos/Entidades/Documentos/Sessoes/Palavras-chave/Mensagens)", legacy: "SIM — buildContext() monta texto estruturado com todos os 9 tipos de entidade Base44", ucme: "PARCIAL — KnowledgeGraphMemoryProvider cobre KnowledgeEntity, Decision, Task, Topic, Document. NAO cobre: Project, ChatSession, Keyword, Message cross-session", match: "PARCIAL" },
  { field: "Resumo da sessao atual (sessionSummary)", legacy: "SIM — queryEntities() busca ChatSession.filter({id:sessionId}) e extrai .summary", ucme: "NAO — nenhum provider busca ChatSession.summary da sessao ativa", match: "NAO" },
  { field: "Intent da pergunta (query_types, search_keywords, is_list_query)", legacy: "SIM — interpretIntent() via InvokeLLM com INTENT_SCHEMA estruturado", ucme: "NAO — o UCME aceita 'intent' como string opcional mas nao classifica tipos de query nem extrai keywords estruturados", match: "NAO" },
  { field: "Filtro por projectId", legacy: "SIM — queryEntities() filtra KnowledgeEntity, Document, Keyword por project_id", ucme: "NAO — nenhum provider recebe projectId na MemoryQuery. KnowledgeGraphMemoryProvider nao filtra por projeto", match: "NAO" },
  { field: "Filtro por sessionId (mensagens cross-session)", legacy: "SIM — buildContext() separa mensagens da sessao atual vs outras sessoes", ucme: "NAO — ConversationMemoryProvider busca Message.list sem filtro de sessao", match: "NAO" },
  { field: "Conteudo da Biblioteca Oficial (documentos selecionados para a query)", legacy: "SIM — officialLibraryCapability.js executado por orchestrateCapabilities(), retorna selectedDocs com conteudo completo injetado no prompt pelo buildReasoningContext()", ucme: "PARCIAL — OfficialLibraryProvider busca chunks por relevancia de texto. NAO retorna conteudo completo de documentos. NAO injeta no prompt da mesma forma", match: "PARCIAL" },
  { field: "Habilidades ativas (skills/specialists detectados)", legacy: "SIM — detectSkills() retorna array de Skills com id/name/score; buildSkillsPrompt() monta bloco no prompt", ucme: "NAO — nenhum provider do UCME detecta ou retorna skills/specialists", match: "NAO" },
  { field: "Objetivo detectado da pergunta (goal)", legacy: "SIM — detectGoal() retorna {id, label, strategy}; injetado como secao propria no prompt", ucme: "NAO — nenhum provider do UCME detecta goal", match: "NAO" },
  { field: "Resultados de capacidades executadas (web search, calculo)", legacy: "SIM — orchestrateCapabilities() executa capabilities e injeta resultados no prompt via buildReasoningContext()", ucme: "NAO — UCME nao tem camada de capabilities", match: "NAO" },
  { field: "Informacao de servico (serviceInfo) e connectors", legacy: "SIM — serviceDetector detecta servico; bloco SERVICE LAYER injetado no prompt", ucme: "NAO — nenhum provider do UCME detecta servicos ou connectors", match: "NAO" },
  { field: "Historico da conversa (historyText)", legacy: "SIM — historyMessages formatados e injetados como secao HISTORICO DA CONVERSA no prompt", ucme: "NAO — UCME nao recebe nem processa historyMessages. ConversationMemoryProvider busca Message.list genericamente (sem historico da sessao atual)", match: "NAO" },
  { field: "Instrucao de informacao insuficiente (needsMoreInfo)", legacy: "SIM — orchestrateCapabilities() detecta; bloco ATENCAO injetado se necessario", ucme: "NAO", match: "NAO" },
  { field: "Contexto KFM (KnowledgeFusionEngine — entidades fundidas)", legacy: "SIM — kfmContext passado como parametro e injetado no prompt pelo buildReasoningContext()", ucme: "NAO — UCME nao consome KFM output", match: "NAO" },
  { field: "Filtro de tempo / recencia", legacy: "SIM — ordenacao por -created_date / -decided_date / -updated_date", ucme: "PARCIAL — MemoryFusionEngine calcula recency score (1h/24h/72h/168h/720h), mas providers usam recency=0.5 fixo por default. Apenas OfficialLibraryProvider usa recency=0.90", match: "PARCIAL" },
  { field: "Acesso a Google Drive", legacy: "NAO faz parte do Legacy Context (separado via ConnectorRuntime)", ucme: "SIM — GoogleDriveMemoryProvider (mas condicional: so executa se isConnected('default'))", match: "EXTRA" },
  { field: "Acesso a Gmail", legacy: "NAO faz parte do Legacy Context", ucme: "SIM — GmailMemoryProvider (condicional: isConnected('default'))", match: "EXTRA" },
  { field: "Ranking por authority estrutural (OFFICIAL/VERIFIED/LEARNED/USER/EXTERNAL)", legacy: "NAO — Legacy nao tem authority ranking", ucme: "SIM — MemoryFusionEngine AUTHORITY_PRIORITY: OFFICIAL=5, VERIFIED=4, LEARNED=3, USER=2, EXTERNAL=1", match: "EXTRA" },
  { field: "Deduplicacao por conteudo", legacy: "NAO — Legacy nao deduplica", ucme: "SIM — MemoryFusionEngine.fuse() deduplica por dupKey (content.slice(0,120))", match: "EXTRA" },
  { field: "Citations com documentId/chapter/section/version", legacy: "NAO — Legacy nao produz citations estruturadas", ucme: "SIM — OfficialLibraryProvider retorna OfficialCitation com documentId, chapter, section, version, authority", match: "EXTRA" },
  { field: "Prompt final identico ao Legacy (instrucoes do MemoryOS Core, PRINCIPIOS FUNDAMENTAIS, etc.)", legacy: "SIM — buildReasoningContext() monta prompt completo com identidade, principios, instrucoes, historico, memorias, capacidades", ucme: "NAO — buildContext() do MemoryFusionEngine produz apenas bloco [CONTEXTO DE MEMORIA]. Nao inclui identidade, principios, instrucoes nem estrutura do prompt", match: "NAO" },
];

const GAPS = [
  { item: "sessionSummary", arquivo: "memoryPipeline.js", metodo: "queryEntities() → ChatSession.filter({id:sessionId})", impacto: "O Planner usa sessionSummary para indicar continuidade ('Esta conversa possui X mensagens'). Sem isso o UCME nao pode dizer ao LLM o estado da sessao.", criticidade: "Alta" },
  { item: "historyMessages (historico da sessao atual)", arquivo: "memoryReasoningPlanner.js", metodo: "historyMessages passado para buildReasoningContext()", impacto: "O bloco HISTORICO DA CONVERSA no prompt e construido com historyMessages. Sem isso o LLM nao ve o historico da conversa atual.", criticidade: "Alta" },
  { item: "intent estruturado (query_types, is_list_query, search_keywords)", arquivo: "memoryPipeline.js", metodo: "interpretIntent() via InvokeLLM", impacto: "O Legacy filtra entidades por tipo e por keywords. O UCME usa apenas text matching generico. Pode retornar memorias irrelevantes ou perder memorias relevantes.", criticidade: "Alta" },
  { item: "projectId como filtro de escopo", arquivo: "memoryPipeline.js", metodo: "queryEntities() — KnowledgeEntity.filter({project_id}), Document.filter({project_id})", impacto: "Sem filtro de projeto, UCME retorna memorias de todos os projetos misturados.", criticidade: "Alta" },
  { item: "skills (specialists detectados)", arquivo: "memoryReasoningPlanner.js + skills/detector.js", metodo: "detectSkills() → buildSkillsPrompt()", impacto: "Skills ativam conhecimento especializado no prompt (juridico, financeiro, etc). Sem skills o UCME nao aciona especialistas.", criticidade: "Alta" },
  { item: "goal (objetivo detectado)", arquivo: "memoryReasoningPlanner.js + reasoning/goalDetector.js", metodo: "detectGoal() → {id, label, strategy}", impacto: "O prompt Legacy inclui OBJETIVO DETECTADO e ESTRATEGIA DE RESPOSTA. Sem goal o LLM nao sabe qual problema o usuario esta tentando resolver.", criticidade: "Alta" },
  { item: "capabilityResults (web search, calculo, officialLibrary completo)", arquivo: "memoryReasoningPlanner.js + capabilityOrchestrator.js", metodo: "orchestrateCapabilities() → injetado no prompt", impacto: "Resultados de web search e calculo nunca chegariam ao LLM via UCME.", criticidade: "Alta" },
  { item: "Prompt completo do MemoryOS Core (identidade, principios, instrucoes)", arquivo: "reasoning/contextBuilder.js", metodo: "buildReasoningContext() — texto fixo de 260+ linhas", impacto: "O UCME nao produz esse prompt. Se o Planner usasse apenas UCME, o LLM receberia apenas [CONTEXTO DE MEMORIA] sem identidade nem instrucoes.", criticidade: "Alta" },
  { item: "Project entity (projetos do usuario)", arquivo: "memoryPipeline.js", metodo: "queryEntities() → Project.list()", impacto: "KnowledgeGraphMemoryProvider nao cobre Project. Projetos nao aparecem via UCME.", criticidade: "Media" },
  { item: "ChatSession list (sessoes historicas)", arquivo: "memoryPipeline.js", metodo: "queryEntities() → ChatSession.list()", impacto: "UCME nao recupera historico de sessoes. Perguntas sobre 'sessoes anteriores' ficam sem resposta.", criticidade: "Media" },
  { item: "Keyword entity (palavras-chave indexadas)", arquivo: "memoryPipeline.js", metodo: "queryEntities() → Keyword.list()", impacto: "UCME nao recupera keywords. Bloco PALAVRAS-CHAVE RELACIONADAS ausente.", criticidade: "Media" },
  { item: "serviceInfo (servico identificado + connector)", arquivo: "capabilityOrchestrator.js → serviceDetector.js", metodo: "detectService() → bloco SERVICE LAYER no prompt", impacto: "UCME nao detecta servico nem informa ao LLM qual conector usar.", criticidade: "Media" },
  { item: "needsMoreInfo / missingInfoHint", arquivo: "capabilityOrchestrator.js", metodo: "capabilityResult.needsMoreInfo", impacto: "UCME nunca instrui o LLM a solicitar mais informacao.", criticidade: "Baixa" },
  { item: "kfmContext (KnowledgeFusionEngine output)", arquivo: "ConversationPipeline.ts", metodo: "kfmContext passado para runReasoningPlan()", impacto: "UCME nao consome entidades fundidas pelo KFE.", criticidade: "Baixa" },
];

export default function SprintEF407Page() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 font-mono text-sm">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <Chip color="violet">SPRINT EF-40.7</Chip>
            <span className="text-zinc-500 text-xs">UCME Functional Certification — Evidence First — Somente codigo-fonte</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-2">Certificacao Funcional do UCME</h1>
          <p className="text-zinc-500 text-xs mt-1">Nenhuma hipotese. Nenhuma documentacao. Apenas implementacao.</p>
        </div>

        {/* FASE 1 — Arquitetura */}
        <Sec id="FASE 1" title="Arquitetura completa do UCME" verdict="INFO">
          <div className="bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs text-zinc-300 leading-6">
            <div>Conversa (userMsg)</div>
            <div className="ml-4 text-violet-400">↓ MemoryContextBuilder.build(question, opts)</div>
            <div className="ml-8 text-zinc-400">// src/lib/ucme/MemoryContextBuilder.ts</div>
            <div className="ml-8 text-zinc-400">// Monta MemoryQuery {"{text, intent?, maxPerProvider, timeoutMs}"}</div>
            <div className="ml-8">↓ UnifiedMemoryEngine.buildContext(query)</div>
            <div className="ml-12 text-violet-400">↓ UnifiedMemoryEngine.query(query)</div>
            <div className="ml-16 text-zinc-400">// src/lib/ucme/UnifiedMemoryEngine.ts</div>
            <div className="ml-16 text-zinc-400">// Seleciona providers: todos ou query.providers[]</div>
            <div className="ml-16">↓ Promise.all(providers.map(p =&gt; queryProvider(p, query, timeoutMs)))</div>
            <div className="ml-20 text-zinc-400">// Cada provider tem timeout individual (Promise.race)</div>
            <div className="ml-20 text-zinc-400">// Erro em qualquer provider: isolado, retorna []</div>
            <div className="ml-20 text-emerald-400">Provider 1: ConversationMemoryProvider</div>
            <div className="ml-24 text-zinc-400">Message.list("-created_date", 100) → filtra role=assistant → keyword match</div>
            <div className="ml-20 text-emerald-400">Provider 2: KnowledgeGraphMemoryProvider</div>
            <div className="ml-24 text-zinc-400">KnowledgeEntity + Decision + Task + Topic + Document (cada: list 50 → keyword match)</div>
            <div className="ml-20 text-emerald-400">Provider 3: GoogleDriveMemoryProvider</div>
            <div className="ml-24 text-zinc-400">SE isConnected("default"): loadIndex (localStorage TTL 30min) ou _syncIndex(Drive API)</div>
            <div className="ml-20 text-emerald-400">Provider 4: GmailMemoryProvider</div>
            <div className="ml-24 text-zinc-400">SE isConnected("default"): loadIndex (localStorage TTL 20min) ou _syncIndex(Gmail API)</div>
            <div className="ml-20 text-emerald-400">Provider 5: OfficialLibraryProvider</div>
            <div className="ml-24 text-zinc-400">OfficialLibraryIndexer.initialize() → .search(text, max) → chunks por keyword TF</div>
            <div className="ml-16">↓ allEvidence = results.flatMap(r =&gt; r.evidence)</div>
            <div className="ml-16">↓ MemoryFusionEngine.fuse(allEvidence, maxPerProvider * 2)</div>
            <div className="ml-20 text-violet-400">// recency score, weight, dedup, authority sort, cap</div>
            <div className="ml-16">↓ MemoryFusionEngine.buildContext(query.text, fused)</div>
            <div className="ml-20 text-zinc-400">// Monta string [CONTEXTO DE MEMORIA — "query"]</div>
            <div className="ml-8">↓ MemoryContext {"{query, result, prompt, builtAt}"}</div>
            <div className="ml-4">↓ UCMEContextProvider.build() → PlannerContext</div>
          </div>
        </Sec>

        {/* FASE 2 — Providers */}
        <Sec id="FASE 2" title="Todos os Memory Providers registrados" verdict="INFO">
          {[
            { nome: "ConversationMemoryProvider", classe: "ConversationMemoryProvider", arquivo: "src/lib/ucme/providers/ConversationMemoryProvider.ts", registra: "Autoregistro: MemoryProviderRegistry.register() na linha 99", utiliza: "UnifiedMemoryEngine.query() via MemoryProviderRegistry.getAll()", metodo: "search(query) → base44.entities.Message.list('-created_date', 100) → filtra role='assistant' + len>20 → keyword match", tipo: "Memorias conversacionais (assistant messages)", retorno: "MemoryEvidence[] com content=msg.content.slice(0,800), confidence=0.75, relevance=keyword_match", obrigatorio: "SIM (autoregistro incondicional)", opcional: "NAO" },
            { nome: "KnowledgeGraphMemoryProvider", classe: "KnowledgeGraphMemoryProvider", arquivo: "src/lib/ucme/providers/KnowledgeGraphMemoryProvider.ts", registra: "Autoregistro: linha 104", utiliza: "UnifiedMemoryEngine.query()", metodo: "search(query) → Promise.all([KnowledgeEntity.list(50), Decision.list(50), Task.list(50), Topic.list(50), Document.list(50)]) → keyword match em paralelo", tipo: "Grafo de conhecimento (5 entidades Base44)", retorno: "MemoryEvidence[] com confidence=0.8, relevance=keyword_match. NAO filtra por projectId nem sessionId", obrigatorio: "SIM (autoregistro incondicional)", opcional: "NAO" },
            { nome: "GoogleDriveMemoryProvider", classe: "GoogleDriveMemoryProvider", arquivo: "src/lib/ucme/providers/GoogleDriveMemoryProvider.ts", registra: "Autoregistro: linha 154", utiliza: "UnifiedMemoryEngine.query()", metodo: "search(query): SE NAO isConnected('default') retorna []. SE SIM: loadIndex (localStorage, TTL 30min). SE vazio: _syncIndex(Drive API v3 files list, 50 arquivos)", tipo: "Indice cognitivo de arquivos Google Drive (nome + metadados, nao conteudo)", retorno: "MemoryEvidence[] com content='Arquivo: {name}\\nTipo: {mimeType}\\nLink: {webViewLink}', confidence=0.7", obrigatorio: "NAO (condicional: Google conectado)", opcional: "SIM" },
            { nome: "GmailMemoryProvider", classe: "GmailMemoryProvider", arquivo: "src/lib/ucme/providers/GmailMemoryProvider.ts", registra: "Autoregistro: linha 170", utiliza: "UnifiedMemoryEngine.query()", metodo: "search(query): SE NAO isConnected('default') retorna []. SE SIM: loadIndex (localStorage TTL 20min). SE vazio: _syncIndex(Gmail API, 20 emails mais recentes, apenas metadados)", tipo: "Indice de conhecimento de emails (subject, sender, labels, date, summary 1-line)", retorno: "MemoryEvidence[] com content='Email: {subject}\\nDe: {sender}\\nData: {date}\\nResumo: {summary}', confidence=0.65", obrigatorio: "NAO (condicional: Google conectado)", opcional: "SIM" },
            { nome: "OfficialLibraryProvider", classe: "OfficialLibraryProvider (via createOfficialLibraryProvider)", arquivo: "src/lib/official-library/OfficialLibraryProvider.ts", registra: "Autoregistro: linha 156 — MemoryProviderRegistry.register(OfficialLibraryProvider)", utiliza: "UnifiedMemoryEngine.query()", metodo: "search(query) → OfficialLibraryIndexer.initialize() → OfficialLibraryIndexer.search(text, maxPerProvider). Estrategia de busca injetavel (DIP). confidence=0.85, recency=0.90 fixo", tipo: "Biblioteca oficial de documentos MemoryOS (chunks indexados)", retorno: "MemoryEvidence[] com citation estruturada (documentId, chapter, section, version, authority) em metadata", obrigatorio: "SIM (autoregistro incondicional, mas depende de OfficialLibraryIndexer.initialize() ter sucesso)", opcional: "NAO (se indexer falhar, retorna [])" },
          ].map((p, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3 space-y-1">
              <div className="text-white font-bold text-xs mb-2">{p.nome}</div>
              <Row label="Classe" value={p.classe} />
              <Row label="Arquivo" value={p.arquivo} color="text-violet-400" />
              <Row label="Quem registra" value={p.registra} />
              <Row label="Quem utiliza" value={p.utiliza} />
              <Row label="Metodo principal" value={p.metodo} />
              <Row label="Tipo de memoria" value={p.tipo} />
              <Row label="Retorno" value={p.retorno} />
              <Row label="Obrigatorio" value={p.obrigatorio} color={p.obrigatorio === "SIM" ? "text-emerald-400" : "text-amber-400"} />
            </div>
          ))}
        </Sec>

        {/* FASE 3 — Providers realmente executados */}
        <Sec id="FASE 3" title="Providers realmente executados" verdict="PARCIAL">
          <div className="space-y-2">
            {[
              { p: "ConversationMemoryProvider", exec: "SIM", condicao: "Sempre. Autoregistro incondicional. Message.list sempre disponivel via base44.", obs: "" },
              { p: "KnowledgeGraphMemoryProvider", exec: "SIM", condicao: "Sempre. Autoregistro incondicional. 5 entidades consultadas em paralelo.", obs: "" },
              { p: "OfficialLibraryProvider", exec: "CONDICIONAL", condicao: "Executa sempre, mas retorna [] se OfficialLibraryIndexer.initialize() falhar ou index estiver vazio.", obs: "Dependencia: OfficialLibraryIndexer precisa ter sido inicializado (OfficialLibraryBootstrap ou fallback). Se falhar, provider nao lanca excecao — retorna [] silenciosamente." },
              { p: "GoogleDriveMemoryProvider", exec: "CONDICIONAL", condicao: "SE isConnected('default') retornar true. Caso contrario retorna [] imediatamente.", obs: "isConnected() verifica GoogleAuthSession. Se usuario nao conectou Google: provider silente." },
              { p: "GmailMemoryProvider", exec: "CONDICIONAL", condicao: "SE isConnected('default') retornar true. Caso contrario retorna [] imediatamente.", obs: "Mesmo comportamento que GoogleDriveMemoryProvider." },
            ].map((r, i) => (
              <div key={i} className={`border rounded p-3 ${r.exec === "SIM" ? "border-emerald-800/40" : r.exec === "NAO" ? "border-red-800/40" : "border-amber-800/40"}`}>
                <div className="flex items-center gap-3 mb-1">
                  <Chip color={r.exec === "SIM" ? "green" : r.exec === "NAO" ? "red" : "amber"}>{r.exec}</Chip>
                  <span className="text-white font-bold text-xs">{r.p}</span>
                </div>
                <div className="text-zinc-400 text-xs">{r.condicao}</div>
                {r.obs && <div className="text-zinc-500 text-xs mt-1 italic">{r.obs}</div>}
              </div>
            ))}
          </div>
        </Sec>

        {/* FASE 4 — Execucao do UnifiedMemoryEngine */}
        <Sec id="FASE 4" title="Execucao completa do UnifiedMemoryEngine" verdict="OK">
          <Ev file="src/lib/ucme/UnifiedMemoryEngine.ts — metodo query()">
            1. Seleciona providers: MemoryProviderRegistry.getAll() — ou subset se query.providers[] preenchido.
            2. SE providers.length == 0: retorna resultado vazio (MemoryFusionEngine.fuse([]), contexto vazio).
            3. Promise.all(providers.map(p =&gt; queryProvider(p, query, timeoutMs))) — PARALELO, todos ao mesmo tempo.
            4. Cada queryProvider: Promise.race([provider.search(query), timeout]) — SE timeout: retorna [] com stat.healthy=false.
            5. allEvidence = results.flatMap(r =&gt; r.evidence).
            6. MemoryFusionEngine.fuse(allEvidence, maxPerProvider * 2) — dedup + rank + cap.
            7. MemoryFusionEngine.buildContext(query.text, fused) — monta string.
            8. buildTimeline(fused) — filtra evidence com lastUpdated, ordena desc, slice(0,20).
            9. Retorna: MemoryResult {"{query, evidence, context, timeline, durationMs, providerStats}"}.
          </Ev>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
            {[
              ["Paralelismo", "SIM — Promise.all()"],
              ["Timeout", "SIM — Promise.race() por provider (default 5000ms)"],
              ["Isolamento de erro", "SIM — cada provider isolado, falha nao propaga"],
              ["Cache", "NAO — sem cache no Engine. Drive/Gmail usam localStorage"],
              ["Deduplicacao", "SIM — MemoryFusionEngine.fuse() por dupKey"],
              ["Ranking", "SIM — authority priority, depois weight"],
            ].map(([k, v], i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-2 text-xs">
                <div className="text-zinc-500 mb-0.5">{k}</div>
                <div className="text-zinc-300">{v}</div>
              </div>
            ))}
          </div>
        </Sec>

        {/* FASE 5 — MemoryFusionEngine */}
        <Sec id="FASE 5" title="MemoryFusionEngine — fusao, ranking, deduplicacao" verdict="OK">
          <Ev file="src/lib/ucme/MemoryFusionEngine.ts">
            AUTHORITY_PRIORITY: OFFICIAL=5, VERIFIED=4, LEARNED=3, USER=2, EXTERNAL=1.
            authorityPriority(ev): leitura de ev.metadata?.authority (string). Default: EXTERNAL (1).
            recencyScore(ISO): age em horas → 1h=1.0 / 24h=0.9 / 72h=0.75 / 168h=0.6 / 720h=0.4 / mais antigo=0.2.
            computeWeight(ev): confidence*0.4 + relevance*0.4 + recency*0.2 (arredondado 3 decimais).
            fuse(allEvidence, maxResults=20):
              1. Enrich: recalcula recency e weight para cada evidence.
              2. Dedup: Map por dupKey (content.slice(0,120) lowercase). Vencedor: maior authority; empate → maior weight.
              3. Sort: authorityPriority DESC, depois weight DESC.
              4. Slice(0, maxResults).
            buildContext(query, evidence): max 10 items → string [CONTEXTO DE MEMORIA — "query"].
          </Ev>
          <div className="text-amber-400 text-xs mt-2 p-2 bg-amber-950/20 border border-amber-800/30 rounded">
            OBSERVACAO: ConversationMemoryProvider, KnowledgeGraphMemoryProvider, GoogleDriveMemoryProvider, GmailMemoryProvider definem recency=0.5 FIXO. O recency score do FusionEngine so e util para OfficialLibraryProvider (recency=0.90 fixo) e para qualquer provider que passe o lastUpdated real. Atualmente o FusionEngine recalcula recency com base em lastUpdated — porem o valor calculado substitui o 0.5 do provider apenas na etapa de enrichment. A formula computeWeight usa o recency calculado, nao o original do provider.
          </div>
        </Sec>

        {/* FASE 6 — PlannerContext UCME */}
        <Sec id="FASE 6" title="PlannerContext produzido pelo UCME" verdict="PARCIAL">
          <Ev file="src/lib/memory-context/UCMEContextProvider.ts — metodo build()">
            Retorna PlannerContext com:
            conversation: "" (VAZIO — nao preenchido)
            officialLibrary: "" (VAZIO — nao preenchido)
            memories: contextText (string gerada por MemoryFusionEngine.buildContext())
            goals: "" (VAZIO — UCME nao detecta goal)
            preferences: "" (VAZIO)
            entities: "" (VAZIO)
            reasoningHints: "" (VAZIO)
            citations: sources[] (lista de sourceType/providerName distintos)
            diagnostics: {"{provider:'ucme', durationMs, memoryCount, documentCount, sources, estimatedTokens, authorityScore, confidenceScore, coverage, gaps, duplications, error, timestamp}"}
          </Ev>
          <div className="text-red-400 text-xs mt-2 p-2 bg-red-950/20 border border-red-800/30 rounded">
            Dos 9 campos do PlannerContext, apenas 2 sao preenchidos com dados reais: memories e citations. Os outros 7 campos estao vazios.
          </div>
        </Sec>

        {/* FASE 7 — Comparacao */}
        <Sec id="FASE 7" title="Comparacao PlannerContext Legacy vs UCME" verdict="PARCIAL">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal w-64">Campo / Dado</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Legacy</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">UCME</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal w-24">Match</th>
                </tr>
              </thead>
              <tbody>
                {TABLE_COMPARISON.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/20">
                    <td className="px-2 py-2 text-zinc-300 break-words text-xs">{row.field}</td>
                    <td className="px-2 py-2 text-emerald-300 text-xs break-words">{row.legacy}</td>
                    <td className="px-2 py-2 text-amber-300 text-xs break-words">{row.ucme}</td>
                    <td className="px-2 py-2">
                      <Chip color={row.match === "SIM" ? "green" : row.match === "PARCIAL" ? "amber" : row.match === "EXTRA" ? "violet" : "red"}>{row.match}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>

        {/* FASE 8 — Lacunas */}
        <Sec id="FASE 8" title="Lacunas — o que o Legacy produz que o UCME nao produz" verdict="FALHA">
          <div className="space-y-2">
            {GAPS.map((g, i) => (
              <div key={i} className={`border rounded p-3 ${g.criticidade === "Alta" ? "border-red-800/40" : g.criticidade === "Media" ? "border-amber-800/40" : "border-zinc-700"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Chip color={g.criticidade === "Alta" ? "red" : g.criticidade === "Media" ? "amber" : "zinc"}>{g.criticidade}</Chip>
                  <span className="text-white font-bold text-xs">{g.item}</span>
                </div>
                <Row label="Arquivo" value={g.arquivo} color="text-violet-400" />
                <Row label="Metodo" value={g.metodo} />
                <Row label="Impacto" value={g.impacto} />
              </div>
            ))}
          </div>
        </Sec>

        {/* FASE 9 — Excessos */}
        <Sec id="FASE 9" title="Excessos — o que o UCME produz que o Legacy nunca produziu" verdict="OK">
          {[
            { item: "Authority ranking estrutural (OFFICIAL/VERIFIED/LEARNED/USER/EXTERNAL)", melhora: "SIM — permite priorizar memoria oficial sobre conversacional", incompat: "NAO" },
            { item: "Deduplicacao de conteudo por dupKey", melhora: "SIM — reduz ruido no contexto", incompat: "NAO" },
            { item: "Citations estruturadas (documentId, chapter, section, version)", melhora: "SIM — permite rastreabilidade precisa da fonte", incompat: "NAO" },
            { item: "ProviderStats (tempo de execucao por provider, healthy, hits)", melhora: "SIM — observabilidade da recuperacao de memoria", incompat: "NAO" },
            { item: "Timeline de memoria (itens com data, ordenados por recencia)", melhora: "SIM — nova funcionalidade inexistente no Legacy", incompat: "NAO" },
            { item: "GoogleDriveMemoryProvider (indice cognitivo de Drive)", melhora: "SIM — nova fonte de memoria nao disponivel no Legacy Context", incompat: "NAO — so executa se conectado" },
            { item: "GmailMemoryProvider (indice de emails como conhecimento)", melhora: "SIM — nova fonte de memoria nao disponivel no Legacy Context", incompat: "NAO — so executa se conectado" },
            { item: "Weight formula (confidence*0.4 + relevance*0.4 + recency*0.2)", melhora: "SIM — ranking mais sofisticado que o Legacy (apenas ordenacao por created_date)", incompat: "NAO" },
          ].map((e, i) => (
            <div key={i} className="border border-violet-800/30 rounded p-3 mb-2">
              <div className="text-violet-300 font-bold text-xs mb-1">{e.item}</div>
              <Row label="Melhora arquitetura?" value={e.melhora} color="text-emerald-400" />
              <Row label="Gera incompatibilidade?" value={e.incompat} color="text-emerald-400" />
            </div>
          ))}
        </Sec>

        {/* FASE 10 — Indice de convergencia */}
        <Sec id="FASE 10" title="Indice de convergencia" verdict="PARCIAL">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Campos equivalentes (SIM)", value: "0 / 20", note: "Nenhum campo totalmente equivalente", color: "text-red-400" },
              { label: "Campos parciais (PARCIAL)", value: "3 / 20", note: "memorias estruturadas, officialLibrary, recency", color: "text-amber-400" },
              { label: "Campos ausentes (NAO)", value: "13 / 20", note: "session, history, intent, project, skills, goal, capabilities, prompt, service, needsMoreInfo, kfm, projects, sessions/keywords", color: "text-red-400" },
              { label: "Campos extras (UCME only)", value: "4 / 20", note: "Drive, Gmail, authority ranking, citations", color: "text-violet-400" },
            ].map((s, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-zinc-500 text-xs mb-1">{s.label}</div>
                <div className={`font-bold text-xl ${s.color}`}>{s.value}</div>
                <div className="text-zinc-600 text-xs mt-1">{s.note}</div>
              </div>
            ))}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded p-4">
            <div className="text-zinc-400 text-xs mb-3 font-bold">Calculo de convergencia</div>
            <div className="space-y-2 text-xs text-zinc-400">
              <div>Campos SIM: 0 de 16 campos funcionais (excluindo 4 extras) = 0%</div>
              <div>Campos PARCIAL: 3 x 0.5 = 1.5 equivalentes</div>
              <div>Campos NAO: 13 = 0 contribuicao</div>
              <div>Score funcional: (0 + 1.5) / 16 = 9.4%</div>
              <div>Se incluir extras como bonus parcial: 9.4% + (4 extras x 0.1) = 9.4 + 0.4 = ~10%</div>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div className="text-zinc-500 text-xs">Convergencia geral</div>
              <div className="flex-1 h-4 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: "9.4%" }} />
              </div>
              <div className="text-red-400 font-bold text-lg">~9%</div>
            </div>
          </div>
        </Sec>

        {/* FASE 11 — Resposta objetiva */}
        <Sec id="FASE 11" title="O UCME ja pode substituir o Legacy?" verdict="FALHA">
          <div className="border-2 border-red-800/60 rounded-xl p-6 bg-red-950/10">
            <div className="text-5xl font-black text-red-400 mb-3">NAO</div>
            <div className="text-white font-bold text-lg mb-4">O UCME nao pode substituir o Legacy. Convergencia: ~9%</div>
            <div className="space-y-2 text-xs text-zinc-400">
              <div><span className="text-red-400 font-bold">Evidencia 1:</span> sessionSummary ausente — O prompt Legacy inclui secao ESTADO ATUAL DA MEMORIA com resumo da sessao. O UCME nao busca ChatSession.filter({"{id:sessionId}"}). Fonte: memoryPipeline.js linha 113-116.</div>
              <div><span className="text-red-400 font-bold">Evidencia 2:</span> historyMessages ausente — O prompt Legacy inclui HISTORICO DA CONVERSA. O UCME nao recebe historyMessages. Fonte: memoryReasoningPlanner.js linhas 139-157.</div>
              <div><span className="text-red-400 font-bold">Evidencia 3:</span> skills/goal ausentes — O prompt Legacy inclui OBJETIVO DETECTADO, ESTRATEGIA DE RESPOSTA e bloco de Skills (buildSkillsPrompt). O UCME nao detecta nenhum desses. Fonte: contextBuilder.js linhas 265-295.</div>
              <div><span className="text-red-400 font-bold">Evidencia 4:</span> Prompt incompleto — buildReasoningContext() produz 260+ linhas de instrucao de identidade, principios e instrucoes. MemoryFusionEngine.buildContext() produz apenas o bloco [CONTEXTO DE MEMORIA]. O LLM receberia um prompt sem identidade. Fonte: contextBuilder.js linhas 138-295.</div>
              <div><span className="text-red-400 font-bold">Evidencia 5:</span> capabilityResults ausentes — orchestrateCapabilities() executa web search, calculo e officialLibrary e injeta resultados. O UCME nao tem camada de capabilities. Fonte: memoryReasoningPlanner.js linhas 128-157.</div>
              <div><span className="text-red-400 font-bold">Evidencia 6:</span> projectId filtering ausente — queryEntities() filtra KnowledgeEntity e Document por project_id. KnowledgeGraphMemoryProvider lista tudo sem filtro. Fonte: KnowledgeGraphMemoryProvider.ts linhas 52-63.</div>
            </div>
          </div>
        </Sec>

        {/* FASE 12 — Lista priorizada do que falta */}
        <Sec id="FASE 12" title="Lista priorizada — o que falta implementar (somente listagem)" verdict="INFO">
          <div className="space-y-2">
            {[
              { pri: 1, item: "sessionSummary provider", desc: "Novo provider ou parametro no ConversationMemoryProvider: ChatSession.filter({id:sessionId}) → extrai .summary.", impacto: "Sem isso o LLM nao sabe o estado da sessao atual." },
              { pri: 2, item: "historyMessages no MemoryQuery", desc: "MemoryQuery precisa aceitar historyMessages[]. ConversationMemoryProvider precisa usar esse historico como contexto primario (nao apenas Message.list generico).", impacto: "Sem isso o historico da conversa atual nao chega ao LLM via UCME." },
              { pri: 3, item: "Prompt de identidade (MemoryOS Core)", desc: "UCMEContextProvider precisa incluir o prompt de identidade (buildReasoningContext linhas 138-264) no PlannerContext.reasoningHints ou em campo proprio. Ou MemoryContextBuilder precisa chamar buildReasoningContext internamente.", impacto: "Sem isso o LLM responde sem identidade nem principios." },
              { pri: 4, item: "projectId no MemoryQuery", desc: "MemoryQuery precisa aceitar projectId. KnowledgeGraphMemoryProvider precisa filtrar: KnowledgeEntity.filter({project_id}), Document.filter({project_id}).", impacto: "Sem isso memorias de projetos diferentes se misturam." },
              { pri: 5, item: "skills no PlannerContext", desc: "UCMEContextProvider precisa chamar detectSkills() e buildSkillsPrompt() para preencher PlannerContext.goals ou campo proprio.", impacto: "Sem isso specialists/skills nunca sao ativados." },
              { pri: 6, item: "goal no PlannerContext", desc: "UCMEContextProvider precisa chamar detectGoal() para preencher PlannerContext.goals.", impacto: "Sem isso o LLM nao tem objetivo nem estrategia de resposta." },
              { pri: 7, item: "Project entity provider", desc: "KnowledgeGraphMemoryProvider precisa incluir Project.list() na busca paralela.", impacto: "Projetos do usuario ausentes do contexto UCME." },
              { pri: 8, item: "ChatSession list provider", desc: "KnowledgeGraphMemoryProvider ou novo provider precisa incluir ChatSession.list() para historico de sessoes.", impacto: "Sessoes historicas ausentes." },
              { pri: 9, item: "Keyword entity provider", desc: "KnowledgeGraphMemoryProvider precisa incluir Keyword.list() na busca paralela.", impacto: "Bloco PALAVRAS-CHAVE RELACIONADAS ausente." },
              { pri: 10, item: "capabilityResults (web search, calculo)", desc: "UCMEContextProvider (ou MemoryContextBuilder) precisaria executar orchestrateCapabilities() e incluir resultados no PlannerContext.", impacto: "Web search e calculo nunca chegam ao LLM via UCME." },
              { pri: 11, item: "intent estruturado (query_types, search_keywords)", desc: "UCMEContextProvider ou UnifiedMemoryEngine precisa de classificacao de intent para filtrar providers relevantes.", impacto: "UCME consulta todos os providers para qualquer pergunta." },
              { pri: 12, item: "recency real nos providers", desc: "ConversationMemoryProvider, KnowledgeGraphMemoryProvider definem recency=0.5 fixo. Deveriam usar o created_date real do registro para o FusionEngine calcular recency corretamente.", impacto: "Ranking por recencia nao funciona para esses providers." },
              { pri: 13, item: "serviceInfo (servico + connector) no PlannerContext", desc: "UCMEContextProvider precisa chamar detectService() e incluir serviceInfo no PlannerContext.", impacto: "Sem isso o LLM nao sabe qual conector usar." },
            ].map((r, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3 flex gap-3">
                <div className="text-violet-400 font-bold text-xl w-8 flex-shrink-0">#{r.pri}</div>
                <div>
                  <div className="text-white font-bold text-xs mb-1">{r.item}</div>
                  <div className="text-zinc-400 text-xs">{r.desc}</div>
                  <div className="text-amber-400 text-xs mt-1">Impacto: {r.impacto}</div>
                </div>
              </div>
            ))}
          </div>
        </Sec>

        {/* CERTIFICACAO FINAL */}
        <div className="border-2 border-zinc-700 rounded-xl p-6 bg-zinc-900/30 mt-4">
          <div className="text-xs text-zinc-400 font-bold mb-4">CERTIFICACAO FINAL — EF-40.7</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-6">
            {[
              { q: "UCME completamente implementado?", a: "NAO", detail: "5 providers presentes. 13 dados criticos ausentes do PlannerContext.", color: "red" },
              { q: "Todos os Providers executam?", a: "CONDICIONAL", detail: "Drive e Gmail so executam se Google conectado. OfficialLibrary depende do indexer.", color: "amber" },
              { q: "MemoryFusionEngine completo?", a: "SIM", detail: "Authority, weight, dedup, sort, cap — todos implementados e funcionais.", color: "green" },
              { q: "PlannerContext completo?", a: "NAO", detail: "7 dos 9 campos vazios. Apenas memories e citations preenchidos.", color: "red" },
              { q: "Equivalencia com Legacy?", a: "NAO — ~9%", detail: "13 de 16 campos funcionais ausentes. 3 parciais.", color: "red" },
              { q: "Pronto para Shadow Mode?", a: "SIM (so diagnostico)", detail: "Shadow Mode ja ativo (EF-40.6). UCME roda em paralelo sem afetar respostas.", color: "amber" },
              { q: "Pronto para substituir o Legacy?", a: "NAO", detail: "Convergencia 9%. 13 itens criticos a implementar antes de EF-40.8.", color: "red" },
            ].map((item, i) => (
              <div key={i} className={`flex items-start gap-2 bg-zinc-800/50 rounded p-3 border ${item.color === "green" ? "border-emerald-800/40" : item.color === "red" ? "border-red-800/40" : "border-amber-800/40"}`}>
                <Chip color={item.color === "green" ? "green" : item.color === "red" ? "red" : "amber"}>{item.a}</Chip>
                <div>
                  <div className="text-zinc-300 font-bold">{item.q}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-zinc-500 text-xs w-48">Convergencia UCME → Legacy</div>
            <div className="flex-1 h-6 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full flex items-center px-2" style={{ width: "9.4%" }}>
              </div>
            </div>
            <div className="text-red-400 font-black text-2xl">~9%</div>
          </div>
          <div className="text-zinc-500 text-xs mt-3">Proximo passo: EF-40.8 — implementar os 13 itens da lista priorizada antes de tentar migracao do Planner.</div>
        </div>

      </div>
    </div>
  );
}