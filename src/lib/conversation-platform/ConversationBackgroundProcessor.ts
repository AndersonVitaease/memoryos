/**
 * ConversationBackgroundProcessor.ts
 *
 * Responsabilidade: executar tarefas de background apos cada turno da pipeline.
 * Extraido de ConversationPipeline._backgroundProcessing() para manter
 * o arquivo principal abaixo do limite de linhas.
 *
 * Tarefas atuais:
 *   1. [KR-01] Knowledge Registry Shadow Mode — registra observacoes
 *   2. processConversationBatch — extrai entities/topics/decisions a cada 5 msgs
 *   3. autoTitleIfNeeded — nomeia a sessao automaticamente
 */

// ── Input types ───────────────────────────────────────────────────────────────

export interface BackgroundObsContext {
  readonly executionId:    string;
  readonly userMessage:    string;
  readonly goalType?:      string | null;
  readonly goalValid?:     boolean;
  readonly goalConfidence?: number;
  readonly finalResponse?: string | null;
  readonly producerPath?:  string;
  readonly durationMs?:    number;
}

export interface BackgroundSession {
  readonly id:         string;
  readonly title:      string;
  readonly project_id?: string;
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function runBackgroundProcessing(
  session:     BackgroundSession,
  allMessages: { role: string; content: string }[],
  obsCtx?:     BackgroundObsContext,
): Promise<void> {

  // ── [KR-01] Knowledge Registry Shadow Mode ───────────────────────────────
  if (obsCtx) {
    try {
      const { pipelineObservationBridge } = await import("@/lib/knowledge-registry/PipelineObservationBridge");
      pipelineObservationBridge.observe({
        executionId:    obsCtx.executionId,
        sessionId:      session.id,
        projectId:      session.project_id ?? null,
        userMessage:    obsCtx.userMessage,
        goalType:       obsCtx.goalType ?? null,
        goalValid:      obsCtx.goalValid,
        goalConfidence: obsCtx.goalConfidence,
        finalResponse:  obsCtx.finalResponse ?? null,
        producerPath:   obsCtx.producerPath,
        durationMs:     obsCtx.durationMs,
      });
    } catch { /* shadow nunca bloqueia producao */ }
  }
  // ── [END KR-01] ──────────────────────────────────────────────────────────

  // ── [P1] KnowledgeGraphEngine — build a cada 5 mensagens do usuário ─────
  const _userMsgsForKG = allMessages.filter((m) => m.role === "user").length;
  if (_userMsgsForKG > 0 && _userMsgsForKG % 5 === 0) {
    try {
      const { knowledgeGraphEngine } = await import("@/lib/knowledge-registry/KnowledgeGraphEngine");
      void knowledgeGraphEngine.buildForSession(session.id, session.project_id).then((r) => {
        if (r.ok) console.debug(`[KGE] Grafo atualizado: ${r.nodeCount} nós, ${r.edgeCount} arestas em ${r.durationMs}ms`);
      }).catch(() => {});
    } catch { /* nunca bloqueia */ }
  }
  // ── [END P1 KnowledgeGraphEngine] ────────────────────────────────────────

  // ── [KR-02] StateView — build periódico a cada 3 turnos do usuário ──────
  const _userMsgsForSV = allMessages.filter((m) => m.role === "user").length;
  if (_userMsgsForSV > 0 && _userMsgsForSV % 3 === 0) {
    try {
      const { stateViewEngine } = await import("@/lib/knowledge-registry/StateViewEngine");
      const svResult = await stateViewEngine.buildForSession(session.id, session.project_id);
      console.debug("[KR-02][StateView] built:", {
        sessionId:    session.id,
        totalObjects: svResult.totalObjects,
        durationMs:   svResult.durationMs,
      });
    } catch { /* nunca bloqueia */ }
  }
  // ── [END KR-02] ──────────────────────────────────────────────────────────

  // ── [KR-03] Cognitive Pruning — fire-and-forget, a cada 10 msgs ─────────
  const totalMessages = allMessages.length;
  if (totalMessages > 0 && totalMessages % 10 === 0) {
    try {
      const { cognitivePruningService } = await import("@/lib/knowledge-registry/CognitivePruningService");
      void cognitivePruningService.runForSession(session.id, session.project_id).catch(() => {});
    } catch { /* nunca bloqueia */ }
  }
  // ── [END KR-03] ──────────────────────────────────────────────────────────

  // ── [P2] Memory Tiering — a cada 20 msgs ou primeira msg da sessão ───────
  if (totalMessages === 1 || (totalMessages > 0 && totalMessages % 20 === 0)) {
    try {
      const { memoryTieringService } = await import("@/lib/memory-tiering/MemoryTieringService");
      void memoryTieringService.run().then((r) => {
        if (r.promoted > 0) console.debug(`[MemoryTiering] ${r.promoted} promovidos em ${r.durationMs}ms`);
      }).catch(() => {});
    } catch { /* nunca bloqueia */ }
  }
  // ── [END P2 Memory Tiering] ───────────────────────────────────────────────

  // ── Batch processing (a cada 5 msgs do usuario) ──────────────────────────
  const userCount = allMessages.filter((m) => m.role === "user").length;
  if (userCount % 5 !== 0) return;

  try {
    const { processConversationBatch } = await import("@/lib/conversationEngine");
    const knowledge = await processConversationBatch(session, allMessages, session.project_id);
    if (knowledge?.summary) {
      const { sessionManager } = await import("./ConversationSessionManager");
      await sessionManager.syncSessionMetadata(session.id, { summary: knowledge.summary });
    }
    if (session.title === "Nova conversa" && allMessages.length > 0) {
      const { sessionManager } = await import("./ConversationSessionManager");
      await sessionManager.autoTitleIfNeeded(allMessages[0].content);
    }
  } catch { /* background — never block UI */ }
}