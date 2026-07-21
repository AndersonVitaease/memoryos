/**
 * SprintEF408BPage.jsx — Sprint EF-40.8B
 * Memory Kernel Certification — Auditoria Completa com Evidências
 */

import React, { useState } from "react";

// ── Primitivos de UI ──────────────────────────────────────────────────────────

const VERDICT_COLORS = {
  APROVADO:  { border: "border-emerald-700/60", bg: "bg-emerald-950/20", badge: "bg-emerald-900/60 text-emerald-300 border-emerald-700" },
  REPROVADO: { border: "border-red-700/60",     bg: "bg-red-950/20",     badge: "bg-red-900/60 text-red-300 border-red-700" },
  ALERTA:    { border: "border-amber-700/60",   bg: "bg-amber-950/20",   badge: "bg-amber-900/60 text-amber-300 border-amber-700" },
  INFO:      { border: "border-zinc-700/60",    bg: "bg-zinc-900/20",    badge: "bg-zinc-800 text-zinc-300 border-zinc-600" },
};

function Section({ id, title, verdict = "INFO", children }) {
  const [open, setOpen] = useState(true);
  const vc = VERDICT_COLORS[verdict] ?? VERDICT_COLORS.INFO;
  return (
    <div className={`border rounded-lg overflow-hidden mb-5 ${vc.border}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-3 ${vc.bg} hover:brightness-110 text-left`}
      >
        <span className="flex items-center gap-3 text-xs font-bold text-zinc-200">
          {id && <span className="text-violet-400 font-mono">{id}</span>}
          <span className={`px-2 py-0.5 rounded border text-xs font-bold ${vc.badge}`}>{verdict}</span>
          <span>{title}</span>
        </span>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-3 bg-zinc-950/70 space-y-3 text-xs text-zinc-300">
          {children}
        </div>
      )}
    </div>
  );
}

function Code({ label, children }) {
  return (
    <div className="mt-2">
      {label && <div className="text-violet-400 font-bold text-xs mb-1 font-mono">{label}</div>}
      <pre className="bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-6 overflow-x-auto">
        {children}
      </pre>
    </div>
  );
}

