import { base44 } from "@/api/base44Client";
import { runMemoryPipeline } from "@/lib/memoryPipeline";
import { detectSkills } from "@/lib/skills/detector";
import { detectGoal } from "@/lib/reasoning/goalDetector";
import { buildReasoningContext } from "@/lib/reasoning/contextBuilder";
import { synthesizeResponse } from "@/lib/reasoning/memorySynthesizer";
import { orchestrateCapabilities } from "@/lib/reasoning/capabilityOrchestrator";
import architectureAuditor from "@/lib/specialists/architectureAuditor";
import { formatMacrForChat } from "@/lib/reasoning/macrFormatter";

/**
 * Memory Reasoning Planner (MRP)
 *
 * Camada de orquestração da inteligência do MemoryOS.
 *
 * Fluxo:
 *   Usuário
 *     → Memory Retrieval Pipeline (reutilizado)
 *     → Memory Reasoning Planner (esta camada)
 *       → Capability Orchestrator (decide e executa capacidades)
 *       → Context-Aware Skills Engine (reutilizada)
 *       → Goal Detector
 *       → Context Builder (inclui resultados das capacidades)
 *     → LLM (UMA ÚNICA CHAMADA)
 *     → Memory Synthesizer
 *     → Resposta Final
 *
 * Princípios:
 * - O Planner PENSA, não responde. Monta o melhor contexto possível.
 * - UMA chamada ao LLM por resposta. Nunca uma chamada por especialista.
 * - Especialistas são camadas de conhecimento, não agentes independentes.
 * - O usuário nunca percebe quantos componentes participaram.
 * - Reutiliza contexto já recuperado — sem consultas repetidas.
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
export async function runReasoningPlan({ userMsg, session, historyMessages = [], setPhase }) {
  const startTime = Date.now();

  // === ETAPA 1: MEMORY RETRIEVAL PIPELINE ===
  // Reutiliza o pipeline existente — consulta todo o banco uma única vez.
  setPhase?.("retrieving");
  const memory = await runMemoryPipeline(userMsg, session.id, session.project_id);

  // === ETAPA 2: CONTEXT-AWARE SKILLS ENGINE ===
  // Seleciona especialistas com base na mensagem + memória recuperada.
  const { context, sources, sessionSummary } = memory;
  const skills = detectSkills(userMsg, { sessionSummary, context, sources });

  // === ETAPA 3: GOAL DETECTION ===
  // Identifica qual problema o usuário está tentando resolver.
  const goal = detectGoal(userMsg);

  // === ETAPA 3.5: SPECIALIST ROUTING ===
  // Se o objetivo é auditoria arquitetural, delega ao Architecture Auditor
  // Specialist oficial. O Specialist executa seu próprio pipeline (com seu
  // próprio AIProvider) e retorna o MACR — o LLM genérico do chat NÃO é chamado.
  // Isto garante conformidade com MAS §4.3 (Specialists são oficiais e estáveis).
  if (goal.id === "audit_architecture") {
    setPhase?.("analyzing");
    try {
      const result = await architectureAuditor.analyze({
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
        specialist: architectureAuditor.id,
        specialistVersion: architectureAuditor.version,
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
            specialist: architectureAuditor.id,
            specialist_version: architectureAuditor.version,
            response_time_ms: responseTimeMs,
          },
        });
      } catch {
        // analytics é opcional
      }
      return { response, plan, sources: [] };
    } catch (err) {
      // Em caso de falha no Specialist, informa o usuário — NÃO cai para o LLM genérico.
      const response = `## ⚠️ Auditoria Arquitetural — Erro\n\nNão foi possível concluir a auditoria através do Architecture Auditor Specialist.\n\n**Erro:** ${err.message || "Falha desconhecida"}\n\nO Specialist oficial foi invocado, mas encontrou um problema durante a execução do pipeline (ProjectReader → OfficialLibraryReader → CodeAnalyzer → ReportBuilder). Tente novamente.`;
      return { response, plan: { goal: goal.id, specialist: architectureAuditor.id, error: err.message }, sources: [] };
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
  const historyText = historyMessages
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
  });

  // === ETAPA 6: UMA ÚNICA CHAMADA AO LLM ===
  // Todos os especialistas, memória, objetivo, estratégia e resultados de capacidades
  // estão neste único prompt. O LLM nunca é chamado por capacidade ou especialista.
  setPhase?.("generating");
  const rawResponse = await base44.integrations.Core.InvokeLLM({ prompt });

  // === ETAPA 7: MEMORY SYNTHESIZER ===
  // Síntese determinística (sem LLM): elimina repetições, melhora fluidez.
  const response = synthesizeResponse(
    typeof rawResponse === "string" ? rawResponse : String(rawResponse)
  );

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