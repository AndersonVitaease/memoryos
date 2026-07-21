/**
 * SprintEF407aPage.jsx — Sprint EF-40.7A
 * Architectural Responsibility Certification — Evidence First
 * Somente implementacao. Nenhuma hipotese.
 */

import React, { useState } from "react";

const Sec = ({ id, title, verdict, children }) => {
  const [open, setOpen] = useState(true);
  const col = { "CORRETO": "text-emerald-400", "INCORRETO": "text-red-400", "PARCIAL": "text-amber-400", "INFO": "text-zinc-400", "CRITICO": "text-red-400" };
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800/30 text-left">
        <span className="text-xs font-bold text-zinc-300 flex items-center gap-2">
          {id && <span className="text-violet-400">{id}</span>}
          {verdict && <span className={`${col[verdict] ?? "text-zinc-400"}`}>[{verdict}]</span>}
          {title}
        </span>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-2 bg-zinc-950/60 text-xs space-y-2">{children}</div>}
    </div>
  );
};

const Ev = ({ file, children }) => (
  <div className="bg-zinc-800/50 rounded p-2 font-mono text-xs">
    {file && <div className="text-violet-400 mb-1">{file}</div>}
    <div className="text-zinc-300 whitespace-pre-wrap break-words">{children}</div>
  </div>
);

const Row = ({ label, value, color }) => (
  <div className="flex gap-3 py-1.5 border-b border-zinc-800/40 last:border-0 text-xs">
    <span className="text-zinc-500 w-52 flex-shrink-0">{label}</span>
    <span className={color ?? "text-zinc-300"}>{value}</span>
  </div>
);

const Chip = ({ color, children }) => {
  const c = { green: "bg-emerald-950/60 text-emerald-300 border-emerald-700", amber: "bg-amber-950/60 text-amber-300 border-amber-700", red: "bg-red-950/60 text-red-400 border-red-800", violet: "bg-violet-950/60 text-violet-300 border-violet-700", zinc: "bg-zinc-800 text-zinc-400 border-zinc-600", blue: "bg-blue-950/60 text-blue-300 border-blue-700" };
  return <span className={`px-2 py-0.5 rounded border text-xs font-bold ${c[color] ?? c.zinc}`}>{children}</span>;
};

