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
  // FIX (auditoria cognição): memoryResult.diagnostics.error é preenchido
  // por LegacyMemoryService quando runMemoryPipeline() lança uma exceção
  // (ex: erro de rede, query malformada, schema JSON inválido no
  // InvokeLLM), mas antes NADA verificava esse campo — o Planner seguia
  // em frente com memória vazia, e o usuário recebia uma resposta como
  // se simplesmente "não houvesse registro", sem nenhuma indicação de
  // que a recuperação de memória falhou tecnicamente. Agora loga o erro
  // e sinaliza pro Context Builder, que pode ser honesto sobre isso em
  // vez de deixar o LLM interpretar silêncio como "não existe memória".
  const _memoryRetrievalFailed = Boolean(memoryResult?.diagnostics?.error);
  if (_memoryRetrievalFailed) {
    console.error("[MemoryReasoningPlanner] Falha na recuperação de memória:", memoryResult.diagnostics.error);
  }
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
    memoryRetrievalFailed: _memoryRetrievalFailed,
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
  async function _classifyDriveAction(message, recentContext = "") {
    try {
      const contextBlock = recentContext
        ? `\n\nCONTEXTO RECENTE DA CONVERSA (use para não confundir um pedido de "repetir/explicar de novo algo já dito" com um pedido real de abrir/ler um arquivo do Drive):\n${recentContext}\n`
        : "";
      return await base44.integrations.Core.InvokeLLM({
        prompt: `O usuário disse: "${message}"
${contextBlock}
O usuário está conversando com o MemoryOS, um assistente conectado ao Google Drive. Determine se essa mensagem é um pedido de ação relacionada ao Drive, e qual ação exatamente.

CRITÉRIO OBRIGATÓRIO antes de classificar como ação de Drive: a mensagem precisa se referir a algo que está armazenado NO GOOGLE DRIVE DO USUÁRIO — um arquivo ou pasta que ELE possui, anexou ou já mencionou ter lá. Sinais disso: "meu(s)", "esse/este arquivo", "essa/esta pasta", "que anexei", "que subi", "na minha pasta X", ou um nome de arquivo/pasta específico.

NÃO é ação de Drive (mesmo mencionando "documentação", "documento" ou "arquivo"):
- Perguntas de CONHECIMENTO GERAL sobre a documentação técnica de um sistema, API ou empresa EXTERNA (ex: "documentação do Wooba", "documentação da API do Mercado Livre", "o que é necessário para instalar o conector X") — isso é uma pergunta de conteúdo/pesquisa, não um pedido de leitura de arquivo do Drive.
- Pedidos de repetir, recapitular ou explicar de novo algo que já foi dito nesta própria conversa (ex: "fale de novo sobre a documentação exigida", "resuma o que você disse").

Ações possíveis:
- "list_root": listar os arquivos/pastas recentes do Drive em geral (ex: "drive", "quais arquivos tenho").
- "open_folder": abrir/ver o conteúdo de uma PASTA específica que o usuário possui (ex: "abrir minha pasta X", "o que tem na pasta X que criei").
- "download_file": baixar um ARQUIVO específico do Drive do usuário (ex: "baixar meu arquivo X", "download do documento que anexei").
- "read_content": ver o CONTEÚDO/dados de dentro de um ARQUIVO REAL do Drive do usuário (ex: "mostre os dados do arquivo que anexei", "leia esse PDF que subi").
- null: não é um pedido relacionado ao Drive do usuário — inclui qualquer pergunta sobre documentação/informação de sistemas, empresas ou APIs externas.

Se envolver um nome de arquivo/pasta específico do usuário, extraia em "target" (sem palavras de comando tipo "abrir", "baixar"). Se não houver nome específico, "target" deve ser null.`,
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
  // FIX (auditoria cognição): _classifyDriveAction recebia só a mensagem
  // atual isolada. "Fale de novo sobre a documentação exigida" (um pedido
  // de RECAPITULAR algo já dito na conversa) foi classificado como
  // read_content (leitura de arquivo real do Drive), porque a palavra
  // "documentação" sozinha, sem contexto, parece um pedido de arquivo.
  // Passamos um recorte recente da conversa para o classificador poder
  // distinguir "recapitular o que já foi dito" de "ler um arquivo real".
  const _recentContextForDriveClassifier = _recentHistory
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`.slice(0, 500))
    .join("\n\n");
  const _driveAction = await _classifyDriveAction(userMsg, _recentContextForDriveClassifier);

  // ── NOVA CAPACIDADE: abrir uma pasta específica e listar o conteúdo ──────
  // Isso não existia antes — "abrir pasta X" sempre caía na conversa livre
  // e inventava, ou (depois do IA-038) só dizia "não sei fazer isso". Agora
  // executa de verdade: busca a pasta pelo nome, lista o que tem dentro.
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
        // FIX (auditoria cognição): a marcação interna "🔒 [IA-040-ATIVO]"
        // estava colada direto no texto enviado ao usuário — vazamento de
        // anotação de debug, violando a regra "nunca exponha detalhes
        // técnicos ao usuário" do próprio prompt do sistema. Removida do
        // texto visível; a rastreabilidade de qual regra respondeu já é
        // suficiente com o comentário de código acima.
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
    // FIX (auditoria cognição): mesma correção — "🔒 [IA-035-ATIVO]"
    // removido do texto visível ao usuário.
    const response = "Ainda não tenho uma leitura real do conteúdo desse arquivo — não posso te mostrar dados dele sem antes acessá-lo de verdade. Se quiser, você pode anexar o arquivo direto aqui na conversa (eu leio na hora), ou me pedir para tentar abrir/baixar ele do Drive primeiro.";
    return { response, plan: _makeDriveActionPlan({ action: "read_content", target: _driveAction.target }), sources };
  }

  // ── IA-042: "download_file" agora EXECUTA de verdade — antes só era
  // classificado e depois caía sem ação nenhuma na conversa livre, que
  // então inventava algo parecido com mensagens anteriores da conversa.
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

  // === ETAPA 5.6: DESVIO PARA SERVIÇO DE IA (OpenRouter) ===
  // Quando o serviço detectado é "ai" (traduzir, resumir, gerar código,
  // etc.), a resposta do modelo especializado do OpenRouter DEVE ser a
  // resposta final, sem passar por outra chamada de LLM que reescreveria
  // por cima (o que destruiria o propósito de escolher um modelo
  // especializado). Por isso, aqui pulamos a ETAPA 6 inteiramente
  // quando esse serviço é detectado e a mensagem tem conteúdo suficiente.
  if (capabilityResult.serviceInfo?.id === "ai" && capabilityResult.serviceInfo?.hasConnector) {
    try {
      const { pickModelForMessage } = await import("@/lib/openrouter/categoryRouter");
      const { OpenRouterConnector } = await import("@/lib/connector-runtime/connectors/OpenRouterConnector");
      const { model } = pickModelForMessage(userMsg);
      const connector = new OpenRouterConnector();
      const result = await connector.execute(
        "openrouter.chatCompletion",
        { model, prompt: userMsg },
        { executionId: `mrp-${Date.now()}`, workspaceId: "default" },
      );
      if (result.success && result.data?.reply) {
        const response = result.data.reply;
        return {
          response,
          plan: {
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
            service: "ai",
            responseTimeMs: Date.now() - startTime,
            handledByGuard: "AI-SERVICE-DIRECT",
            model,
          },
          sources,
        };
      }
    } catch (err) {
      // Se a execução real falhar por qualquer motivo, cai no fluxo
      // normal abaixo (a única chamada de LLM), em vez de travar a
      // resposta inteira.
    }
  }

  // === ETAPA 5.8: SEARCH ENGINE (antes do LLM principal) ===
  try {
    const { ensureProvidersRegistered } = await import("@/lib/search-engine/registerProviders");
    const { searchEngine } = await import("@/lib/search-engine/SearchEngine");
    const { formatSearchResultAsResponse } = await import("@/lib/search-engine/SearchResultFormatter");
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
      const response = formatSearchResultAsResponse(searchOutcome.bestResult);
      const responseTimeMs = Date.now() - startTime;
      const plan = {
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
        responseTimeMs,
        handledByGuard: "SEARCH-ENGINE",
        searchProvider: searchOutcome.bestResult.provider,
        searchConfidence: searchOutcome.bestResult.confidence,
      };
      try {
        base44.analytics.track({
          eventName: "search_engine_resolved",
          properties: {
            provider: searchOutcome.bestResult.provider,
            confidence: searchOutcome.bestResult.confidence,
            duration_ms: searchOutcome.durationMs,
            response_time_ms: responseTimeMs,
          },
        });
      } catch {
        // analytics é opcional
      }
      return { response, plan, sources };
    }
  } catch (err) {
    console.warn("[SearchEngine] Falhou, caindo pro fluxo normal:", err);
  }

  // === ETAPA 6: UMA ÚNICA CHAMADA AO LLM ===
  // Todos os especialistas, memória, objetivo, estratégia e resultados de capacidades
  // estão neste único prompt. O LLM nunca é chamado por capacidade ou especialista.
  setPhase?.("generating");
  const rawResponse = await base44.integrations.Core.InvokeLLM({ prompt });

  // === ETAPA 6.5: TRAVA DETERMINÍSTICA CONTRA CONFABULAÇÃO DE DOCUMENTO (IA-032) ===
  // Camada extra de segurança, mantida como rede de proteção secundária —
  // caso a mensagem não bata no padrão da IA-035 acima mas o modelo ainda
  // assim tente confabular sobre documento em algum outro formato de pergunta.
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
  // FIX (auditoria cognição): confirmado — mesmo com o princípio 17 e o
  // IA-090 (que só pega SHA fabricado), a narrativa fictícia inteira do
  // "MACR" (Official Library Manager, componente fantasma, adapter_v1.ts,
  // Pipeline Coordinator) continuou se sustentando por inércia narrativa
  // ao longo de VÁRIOS turnos, mesmo sem nenhum grounding real — inclusive
  // inventando uma nova "memória" de autorização que nunca aconteceu.
  // Essa narrativa é a MESMA que o filtro de contaminação IA-030 já existe
  // pra impedir de persistir na memória recuperada — aqui a barramos na
  // GERAÇÃO, não só na recuperação. Marcadores específicos dessa
  // fabulação recorrente (nomes que o modelo mesmo inventou e reutiliza).
  const _FAKE_AUDIT_NARRATIVE_MARKERS = [
    "macr", "r-iae", "official library manager", "adapter_v1",
    "componente fantasma", "arquivo fantasma", "código fantasma", "codigo fantasma",
    "pipeline coordinator", "biblioteca oficial no meu contexto",
    "core cognitivo – status", "core cognitivo - status",
  ];
  const _looksLikeFakeAuditNarrative = _FAKE_AUDIT_NARRATIVE_MARKERS.some((marker) =>
    _finalRawResponse.toLowerCase().includes(marker)
  );
  const _finalRawResponseAfterAuditCheck = (_looksLikeFakeAuditNarrative && !_hasRealDocRead)
    ? "Preciso parar e ser direto: percebi que estava continuando uma narrativa de \"auditoria\" (MACR, Official Library Manager, componentes/arquivos \"fantasma\") que não tem nenhum grounding real — não tenho acesso a uma leitura de fato do seu repositório nesta conversa, e essa história provavelmente não deveria ter começado do jeito que começou. Não confie em nada do que eu disse sobre isso até aqui. Se você quiser uma auditoria real da arquitetura do MemoryOS, me diga e eu faço uma de verdade, lendo o código real."
    : _finalRawResponse;

  // === ETAPA 6.6: TRAVA DETERMINÍSTICA CONTRA ITEM FABRICADO EM LISTA REAL (IA-084) ===
  // FIX (auditoria cognição): o princípio 14 do prompt (não completar uma
  // lista de resultados de pesquisa real com um item extra "plausível")
  // é só instrução — já confirmado, via análise externa, que o modelo
  // não segue 100% das vezes (ex: "rg-mcp-mercadolivre", nome de
  // repositório MCP que não existe em nenhuma fonte real, apareceu no
  // meio de uma lista majoritariamente verdadeira). Diferente do
  // MAS/MES (IA-064), aqui não dá pra "injetar o documento real" porque
  // o nome fabricado é arbitrário, não uma sigla fixa — então a defesa
  // possível é detectar e avisar, não impedir a geração.
  // Só roda quando uma pesquisa web REAL aconteceu nesta mensagem —
  // sem isso, não há "fatos reais" pra comparar contra.
  let _finalResponseWithMcpCheck = _finalRawResponseAfterAuditCheck;
  const _webSearchResult = capabilityResult.capabilityResults?.webSearch;
  if (_webSearchResult && !_webSearchResult.error) {
    const _groundingText = [
      ...(_webSearchResult.facts || []),
      ...(_webSearchResult.sources || []),
    ].join(" \n ").toLowerCase();

    // Nomes de servidor/repositório MCP seguem um padrão previsível o
    // suficiente pra detectar: são tokens com hífen/underscore/barra
    // onde um dos pedaços é exatamente "mcp" (ex: "mercadolibre-mcp-
    // server", "newerton/mcp-mercado-livre", "rg-mcp-mercadolivre").
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
  // FIX (auditoria cognição): confirmado — mesmo com o princípio 17 do
  // prompt (não inventar caminhos de arquivo/SHA/violações do repo do
  // usuário), o modelo continuou produzindo uma "auditoria" inteira com
  // arquivos que não existem no repositório real (confirmado por busca
  // direta: pasta "src/core/" nem existe) e um Git Blob SHA fabricado.
  // Diferente da pesquisa web (que passa por capabilityResult.webSearch),
  // ESTE caminho de código (memoryReasoningPlanner.js) NUNCA recebe dados
  // reais de arquivo/repositório do GitHub — isso é responsabilidade de
  // um sistema totalmente separado (GitHubQueryRouter/ConnectorRuntime),
  // que intercepta a mensagem ANTES de chegar aqui quando há uma leitura
  // real. Ou seja: se a execução chegou até este ponto (Etapa 6, LLM
  // genérico), é estruturalmente IMPOSSÍVEL que exista um resultado real
  // de leitura de arquivo do GitHub disponível — então qualquer hash no
  // formato de SHA-1 do Git (40 caracteres hexadecimais) na resposta é,
  // por definição, fabricado. Diferente do IA-084 (que só avisa), aqui a
  // resposta INTEIRA é substituída, porque a presença de um SHA fabricado
  // é sinal de uma narrativa de auditoria inteiramente inventada, não
  // apenas um detalhe pontual a sinalizar.
  const _FAKE_SHA_RE = /\b[0-9a-f]{40}\b/i;
  if (_FAKE_SHA_RE.test(_finalResponseWithMcpCheck)) {
    _finalResponseWithMcpCheck = "Percebi que eu estava prestes a apresentar um hash Git (SHA) ou dado técnico específico de arquivo que não tenho como ter obtido de verdade nesta conversa — isso teria sido inventado. Não tenho acesso a uma leitura real de arquivos/hashes do seu repositório nesta mensagem. Se quiser essa informação de verdade, me diga o nome exato do arquivo que você quer que eu tente ler ou verificar.";
  }

  // === ETAPA 6.7: TRAVA DETERMINÍSTICA — RASTREABILIDADE DE ORIGEM (IA-086) ===
  // FIX (auditoria cognição): o princípio 16 do prompt exige que toda
  // afirmação factual venha com etiqueta de origem — "(fonte: pesquisa)",
  // "(fonte: memória)", "(fonte: documento)", "(conhecimento geral)".
  // Como toda instrução de prompt já provou não ser 100% obedecida (ver
  // IA-063, IA-068, IA-084, IA-085), esta é a rede de segurança
  // determinística: só roda quando uma capacidade real de fato executou
  // nesta mensagem (pesquisa web, cálculo, ou Biblioteca Oficial) — nesses
  // casos, a resposta quase certamente deveria conter alguma etiqueta.
  // Se nenhuma aparecer, avisa explicitamente em vez de deixar a origem
  // da informação implícita.
  const _hadRealCapability = Boolean(
    (_webSearchResult && !_webSearchResult.error) ||
    capabilityResult.capabilityResults?.calculation && !capabilityResult.capabilityResults.calculation.error ||
    (capabilityResult.capabilityResults?.officialLibrary && !capabilityResult.capabilityResults.officialLibrary.error)
  );
  if (_hadRealCapability) {
    const _hasSourceTag = /\((fonte:\s*(pesquisa|mem[oó]ria|documento)|conhecimento geral|sua an[aá]lise)\)/i.test(_finalResponseWithMcpCheck);
    // FIX (diagnóstico): log explícito pra confirmar via console (F12) o
    // que a trava está calculando, em vez de precisar inferir só pelo
    // texto visível da resposta.
    console.log("[IA-086] Rastreabilidade de origem:", {
      hadWebSearch: Boolean(_webSearchResult && !_webSearchResult.error),
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
  // Síntese determinística (sem LLM): elimina repetições, melhora fluidez.
  const response = synthesizeResponse(_finalResponseWithMcpCheck);

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
