import { base44 } from "@/api/base44Client";
import { memoryService } from "@/lib/memory-kernel/MemoryServiceFactory";
import { detectSkills } from "@/lib/skills/detector";
import { detectGoal } from "@/lib/reasoning/goalDetector";
import { buildReasoningContext } from "@/lib/reasoning/contextBuilder";
import { synthesizeResponse } from "@/lib/reasoning/memorySynthesizer";
import { orchestrateCapabilities } from "@/lib/reasoning/capabilityOrchestrator";
import { SpecialistRouter } from "@/lib/routing/specialistRouter";
import { formatMacrForChat } from "@/lib/reasoning/macrFormatterV4";

/**
 * Memory Reasoning Planner (MRP)
 *
 * Camada de orquestração da inteligência do MemoryOS.
 *
 * Fluxo oficial (MAS):
 *   Usuário
 *     → Memory Retrieval Pipeline (reutilizado)
 *     → Memory Reasoning Planner (esta camada)
 *       → Goal Detector
 *       → Specialist Router (decide qual Specialist, se houver)
 *         → Specialist Registry (consulta, NÃO imports diretos)
 *         → Specialist (executa pipeline próprio, retorna resultado)
 *       → Capability Orchestrator (decide e executa capacidades)
 *       → Context-Aware Skills Engine (reutilizada)
 *       → Context Builder (inclui resultados das capacidades)
 *     → LLM (UMA ÚNICA CHAMADA — apenas se nenhum Specialist assumiu)
 *     → Memory Synthesizer
 *     → Resposta Final
 *
 * Princípios:
 * - O Planner PENSA, não responde. Monta o melhor contexto possível.
 * - O Planner NUNCA conhece Specialists diretamente — apenas o Specialist Router.
 * - UMA chamada ao LLM por resposta. Nunca uma chamada por especialista.
 * - Especialistas são camadas de conhecimento, não agentes independentes.
 * - O usuário nunca percebe quantos componentes participaram.
 * - Reutiliza contexto já recuperado — sem consultas repetidas.
 * - Escalabilidade: novo Specialist = registrar no Registry. Nada mais muda.
 *
 * @param {Object} params
 * @param {string} params.userMsg - Mensagem do usuário
 * @param {Object} params.session - Sessão ativa { id, project_id, title, summary }
 * @param {Array} params.historyMessages - Mensagens anteriores (para histórico)
 * @param {Function} params.setPhase - Callback de fase opcional (para Voice Pipeline)
 * @returns {Object} { response, plan }
 *   - response: resposta final sintetizada
 *   - plan: metadados do raciocínio (objetivo, especialistas, estratégia, tempo)
 */