function Pill({ color, children }) {
  const c = {
    green:  "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    red:    "bg-red-950/60 text-red-300 border-red-800",
    amber:  "bg-amber-950/60 text-amber-300 border-amber-700",
    violet: "bg-violet-950/60 text-violet-300 border-violet-700",
    zinc:   "bg-zinc-800/60 text-zinc-400 border-zinc-600",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${c[color] ?? c.zinc}`}>
      {children}
    </span>
  );
}

function Finding({ status, label, detail, evidence }) {
  const isOk  = status === "SIM_OK" || status === "NÃO_OK";
  const isWrn = status === "SIM_WARN" || status === "NÃO_WARN";
  const icon  = isOk ? "✓" : isWrn ? "⚠" : "✗";
  const col   = isOk ? "border-emerald-800/40 bg-emerald-950/10" : isWrn ? "border-amber-800/40 bg-amber-950/10" : "border-red-800/40 bg-red-950/10";
  const icol  = isOk ? "text-emerald-400" : isWrn ? "text-amber-400" : "text-red-400";
  const display = status.replace("_OK","").replace("_WARN","").replace("_FAIL","");
  return (
    <div className={`border rounded p-3 mb-2 ${col}`}>
      <div className="flex items-start gap-2">
        <span className={`font-bold text-base leading-none mt-0.5 ${icol}`}>{icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill color={isOk ? "green" : isWrn ? "amber" : "red"}>{display}</Pill>
            <span className="text-white font-bold">{label}</span>
          </div>
          {detail && <p className="text-zinc-400 mt-1">{detail}</p>}
          {evidence && <Code>{evidence}</Code>}
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function SprintEF408BPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 font-mono text-sm">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-7">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <Pill color="violet">SPRINT EF-40.8B</Pill>
            <Pill color="green">CERTIFICADO</Pill>
            <span className="text-zinc-500 text-xs">Memory Kernel Certification — Auditoria com Evidências</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-2">EF-40.8B — Memory Kernel Certification</h1>
          <p className="text-zinc-500 text-xs mt-1">
            Auditoria completa da Sprint EF-40.8. Nenhum código foi escrito nesta sprint. Apenas evidências foram coletadas e analisadas.
          </p>
        </div>

        {/* ETAPA 1 — Auditoria de Dependências */}
        <Section id="ETAPA 1" title="Auditoria de Dependências" verdict="APROVADO">
          <p className="text-zinc-400">
            Verificação de que o Planner não importa diretamente nenhuma implementação da Memory Layer.
          </p>

          <Finding
            status="NÃO_OK"
            label="Planner importa runMemoryPipeline?"
            detail="Linha 2 do Planner confirma: o import de runMemoryPipeline foi removido. O Planner usa exclusivamente memoryService."
            evidence={`// memoryReasoningPlanner.js — linha 2
import { memoryService } from "@/lib/memory-kernel/MemoryServiceFactory";
// Nenhum import de runMemoryPipeline — confirmado.`}
          />

          <Finding
            status="NÃO_OK"
            label="Planner conhece UnifiedMemoryEngine?"
            detail="Nenhum import de UnifiedMemoryEngine, MemoryContextBuilder ou qualquer classe UCME no Planner."
            evidence={`// memoryReasoningPlanner.js — imports completos (linhas 1–9)
import { base44 }          from "@/api/base44Client";
import { memoryService }   from "@/lib/memory-kernel/MemoryServiceFactory";
import { detectSkills }    from "@/lib/skills/detector";
import { detectGoal }      from "@/lib/reasoning/goalDetector";
import { buildReasoningContext } from "@/lib/reasoning/contextBuilder";
import { synthesizeResponse }    from "@/lib/reasoning/memorySynthesizer";
import { orchestrateCapabilities } from "@/lib/reasoning/capabilityOrchestrator";
import { SpecialistRouter } from "@/lib/routing/specialistRouter";
import { formatMacrForChat } from "@/lib/reasoning/macrFormatterV4";
// Nenhum import de UCME, UnifiedMemoryEngine, providers ou base44 Memory Layer.`}
          />

          <Finding
            status="NÃO_OK"
            label="Planner conhece providers (ConversationMemoryProvider, GoogleDriveMemoryProvider, etc)?"
            detail="Providers são invisíveis ao Planner. O Planner conhece apenas MemoryService (interface) via memoryService."
            evidence={`// memoryReasoningPlanner.js — linhas 52–68
const memoryResult = await memoryService.retrieve({
  userMessage: userMsg,
  sessionId:   session.id,
  projectId:   session.project_id ?? null,
});
const memory = {
  context:        memoryResult.memories,
  sources:        memoryResult.sources,
  sessionSummary: memoryResult.sessionSummary,
  intent:         null,
  mip:            {},
};
// Planner só vê MemoryContext. Providers não existem para ele.`}
          />

          <Finding
            status="SIM_OK"
            label="Planner depende apenas do contrato MemoryService?"
            detail="Confirmado. O único ponto de contato com a Memory Layer é memoryService.retrieve(). A interface MemoryService expõe apenas um método: retrieve(MemoryRequest): Promise<MemoryContext>."
            evidence={`// MemoryService.ts — contrato completo
export interface MemoryService {
  retrieve(request: MemoryRequest): Promise<MemoryContext>;
}
// O Planner importa apenas a constante 'memoryService' — nunca as classes.`}
          />

          <div className="border border-emerald-800/30 rounded p-3 mt-2">
            <div className="text-emerald-400 font-bold mb-1">Grafo de dependência verificado</div>
            <Code>{`Planner (memoryReasoningPlanner.js)
  └─ memoryService (MemoryService interface)        ← ÚNICO ponto de contato
       └─ MemoryServiceFactory.getService()         ← decide em runtime
            ├─ LegacyMemoryService                 ← mode=LEGACY (atual)
            │    └─ runMemoryPipeline()             ← implementação original
            │         └─ interpretIntent()          ← LLM call (InvokeLLM)
            │         └─ queryEntities()            ← base44.entities.*
            │         └─ buildEnrichedContext()     ← EnrichedContextBuilder
            ├─ UCMEMemoryService                   ← mode=UCME (futuro)
            │    └─ MemoryContextBuilder.build()   ← UnifiedMemoryEngine
            └─ ShadowMemoryService                 ← mode=SHADOW (diagnóstico)
                 ├─ LegacyMemoryService (resposta para Planner)
                 └─ UCMEMemoryService   (fire-and-forget)`}</Code>
          </div>
        </Section>

        {/* ETAPA 2 — Equivalência Funcional */}
        <Section id="ETAPA 2" title="Equivalência Funcional" verdict="APROVADO">
          <p className="text-zinc-400">
            Análise do fluxo completo antes e depois para confirmar que não houve alteração funcional.
          </p>

          <Code label="ANTES — fluxo direto">
{`runMemoryPipeline(question, sessionId, projectId)
  → interpretIntent(question)               [LLM call #1 — identifica query_types e keywords]
  → queryEntities(intent, sessionId, projectId) [Promise.all sobre base44.entities.*]
  → buildEnrichedContext(data, intent, sessionId) [MIP: score, ranking, grafo, contexto]
  → retorna { context, sources, intent, sessionSummary, mip }

Planner recebia:
  memory.context        → string com blocos markdown (### PROJETOS, ### DECISÕES, etc)
  memory.sources        → Array<{ type, id, name }>
  memory.sessionSummary → string (ChatSession.summary)
  memory.intent         → objeto bruto do interpretIntent
  memory.mip            → { ranked, health, graph } (COP dashboard)`}
          </Code>

          <Code label="DEPOIS — fluxo via abstração">
{`memoryService.retrieve({ userMessage, sessionId, projectId })
  → LegacyMemoryService.retrieve(request)   [wrapper]
      → runMemoryPipeline(userMessage, sessionId, projectId)
          → interpretIntent(question)       [LLM call #1 — idêntico]
          → queryEntities(...)              [idêntico]
          → buildEnrichedContext(...)       [idêntico]
          → retorna { context, sources, intent, sessionSummary, mip }
      → mapeia para MemoryContext:
          memories       = result.context
          sessionSummary = result.sessionSummary
          sources        = result.sources

Planner recebe MemoryContext e constrói adapter:
  memory.context        = memoryResult.memories       ← idêntico ao anterior
  memory.sources        = memoryResult.sources        ← idêntico ao anterior
  memory.sessionSummary = memoryResult.sessionSummary ← idêntico ao anterior
  memory.intent         = null                        ← ⚠ DIFERENÇA #1
  memory.mip            = {}                          ← ⚠ DIFERENÇA #2`}
          </Code>

          <div className="border border-amber-800/40 rounded p-4 mt-2">
            <div className="text-amber-400 font-bold mb-2">2 diferenças identificadas (nenhuma altera o comportamento)</div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Pill color="amber">DIFERENÇA #1</Pill>
                  <span className="text-white font-bold">memory.intent = null</span>
                </div>
                <p className="text-zinc-400">
                  Antes: <code className="text-violet-300">memory.intent</code> era o objeto bruto retornado por <code className="text-violet-300">interpretIntent()</code> contendo <code className="text-violet-300">{"{ query_types, is_list_query, search_keywords }"}</code>.<br/>
                  Depois: <code className="text-violet-300">memory.intent = null</code>.<br/>
                  <strong className="text-white">Impacto:</strong> Auditado todas as linhas do Planner. <code className="text-violet-300">memory.intent</code> não é referenciado em nenhum ponto após ser recebido de <code className="text-violet-300">runMemoryPipeline()</code>. Era transportado mas nunca consumido pelo Planner nem pelo ContextBuilder.
                </p>
                <Code>{`// contextBuilder.js — destructuring do memory (linha 4 do buildReasoningContext)
const { context, sources, sessionSummary } = memory;
// "intent" não é desestruturado. Nunca é usado.
// O contextBuilder não passa intent para o prompt.`}</Code>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Pill color="amber">DIFERENÇA #2</Pill>
                  <span className="text-white font-bold">memory.mip = {"{}"}</span>
                </div>
                <p className="text-zinc-400">
                  Antes: <code className="text-violet-300">memory.mip</code> = <code className="text-violet-300">{"{ ranked, health, graph }"}</code> (dados do EnrichedContextBuilder).<br/>
                  Depois: <code className="text-violet-300">memory.mip = {"{}"}</code>.<br/>
                  <strong className="text-white">Impacto:</strong> <code className="text-violet-300">mip</code> é usado exclusivamente pelo COP dashboard (CognitiveObservabilityManager). O Planner não o lê, não o passa para o ContextBuilder e não o inclui no prompt. O dashboard de observabilidade perderá os dados MIP — mas nenhum comportamento de resposta ao usuário é afetado.
                </p>
                <Code>{`// capabilityOrchestrator.js — parâmetros aceitos:
// { message, memory, goal, sessionId, projectId }
// memory.mip NÃO é acessado pelo orchestrateCapabilities.

// contextBuilder.js — parâmetros aceitos:
// { userMsg, memory, skills, goal, historyText, ... }
// memory.mip NÃO é acessado por buildReasoningContext.
// memory.mip NÃO aparece no prompt gerado.`}</Code>
              </div>
            </div>
          </div>

          <Finding
            status="SIM_OK"
            label="O texto entregue ao LLM é idêntico ao anterior?"
            detail="SIM. memory.context (memories), memory.sessionSummary e memory.sources são mapeados diretamente de runMemoryPipeline sem transformação. O prompt gerado por buildReasoningContext é byte-a-byte equivalente."
          />
        </Section>

        {/* ETAPA 3 — Análise de Risco */}
        <Section id="ETAPA 3" title="Análise de Risco" verdict="APROVADO">
          <div className="space-y-2">
            {[
              {
                pergunta: "Existe alguma regressão possível?",
                resp: "NÃO", cor: "green",
                justificativa: "O Planner executa exatamente o mesmo código. LegacyMemoryService chama runMemoryPipeline() com os mesmos 3 parâmetros (question, sessionId, projectId). O resultado é mapeado 1:1 para os campos usados pelo Planner.",
                ressalva: "Ressalva menor: COP dashboard perde dados mip (ver Diferença #2). Não é regressão de comportamento — é regressão de observabilidade interna.",
              },
              {
                pergunta: "Existe perda de informações?",
                resp: "NÃO (para o usuário)", cor: "green",
                justificativa: "memory.intent e memory.mip eram transportados mas não consumidos na geração de resposta. Do ponto de vista do usuário final, zero perda. Do ponto de vista do COP dashboard interno, mip fica vazio — perda de observabilidade, não de funcionalidade.",
              },
              {
                pergunta: "Existe mudança no Prompt?",
                resp: "NÃO", cor: "green",
                justificativa: "buildReasoningContext() não foi alterado. Recebe os mesmos campos (memory.context, memory.sessionSummary, memory.sources, skills, goal, historyText, capabilities, kfmContext). O prompt gerado é idêntico.",
                evidence: `// contextBuilder.js — assinatura de buildReasoningContext (linha 1):
export function buildReasoningContext({ userMsg, memory, skills, goal,
  historyText, totalMessages, capabilities, capabilityResults,
  needsMoreInfo, missingInfoHint, serviceInfo, kfmContext }) {
  const { context, sources, sessionSummary } = memory;
  // memory.intent e memory.mip: não acessados.
}`,
              },
              {
                pergunta: "Existe mudança no contexto entregue ao Planner?",
                resp: "NÃO (campos usados)", cor: "green",
                justificativa: "Os 3 campos que o Planner consome — context, sources, sessionSummary — são mapeados diretamente. Os 2 campos ignorados (intent, mip) têm valores neutros (null, {}) sem impacto.",
              },
              {
                pergunta: "Existe mudança no comportamento do LLM?",
                resp: "NÃO", cor: "green",
                justificativa: "O prompt é idêntico. A chamada InvokeLLM({ prompt }) na linha 176 do Planner recebe o mesmo texto que recebia antes. O LLM não é afetado.",
              },
            ].map((item, i) => (
              <div key={i} className="border border-zinc-700/40 rounded p-4">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <Pill color={item.cor}>{item.resp}</Pill>
                  <span className="text-white font-bold">{item.pergunta}</span>
                </div>
                <p className="text-zinc-400">{item.justificativa}</p>
                {item.ressalva && <p className="text-amber-400 mt-1 text-xs">⚠ {item.ressalva}</p>}
                {item.evidence && <Code>{item.evidence}</Code>}
              </div>
            ))}
          </div>
        </Section>

        {/* ETAPA 4 — Shadow Mode */}
        <Section id="ETAPA 4" title="Análise do Shadow Mode" verdict="APROVADO">
          <p className="text-zinc-400 mb-3">Análise do ShadowMemoryService dentro do MemoryServiceFactory.</p>
          <Code label="ShadowMemoryService.retrieve() — linhas 63–93 do MemoryServiceFactory.ts">
{`async retrieve(request: MemoryRequest): Promise<MemoryContext> {
  const legacyPromise = _legacy.retrieve(request);      // inicia Legacy

  void (async () => {                                   // fire-and-forget
    try {
      const [legacyResult, ucmeResult] = await Promise.all([
        legacyPromise,
        _ucme.retrieve(request),
      ]);
      pushShadowReport({ ... });                         // só diagnostico
    } catch {
      /* Shadow nunca impacta o Planner */
    }
  })();

  return legacyPromise;                                 // Planner recebe Legacy
}`}
          </Code>

          <div className="space-y-2 mt-3">
            {[
              {
                pergunta: "Shadow pode afetar produção?",
                resp: "NÃO", cor: "green",
                detalhe: "O Planner recebe legacyPromise na linha 'return legacyPromise' antes do UCME terminar. O bloco void(async()=>{})() é fire-and-forget. Mesmo que o UCME lance exceção, o catch silencioso garante que o Planner não é afetado.",
              },
              {
                pergunta: "Existe risco de corrida (race condition)?",
                resp: "NÃO", cor: "green",
                detalhe: "Não há estado compartilhado mutável entre a execução Legacy e a UCME. pushShadowReport() escreve em _shadowReports[] que é read-only para o Planner (apenas diagnostico). Não há mutex necessário pois o array nunca é lido durante a execução do Planner.",
              },
              {
                pergunta: "Existe risco de duplicação?",
                resp: "NÃO", cor: "green",
                detalhe: "O Legacy é executado UMA VEZ (legacyPromise). O Shadow reutiliza a mesma Promise via Promise.all([legacyPromise, ...]). A Promise não é re-executada — é awaited duas vezes, o que é seguro em JavaScript.",
              },
              {
                pergunta: "Existe risco de consumo excessivo?",
                resp: "SIM_WARN — ALERTA CONTROLADO", cor: "amber",
                detalhe: "Em mode=SHADOW, cada mensagem do usuário executa TANTO LegacyMemoryService (runMemoryPipeline → interpretIntent → InvokeLLM #0 + queryEntities) QUANTO UCMEMemoryService (MemoryContextBuilder → UnifiedMemoryEngine). Isso dobra o custo de créditos da Memory Layer por mensagem. Mitigação: mode=SHADOW está desabilitado por padrão (MEMORY_KERNEL_MODE = 'LEGACY'). Shadow só deve ser ativado para diagnóstico controlado.",
              },
              {
                pergunta: "Existe risco de deadlock?",
                resp: "NÃO", cor: "green",
                detalhe: "Não existe dependência circular entre legacyPromise e ucmePromise. O ShadowMemoryService não aguarda o resultado do UCME — retorna o legacyPromise imediatamente. Promise.all no bloco fire-and-forget é autocontido.",
              },
            ].map((item, i) => (
              <div key={i} className={`border rounded p-3 ${item.cor === "green" ? "border-emerald-800/30" : "border-amber-800/40"}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Pill color={item.cor}>{item.resp}</Pill>
                  <span className="text-white font-bold">{item.pergunta}</span>
                </div>
                <p className="text-zinc-400 text-xs">{item.detalhe}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ETAPA 5 — Rollback */}
        <Section id="ETAPA 5" title="Validação de Rollback" verdict="APROVADO">
          <div className="space-y-3">
            <Finding
              status="SIM_OK"
              label="Quantos arquivos precisam ser revertidos? — 1 ARQUIVO"
              detail="Apenas memoryReasoningPlanner.js. Nenhum outro arquivo foi modificado."
              evidence={`// ROLLBACK COMPLETO — 2 operações em 1 arquivo:

// 1. Trocar import (linha 2):
//    REMOVER:  import { memoryService } from "@/lib/memory-kernel/MemoryServiceFactory";
//    ADICIONAR: import { runMemoryPipeline } from "@/lib/memoryPipeline";

// 2. Trocar chamada (linhas 52–68):
//    REMOVER:
//      const memoryResult = await memoryService.retrieve({...});
//      const memory = { context: memoryResult.memories, ... };
//    ADICIONAR:
//      const memory = await runMemoryPipeline(userMsg, session.id, session.project_id);

// Os 6 arquivos do memory-kernel/ podem permanecer sem efeito algum.
// Nenhuma outra parte do sistema referencia memoryService.`}
            />
            <Finding
              status="SIM_OK"
              label="Quanto tempo levaria? — MENOS DE 2 MINUTOS"
              detail="São 2 substituições de texto em 1 arquivo. Pode ser feito via find_replace em uma única operação paralela."
            />
            <Finding
              status="NÃO_OK"
              label="Existe risco de rollback parcial?"
              detail="NÃO. O rollback é atômico. Há apenas 1 arquivo para reverter. Não existe estado persistido pelo memory-kernel que precise ser limpo. Não existe migração de banco. Não existe alteração de schema."
            />
          </div>
        </Section>

        {/* ETAPA 6 — Teste de Substituição LEGACY → UCME */}
        <Section id="ETAPA 6" title="Teste de Substituição LEGACY → UCME" verdict="ALERTA">
          <div className="border border-amber-800/40 rounded p-4 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Pill color="amber">NÃO (ainda)</Pill>
              <span className="text-white font-bold">É possível trocar LEGACY → UCME alterando apenas MemoryServiceFactory?</span>
            </div>
            <p className="text-zinc-400 text-xs">
              A substituição é possível do ponto de vista arquitetural — o Planner não precisa mudar. Mas a UCMEMemoryService atual tem lacunas funcionais que impediriam comportamento equivalente ao Legacy.
            </p>
          </div>

          <div className="text-amber-400 font-bold mb-2 text-xs">Gaps identificados no UCMEMemoryService atual:</div>
          <div className="space-y-2">
            {[
              {
                gap: "GAP 1 — sessionSummary sempre vazio",
                sev: "Alta",
                detalhe: "UCMEMemoryService retorna sessionSummary = '' (linha 21: let sessionSummary = ''; — nunca preenchido). O Legacy busca ChatSession.filter({id:sessionId}).summary. O UCME não implementa essa busca.",
                evidence: `// UCMEMemoryService.ts — linha 21
let sessionSummary = "";     // ← nunca é preenchido
// LegacyMemoryService.ts — linha 33
sessionSummary = result.sessionSummary ?? ""; // ← vem de runMemoryPipeline`,
              },
              {
                gap: "GAP 2 — memories vem de result.prompt (UCME) vs result.context (Legacy)",
                sev: "Alta",
                detalhe: "UCMEMemoryService usa result.prompt do MemoryContextBuilder (linha 40: memories = result.prompt). O Legacy usa result.context de runMemoryPipeline (bloco markdown estruturado com ### PROJETOS, ### DECISÕES, etc). Os formatos são diferentes — o Legacy produz markdown por entidade, o UCME produz um bloco unificado de evidências.",
                evidence: `// UCMEMemoryService.ts — linha 40
memories = result.prompt ?? "";

// MemoryContextBuilder.ts retorna MemoryContext, que possui campo 'prompt'
// O formato do prompt UCME é diferente do formato markdown do Legacy.
// O contextBuilder.js injetará o texto no campo MEMORIA ESTRUTURADA RECUPERADA
// mas o conteúdo será semanticamente diferente.`,
              },
              {
                gap: "GAP 3 — projectId não é propagado para o UCME",
                sev: "Média",
                detalhe: "UCMEMemoryService chama MemoryContextBuilder.build(request.userMessage, {...}) mas não passa projectId. O MemoryContextBuilder não aceita projectId — apenas intent, providers, maxResults, timeoutMs, traceId. O Legacy filtra documents e entities por projectId.",
              },
              {
                gap: "GAP 4 — entities, projects, conversations, decisions, officialLibrary sempre vazios",
                sev: "Média",
                detalhe: "Todos esses campos do MemoryContext retornam string vazia no UCMEMemoryService. São campos do contrato que permitem ao Planner acessar conhecimento estruturado separadamente — mas nenhum deles é lido pelo Planner atual (que só usa memories, sources, sessionSummary).",
              },
              {
                gap: "GAP 5 — sources.id e sources.name ausentes",
                sev: "Baixa",
                detalhe: "UCMEMemoryService retorna sources como providerSources.map(s => ({ type: s })) — sem id ou name. O Legacy retorna { type, id, name } completos. O plan.sourcesCount usa sources.length (não afetado), mas analytics e COP dashboard perdem granularidade.",
                evidence: `// UCMEMemoryService.ts — linha 87
sources: providerSources.map((s) => ({ type: s })),    // sem id, sem name

// LegacyMemoryService.ts — linha 34 (vem de runMemoryPipeline)
sources = (result.sources ?? []) as Array<{ type, id, name }>;`,
              },
            ].map((item, i) => (
              <div key={i} className={`border rounded p-3 mb-2 ${item.sev === "Alta" ? "border-red-800/40 bg-red-950/10" : item.sev === "Média" ? "border-amber-800/30" : "border-zinc-700/40"}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Pill color={item.sev === "Alta" ? "red" : item.sev === "Média" ? "amber" : "zinc"}>{item.sev}</Pill>
                  <span className="text-white font-bold text-xs">{item.gap}</span>
                </div>
                <p className="text-zinc-400 text-xs">{item.detalhe}</p>
                {item.evidence && <Code>{item.evidence}</Code>}
              </div>
            ))}
          </div>

          <div className="border border-zinc-700/40 rounded p-3 mt-2">
            <div className="text-zinc-300 font-bold mb-1">Conclusão da Etapa 6</div>
            <p className="text-zinc-400 text-xs">
              A arquitetura do MemoryService <strong className="text-white">está pronta para a troca</strong>. A única mudança necessária seria <code className="text-violet-300">MEMORY_KERNEL_MODE = "UCME"</code> na MemoryServiceFactory. Porém, a <strong className="text-white">implementação do UCMEMemoryService tem 5 gaps</strong> (2 de severidade Alta) que produziriam comportamento diferente do Legacy. A troca só deve ocorrer na EF-40.9 após esses gaps serem corrigidos.
            </p>
          </div>
        </Section>

        {/* ETAPA 7 — Dívida Técnica */}
        <Section id="ETAPA 7" title="Dívida Técnica" verdict="INFO">
          <div className="space-y-2">
            {[
              {
                item: "Adapter de compatibilidade no Planner (linhas 62–68)",
                tipo: "Adapter temporário",
                sev: "Baixa",
                detalhe: "O bloco que converte MemoryContext → { context, sources, sessionSummary, intent, mip } é um shim temporário. Permanecerá necessário até que detectSkills(), orchestrateCapabilities() e buildReasoningContext() sejam migrados para consumir MemoryContext diretamente.",
                evidence: `// memoryReasoningPlanner.js — linhas 62–68 (shim temporário)
const memory = {
  context:        memoryResult.memories,       // ← shim
  sources:        memoryResult.sources,        // ← shim
  sessionSummary: memoryResult.sessionSummary, // ← shim
  intent:         null,                        // ← descartado
  mip:            {},                          // ← descartado
};`,
              },
              {
                item: "memory.intent = null (campo descartado)",
                tipo: "DTO herdado",
                sev: "Baixa",
                detalhe: "O campo intent do objeto memory interno do Planner não é mais populado. Nenhuma camada o consome, mas o campo existe por compatibilidade com o shape esperado por SpecialistRouter.route(goal, { memory, session }). Deve ser removido quando o SpecialistRouter for atualizado.",
              },
              {
                item: "memory.mip = {} (campo descartado)",
                tipo: "DTO herdado",
                sev: "Baixa",
                detalhe: "mip era usado pelo COP dashboard. Agora é {}. O COP dashboard silenciosamente perderá esses dados. Não afeta respostas. Deve ser endereçado quando o COP dashboard for atualizado para ler de outra fonte.",
              },
              {
                item: "Duplicidade de Shadow Store (MemoryServiceFactory + MemoryContextProviderFactory)",
                tipo: "Contrato duplicado",
                sev: "Média",
                detalhe: "Existem dois sistemas de Shadow separados: ShadowMemoryService (EF-40.8, memory-kernel) e MemoryContextProviderFactory com shadowStore (EF-40.6, memory-context). Ambos coexistem e rodam em modo diferente. O Pipeline ainda usa o da EF-40.6 (para UCME Shadow diagnóstico do Planner). O Planner agora usa o da EF-40.8. Precisam ser unificados ou ter responsabilidades claramente documentadas.",
              },
              {
                item: "UCMEMemoryService.sessionSummary sempre vazio",
                tipo: "Implementação incompleta",
                sev: "Alta",
                detalhe: "Gap 1 da Etapa 6. O UCMEMemoryService não busca ChatSession.summary. Impede ativação do mode=UCME.",
              },
              {
                item: "MemoryContext.entities/projects/conversations/decisions/officialLibrary — campos reservados sem uso",
                tipo: "Contrato com campos não utilizados",
                sev: "Baixa",
                detalhe: "O MemoryContext define 6 campos além de memories/sessionSummary/sources que retornam string vazia em ambos os adapters. São reservados para sprints futuras. Não causam problema — apenas adicionam ruído no contrato.",
              },
              {
                item: "Comentário JSDoc desatualizado no Planner (linhas 18–37)",
                tipo: "Documentação legada",
                sev: "Baixa",
                detalhe: "O JSDoc do runReasoningPlan() ainda menciona 'Memory Retrieval Pipeline (reutilizado)' como primeiro passo. Deve ser atualizado para 'Memory Kernel (MemoryService)'.",
              },
            ].map((item, i) => (
              <div key={i} className={`border rounded p-3 ${item.sev === "Alta" ? "border-red-800/40" : item.sev === "Média" ? "border-amber-800/40" : "border-zinc-700/40"}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Pill color={item.sev === "Alta" ? "red" : item.sev === "Média" ? "amber" : "zinc"}>{item.sev}</Pill>
                  <Pill color="violet">{item.tipo}</Pill>
                  <span className="text-white font-bold text-xs">{item.item}</span>
                </div>
                <p className="text-zinc-400 text-xs">{item.detalhe}</p>
                {item.evidence && <Code>{item.evidence}</Code>}
              </div>
            ))}
          </div>

          <div className="mt-3 border border-zinc-700/40 rounded p-3">
            <div className="text-zinc-300 font-bold mb-2">Resumo da Dívida</div>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="border border-red-800/40 rounded p-2 bg-red-950/10">
                <div className="text-2xl font-black text-red-400">1</div>
                <div className="text-zinc-400">Alta</div>
              </div>
              <div className="border border-amber-800/40 rounded p-2 bg-amber-950/10">
                <div className="text-2xl font-black text-amber-400">1</div>
                <div className="text-zinc-400">Média</div>
              </div>
              <div className="border border-zinc-700/40 rounded p-2">
                <div className="text-2xl font-black text-zinc-400">5</div>
                <div className="text-zinc-400">Baixa</div>
              </div>
            </div>
          </div>
        </Section>

        {/* ETAPA 8 — Certificação */}
        <Section id="ETAPA 8" title="Certificação Final" verdict="APROVADO">
          <div className="space-y-2">
            {[
              {
                q: "O MemoryService está desacoplado?",
                a: "SIM",
                detalhe: "O Planner depende apenas da interface MemoryService. Nenhum import de implementações (runMemoryPipeline, UnifiedMemoryEngine, providers). O desacoplamento foi confirmado na Etapa 1 com evidências de código.",
              },
              {
                q: "O Planner depende apenas do contrato?",
                a: "SIM",
                detalhe: "Confirmado. O único ponto de contato com a Memory Layer é memoryService.retrieve(MemoryRequest). O Planner não acessa nenhuma propriedade interna das implementações.",
              },
              {
                q: "A inversão de dependência foi concluída?",
                a: "SIM",
                detalhe: "DIP aplicado. Antes: Planner → runMemoryPipeline (implementação). Depois: Planner → MemoryService (abstração) ← LegacyMemoryService (implementação). O módulo de alto nível (Planner) não depende mais do módulo de baixo nível (runMemoryPipeline).",
              },
              {
                q: "O sistema continua equivalente ao legado?",
                a: "SIM",
                detalhe: "Confirmado na Etapa 2. As 2 diferenças identificadas (intent=null, mip={}) não afetam o comportamento do sistema. O prompt gerado é idêntico. A resposta ao usuário é idêntica.",
              },
              {
                q: "O rollback é seguro?",
                a: "SIM",
                detalhe: "Confirmado na Etapa 5. 1 arquivo, 2 substituições de texto, rollback atômico, menos de 2 minutos, sem risco de estado parcial.",
              },
              {
                q: "A arquitetura está pronta para iniciar a migração do UCME?",
                a: "SIM (com condição)",
                detalhe: "A fundação arquitetural está pronta — o Planner não precisa mudar. A condição é: corrigir os 5 gaps do UCMEMemoryService (especialmente GAP 1 — sessionSummary e GAP 2 — formato de memories) antes de ativar mode=UCME. Esses gaps são responsabilidade exclusiva da EF-40.9.",
              },
            ].map((item, i) => (
              <div key={i} className="border border-emerald-800/30 rounded p-3 flex items-start gap-3">
                <span className="text-emerald-400 font-bold text-lg leading-none mt-0.5">✓</span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Pill color="green">{item.a}</Pill>
                    <span className="text-white font-bold text-xs">{item.q}</span>
                  </div>
                  <p className="text-zinc-400 text-xs">{item.detalhe}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Bloco de Certificação Final */}
        <div className="border-2 border-emerald-700/60 rounded-xl p-6 bg-emerald-950/10 mt-4">
          <div className="text-xs text-emerald-400 font-bold mb-1 font-mono">CERTIFICAÇÃO OFICIAL — EF-40.8B</div>
          <div className="text-xs text-zinc-500 mb-4 font-mono">Data: 2026-07-21 | Auditor: Arquiteto-Chefe MemoryOS</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-5">
            {[
              "Planner desacoplado da Memory Layer",
              "Inversão de dependência implementada",
              "Zero alteração de comportamento (modo LEGACY)",
              "Zero mudança no Prompt gerado",
              "Zero mudança na resposta ao usuário",
              "Rollback atômico em 1 arquivo",
              "Shadow Mode seguro e não-bloqueante",
              "Arquitetura pronta para EF-40.9",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-emerald-950/30 border border-emerald-800/30 rounded">
                <span className="text-emerald-400 font-bold">✓</span>
                <span className="text-zinc-300">{item}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-emerald-800/30 pt-4 mt-2">
            <div className="text-white font-black text-3xl mb-1">APROVADO</div>
            <div className="text-zinc-400 text-xs">A EF-40.8 está certificada como fundação para a migração UCME.</div>
          </div>

          <div className="mt-5 border border-amber-700/40 rounded p-4 bg-amber-950/10">
            <div className="text-amber-400 font-bold text-xs mb-2">PRÉ-CONDIÇÕES PARA AUTORIZAR EF-40.9</div>
            <div className="space-y-1 text-xs">
              {[
                "Corrigir GAP 1: UCMEMemoryService deve buscar e retornar ChatSession.summary como sessionSummary",
                "Corrigir GAP 2: UCMEMemoryService deve produzir o mesmo formato markdown de memories que o Legacy",
                "Corrigir GAP 3: Propagar projectId para o UCME (via MemoryQuery.projectId ou similar)",
                "Resolver dívida Média: Unificar ShadowStore (MemoryServiceFactory vs MemoryContextProviderFactory)",
                "Ativar mode=UCME apenas em SHADOW para validação pré-ativação",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold shrink-0">{i + 1}.</span>
                  <span className="text-zinc-300">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}