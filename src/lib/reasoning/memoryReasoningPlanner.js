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
  setPhase?.("retrieving");
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

  // === ETAPA 2: CONTEXT-AWARE SKILLS ENGINE ===
  const { context, sources, sessionSummary } = memory;
  const skills = detectSkills(userMsg, { sessionSummary, context, sources });

  // === ETAPA 3: GOAL DETECTION ===
  const goal = detectGoal(userMsg);

  // === ETAPA 3.5: SPECIALIST ROUTING ===
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
      const response = `## ⚠️ ${routing.specialist.name} — Erro\n\nNão foi possível concluir a execução através do Specialist oficial.\n\n**Erro:** ${err.message || "Falha desconhecida"}\n\nO Specialist foi invocado pelo Specialist Router, mas encontrou um problema durante a execução. Tente novamente.`;
      return { response, plan: { goal: goal.id, specialist: routing.specialist.id, error: err.message }, sources: [] };
    }
  }

  // === ETAPA 4: CAPABILITY ORCHESTRATOR ===
  const capabilityResult = await orchestrateCapabilities({
    message: userMsg,
    memory,
    goal,
    sessionId: session.id,
    projectId: session.project_id,
  });

  // === ETAPA 5: CONTEXT BUILDER ===
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

  // === ETAPA 5.4: ROTEADOR SEMÂNTICO DE AÇÕES DO DRIVE (IA-040) ===
  // Generaliza o IA-035: em vez de só reconhecer "pedido de conteúdo de
  // arquivo", agora reconhece QUALQUER ação de Drive (listar, abrir pasta,
  // baixar, ler conteúdo) por COMPREENSÃO DA FRASE, não por lista de
  // palavras-chave — e, quando reconhece, EXECUTA a ação de verdade aqui
  // mesmo, incluindo uma capacidade que não existia antes (abrir uma pasta
  // específica e mostrar o que tem dentro). Isso só roda quando nada mais
  // (GoalRegistry, Producer B) já resolveu a mensagem — é a rede de
  // segurança semântica final, não uma substituição do sistema existente.
  async function _classifyDriveAction(message) {
    try {
      return await base44.integrations.Core.InvokeLLM({
        prompt: `O usuário disse: "${message}"

O usuário está conversando com o MemoryOS, um assistente conectado ao Google Drive. Determine se essa mensagem é um pedido de ação relacionada ao Drive, e qual ação exatamente.

Ações possíveis:
- "list_root": listar os arquivos/pastas recentes do Drive em geral (ex: "drive", "quais arquivos tenho").
- "open_folder": abrir/ver o conteúdo de uma PASTA específica (ex: "abrir pasta X", "o que tem na pasta X").
- "download_file": baixar um ARQUIVO específico (ex: "baixar X", "download de X").
- "read_content": ver o CONTEÚDO/dados de dentro de um arquivo específico (ex: "mostre os dados de X", "leia X").
- null: não é um pedido relacionado ao Drive.

Se envolver um nome de arquivo/pasta específico, extraia em "target" (sem palavras de comando tipo "abrir", "baixar"). Se não houver nome específico, "target" deve ser null.`,
        response_json_schema: {
          type: "object",
          properties: {
            is_drive_action: { type: "boolean" },
            action: { type: ["string", "null"] },
            target: { type: ["string", "null"] },
          },
          required: ["is_drive_action", "action", "target"],
        },
      });
    } catch {
      return { is_drive_action: false, action: null, target: null };
    }
  }

  function _makeDriveActionPlan(extra = {}) {
    return {
      goal: goal.id,
      goalLabel: goal.label,
      strategy: goal.strategy,
      skills: skills.map((s) => ({ id: s.id, name: s.name, score: s.score })),
      skillsCount: skills.length,
      sourcesCount: sources.length,
      contextLength: context ? context.length : 0,
      capabilities: [],
      capabilitiesCount: 0,
      needsMoreInfo: false,
      service: null,
      responseTimeMs: Date.now() - startTime,
      handledByGuard: "IA-040",
      ...extra,
    };
  }

  const _hasRealDocRead = Boolean(
    capabilityResult.capabilityResults?.officialLibrary?.selectedDocs?.length > 0
  );
  const _driveAction = await _classifyDriveAction(userMsg);

  // ── NOVA CAPACIDADE: abrir uma pasta específica e listar o conteúdo ──────
  if (_driveAction?.is_drive_action && _driveAction.action === "open_folder" && _driveAction.target) {
    try {
      const { searchByName, listFiles } = await import("@/lib/google-drive/GoogleDriveConnector");
      const candidates = await searchByName(_driveAction.target, { pageSize: 10 });
      const folder = candidates.find((f) => f.mimeType === "application/vnd.google-apps.folder");
      if (folder) {
        const listing = await listFiles({ folderId: folder.id, pageSize: 30 });
        const itemLines = listing.files
          .map((f) => `- ${f.name}${f.webViewLink ? ` — [Visualizar](${f.webViewLink})` : ""}`)
          .join("\n");
        const response = listing.files.length > 0
          ? `Conteúdo da pasta **"${folder.name}"**:\n\n${itemLines}`
          : `A pasta **"${folder.name}"** está vazia (ou não consegui ler o conteúdo dela).`;
        return { response, plan: _makeDriveActionPlan({ action: "open_folder", target: folder.name }), sources };
      }
      const response = `Não encontrei nenhuma pasta chamada "${_driveAction.target}" no seu Drive.`;
      return { response, plan: _makeDriveActionPlan({ action: "open_folder", target: _driveAction.target, found: false }), sources };
    } catch {
      // Se a execução real falhar por qualquer motivo, cai no fluxo normal abaixo.
    }
  }

  if (_driveAction?.is_drive_action && _driveAction.action === "read_content" && !_hasRealDocRead) {
    const response = "🔒 [IA-035-ATIVO] Ainda não tenho uma leitura real do conteúdo desse arquivo — não posso te mostrar dados dele sem antes acessá-lo de verdade. Se quiser, você pode anexar o arquivo direto aqui na conversa (eu leio na hora), ou me pedir para tentar abrir/baixar ele do Drive primeiro.";
    return { response, plan: _makeDriveActionPlan({ action: "read_content", target: _driveAction.target }), sources };
  }

  // === ETAPA 6: UMA ÚNICA CHAMADA AO LLM ===
  setPhase?.("generating");
  const rawResponse = await base44.integrations.Core.InvokeLLM({ prompt });

  // === ETAPA 6.5: TRAVA DETERMINÍSTICA CONTRA CONFABULAÇÃO DE DOCUMENTO (IA-032) ===
  const _rawText = typeof rawResponse === "string" ? rawResponse : String(rawResponse);
  const _FAKE_DOCUMENT_MARKERS = [
    "processando documento", "análise concluída", "analise concluida",
    "documento está íntegro", "documento esta integro",
    "extraí as informações", "extrai as informacoes",
    "extraí os dados", "extrai os dados",
    "dados extraídos", "dados extraidos",
    "documento foi localizado", "iniciando acesso ao documento",
    "conteúdo do arquivo processado", "conteudo do arquivo processado",
    "pontos estruturados contidos", "conforme o nosso processamento",
    "relatório de conformidade", "relatorio de conformidade",
    "reexaminei o conteúdo", "reexaminei o conteudo",
  ];
  const _looksLikeFakeDocumentClaim = _FAKE_DOCUMENT_MARKERS.some((marker) =>
    _rawText.toLowerCase().includes(marker)
  );
  const _finalRawResponse = (_looksLikeFakeDocumentClaim && !_hasRealDocRead)
    ? "Ainda não consegui ler o conteúdo real desse arquivo — não tenho um resultado de leitura confirmado para ele agora. Se quiser, você pode anexar o arquivo diretamente aqui na conversa, que eu leio na hora, ou me pedir para tentar abrir/baixar ele pelo Drive."
    : _rawText;

  // === ETAPA 7: MEMORY SYNTHESIZER ===
  const response = synthesizeResponse(_finalRawResponse);

  const responseTimeMs = Date.now() - startTime;

  // === ETAPA 8: REGISTRO DE RACIOCÍNIO (APRENDIZADO) ===
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