export default function SprintEF407aPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 font-mono text-sm">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <Chip color="violet">SPRINT EF-40.7A</Chip>
            <span className="text-zinc-500 text-xs">Architectural Responsibility Certification — Evidence First</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-2">Certificacao de Responsabilidades Arquiteturais</h1>
          <p className="text-zinc-500 text-xs mt-1">Somente codigo-fonte. Nenhuma hipotese. Nenhuma documentacao.</p>
        </div>

        {/* FASE 1 */}
        <Sec id="FASE 1" title="Arquitetura conversacional real — quem chama quem" verdict="INFO">
          <div className="bg-zinc-900 border border-zinc-800 rounded p-4 text-xs leading-7">
            <div className="text-white font-bold mb-2">Fonte: memoryReasoningPlanner.js + capabilityOrchestrator.js + contextBuilder.js</div>
            <div className="space-y-1">
              <div><span className="text-violet-400">ConversationPipeline.ts</span> chama <span className="text-zinc-400">runReasoningPlan(userMsg, session, historyMessages, setPhase, kfmContext)</span></div>
              <div className="ml-4 text-emerald-400">ETAPA 1 — Memory Layer</div>
              <div className="ml-8">runMemoryPipeline(userMsg, session.id, session.project_id)</div>
              <div className="ml-12 text-zinc-500">interpretIntent() via InvokeLLM: classifica query_types + keywords</div>
              <div className="ml-12 text-zinc-500">queryEntities(): busca 9 entidades em paralelo, filtra por projectId</div>
              <div className="ml-12 text-zinc-500">buildEnrichedContext(): score, ranking, consolida string de contexto</div>
              <div className="ml-12 text-zinc-500">retorna: context, sources, sessionSummary, intent, mip</div>
              <div className="ml-4 text-emerald-400">ETAPA 2 — Skills Layer</div>
              <div className="ml-8">detectSkills(userMsg, sessionSummary, context, sources)</div>
              <div className="ml-12 text-zinc-500">keyword match: userMsg x1.0 + context x0.8 + sessionSummary x0.6 + sources x0.5</div>
              <div className="ml-12 text-zinc-500">retorna: Skills[] ordenadas por score</div>
              <div className="ml-4 text-emerald-400">ETAPA 3 — Goal Layer</div>
              <div className="ml-8">detectGoal(userMsg) — keyword match em 13 goals (sem API)</div>
              <div className="ml-12 text-zinc-500">retorna: id, label, strategy, matchedKeywords</div>
              <div className="ml-4 text-emerald-400">ETAPA 3.5 — Specialist Router (condicional)</div>
              <div className="ml-8">SpecialistRouter.route(goal, memory, session)</div>
              <div className="ml-12 text-zinc-500">SE specialist encontrado: executa pipeline proprio, retorna resposta final — FIM</div>
              <div className="ml-4 text-emerald-400">ETAPA 4 — Capability Orchestrator</div>
              <div className="ml-8">orchestrateCapabilities(message, memory, goal, sessionId, projectId)</div>
              <div className="ml-12 text-zinc-500">detectCapabilities(): detecta web_search, calculation, documents, official_library</div>
              <div className="ml-12 text-zinc-500">detectService(): Service Layer — email, agenda, docs</div>
              <div className="ml-12 text-zinc-500">getConnectorsForService(): Connector Manager</div>
              <div className="ml-12 text-zinc-500">executeCapabilities(): executa em paralelo</div>
              <div className="ml-12 text-zinc-500">retorna: capabilities, capabilityResults, serviceInfo, needsMoreInfo, missingInfoHint</div>
              <div className="ml-4 text-emerald-400">ETAPA 5 — Prompt Builder (Context Builder)</div>
              <div className="ml-8">historyText = historyMessages.map().join() — PLANNER formata o historico</div>
              <div className="ml-8">buildReasoningContext(userMsg, memory, skills, goal, historyText, totalMessages, capabilities, capabilityResults, needsMoreInfo, missingInfoHint, serviceInfo, kfmContext)</div>
              <div className="ml-12 text-zinc-500">monta: Identidade + Principios + Skills + Goal + Estado + Memoria + Historico + Service + Capabilities + userMsg</div>
              <div className="ml-12 text-zinc-500">retorna: string 260+ linhas</div>
              <div className="ml-4 text-emerald-400">ETAPA 6 — LLM</div>
              <div className="ml-8">base44.integrations.Core.InvokeLLM(prompt)</div>
              <div className="ml-4 text-emerald-400">ETAPA 7 — Memory Synthesizer</div>
              <div className="ml-8">synthesizeResponse(rawResponse) — deterministico, sem LLM</div>
              <div className="ml-4">retorna: response, plan, sources</div>
            </div>
          </div>
        </Sec>

        {/* FASE 2 */}
        <Sec id="FASE 2" title="Responsavel correto por cada gap da EF-40.7" verdict="INCORRETO">
          <div className="bg-amber-950/20 border border-amber-700/30 rounded p-3 mb-3 text-amber-300 text-xs">
            CONCLUSAO: A EF-40.7 classificou incorretamente a maioria dos gaps como "ausentes do UCME". A maioria desses itens NUNCA foi responsabilidade do UCME. O UCME e uma MEMORY LAYER, nao um PLANNER nem um PROMPT BUILDER.
          </div>
          <div className="space-y-2">
            {[
              { gap: "sessionSummary", resp: "Memory Layer (runMemoryPipeline)", justif: "runMemoryPipeline.js linha 113-116: queryEntities() busca ChatSession.filter({id:sessionId}). sessionSummary e dado bruto de memoria. O UCME DEVERIA prover esse dado.", ucme: true },
              { gap: "historyMessages — historico da sessao atual", resp: "Planner (memoryReasoningPlanner.js)", justif: "Linha 139-141: historyText = historyMessages.map().join(). historyMessages vem do ConversationPipeline via RAM. NAO e responsabilidade do UCME.", ucme: false },
              { gap: "Prompt de identidade — MemoryOS Core", resp: "Prompt Builder (contextBuilder.js)", justif: "contextBuilder.js linhas 138-264: buildReasoningContext() monta o prompt. Responsabilidade exclusiva do PromptBuilder. O UCME entrega dados — o PromptBuilder monta a string final.", ucme: false },
              { gap: "projectId como filtro de escopo", resp: "Memory Layer / UCME", justif: "runMemoryPipeline.js linhas 123,137: filtra por project_id. UCMEContextProvider.build() recebe projectId mas nao passa para MemoryContextBuilder. GAP LEGITIMO DO UCME.", ucme: true },
              { gap: "skills — specialists detectados", resp: "Planner / Skills Layer (detector.js)", justif: "planner.js linha 60: detectSkills(userMsg, memory). Skills nao sao memoria — sao routing decisions. Pertencem ao Planner.", ucme: false },
              { gap: "goal — objetivo detectado", resp: "Planner / Goal Layer (goalDetector.js)", justif: "planner.js linha 64: detectGoal(userMsg). Goal nao e memoria — e interpretacao de intencao. Pertence ao Planner.", ucme: false },
              { gap: "capabilityResults — web search, calculo", resp: "Capability Orchestrator (capabilityOrchestrator.js)", justif: "capabilityOrchestrator.js linha 43-115: capabilities sao acoes, nao memorias. Pertencem ao CapabilityOrchestrator.", ucme: false },
              { gap: "Project entity", resp: "Memory Layer / UCME", justif: "runMemoryPipeline.js linha 119: Project.list(). KnowledgeGraphMemoryProvider nao cobre Project. GAP LEGITIMO DO UCME.", ucme: true },
              { gap: "ChatSession list — historico de sessoes", resp: "Memory Layer / UCME", justif: "runMemoryPipeline.js linha 141: ChatSession.list(). GAP LEGITIMO DO UCME.", ucme: true },
              { gap: "Keyword entity", resp: "Memory Layer / UCME", justif: "runMemoryPipeline.js linha 144: Keyword.list(). GAP LEGITIMO DO UCME.", ucme: true },
              { gap: "serviceInfo — servico + connector", resp: "Capability Orchestrator (capabilityOrchestrator.js)", justif: "capabilityOrchestrator.js linhas 53-77: detectService() + getConnectorsForService(). NAO e responsabilidade do UCME.", ucme: false },
              { gap: "needsMoreInfo / missingInfoHint", resp: "Capability Orchestrator (capabilityOrchestrator.js)", justif: "capabilityOrchestrator.js linha 45: detectCapabilities() retorna hasEnoughInfo. Pertence ao CapabilityOrchestrator.", ucme: false },
              { gap: "kfmContext — KnowledgeFusionEngine", resp: "ConversationPipeline (ConversationPipeline.ts)", justif: "ConversationPipeline.ts: kfmModel produzido pelo Pipeline, passado como parametro. NAO e responsabilidade do UCME.", ucme: false },
              { gap: "recency real nos providers", resp: "Memory Layer / UCME Providers", justif: "ConversationMemoryProvider usa recency=0.5 fixo. O created_date existe no registro — o provider nao o passa. GAP LEGITIMO DO UCME.", ucme: true },
              { gap: "intent estruturado — query_types, search_keywords", resp: "Memory Layer (runMemoryPipeline)", justif: "runMemoryPipeline.js linhas 56-89: interpretIntent() via LLM. Para replicar, UCME precisaria de classificacao propria. GAP OPCIONAL DO UCME.", ucme: true },
            ].map((r, i) => (
              <div key={i} className={`border rounded p-3 ${r.ucme ? "border-amber-800/40" : "border-zinc-700/40"}`}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Chip color={r.ucme ? "amber" : "green"}>{r.ucme ? "GAP DO UCME" : "NAO E DO UCME"}</Chip>
                  <span className="text-white font-bold text-xs">{r.gap}</span>
                  <span className="text-zinc-500">|</span>
                  <Chip color="blue">{r.resp}</Chip>
                </div>
                <div className="text-zinc-400 text-xs leading-5">{r.justif}</div>
              </div>
            ))}
          </div>
        </Sec>

        {/* FASE 3 */}
        <Sec id="FASE 3" title="Responsabilidade real de cada componente — SRP / DIP / OCP" verdict="PARCIAL">
          {[
            { comp: "runMemoryPipeline (memoryPipeline.js)", oficial: "Recuperar memoria estruturada, filtrar por intencao, retornar contexto.", real: "Faz intent classification via LLM (interpretIntent). Faz entity fetching (9 tipos). Faz context assembly (buildEnrichedContext). Recupera sessionSummary.", srp: "VIOLACAO: 3 responsabilidades (intent+fetch+assembly) em um arquivo.", dip: "OK — depende de base44 abstrato.", ocp: "VIOLACAO: adicionar novo query_type exige modificar queryEntities e buildContext.", acop: "base44.entities (9), InvokeLLM, EnrichedContextBuilder" },
            { comp: "memoryReasoningPlanner.js (Planner)", oficial: "Orquestrar fluxo de raciocinio: memoria → skills → goal → capabilities → prompt → LLM.", real: "Formata historyText (linha 139-141). Chama todos os sub-componentes em sequencia.", srp: "OK — orchestrator puro. Nao implementa logica propria de nenhuma etapa.", dip: "VIOLACAO MENOR: importa diretamente runMemoryPipeline, detectSkills, detectGoal.", ocp: "VIOLACAO: adicionar nova etapa exige modificar o Planner.", acop: "runMemoryPipeline, detectSkills, detectGoal, SpecialistRouter, orchestrateCapabilities, buildReasoningContext, synthesizeResponse, InvokeLLM" },
            { comp: "contextBuilder.js (Prompt Builder)", oficial: "Montar o prompt final para o LLM com todos os dados ja coletados.", real: "Monta identidade (260+ linhas fixo). Monta skillsBlock. Monta goal. Monta memory. Monta history. Monta capability blocks. Monta service block.", srp: "VIOLACAO: Prompt Builder + Identidade Builder + Capability Formatter + Service Formatter em um unico arquivo.", dip: "OK — recebe todos os dados como parametros.", ocp: "VIOLACAO: adicionar novo bloco exige modificar buildReasoningContext.", acop: "buildSkillsPrompt (skills/detector.js)" },
            { comp: "capabilityOrchestrator.js", oficial: "Detectar e executar capabilities. Detectar Service Layer e Connector Manager.", real: "Exatamente a responsabilidade oficial. Sem desvio.", srp: "VIOLACAO MENOR: detecta capabilities E detecta Service/Connectors.", dip: "OK — depende de interfaces importadas.", ocp: "VIOLACAO: adicionar nova capability exige modificar execCapabilities.", acop: "capabilityDetector, capabilityExecutor, serviceDetector, connectors/registry" },
            { comp: "detectSkills (skills/detector.js)", oficial: "Classificar quais specialists sao relevantes para mensagem+contexto.", real: "detectSkills (classificador) + buildSkillsPrompt (formatter de prompt) no mesmo arquivo.", srp: "VIOLACAO: 2 responsabilidades diferentes no mesmo arquivo.", dip: "OK — recebe parametros.", ocp: "OK — adicionar skill = adicionar ao registry.js.", acop: "SKILLS registry" },
            { comp: "UnifiedMemoryEngine.ts (UCME)", oficial: "Executar todos os MemoryProviders em paralelo, fusionar resultados, retornar MemoryResult.", real: "Exatamente o que a responsabilidade oficial descreve.", srp: "OK.", dip: "OK — depende de MemoryProviderRegistry (interface) e MemoryFusionEngine.", ocp: "OK — adicionar provider = registrar no registry.", acop: "MemoryProviderRegistry, MemoryFusionEngine" },
          ].map((c, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3 mb-2">
              <div className="text-white font-bold text-xs mb-2">{c.comp}</div>
              <Row label="Responsabilidade oficial" value={c.oficial} />
              <Row label="Responsabilidade real" value={c.real} />
              <Row label="SRP" value={c.srp} color={c.srp.startsWith("OK") ? "text-emerald-400" : "text-amber-400"} />
              <Row label="DIP" value={c.dip} color={c.dip.startsWith("OK") ? "text-emerald-400" : "text-amber-400"} />
              <Row label="OCP" value={c.ocp} color={c.ocp.startsWith("OK") ? "text-emerald-400" : "text-amber-400"} />
              <Row label="Acoplamentos" value={c.acop} color="text-zinc-400" />
            </div>
          ))}
        </Sec>

        {/* FASE 4 */}
        <Sec id="FASE 4" title="Ciclo de vida da memoria — quem produz, transforma, entrega" verdict="INFO">
          <div className="bg-zinc-900 border border-zinc-800 rounded p-4 text-xs">
            {[
              ["Produz", "runMemoryPipeline()", "memoryPipeline.js — consulta 9 entidades do banco, filtra, retorna context + sources + sessionSummary"],
              ["Transforma", "buildEnrichedContext()", "memory-intelligence/EnrichedContextBuilder.js — score, ranking, consolidacao, grafo, contexto enriquecido"],
              ["Classifica intent", "interpretIntent()", "memoryPipeline.js — LLM classifica query_types + search_keywords para direcionar busca"],
              ["Organiza para LLM", "buildReasoningContext()", "contextBuilder.js — recebe memory.context (string ja pronta) e insere no prompt"],
              ["Monta prompt final", "buildReasoningContext()", "contextBuilder.js — e o PromptBuilder, nao a Memory Layer"],
              ["Entrega ao LLM", "memoryReasoningPlanner.js", "linha 163: InvokeLLM — o Planner entrega o prompt montado pelo ContextBuilder"],
            ].map(([fase, quem, detalhe], i) => (
              <div key={i} className="flex gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                <span className="text-violet-400 font-bold w-32 flex-shrink-0">{fase}</span>
                <span className="text-emerald-400 w-44 flex-shrink-0">{quem}</span>
                <span className="text-zinc-400">{detalhe}</span>
              </div>
            ))}
          </div>
          <Ev>
            {"OBSERVACAO CRITICA: A 'memoria' que o ContextBuilder recebe (memory.context) ja e uma STRING FORMATADA,\nnao dados brutos. O ContextBuilder nao ve entidades — ve texto.\nA transformacao de dados em linguagem ocorre no runMemoryPipeline/buildEnrichedContext,\nANTES do ContextBuilder."}
          </Ev>
        </Sec>

        {/* FASE 5 */}
        <Sec id="FASE 5" title="Ciclo do Prompt — quem monta cada parte" verdict="INFO">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Bloco do Prompt</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Quem monta (Real)</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Arquivo / Linha</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Identidade (MemoryOS Core, missao, principios)", "Prompt Builder (contextBuilder.js)", "contextBuilder.js linhas 138-264 — texto fixo hardcoded"],
                  ["Principios fundamentais (7 principios)", "Prompt Builder (contextBuilder.js)", "contextBuilder.js linhas 148-157"],
                  ["Como conversar, o que nao fazer", "Prompt Builder (contextBuilder.js)", "contextBuilder.js linhas 175-222"],
                  ["Skills (ESPECIALISTA CARREGADO)", "Skills Layer — buildSkillsPrompt()", "skills/detector.js linhas 123-148, chamado por contextBuilder.js linha 135"],
                  ["Objetivo detectado + Estrategia", "Prompt Builder (contextBuilder.js)", "contextBuilder.js linhas 268-273"],
                  ["Estado da memoria (totalMessages, sources)", "Prompt Builder (contextBuilder.js)", "contextBuilder.js linhas 277-282"],
                  ["Memoria estruturada (context string)", "Memory Layer (runMemoryPipeline) — entregue como string", "contextBuilder.js linha 288"],
                  ["Resumo da sessao (sessionSummary)", "Memory Layer (runMemoryPipeline) — entregue como string", "contextBuilder.js linha 290"],
                  ["Historico da conversa (historyText)", "Planner — formata historyMessages em texto (linhas 139-141)", "contextBuilder.js linha 292"],
                  ["KFM context (entidades fundidas)", "ConversationPipeline — passado como parametro", "contextBuilder.js linha 286"],
                  ["Service Layer (servico + connector)", "CapabilityOrchestrator executa, PromptBuilder formata", "contextBuilder.js linhas 104-117"],
                  ["Capabilities (web search, calculo, officialLibrary)", "CapabilityOrchestrator executa, PromptBuilder formata", "contextBuilder.js linhas 42-101"],
                  ["NeedsMoreInfo (instrucao insuficiencia)", "CapabilityOrchestrator detecta, PromptBuilder formata", "contextBuilder.js linhas 119-127"],
                  ["userMsg (mensagem do usuario)", "ConversationPipeline passa ao Planner", "contextBuilder.js linha 295"],
                ].map(([bloco, quem, arquivo], i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/20">
                    <td className="px-2 py-2 text-zinc-300">{bloco}</td>
                    <td className="px-2 py-2 text-emerald-400">{quem}</td>
                    <td className="px-2 py-2 text-zinc-500">{arquivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>

        {/* FASE 6 */}
        <Sec id="FASE 6" title="O UCME deveria produzir apenas memoria, ou mais?" verdict="CORRETO">
          <div className="border-2 border-emerald-700/40 rounded-xl p-5 bg-emerald-950/10">
            <div className="text-emerald-400 font-black text-2xl mb-3">APENAS MEMORIA</div>
            <Ev file="UCMEContextProvider.ts linha 90-100">
              {"PlannerContext retornado:\n  conversation:    '' (vazio — Planner responsavel)\n  officialLibrary: '' (vazio — CapabilityOrchestrator responsavel)\n  memories:        contextText (UNICO campo preenchido pelo UCME)\n  goals:           '' (vazio — GoalDetector responsavel)\n  preferences:     '' (vazio)\n  entities:        '' (vazio)\n  reasoningHints:  '' (vazio — GoalDetector/Planner responsavel)\n  citations:       sources[]"}
            </Ev>
            <Ev file="PlannerContextTypes.ts — contrato dos 9 campos">
              {"O contrato PlannerContext ja separou corretamente as responsabilidades.\nO UCME e responsavel por: memories, citations.\nOs demais campos (conversation, goals, reasoningHints, etc) sao de outros componentes."}
            </Ev>
            <div className="text-emerald-400 font-bold text-xs mt-2">CONCLUSAO: O design do PlannerContext (EF-40.6) ja estava correto. O UCME entrega apenas o bloco de memorias. O Planner, GoalDetector, SkillsLayer e CapabilityOrchestrator preenchem os demais campos.</div>
          </div>
        </Sec>

        {/* FASE 7 */}
        <Sec id="FASE 7" title="O Planner deveria depender de qual contrato?" verdict="CORRETO">
          <div className="border-2 border-violet-700/40 rounded-xl p-5 bg-violet-950/10">
            <div className="text-violet-400 font-black text-2xl mb-3">PlannerContext</div>
            <Ev file="memoryReasoningPlanner.js — consumo atual">
              {"Atualmente o Planner consome diretamente:\n  memory.context (string)\n  memory.sources (array)\n  memory.sessionSummary (string)\n\nO Planner chama runMemoryPipeline() e recebe 'memory' — nao um PlannerContext.\nO ideal e que o Planner dependesse de PlannerContext (contrato),\nnao de memory (objeto especifico do runMemoryPipeline)."}
            </Ev>
            <Ev file="LegacyContextProvider.ts linha 77-88">
              {"LegacyContextProvider ja adapta memory → PlannerContext.\nMas o Planner atual NAO usa PlannerContext — usa memory diretamente.\nO PlannerContext foi criado pelo EF-40.6 como preparacao para a migracao."}
            </Ev>
            <div className="text-violet-300 font-bold text-xs mt-2">CONCLUSAO: A migracao exige que o Planner passe a consumir PlannerContext (contrato) em vez de memory diretamente — mudanca de binding no Planner, nao no UCME.</div>
          </div>
        </Sec>

        {/* FASE 8 */}
        <Sec id="FASE 8" title="Matriz de responsabilidades completa" verdict="INFO">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Funcionalidade</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Componente responsavel</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal">Consumidor</th>
                  <th className="text-left px-2 py-2 text-zinc-500 font-normal w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Busca memoria estruturada (9 entidades)", "Memory Layer (runMemoryPipeline)", "Planner → ContextBuilder", "Legacy OK", "green"],
                  ["Busca memoria UCME (5 providers)", "UCME (UnifiedMemoryEngine)", "UCMEContextProvider", "UCME OK", "green"],
                  ["Classificacao de intent da query", "Memory Layer (interpretIntent via LLM)", "queryEntities()", "Legacy OK / UCME Gap", "amber"],
                  ["Filtro por projectId", "Memory Layer / UCME", "queryEntities()", "Legacy OK / UCME Gap", "amber"],
                  ["Filtro por sessionId / sessionSummary", "Memory Layer / UCME", "queryEntities()", "Legacy OK / UCME Gap", "amber"],
                  ["Deteccao de skills/specialists", "Skills Layer (detectSkills)", "Planner → ContextBuilder", "Implementado — NAO e do UCME", "zinc"],
                  ["Deteccao de goal/objetivo", "Goal Layer (detectGoal)", "Planner → ContextBuilder", "Implementado — NAO e do UCME", "zinc"],
                  ["Routing para Specialists", "Specialist Router", "Planner (condicional)", "Implementado — NAO e do UCME", "zinc"],
                  ["Execucao de capabilities", "Capability Orchestrator", "Planner → ContextBuilder", "Implementado — NAO e do UCME", "zinc"],
                  ["Service Layer + Connector Manager", "Capability Orchestrator", "Planner → ContextBuilder", "Implementado — NAO e do UCME", "zinc"],
                  ["Montagem do prompt de identidade", "Prompt Builder (contextBuilder.js)", "Planner → LLM", "Implementado — NAO e do UCME", "zinc"],
                  ["Formatacao do historico da conversa", "Planner (historyMessages.map)", "ContextBuilder", "Implementado — NAO e do UCME", "zinc"],
                  ["Fusao por authority (ranking)", "UCME (MemoryFusionEngine)", "UCMEContextProvider", "UCME OK — ausente no Legacy", "green"],
                  ["Deduplicacao de evidencias", "UCME (MemoryFusionEngine)", "UCMEContextProvider", "UCME OK — ausente no Legacy", "green"],
                  ["Citations estruturadas", "UCME (OfficialLibraryProvider)", "UCMEContextProvider", "UCME OK — ausente no Legacy", "green"],
                  ["Indice cognitivo Google Drive", "UCME (GoogleDriveMemoryProvider)", "UCMEContextProvider", "UCME OK — ausente no Legacy", "green"],
                  ["Indice cognitivo Gmail", "UCME (GmailMemoryProvider)", "UCMEContextProvider", "UCME OK — ausente no Legacy", "green"],
                  ["Project entity no contexto", "Memory Layer / UCME", "ContextBuilder", "Legacy OK / UCME Gap", "amber"],
                  ["ChatSession list historico", "Memory Layer / UCME", "ContextBuilder", "Legacy OK / UCME Gap", "amber"],
                  ["Keyword entity no contexto", "Memory Layer / UCME", "ContextBuilder", "Legacy OK / UCME Gap", "amber"],
                  ["recency real baseado em created_date", "UCME Providers", "MemoryFusionEngine", "Parcial (0.5 fixo)", "amber"],
                ].map(([func, resp, cons, status, color], i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/20">
                    <td className="px-2 py-2 text-zinc-300">{func}</td>
                    <td className="px-2 py-2 text-emerald-400">{resp}</td>
                    <td className="px-2 py-2 text-zinc-500">{cons}</td>
                    <td className="px-2 py-2"><Chip color={color}>{status}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>

        {/* FASE 9 */}
        <Sec id="FASE 9" title="Responsabilidades duplicadas" verdict="PARCIAL">
          {[
            { item: "Busca de memorias estruturadas", dup: "SIM", detalhe: "Memory Legacy (runMemoryPipeline: 9 entidades) e UCME (KnowledgeGraphMemoryProvider: 5 das 9 entidades) buscam os mesmos dados por caminhos diferentes. Duplicata real de busca em KnowledgeEntity, Decision, Task, Topic, Document." },
            { item: "Ranking de memorias", dup: "PARALELO", detalhe: "Legacy: ordenacao por created_date. UCME: MemoryFusionEngine authority+weight+dedup. Sao implementacoes diferentes — nao duplicatas, mas funcoes diferentes sobre o mesmo conceito." },
            { item: "Deduplicacao", dup: "NAO", detalhe: "Apenas o UCME deduplica (MemoryFusionEngine.dupKey). O Legacy nao deduplica." },
            { item: "Busca em Drive/Gmail", dup: "NAO", detalhe: "Apenas o UCME acessa Drive/Gmail como memoria cognitiva. O Legacy nao acessa." },
            { item: "Official Library", dup: "SIM", detalhe: "officialLibraryCapability.js (CapabilityOrchestrator) e OfficialLibraryProvider (UCME) buscam os mesmos chunks do mesmo indexer. Duplicata real — duas implementacoes do mesmo dado." },
            { item: "Contexto / Prompt paralelo", dup: "POR DESIGN", detalhe: "LegacyContextProvider e UCMEContextProvider rodam em paralelo (Shadow Mode EF-40.6). Nao e bug — e a comparacao intencional do Shadow Mode." },
          ].map((r, i) => (
            <div key={i} className={`border rounded p-3 mb-2 ${r.dup === "SIM" ? "border-amber-800/30" : r.dup === "NAO" ? "border-zinc-700" : "border-zinc-600"}`}>
              <div className="flex items-center gap-2 mb-1">
                <Chip color={r.dup === "SIM" ? "amber" : r.dup === "NAO" ? "green" : "zinc"}>{r.dup}</Chip>
                <span className="text-white font-bold text-xs">{r.item}</span>
              </div>
              <div className="text-zinc-400 text-xs">{r.detalhe}</div>
            </div>
          ))}
        </Sec>

        {/* FASE 10 */}
        <Sec id="FASE 10" title="Menor mudanca arquitetural para UCME substituir apenas a Memory Layer" verdict="INFO">
          <div className="bg-zinc-900 border border-zinc-800 rounded p-4 text-xs leading-7">
            <div className="text-white font-bold mb-3">Arquitetura target (minimal change):</div>
            <div className="space-y-1">
              <div className="text-violet-400">ConversationPipeline.ts — sem mudanca</div>
              <div className="ml-4 text-zinc-400">chama runReasoningPlan(userMsg, session, historyMessages, setPhase, kfmContext)</div>
              <div className="ml-4 text-emerald-400">MUDANCA 1: Planner para de chamar runMemoryPipeline() diretamente</div>
              <div className="ml-4 text-emerald-400">MUDANCA 2: Planner chama MemoryAdapter.getMemory(userMsg, sessionId, projectId)</div>
              <div className="ml-8 text-zinc-500">mode=LEGACY: delega para runMemoryPipeline() — mesmo comportamento atual</div>
              <div className="ml-8 text-zinc-500">mode=UCME: delega para UnifiedMemoryEngine.query() via UCMEContextProvider</div>
              <div className="ml-8 text-zinc-500">retorna sempre: context (string), sources (array), sessionSummary (string)</div>
              <div className="ml-4 text-zinc-500">detectSkills(userMsg, sessionSummary, context, sources) — sem mudanca</div>
              <div className="ml-4 text-zinc-500">detectGoal(userMsg) — sem mudanca</div>
              <div className="ml-4 text-zinc-500">SpecialistRouter.route() — sem mudanca</div>
              <div className="ml-4 text-zinc-500">orchestrateCapabilities() — sem mudanca</div>
              <div className="ml-4 text-zinc-500">buildReasoningContext() — sem mudanca</div>
              <div className="ml-4 text-zinc-500">InvokeLLM(prompt) — sem mudanca</div>
            </div>
            <div className="mt-4 text-emerald-400 font-bold">CONCLUSAO: O UCME nao precisa substituir o Planner, o PromptBuilder nem o CapabilityOrchestrator. Ele precisa substituir APENAS runMemoryPipeline() — retornando o mesmo contrato: context (string), sources (Array), sessionSummary (string).</div>
            <div className="mt-2 text-amber-400 font-bold">Para isso, o UCME precisa adicionar: sessionSummary, Project, ChatSession, Keyword providers e projectId filtering — apenas 5 itens funcionais.</div>
          </div>
        </Sec>

        {/* FASE 11 */}
        <Sec id="FASE 11" title="Backlog definitivo — 4 grupos sem sobreposicao" verdict="INFO">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { grupo: "A — UCME (Memory Layer)", color: "emerald", items: [
                "Adicionar sessionSummary: ChatSession.filter({id:sessionId}) no ConversationMemoryProvider ou novo SessionMemoryProvider",
                "Adicionar Project.list() ao KnowledgeGraphMemoryProvider",
                "Adicionar ChatSession.list() ao KnowledgeGraphMemoryProvider (sessoes historicas)",
                "Adicionar Keyword.list() ao KnowledgeGraphMemoryProvider",
                "Passar projectId para MemoryContextBuilder.build() em UCMEContextProvider",
                "KnowledgeGraphMemoryProvider: filtrar por project_id quando disponivel",
                "ConversationMemoryProvider: usar created_date real como recency",
                "KnowledgeGraphMemoryProvider: usar created_date/updated_date real como recency",
                "UCMEContextProvider.build(): retornar contrato compativel com runMemoryPipeline — context (string), sources (Array), sessionSummary (string)",
              ] },
              { grupo: "B — Planner", color: "blue", items: [
                "Criar MemoryAdapter.getMemory(userMsg, sessionId, projectId, mode) com modos LEGACY/UCME/SHADOW",
                "Planner: trocar chamada direta a runMemoryPipeline() pelo MemoryAdapter",
                "Garantir que o retorno do adapter seja sempre: context, sources, sessionSummary — independente do provider",
                "Nenhuma mudanca em detectSkills, detectGoal, SpecialistRouter, orchestrateCapabilities, buildReasoningContext",
              ] },
              { grupo: "C — Prompt Builder", color: "violet", items: [
                "ZERO itens — contextBuilder.js nao precisa mudar",
                "buildReasoningContext() recebe os mesmos parametros independente da origem da memoria",
              ] },
              { grupo: "D — Capability Layer", color: "amber", items: [
                "ZERO itens — CapabilityOrchestrator nao precisa mudar",
                "detectService, detectCapabilities, executeCapabilities, getConnectorsForService permanecem sem alteracao",
                "OfficialLibraryProvider (UCME) e officialLibraryCapability.js sao contextos diferentes — Shadow vs Capability — sem conflito",
              ] },
            ].map((g, i) => {
              const borderMap = { emerald: "border-emerald-700/40", blue: "border-blue-700/40", violet: "border-violet-700/40", amber: "border-amber-700/40" };
              const textMap = { emerald: "text-emerald-400", blue: "text-blue-400", violet: "text-violet-400", amber: "text-amber-400" };
              return (
                <div key={i} className={`border ${borderMap[g.color]} rounded p-4 bg-zinc-900/30`}>
                  <div className={`font-bold text-xs mb-3 ${textMap[g.color]}`}>{g.grupo}</div>
                  <ul className="space-y-2">
                    {g.items.map((item, j) => (
                      <li key={j} className="text-zinc-400 text-xs flex gap-2">
                        <span className={textMap[g.color]}>→</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Sec>

        {/* FASE 12 */}
        <Sec id="FASE 12" title="O UCME esta incompleto ou o backlog da EF-40.7 classificou incorretamente?" verdict="INCORRETO">
          <div className="border-2 border-amber-700/60 rounded-xl p-6 bg-amber-950/10">
            <div className="text-amber-400 font-black text-2xl mb-3">O BACKLOG DA EF-40.7 CLASSIFICOU RESPONSABILIDADES INCORRETAMENTE</div>
            <div className="text-white font-bold mb-3">Evidencias de codigo:</div>
            <div className="space-y-2 text-xs">
              {[
                { ev: "EF-40.7 classificou 'historyMessages ausente' como gap do UCME.", fonte: "memoryReasoningPlanner.js linhas 139-141", correto: "historyText e formatado pelo PLANNER a partir de historyMessages RAM. Nunca foi responsabilidade da Memory Layer." },
                { ev: "EF-40.7 classificou 'skills/goal ausentes' como gaps do UCME.", fonte: "planner.js linhas 60,64: detectSkills e detectGoal", correto: "Skills e goal sao routing decisions do Planner, nao memoria." },
                { ev: "EF-40.7 classificou 'capabilityResults/serviceInfo/needsMoreInfo ausentes' como gaps do UCME.", fonte: "capabilityOrchestrator.js linhas 43-115", correto: "Capabilities sao acoes do CapabilityOrchestrator, nao responsabilidade da Memory Layer." },
                { ev: "EF-40.7 classificou 'Prompt de identidade ausente' como gap do UCME.", fonte: "contextBuilder.js linhas 138-264", correto: "Prompt de identidade e responsabilidade exclusiva do PromptBuilder." },
                { ev: "EF-40.7 classificou 'kfmContext ausente' como gap do UCME.", fonte: "ConversationPipeline.ts: kfmModel produzido pelo KFE no Pipeline", correto: "kfmContext e dado de enriquecimento do Pipeline, nao da Memory Layer." },
              ].map((e, i) => (
                <div key={i} className="bg-zinc-800/50 rounded p-3">
                  <div className="text-amber-300 font-bold">{e.ev}</div>
                  <div className="text-violet-400 text-xs mt-1">Fonte: {e.fonte}</div>
                  <div className="text-emerald-400 text-xs mt-1">{e.correto}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 bg-zinc-900 border border-zinc-700 rounded p-4">
              <div className="text-white font-bold text-xs mb-2">Recontagem correta:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center"><div className="text-2xl font-bold text-red-400">6</div><div className="text-zinc-500 text-xs">gaps classificados como UCME que eram de outros componentes</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-amber-400">7</div><div className="text-zinc-500 text-xs">gaps reais do UCME (Memory Layer)</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-red-400">~9%</div><div className="text-zinc-500 text-xs">convergencia calculada na EF-40.7 (incorreta — comparou UCME com o sistema inteiro)</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-emerald-400">~60%</div><div className="text-zinc-500 text-xs">convergencia real do UCME vs Memory Layer apenas</div></div>
              </div>
            </div>
          </div>
        </Sec>

        {/* CERTIFICACAO FINAL */}
        <div className="border-2 border-violet-700/50 rounded-xl p-6 bg-violet-950/10 mt-4">
          <div className="text-xs text-violet-400 font-bold mb-4">CERTIFICACAO FINAL — EF-40.7A</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-6">
            {[
              { q: "Arquitetura correta identificada?", a: "SIM", detail: "Memory Layer / Planner / PromptBuilder / CapabilityOrchestrator delimitados por evidencia de codigo.", color: "green" },
              { q: "Responsabilidades separadas?", a: "SIM", detail: "7 gaps sao do UCME. 6 nao sao do UCME — pertencem ao Planner, CapabilityOrchestrator e PromptBuilder.", color: "green" },
              { q: "Backlog EF-40.7 estava correto?", a: "NAO", detail: "EF-40.7 comparou o UCME com a totalidade do sistema legado, nao apenas com a Memory Layer.", color: "red" },
              { q: "Backlog reorganizado por responsabilidade?", a: "SIM", detail: "A=UCME(9 itens), B=Planner(4 itens), C=PromptBuilder(0), D=CapabilityLayer(0).", color: "green" },
              { q: "Convergencia real do UCME (Memory Layer)?", a: "~60%", detail: "5 providers/filtros ausentes vs 8 implementados na Memory Layer.", color: "amber" },
              { q: "Pronto para EF-40.8?", a: "SIM", detail: "EF-40.8 implementa os 9 itens do grupo A e os 4 do grupo B.", color: "green" },
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
          <div className="bg-zinc-900 border border-zinc-800 rounded p-4 text-xs text-zinc-400">
            <div className="text-white font-bold mb-1">Proximo passo — EF-40.8 (9+4 itens, nao 13):</div>
            <div>UCME (9): sessionSummary provider, Project provider, ChatSession provider, Keyword provider, projectId filter, recency real, contrato de saida compativel.</div>
            <div className="mt-1">Planner (4): MemoryAdapter, trocar runMemoryPipeline(), garantir contrato.</div>
            <div className="mt-1 text-emerald-400">PromptBuilder: 0 itens. CapabilityOrchestrator: 0 itens.</div>
          </div>
        </div>

      </div>
    </div>
  );
}