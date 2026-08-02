import { base44 } from "@/api/base44Client";
import { memoryService } from "@/lib/memory-kernel/MemoryServiceFactory";
import { detectSkills } from "@/lib/skills/detector";
import { detectGoal } from "@/lib/reasoning/goalDetector";
import { buildReasoningContext, buildSystemPrompt } from "@/lib/reasoning/contextBuilder";
import { synthesizeResponse } from "@/lib/reasoning/memorySynthesizer";
import { orchestrateCapabilities } from "@/lib/reasoning/capabilityOrchestrator";
import { SpecialistRouter } from "@/lib/routing/specialistRouter";
import { formatMacrForChat } from "@/lib/reasoning/macrFormatterV4";
import { detectService } from "@/lib/reasoning/serviceDetector";
import { getConnectorsForService } from "@/lib/connectors/registry";
import { pickModelForMessage } from "@/lib/openrouter/categoryRouter";
import { OpenRouterConnector } from "@/lib/connector-runtime/connectors/OpenRouterConnector";
import { detectFullDocumentRequest, findMentionedDocument } from "@/lib/document-processing/FullDocumentContentDetector";
import { ensureProvidersRegistered } from "@/lib/search-engine/registerProviders";
import { searchEngine } from "@/lib/search-engine/SearchEngine";
import { formatSearchResultAsResponse } from "@/lib/search-engine/SearchResultFormatter";
import { ensureAIProvidersRegistered, aiProviderRegistry } from "@/lib/ai-provider-registry/AIProviderRegistry";
import { stateViewEngine } from "@/lib/knowledge-registry/StateViewEngine";

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

  // === PRÉ-ETAPA -1: INTERCEPTAR PEDIDO DE ENVIO AGENDADO (v5) ===
  // Detecta horário nas primeiras 5 linhas + endereço de email em qualquer linha.
  // Retorna IMEDIATAMENTE criando o Watch — nunca passa pelo LLM ou busca Gmail.
  // Versão 5: usa todo o texto da mensagem para extração de campos, mas só as
  // primeiras 5 linhas para detectar o horário de disparo.
  const _SCHED_TIME_RE = /(\d{1,2})[h:](\d{2})h?r?s?\b/i;
  const _HAS_EMAIL_ADDR = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const _msgLines = userMsg.split("\n");
  const _msgTop5 = _msgLines.slice(0, 5).join("\n");
  const _timeMatch = _SCHED_TIME_RE.exec(_msgTop5);

  // Extrai destinatário de qualquer linha da mensagem (busca em todo o texto)
  const _toMatchGlobal = /^(?:para|to)\s*:?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/im.exec(userMsg);

  if (_timeMatch && _toMatchGlobal) {
    try {
      const _h = String(parseInt(_timeMatch[1], 10)).padStart(2, "0");
      const _m = String(parseInt(_timeMatch[2], 10)).padStart(2, "0");
      const _targetTime = `${_h}:${_m}`;

      const _to = _toMatchGlobal[1].trim();
      const _fromMatch = /^(?:de|from)\s*:?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/im.exec(userMsg);
      const _from = _fromMatch?.[1]?.trim() || null;
      const _subjMatch = /^(?:assunto|subject)\s*:?\s*(.+)/im.exec(userMsg);
      const _subject = _subjMatch?.[1]?.trim().split("\n")[0] || "Mensagem agendada";

      // Corpo: linhas após o assunto, filtrando lixo de output do sistema colado
      let _body = _subject;
      if (_subjMatch) {
        const _subjLineIdx = userMsg.split("\n").findIndex(l => /^(?:assunto|subject)\s*:/i.test(l.trim()));
        if (_subjLineIdx >= 0) {
          const _bodyLines = userMsg.split("\n").slice(_subjLineIdx + 1).filter(l => {
            const lt = l.trim().toLowerCase();
            return lt.length > 0 &&
              !lt.startsWith("nao foram") && !lt.startsWith("não foram") &&
              !lt.startsWith("a tarefa") && !lt.startsWith("mostrar") &&
              !lt.startsWith("nao ha") && !lt.startsWith("não há") &&
              !lt.startsWith("nenhum") && !lt.startsWith("deseja");
          });
          if (_bodyLines.length > 0) _body = _bodyLines.join("\n").trim();
        }
      }

      const { base44: _b44 } = await import("@/api/base44Client");
      const _condition = {
        kind: "leaf", provider: "clock", action: "check_time",
        params: { target_time: _targetTime }, result_path: "count", comparator: "gt", value: 0,
      };
      const _emailPayload = {
        type: "send_email",
        email: { from: _from, to: _to, subject: _subject, body: _body },
      };
      const _record = await _b44.entities.Watch.create({
        name: `Email às ${_targetTime} para ${_to}`,
        description: `Agendado via chat às ${_targetTime}`,
        condition_tree: JSON.stringify(_condition),
        frequency_minutes: 1,
        priority: "high",
        status: "active",
        on_trigger_type: "emit_event",
        on_trigger_payload: JSON.stringify(_emailPayload),
        last_evaluation_result: null,
        consecutive_failures: 0,
        trigger_count: 0,
        next_execution_at: new Date().toISOString(),
        compiled_at: new Date().toISOString(),
        session_id: session?.id,
        project_id: session?.project_id,
      });
      console.log(`[SCHED-EMAIL-v5] Watch criado: ${_record.id} — ${_targetTime} → ${_to}`);
      return {
        response: `Agendado! Email para \`${_to}\` será enviado às **${_targetTime}**.`,
        plan: { goal: "scheduled_email", goalLabel: "Email agendado", strategy: "Watch Engine v5 — intercept direto", skills: [], skillsCount: 0, sourcesCount: 0, contextLength: 0, capabilities: [], capabilitiesCount: 0, needsMoreInfo: false, service: null, responseTimeMs: Date.now() - startTime, handledByGuard: "SCHED-EMAIL-v5", watchId: _record.id },
        sources: [],
      };
    } catch (err) {
      console.warn("[SCHED-EMAIL-v5] Erro:", err?.message);
    }
  }

  // === PRÉ-ETAPA WATCH-QUERY: Responder perguntas sobre watches ativos ===
  // GUARD: não rodar se a mensagem é um pedido de agendamento com horário + email
  const _isSchedulingRequest = Boolean(_timeMatch && _toMatchGlobal);
  const _WATCH_QUERY_PATTERNS = [
    /qual.{0,20}(hora|horario|hor[aá]rio).{0,20}(alerta|aviso|watch|lembrete|agendamento)/i,
    /qual.{0,20}(alerta|aviso|watch|lembrete|agendamento).{0,20}(hora|horario|ativo|agendado|programado)/i,
    /(alerta|aviso|watch|lembrete|agendamento).{0,30}(ativo|agendado|programado|qual|quando|que hora)/i,
    /que hora.{0,20}(alerta|aviso|watch|lembrete|agendamento)/i,
    /quando.{0,20}(alerta|aviso|watch|lembrete|agendamento)/i,
    /perguntei.{0,30}(alerta|aviso|watch|agendamento)/i,
    /mostrar?\s+(alertas?|avisos?|watches?|agendamentos?|lembretes?)\s*(ativos?|programados?|pendentes?)?/i,
    /listar?\s+(alertas?|avisos?|watches?|agendamentos?|lembretes?)/i,
    /ver?\s+(alertas?|avisos?|watches?|agendamentos?|lembretes?)\s*(ativos?|programados?|pendentes?)?/i,
  ];
  const _isWatchQuery = !_isSchedulingRequest && _WATCH_QUERY_PATTERNS.some(p => p.test(userMsg));
  if (_isWatchQuery) {
    try {
      const activeWatches = await base44.entities.Watch.filter({ status: "active" }, "-created_date", 20);
      if (activeWatches.length > 0) {
        const lines = activeWatches.map(w => {
          try {
            const ct = JSON.parse(w.condition_tree || "{}");
            const provider = ct.provider || "desconhecido";
            let detail = "";
            if (provider === "clock") {
              const hora = ct.params?.target_time || "horário desconhecido";
              detail = `⏰ às **${hora}**`;
            } else if (provider === "gmail") {
              detail = `📧 Gmail — novos emails`;
            } else if (provider === "calendar") {
              detail = `📅 Google Calendar`;
            } else {
              detail = `🔔 ${provider}`;
            }
            // Verificar se tem email agendado
            let emailInfo = "";
            if (w.on_trigger_payload) {
              try {
                const tp = JSON.parse(w.on_trigger_payload);
                if (tp?.type === "send_email" && tp?.email?.to) {
                  emailInfo = ` + 📨 email para ${tp.email.to}`;
                }
              } catch {}
            }
            const cleanName = w.name.replace(/ — Auto WE-04$/, "").replace(/ \+ email para .+$/, "");
            return `• **${cleanName}** — ${detail}${emailInfo} _(disparos: ${w.trigger_count || 0})_`;
          } catch { return `• ${w.name}`; }
        }).join("\n");
        return {
          response: `Seus alertas ativos:\n\n${lines}`,
          plan: { goal: "watch_query", goalLabel: "Consulta de alertas", strategy: "Watch query direto", skills: [], skillsCount: 0, sourcesCount: 0, contextLength: 0, capabilities: [], capabilitiesCount: 0, needsMoreInfo: false, service: null, responseTimeMs: Date.now() - startTime, handledByGuard: "WATCH-QUERY" },
          sources: [],
        };
      } else {
        return {
          response: "Não há alertas ativos no momento.",
          plan: { goal: "watch_query", goalLabel: "Consulta de alertas", strategy: "Watch query direto", skills: [], skillsCount: 0, sourcesCount: 0, contextLength: 0, capabilities: [], capabilitiesCount: 0, needsMoreInfo: false, service: null, responseTimeMs: Date.now() - startTime, handledByGuard: "WATCH-QUERY" },
          sources: [],
        };
      }
    } catch (err) {
      console.warn("[WatchQuery] Falhou:", err?.message);
    }
  }

  // === PRÉ-ETAPA WATCH: Detectar intenção de monitoramento ===
  // "me avise quando...", "monitore...", "fique de olho...", "às HH:MM envie..." etc.
  // Aguarda a criação do Watch e retorna DIRETAMENTE se criado — sem passar pelo LLM.
  // GUARD: Se já foi detectado agendamento com email na PRÉ-ETAPA -1 (mesmo que _to estava vazio),
  // não chama o bridge — evita falsos positivos em palavras do corpo do email ("atch", "watch").
  let _watchBridgeResult = null;
  const _alreadyHandledAsScheduledEmail = Boolean(_timeMatch && _toMatchGlobal);
  try {
    const { watchPlannerBridge } = await import("@/lib/watch-engine/WatchPlannerBridge");
    const _hasIntent = !_alreadyHandledAsScheduledEmail && watchPlannerBridge.hasMonitoringIntent(userMsg);
    console.log(`[MRP][WATCH-GUARD] hasIntent=${_hasIntent} | msg="${userMsg.slice(0,60).replace(/\n/g,'\\n')}"`);
    // Checa sempre — o bridge decide internamente se há intenção
    if (_hasIntent) {
      _watchBridgeResult = await watchPlannerBridge.processMessage(userMsg, session?.id, session?.project_id, historyMessages);
      console.log(`[MRP][WATCH-GUARD] result:`, JSON.stringify(_watchBridgeResult).slice(0, 200));
      if (_watchBridgeResult.created) {
        console.log(`[WatchPlannerBridge] Watch criado: ${_watchBridgeResult.watchId} — ${_watchBridgeResult.watchName}`);
        // Retorna direto — o LLM não precisa ser chamado para confirmar algo já persistido
        return {
          response: `Pronto! Vou te avisar quando chegar o horário. O alerta "${_watchBridgeResult.watchName}" está ativo e será disparado automaticamente.`,
          plan: {
            goal: "watch_created",
            goalLabel: "Alerta criado",
            strategy: "Watch Engine — bypass direto, sem LLM",
            skills: [], skillsCount: 0, sourcesCount: 0, contextLength: 0,
            capabilities: [], capabilitiesCount: 0, needsMoreInfo: false,
            service: null, responseTimeMs: Date.now() - startTime,
            handledByGuard: "WATCH-DIRECT",
            watchId: _watchBridgeResult.watchId,
          },
          sources: [],
        };
      } else if (_watchBridgeResult.wasDuplicate) {
        return {
          response: `Já existe um alerta ativo para isso: "${_watchBridgeResult.existingWatchId ? 'Watch #' + _watchBridgeResult.existingWatchId.slice(-6) : 'alerta anterior'}". Você será notificado quando disparar.`,
          plan: { goal: "watch_duplicate", goalLabel: "Alerta duplicado", strategy: "Watch dedup", skills: [], skillsCount: 0, sourcesCount: 0, contextLength: 0, capabilities: [], capabilitiesCount: 0, needsMoreInfo: false, service: null, responseTimeMs: Date.now() - startTime, handledByGuard: "WATCH-DEDUP" },
          sources: [],
        };
      } else {
        console.log(`[WatchPlannerBridge] Watch NÃO criado:`, _watchBridgeResult.message);
      }
    }
  } catch (err) { console.warn('[WatchPlannerBridge] Erro:', err?.message); }

  const _t0 = Date.now();
  // === PRÉ-ETAPA 0: BYPASS PARA PERGUNTAS CONVERSACIONAIS SIMPLES ===
  // Perguntas de identidade/saudação nunca precisam de service detection, memory ou capacidades.
  // Detectar aqui evita todos os imports dinâmicos e chamadas de rede desnecessárias.
  const _IDENTITY_BYPASS = /^(qual|quem|como|o que|me diga|me fale|oi|olá|ola|bom dia|boa tarde|boa noite)\b.{0,60}(nome|você|voce|vc|você é|voce é|se chama|és|é você)\b/i;
  const _isIdentityQuery = _IDENTITY_BYPASS.test(userMsg.trim()) || 
    /^(qual (é |e )?(o |seu |o seu )?(nome|propósito|objetivo|função|funcao))/i.test(userMsg.trim());

  // === PRÉ-ETAPA 0.1: RESPOSTA DIRETA PARA PERGUNTAS DE IDENTIDADE ===
  // "qual o seu nome?", "quem é você?" etc. — nunca precisam de memória, LLM ou capacidades.
  // Resposta fixa em <5ms, zero chamadas de rede.
  if (_isIdentityQuery) {
    const _greeting = /^(oi|olá|ola|bom dia|boa tarde|boa noite)\b/i.test(userMsg.trim());
    const _askingName = /nome/i.test(userMsg);
    const _askingPurpose = /propósito|objetivo|função|funcao/i.test(userMsg);
    let _identityResponse;
    if (_greeting && !_askingName && !_askingPurpose) {
      _identityResponse = "Olá! Sou o MemoryOS — sua memória permanente e inteligente. Como posso ajudar?";
    } else if (_askingPurpose) {
      _identityResponse = "Sou o MemoryOS, seu sistema operacional cognitivo. Preservo tudo que você aprende, decide e cria — para que você nunca precise repetir contexto.";
    } else {
      _identityResponse = "Sou o MemoryOS — sua memória viva e permanente. Não tenho um nome pessoal, mas você pode me chamar de MemoryOS.";
    }
    return {
      response: _identityResponse,
      plan: {
        goal: "identity",
        goalLabel: "Pergunta de identidade",
        strategy: "Bypass direto — sem memória nem LLM",
        skills: [], skillsCount: 0, sourcesCount: 0, contextLength: 0,
        capabilities: [], capabilitiesCount: 0, needsMoreInfo: false,
        service: null, responseTimeMs: Date.now() - startTime,
        handledByGuard: "IDENTITY-DIRECT",
      },
      sources: [],
    };
  }

  // === ETAPA 0: DESVIO PRECOCE PARA SERVICO DE IA ===
  // FIX (otimizacao real, medida em producao — 3+ segundos economizados):
  // movido de depois da memoria/capacidades (ETAPA 4) pra antes de tudo.
  // detectService() so precisa do texto da mensagem, nao depende de nada
  // calculado depois — pedidos de traducao/resumo/transcricao/geracao de
  // codigo agora sao respondidos sem gastar tempo com memoria e
  // deteccao de capacidades que vao ser descartadas de qualquer jeito.
  try {
    const _earlyService = _isIdentityQuery ? null : detectService(userMsg);
    if (_earlyService && getConnectorsForService(_earlyService.id).length > 0) {
      const { model } = pickModelForMessage(userMsg);
      const connector = new OpenRouterConnector();
      const result = await connector.execute(
        "openrouter.chatCompletion",
        { model, prompt: userMsg },
        { executionId: `mrp-early-${Date.now()}`, workspaceId: "default" },
      );
      console.log(`[DIAG][AI-SERVICE-DIRECT-EARLY] servico: ${_earlyService.id} | modelo: ${model} | success: ${result.success} | tem reply: ${Boolean(result.data?.reply)}`);
      if (result.success && result.data?.reply) {
        const _watchNote = _watchBridgeResult?.created
          ? `\n\n_(Watch "${_watchBridgeResult.watchName}" criado — você será notificado automaticamente.)_`
          : "";
        return {
          response: result.data.reply + _watchNote,
          plan: {
            goal: "ai_service_direct",
            goalLabel: "Processamento direto de IA",
            strategy: `Roteado direto pra ${model}, sem passar por memória/capacidades`,
            skills: [],
            skillsCount: 0,
            sourcesCount: 0,
            contextLength: 0,
            capabilities: [],
            capabilitiesCount: 0,
            needsMoreInfo: false,
            service: "ai",
            responseTimeMs: Date.now() - startTime,
            handledByGuard: "AI-SERVICE-DIRECT-EARLY",
            model,
          },
          sources: [],
        };
      }
    }
  } catch (err) {
    if (err?.message !== "identity-bypass") {
      console.error(`[DIAG][AI-SERVICE-DIRECT-EARLY] FALHOU:`, err?.message || err);
    }
    // Cai pro fluxo normal abaixo — nunca trava a resposta por causa disso.
  }

  // === ETAPA 0.5: DESVIO PARA CONTEUDO COMPLETO DE DOCUMENTO ===
  // FIX (pedido real do usuario): perguntas tipo "me mostre o conteudo"
  // antes so recebiam um trecho de 500-800 caracteres (limite deliberado
  // pra nao inflar o prompt final — mesmo motivo do bloco fixo de 16KB).
  // Quando o pedido e explicitamente por conteudo INTEIRO, busca o texto
  // completo salvo (Document.extracted_text, ja sem corte — o corte so
  // acontecia na hora de montar contexto pra LLM) e retorna DIRETO, sem
  // passar pela LLM — mais completo (nada e perdido/resumido pela IA) e
  // mais rapido (sem chamada de LLM nem risco de prompt gigante).
  try {
    if (detectFullDocumentRequest(userMsg)) {
      const recentDocs = await base44.entities.Document.filter(
        { session_id: session.id, processing_status: "completed" },
        "-created_date",
        10,
      );
      if (recentDocs.length > 0) {
        const target = findMentionedDocument(userMsg, recentDocs) || recentDocs[0];
        const fullText = target.extracted_text || target.summary || "";
        if (fullText.trim().length > 0) {
          const response =
            `📄 **${target.name}** (fonte: documento, conteúdo completo salvo)

${fullText}`;
          return {
            response,
            plan: {
              goal: "full_document_content",
              goalLabel: "Conteúdo completo de documento",
              strategy: `Retornado direto de Document.extracted_text (${fullText.length} caracteres), sem passar por LLM`,
              skills: [], skillsCount: 0, sourcesCount: 1,
              contextLength: fullText.length,
              capabilities: [], capabilitiesCount: 0, needsMoreInfo: false,
              service: "document", responseTimeMs: Date.now() - startTime,
              handledByGuard: "FULL-DOCUMENT-CONTENT-DIRECT",
            },
            sources: [{ type: "document", id: target.id, name: target.name }],
          };
        }
      }
    }
  } catch (err) {
    console.error(`[DIAG][FULL-DOCUMENT-CONTENT] FALHOU:`, err?.message || err);
    // Cai pro fluxo normal abaixo — nunca trava a resposta por causa disso.
  }

  console.log(`[DIAG][MRP] ETAPA 0 (early AI + doc bypass) levou ${Date.now() - _t0}ms`);

  // === ETAPAS 1+2+3 EM PARALELO: MEMORY + SKILLS + GOAL ===
  // Skills e Goal só precisam da mensagem — não dependem da memória.
  // Paralelizar economiza ~400ms (tempo do goalDetector+skills).
  setPhase?.("retrieving");
  const _t1 = Date.now();
  const [memoryResult, skills, goal] = await Promise.all([
    memoryService.retrieve({
      userMessage: userMsg,
      sessionId:   session.id,
      projectId:   session.project_id ?? null,
    }),
    Promise.resolve(detectSkills(userMsg, {})),
    Promise.resolve(detectGoal(userMsg)),
  ]);

  const _memoryRetrievalFailed = Boolean(memoryResult?.diagnostics?.error);
  if (_memoryRetrievalFailed) {
    console.error("[MemoryReasoningPlanner] Falha na recuperação de memória:", memoryResult.diagnostics.error);
  }
  const _rawMemCtx = memoryResult.memories || "";
  const _cappedMemCtx = _rawMemCtx.length > 3000
    ? _rawMemCtx.slice(0, 3000) + "\n...(contexto truncado)"
    : _rawMemCtx;

  const memory = {
    context:        _cappedMemCtx,
    sources:        memoryResult.sources,
    sessionSummary: memoryResult.sessionSummary
      ? memoryResult.sessionSummary.slice(0, 500)
      : null,
    intent:         null,
    mip:            {},
  };

  console.log(`[DIAG][MRP] ETAPAS 1+2+3 (memory+skills+goal paralelo) levou ${Date.now() - _t1}ms`);

  const { context, sources, sessionSummary } = memory;

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
  const _t4 = Date.now();
  const capabilityResult = await orchestrateCapabilities({
    message: userMsg,
    memory,
    goal,
    sessionId: session.id,
    projectId: session.project_id,
  });
  console.log(`[DIAG][ReasoningPlanner] ETAPA 4 (orchestrateCapabilities) levou ${Date.now() - _t4}ms`);

  // === ETAPA 5: CONTEXT BUILDER ===
  // Limita o histórico às últimas 8 mensagens para evitar prompts massivos.
  // O resumo da sessão (sessionSummary) já cobre o contexto de longo prazo —
  // não é necessário carregar mensagens antigas no prompt de cada resposta.
  // Conversas simples (sem busca, sem doc, sem capacidade ativa) usam histórico menor
  const _isSimpleConversation = !capabilityResult.capabilities?.web_search &&
    !capabilityResult.capabilities?.documents &&
    !capabilityResult.capabilities?.official_library &&
    !capabilityResult.capabilities?.calculation;
  const _MAX_HISTORY_MESSAGES = _isSimpleConversation ? 4 : 8;
  const _MAX_HISTORY_CHARS = _isSimpleConversation ? 3000 : 6000;
  const _recentHistory = historyMessages.slice(-_MAX_HISTORY_MESSAGES);
  let historyText = _recentHistory
    .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
    .join("\n\n");
  // Segunda camada: se ainda ultrapassar o limite de chars, corta pelo início
  if (historyText.length > _MAX_HISTORY_CHARS) {
    historyText = "...(histórico anterior omitido para otimizar resposta)...\n\n" +
      historyText.slice(-_MAX_HISTORY_CHARS);
  }
  const totalMessages = historyMessages.length;
  console.log(`[DIAG][PromptBreakdown] historyText: ${historyText.length} chars (${_recentHistory.length} mensagens) | memory.context: ${(memory.context || "").length} chars | sessionSummary: ${(memory.sessionSummary || "").length} chars`);

  // === ETAPA 5.1: ESTADO COGNITIVO (Sprint EF-412 — Read Model) ===
  // Consulta o StateViewEngine para injetar o contexto do Read Model no prompt.
  // Fire-and-forget com fallback seguro — nunca bloqueia a resposta.
  let _stateViewContext = null;
  try {
    const svResult = await stateViewEngine.buildForSession(session.id, session.project_id ?? null);
    if (svResult.llmContext && svResult.llmContext.trim().length > 0) {
      _stateViewContext = svResult.llmContext;
    }
  } catch {
    // falha silenciosa — o LLM segue sem o stateView
  }

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
    memoryRetrievalFailed: _memoryRetrievalFailed,
    serviceInfo: capabilityResult.serviceInfo,
    kfmContext,
    stateViewContext: _stateViewContext,
  });

  // === ETAPA 5.2: SEARCH ENGINE (antes de qualquer chamada de LLM) ===
  let _searchEngineGroundingNote = null;
  // FIX: alimenta as travas IA-084/IA-086 mais abaixo, que antes so
  // enxergavam o sistema de busca antigo (capabilityResult.capabilityResults.webSearch).
  let _searchEngineGroundingText = "";

  // FIX (unificacao de pipelines paralelas): a capability web_search
  // (ETAPA 4, capabilityDetector.js) e este SearchEngine (ETAPA 5.2) agora
  // usam o MESMO backend (Serper) — se a ETAPA 4 ja pesquisou com sucesso
  // pra essa mensagem, pular essa segunda chamada evita gastar outra
  // consulta a toa (mesma pergunta, mesmo resultado, so custo duplicado).
  const _capabilityWebSearchAlreadyRan = Boolean(
    capabilityResult.capabilityResults?.webSearch &&
    !capabilityResult.capabilityResults.webSearch.error &&
    (capabilityResult.capabilityResults.webSearch.facts?.length > 0)
  );

  // ETAPA 5.2 roda se:
  // 1. A ETAPA 4 (capabilityDetector) já decidiu que web_search é necessário, OU
  // 2. Há sinal explícito de busca na mensagem (inclui/startsWith para evitar falha de \b)
  const _msgLower = userMsg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const _SEARCH_TERMS = ["pesquise", "pesquisar", "busque", "buscar", "procure", "procurar", "mcp", "servidor mcp", "online", "internet", "web", "google", "noticia", "preco atual", "rate limit",
    "descubra", "investigue", "como conectar", "como integrar", "como usar", "existe api", "existe mcp", "como fazer", "verifique", "confirme", "cheque"];
  const _hasSearchSignal = _SEARCH_TERMS.some((t) => _msgLower.includes(t));
  const _capabilityRequestedSearch = Boolean(capabilityResult.capabilities?.web_search);
  // Se capability web_search ativa OU sinal na mensagem → sempre busca
  const _needsSearchEngine = (_hasSearchSignal || _capabilityRequestedSearch) && !_capabilityWebSearchAlreadyRan && !_isIdentityQuery;

  const _t52 = Date.now();
  if (!_needsSearchEngine) {
    if (_capabilityWebSearchAlreadyRan) console.log("[SearchEngine] Pulado — ETAPA 4 (capability web_search) ja pesquisou essa mensagem.");
    else console.log("[SearchEngine] Pulado — sem sinal explícito de busca externa na mensagem.");
  } else if (_needsSearchEngine) {
  try {
    ensureProvidersRegistered();

    const searchOutcome = await searchEngine.search(userMsg, {
      context: {
        sessionId: session.id,
        projectId: session.project_id ?? null,
        sessionSummary: memory.sessionSummary,
      },
    });

    console.log("[SearchEngine] Outcome:", {
      resolved: searchOutcome.resolved,
      bestProvider: searchOutcome.bestResult?.provider ?? null,
      bestConfidence: searchOutcome.bestResult?.confidence ?? null,
      durationMs: searchOutcome.durationMs,
    });

    if (searchOutcome.resolved && searchOutcome.bestResult) {
      // Injeta os resultados como grounding para o LLM — NÃO retorna direto ao usuário.
      // O LLM deve sintetizar uma resposta contextualizada, não listar links crus.
      const snippet = formatSearchResultAsResponse(searchOutcome.bestResult);
      _searchEngineGroundingNote =
        `RESULTADOS DA PESQUISA WEB (use estes dados para responder — não liste os links, sintetize uma resposta útil e completa em português):\n${snippet}`;
      _searchEngineGroundingText = (searchOutcome.bestResult.items ?? [])
        .map((it) => `${it.title ?? ""} ${it.snippet ?? ""} ${it.url ?? ""}`)
        .join(" \n ")
        .toLowerCase();
      try {
        base44.analytics.track({
          eventName: "search_engine_resolved",
          properties: {
            provider: searchOutcome.bestResult.provider,
            confidence: searchOutcome.bestResult.confidence,
            duration_ms: searchOutcome.durationMs,
          },
        });
      } catch {
        // analytics é opcional
      }
    }

    // Fallback: tenta qualquer provider que retornou itens, mesmo sem confidence alto
    const _anyResultWithItems = !searchOutcome.bestResult?.items?.length
      ? searchOutcome.allResults?.find((r) => r.success && r.items?.length > 0) ?? null
      : searchOutcome.bestResult;

    if (_anyResultWithItems && _anyResultWithItems.items?.length > 0) {
      const snippet = formatSearchResultAsResponse(_anyResultWithItems);
      _searchEngineGroundingNote =
        `JÁ PESQUISAMOS ISSO ANTES DE VOCÊ (fonte real, verificada — não pesquise de novo nem invente dados adicionais):\n${snippet}\n` +
        `Se precisar responder sobre este assunto, use SÓ o que está listado acima. Não invente nomes de repositórios, produtos ou serviços que não estejam nessa lista.`;
      _searchEngineGroundingText = (_anyResultWithItems.items ?? [])
        .map((it) => `${it.title ?? ""} ${it.snippet ?? ""} ${it.url ?? ""}`)
        .join(" \n ")
        .toLowerCase();
    } else {
      const triedProviders = (searchOutcome.allResults ?? [])
        .filter((r) => r.success)
        .map((r) => r.provider);
      if (triedProviders.length > 0) {
        _searchEngineGroundingNote =
          `JÁ PESQUISAMOS ISSO ANTES DE VOCÊ, nas seguintes fontes reais: ${triedProviders.join(", ")}. ` +
          `NÃO foi encontrado nada relevante nessas fontes específicas. Não invente nomes de repositórios, produtos ou serviços — ` +
          `seja honesto que a busca nessas fontes específicas não encontrou resultado, mas você pode mencionar seu conhecimento geral sobre o tema se for claramente identificado como tal.`;
      }
    }
  } catch (err) {
    console.warn("[SearchEngine] Falhou, caindo pro fluxo normal:", err);
  }
  }

  console.log(`[DIAG][MRP] ETAPA 5.2 (SearchEngine) levou ${Date.now() - _t52}ms`);
  // === ETAPA 5.4: ROTEADOR SEMÂNTICO DE AÇÕES DO DRIVE (IA-040) ===
  // Heurística rápida — evita chamar LLM para mensagens sem sinal de Drive.
  // Só chama o LLM classificador se houver pelo menos um sinal explícito.
  function _driveHeuristicCheck(message) {
    const msg = message.toLowerCase();
    const DRIVE_SIGNALS = [
      "drive", "pasta", "folder", "arquivo", "file", "pdf", "docx", "planilha",
      "abrir", "baixar", "download", "ler", "leia", "conteúdo", "conteudo",
      "que subi", "que anexei", "meu arquivo", "minha pasta", "meus arquivos",
      "minhas pastas", "upload", "documento que",
    ];
    return DRIVE_SIGNALS.some((s) => msg.includes(s));
  }

  async function _classifyDriveAction(message, recentContext = "") {
    // Atalho: sem sinal de Drive → não é ação de Drive (sem LLM)
    if (!_driveHeuristicCheck(message)) {
      return { is_drive_action: false, action: null, target: null };
    }
    try {
      const contextBlock = recentContext
        ? `\n\nCONTEXTO RECENTE DA CONVERSA:\n${recentContext}\n`
        : "";
      return await base44.integrations.Core.InvokeLLM({
        prompt: `O usuário disse: "${message}"
${contextBlock}
Determine se é um pedido de ação no Google Drive do usuário e qual ação.

Ações: "list_root", "open_folder", "download_file", "read_content", ou null.
Se não for Drive do usuário (ex: pergunta sobre docs de API externa), retorne is_drive_action: false.
Se for, extraia "target" (nome do arquivo/pasta sem verbos de comando).`,
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

  const _t54 = Date.now();
  const _hasRealDocRead = Boolean(
    capabilityResult.capabilityResults?.officialLibrary?.selectedDocs?.length > 0
  );
  const _recentContextForDriveClassifier = _recentHistory
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`.slice(0, 500))
    .join("\n\n");
  const _driveAction = await _classifyDriveAction(userMsg, _recentContextForDriveClassifier);

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
      // Se a execução real falhar por qualquer motivo, cai no fluxo normal
      // abaixo em vez de travar a resposta inteira.
    }
  }

  if (_driveAction?.is_drive_action && _driveAction.action === "read_content" && !_hasRealDocRead) {
    const response = "Ainda não tenho uma leitura real do conteúdo desse arquivo — não posso te mostrar dados dele sem antes acessá-lo de verdade. Se quiser, você pode anexar o arquivo direto aqui na conversa (eu leio na hora), ou me pedir para tentar abrir/baixar ele do Drive primeiro.";
    return { response, plan: _makeDriveActionPlan({ action: "read_content", target: _driveAction.target }), sources };
  }

  if (_driveAction?.is_drive_action && _driveAction.action === "download_file" && _driveAction.target) {
    try {
      const { executeDriveDownload } = await import("@/lib/google-drive/DriveDownloadExecutor");
      const dl = await executeDriveDownload({ fileName: _driveAction.target }, "");
      let response;
      if (dl.ok) {
        const preview = dl.content && dl.content.trim().length > 0 && dl.content.length < 3000
          ? `\n\n${dl.content.trim()}`
          : "\n\n(Arquivo baixado com sucesso, mas o conteúdo não é texto legível diretamente.)";
        response = `Arquivo **${dl.fileName}** baixado com sucesso.${preview}`;
      } else {
        response = dl.message || "Não foi possível baixar esse arquivo.";
      }
      return { response, plan: _makeDriveActionPlan({ action: "download_file", target: _driveAction.target, ok: dl.ok }), sources };
    } catch {
      // Se falhar por qualquer motivo, cai no fluxo normal abaixo.
    }
  }

  console.log(`[DIAG][MRP] ETAPA 5.4 (DriveClassifier) levou ${Date.now() - _t54}ms`);
  // === ETAPA 6: UMA ÚNICA CHAMADA AO LLM ===
  const finalPrompt = _searchEngineGroundingNote
    ? `${prompt}\n\n${_searchEngineGroundingNote}`
    : prompt;
  setPhase?.("generating");
  const _t6 = Date.now();
  // FIX (migracao de provider): resposta final agora passa pelo Registro de
  // Providers de IA (prefere OpenRouter — mais rapido, mais modelos, cache
  // de prompt no futuro). Se o provider preferido falhar por qualquer
  // motivo, cai pro InvokeLLM do Base44 direto — nunca deixa a mensagem
  // sem resposta por causa de uma falha de provider especifico.
  ensureAIProvidersRegistered();
  const _aiProvider = await aiProviderRegistry.selectProvider("text-generation");
  const _systemPrompt = buildSystemPrompt();
  let rawResponse;
  if (_aiProvider) {
    // Passa system + user separados para permitir prompt caching no OpenRouter
    const _aiResult = await _aiProvider.invoke(finalPrompt, { systemPrompt: _systemPrompt });
    if (_aiResult.success) {
      rawResponse = _aiResult.text;
    } else {
      console.warn(`[DIAG][ReasoningPlanner] ETAPA 6: provider "${_aiProvider.id}" falhou (${_aiResult.error}) — caindo pro Base44 direto`);
      rawResponse = await base44.integrations.Core.InvokeLLM({ prompt: _systemPrompt + "\n\n" + finalPrompt });
    }
  } else {
    rawResponse = await base44.integrations.Core.InvokeLLM({ prompt: _systemPrompt + "\n\n" + finalPrompt });
  }
  console.log(`[DIAG][ReasoningPlanner] ETAPA 6 (resposta final, provider: ${_aiProvider?.id ?? "base44-fallback"}) levou ${Date.now() - _t6}ms — prompt tinha ${finalPrompt.length} caracteres`);

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

  // === ETAPA 6.55: TRAVA DETERMINÍSTICA CONTRA NARRATIVA FICTÍCIA DE AUDITORIA (IA-091) ===
  const _FAKE_AUDIT_NARRATIVE_MARKERS = [
    "macr", "r-iae", "official library manager", "adapter_v1",
    "componente fantasma", "arquivo fantasma", "código fantasma", "codigo fantasma",
    "pipeline coordinator", "biblioteca oficial no meu contexto",
    "core cognitivo – status", "core cognitivo - status",
  ];
  const _looksLikeFakeAuditNarrative = _FAKE_AUDIT_NARRATIVE_MARKERS.some((marker) =>
    _finalRawResponse.toLowerCase().includes(marker)
  );
  console.log("[IA-091] Trava de narrativa fictícia de auditoria:", {
    looksLikeFakeAuditNarrative: _looksLikeFakeAuditNarrative,
    hasRealDocRead: _hasRealDocRead,
    willReplaceResponse: _looksLikeFakeAuditNarrative,
  });
  const _finalRawResponseAfterAuditCheck = _looksLikeFakeAuditNarrative
    ? "Preciso parar e ser direto: percebi que estava continuando uma narrativa de \"auditoria\" (MACR, Official Library Manager, componentes/arquivos \"fantasma\") que não tem nenhum grounding real — não tenho acesso a uma leitura de fato do seu repositório nesta conversa, e essa história provavelmente não deveria ter começado do jeito que começou. Não confie em nada do que eu disse sobre isso até aqui. Se você quiser uma auditoria real da arquitetura do MemoryOS, me diga e eu faço uma de verdade, lendo o código real."
    : _finalRawResponse;

  // === ETAPA 6.6: TRAVA DETERMINÍSTICA CONTRA ITEM FABRICADO EM LISTA REAL (IA-084) ===
  let _finalResponseWithMcpCheck = _finalRawResponseAfterAuditCheck;
  const _webSearchResult = capabilityResult.capabilityResults?.webSearch;
  const _hadAnyRealWebGrounding = Boolean((_webSearchResult && !_webSearchResult.error) || _searchEngineGroundingText);
  if (_hadAnyRealWebGrounding) {
    const _groundingText = [
      ...(_webSearchResult?.facts || []),
      ...(_webSearchResult?.sources || []),
      _searchEngineGroundingText,
    ].join(" \n ").toLowerCase();

    const _tokenRe = /[a-z0-9]+(?:[-_/][a-z0-9]+)+/gi;
    const _tokens = _finalResponseWithMcpCheck.match(_tokenRe) || [];
    const _mentioned = [...new Set(
      _tokens
        .filter((t) => t.toLowerCase().split(/[-_/]/).includes("mcp"))
        .map((s) => s.toLowerCase())
    )];
    const _unverified = _mentioned.filter((name) => !_groundingText.includes(name));

    if (_unverified.length > 0) {
      _finalResponseWithMcpCheck =
        `${_finalResponseWithMcpCheck}\n\n---\n⚠️ **Não verificado**: ${_unverified.join(", ")} — ` +
        `${_unverified.length > 1 ? "esses nomes" : "esse nome"} não ${_unverified.length > 1 ? "aparecem" : "aparece"} literalmente nos resultados da pesquisa realizada agora. Confirme antes de usar.`;
    }
  }

  // === ETAPA 6.65: TRAVA DETERMINÍSTICA CONTRA SHA/ARQUIVO FABRICADO (IA-090) ===
  const _FAKE_SHA_RE = /\b[0-9a-f]{40}\b/i;
  if (_FAKE_SHA_RE.test(_finalResponseWithMcpCheck)) {
    _finalResponseWithMcpCheck = "Percebi que eu estava prestes a apresentar um hash Git (SHA) ou dado técnico específico de arquivo que não tenho como ter obtido de verdade nesta conversa — isso teria sido inventado. Não tenho acesso a uma leitura real de arquivos/hashes do seu repositório nesta mensagem. Se quiser essa informação de verdade, me diga o nome exato do arquivo que você quer que eu tente ler ou verificar.";
  }

  // === ETAPA 6.7: TRAVA DETERMINÍSTICA — RASTREABILIDADE DE ORIGEM (IA-086) ===
  const _hadRealCapability = Boolean(
    _hadAnyRealWebGrounding ||
    capabilityResult.capabilityResults?.calculation && !capabilityResult.capabilityResults.calculation.error ||
    (capabilityResult.capabilityResults?.officialLibrary && !capabilityResult.capabilityResults.officialLibrary.error)
  );
  if (_hadRealCapability) {
    const _hasSourceTag = /\((fonte:\s*(pesquisa|mem[oó]ria|documento)|conhecimento geral|sua an[aá]lise)\)/i.test(_finalResponseWithMcpCheck);
    console.log("[IA-086] Rastreabilidade de origem:", {
      hadWebSearch: _hadAnyRealWebGrounding,
      hadCalculation: Boolean(capabilityResult.capabilityResults?.calculation && !capabilityResult.capabilityResults.calculation.error),
      hadOfficialLibrary: Boolean(capabilityResult.capabilityResults?.officialLibrary && !capabilityResult.capabilityResults.officialLibrary.error),
      hasSourceTag: _hasSourceTag,
      responseLength: _finalResponseWithMcpCheck.length,
      willAppendWarning: !_hasSourceTag && _finalResponseWithMcpCheck.length > 300,
    });
    if (!_hasSourceTag && _finalResponseWithMcpCheck.length > 300) {
      _finalResponseWithMcpCheck += `\n\n---\nℹ️ Esta resposta usou uma capacidade real (pesquisa/cálculo/biblioteca) mas não indicou a origem de cada afirmação. Trate os detalhes específicos com cautela até confirmar a fonte.`;
    }
  } else {
    console.log("[IA-086] Nenhuma capacidade real detectada nesta mensagem — trava não avaliada.");
  }

  // === ETAPA 7: MEMORY SYNTHESIZER ===
  const response = synthesizeResponse(_finalResponseWithMcpCheck);

  const responseTimeMs = Date.now() - startTime;
  console.log(`[DIAG][ReasoningPlanner] TOTAL runReasoningPlan (todas as etapas) levou ${responseTimeMs}ms`);

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