export async function runReasoningPlan({ userMsg, session, historyMessages = [], setPhase, kfmContext }) {
  const startTime = Date.now();

  // === ETAPA 1: MEMORY KERNEL ===
  // O Planner conhece apenas MemoryService — nunca a implementacao subjacente.
  // A escolha de implementacao (Legacy/UCME/Shadow) e responsabilidade do MemoryServiceFactory.
  setPhase?.("retrieving");
  const memoryResult = await memoryService.retrieve({
    userMessage: userMsg,
    sessionId:   session.id,
    projectId:   session.project_id ?? null,
  });
  // Adapta MemoryContext ao contrato que o restante do Planner ja conhece
  const memory = {
    context:        memoryResult.memories,
    sources:        memoryResult.sources,
    sessionSummary: memoryResult.sessionSummary,
    intent:         null,
    mip:            {},
  };

  // === ETAPA 2: CONTEXT-AWARE SKILLS ENGINE ===
  // Seleciona especialistas com base na mensagem + memória recuperada.
  const { context, sources, sessionSummary } = memory;
  const skills = detectSkills(userMsg, { sessionSummary, context, sources });

  // === ETAPA 3: GOAL DETECTION ===
  // Identifica qual problema o usuário está tentando resolver.
  const goal = detectGoal(userMsg);

  // === ETAPA 3.5: SPECIALIST ROUTING ===
  // O Planner NÃO conhece Specialists diretamente.
  // O Specialist Router consulta o Registry e decide qual Specialist utilizar.
  // Se um Specialist for encontrado, ele executa seu próprio pipeline e retorna
  // o resultado — o LLM genérico do chat NÃO é chamado.
  // Conformidade: MAS §4.3 (Specialists), MES §18 (Interface Oficial).
  const routing = SpecialistRouter.route(goal, { memory, session });
  if (routing && routing.specialist) {
    setPhase?.("analyzing");
    try {
      const result = await routing.specialist.analyze({
        scope: { level: "project" },
        onStage: (stage) => {
          if (stage === "done") setPhase?.("generating");
          else setPhase?.(stage);
        },
      });
      const response = formatMacrForChat(result.macr, result.metadata);
      const responseTimeMs = Date.now() - startTime;
      const plan = {
        goal: goal.id,
        goalLabel: goal.label,
        strategy: goal.strategy,
        specialist: routing.specialist.id,
        specialistVersion: routing.specialist.version,
        routingConfidence: routing.confidence,
        routingReason: routing.reason,
        skills: [],
        skillsCount: 0,
        sourcesCount: 0,
        contextLength: 0,
        capabilities: [],
        capabilitiesCount: 0,
        needsMoreInfo: false,
        service: null,
        responseTimeMs,
        routedToSpecialist: true,
      };
      try {
        base44.analytics.track({
          eventName: "mrp_specialist_routed",
          properties: {
            specialist: routing.specialist.id,
            specialist_version: routing.specialist.version,
            routing_confidence: routing.confidence,
            response_time_ms: responseTimeMs,
          },
        });
      } catch {
        // analytics é opcional
      }
      return { response, plan, sources: [] };
    } catch (err) {
      // Em caso de falha no Specialist, informa o usuário — NÃO cai para o LLM genérico.
      const response = `## ⚠️ ${routing.specialist.name} — Erro\n\nNão foi possível concluir a execução através do Specialist oficial.\n\n**Erro:** ${err.message || "Falha desconhecida"}\n\nO Specialist foi invocado pelo Specialist Router, mas encontrou um problema durante a execução. Tente novamente.`;
      return { response, plan: { goal: goal.id, specialist: routing.specialist.id, error: err.message }, sources: [] };
    }
  }

  // === ETAPA 4: CAPABILITY ORCHESTRATOR ===
  // Decide e executa capacidades: web search, cálculo determinístico, documentos.
  // Resultados são injetados no Context Builder — NÃO chamam o LLM para responder.
  const capabilityResult = await orchestrateCapabilities({
    message: userMsg,
    memory,
    goal,
    sessionId: session.id,
    projectId: session.project_id,
  });

  // === ETAPA 5: CONTEXT BUILDER ===
  // Monta um único contexto estruturado com: memória, especialistas, objetivo,
  // estratégia e resultados das capacidades executadas.
  // IA-022: limitado às últimas 20 mensagens — sem limite, conversas longas
  // reenviavam o histórico bruto inteiro (ex: 154 mensagens) a cada resposta,
  // fazendo o modelo "continuar" narrativas antigas mesmo depois de corrigidas.
  // O session.summary (memory.sessionSummary, já incluído acima) é quem deve
  // cobrir o contexto mais distante — esse é o próprio propósito dele.
  const _recentHistory = historyMessages.slice(-20);
  const historyText = _recentHistory
    .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
    .join("\n\n");
  const totalMessages = historyMessages.length;

  const prompt = buildReasoningContext({
    userMsg,
    memory,
    skills,
    goal,
    historyText,
    totalMessages,
    capabilities: capabilityResult.capabilities,
    capabilityResults: capabilityResult.capabilityResults,
    needsMoreInfo: capabilityResult.needsMoreInfo,
    missingInfoHint: capabilityResult.missingInfoHint,
    serviceInfo: capabilityResult.serviceInfo,
    kfmContext,
  });

  // === ETAPA 6: UMA ÚNICA CHAMADA AO LLM ===
  // Todos os especialistas, memória, objetivo, estratégia e resultados de capacidades
  // estão neste único prompt. O LLM nunca é chamado por capacidade ou especialista.
  setPhase?.("generating");
  const rawResponse = await base44.integrations.Core.InvokeLLM({ prompt });

  // === ETAPA 6.5: TRAVA DETERMINÍSTICA CONTRA CONFABULAÇÃO DE DOCUMENTO (IA-032) ===
  // Diferente dos princípios 8-11 (que são PEDIDOS em texto no prompt — e provaram
  // não ser suficientes sozinhos), esta é uma verificação de CÓDIGO, feita depois
  // que o LLM já respondeu. Ela não depende do modelo "se comportar": procura por
  // frases que indicam "finjo ter processado um documento" e, se nenhuma leitura
  // real de documento aconteceu neste turno (capabilityResult.capabilityResults
  // não tem officialLibrary com dado real), descarta a resposta do LLM e usa uma
  // mensagem honesta fixa no lugar — garantida, não uma sugestão.
  const _rawText = typeof rawResponse === "string" ? rawResponse : String(rawResponse);
  const _hadRealDocumentRead = Boolean(
    capabilityResult.capabilityResults?.officialLibrary?.selectedDocs?.length > 0
  );
  const _FAKE_DOCUMENT_MARKERS = [
    "processando documento", "análise concluída", "analise concluida",
    "documento está íntegro", "documento esta integro",
    "extraí as informações", "extrai as informacoes",
    "extraí os dados", "extrai os dados",
    "dados extraídos", "dados extraidos",
    "documento foi localizado", "iniciando acesso ao documento",
    "conteúdo do arquivo processado", "conteudo do arquivo processado",
  ];
  const _looksLikeFakeDocumentClaim = _FAKE_DOCUMENT_MARKERS.some((marker) =>
    _rawText.toLowerCase().includes(marker)
  );
  const _finalRawResponse = (_looksLikeFakeDocumentClaim && !_hadRealDocumentRead)
    ? "Ainda não consegui ler o conteúdo real desse arquivo — não tenho um resultado de leitura confirmado para ele agora. Se quiser, você pode anexar o arquivo diretamente aqui na conversa, que eu leio na hora, ou me pedir para tentar abrir/baixar ele pelo Drive."
    : _rawText;

  // === ETAPA 7: MEMORY SYNTHESIZER ===
  // Síntese determinística (sem LLM): elimina repetições, melhora fluidez.
  const response = synthesizeResponse(_finalRawResponse);

  const responseTimeMs = Date.now() - startTime;

  // === ETAPA 8: REGISTRO DE RACIOCÍNIO (APRENDIZADO) ===
  // Metadados para otimização futura. Lightweight, não bloqueia a resposta.
  const activeCapabilities = Object.entries(capabilityResult.capabilities || {})
    .filter(([_, active]) => active)
    .map(([cap]) => cap);

  const plan = {
    goal: goal.id,
    goalLabel: goal.label,
    strategy: goal.strategy,
    skills: skills.map((s) => ({ id: s.id, name: s.name, score: s.score })),
    skillsCount: skills.length,
    sourcesCount: sources.length,
    contextLength: context ? context.length : 0,
    capabilities: activeCapabilities,
    capabilitiesCount: activeCapabilities.length,
    needsMoreInfo: capabilityResult.needsMoreInfo,
    service: capabilityResult.serviceInfo?.name || null,
    responseTimeMs,
  };

  try {
    base44.analytics.track({
      eventName: "mrp_reasoning_executed",
      properties: {
        goal: plan.goal,
        skills_count: plan.skillsCount,
        skill_ids: plan.skills.map((s) => s.id).join(",") || null,
        sources_count: plan.sourcesCount,
        capabilities: activeCapabilities.join(",") || null,
        capabilities_count: plan.capabilitiesCount,
        needs_more_info: plan.needsMoreInfo,
        service: plan.service,
        response_time_ms: plan.responseTimeMs,
      },
    });
  } catch {
    // analytics é opcional — nunca bloqueia a resposta
  }

  return { response, plan, sources };
}
