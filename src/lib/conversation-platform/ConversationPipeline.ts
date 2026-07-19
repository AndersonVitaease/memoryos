/**
 * ConversationPipeline.ts
 * Replaces sendAndReceive() entirely.
 * Divides into: Prepare → Persist → Reason → Route → Capabilities → Synthesize → Stream → Finalize
 * Each step has timeout, metrics, and recovery.
 * MDS v2.0 compliant
 */

import { initializePlatform } from "@/lib/platform/PlatformBootstrap";
import { conversationStore } from "./ConversationStore";
import { conversationStreaming } from "./ConversationStreaming";
import { conversationRecovery } from "./ConversationRecovery";
import { conversationMetrics } from "./ConversationMetrics";
import { persistMessage } from "./ConversationPersistence";
import { buildConversationContext, contextToPromptParts, historyToText } from "./ConversationContext";
import type { PipelineExecution, PipelineStep, ReasoningPhase } from "./CXPTypes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeStep(name: string, label: string): PipelineStep {
  return { name, label, status: "pending" };
}

// ─── ConversationPipeline ─────────────────────────────────────────────────────

class ConversationPipeline {
  private _currentExecutionId: string | null = null;
  private _cancelled = false;

  get isRunning(): boolean {
    return this._currentExecutionId !== null;
  }

  // ── Main Entry Point ──────────────────────────────────────────────────────

  async send(userMessage: string): Promise<void> {
    if (this.isRunning) return;
    this._cancelled = false;

    const session = conversationStore.session;
    if (!session) throw new Error("No active session");

    const executionId = makeId();
    this._currentExecutionId = executionId;

    const steps: PipelineStep[] = [
      makeStep("prepare", "Preparando"),
      makeStep("persist_user", "Salvando mensagem"),
      makeStep("context", "Recuperando memoria"),
      makeStep("route", "Consultando especialistas"),
      makeStep("synthesize", "Construindo resposta"),
      makeStep("stream", "Respondendo"),
      makeStep("finalize", "Finalizando"),
    ];

    const execution: PipelineExecution = {
      id: executionId,
      sessionId: session.id,
      userMessage,
      steps,
      startedAt: Date.now(),
      status: "running",
    };

    conversationStore.setCurrentExecution(execution);
    conversationStore.setStatus("preparing");
    conversationMetrics.begin(executionId, session.id);

    conversationStore.emit({
      type: "CONVERSATION_STARTED",
      executionId,
      sessionId: session.id,
      payload: { userMessage },
      timestamp: Date.now(),
    });

    try {
      await conversationRecovery.guardedExecution(
        executionId,
        () => this._runPipeline(executionId, userMessage, steps),
        {
          maxAttempts: 1, // pipeline handles its own retry per step
          onRetry: () => conversationMetrics.recordRecoveryAttempt(executionId),
        }
      );
    } finally {
      conversationRecovery.safeReset(executionId);
      this._currentExecutionId = null;
      const metrics = conversationMetrics.finalize(
        executionId,
        conversationStore.state.streamSession?.tokensPerSecond
      );
      conversationStore.emit({
        type: "PIPELINE_DONE",
        executionId,
        payload: { metrics },
        timestamp: Date.now(),
      });
    }
  }

  // ── Pipeline Stages ───────────────────────────────────────────────────────

  private async _runPipeline(
    executionId: string,
    userMessage: string,
    steps: PipelineStep[]
  ): Promise<void> {
    const session = conversationStore.session!;
    const messages = conversationStore.messages;

    const setStep = (name: string, status: PipelineStep["status"]) => {
      const step = steps.find((s) => s.name === name);
      if (step) {
        step.status = status;
        if (status === "running") step.startedAt = Date.now();
        if (status === "done" || status === "error") {
          step.finishedAt = Date.now();
          step.durationMs = (step.finishedAt ?? 0) - (step.startedAt ?? 0);
        }
      }
      conversationStore.emit({
        type: "PIPELINE_STEP",
        executionId,
        payload: { step: name, status },
        timestamp: Date.now(),
      });
    };

    const setPhase = (phase: ReasoningPhase) => {
      conversationStore.setReasoningPhase(phase);
    };

    // ── 1. Prepare ───────────────────────────────────────────────────────
    if (this._cancelled) return;
    setStep("prepare", "running");
    conversationStore.setStatus("preparing");
    setStep("prepare", "done");

    // ── 2. Persist User Message ──────────────────────────────────────────
    if (this._cancelled) return;
    setStep("persist_user", "running");
    conversationStore.setStatus("persisting");

    const savedUser = await persistMessage({
      sessionId: session.id,
      projectId: session.project_id,
      role: "user",
      content: userMessage,
    });
    conversationStore.appendMessage(savedUser);
    conversationStore.emit({
      type: "MESSAGE_SAVED",
      executionId,
      payload: { messageId: savedUser.id, role: "user" },
      timestamp: Date.now(),
    });
    setStep("persist_user", "done");

    // ── 3. Build Context ─────────────────────────────────────────────────
    if (this._cancelled) return;
    setStep("context", "running");
    conversationStore.setStatus("reasoning");
    setPhase("retrieving_memory");
    const t0ctx = Date.now();

    const ctx = await buildConversationContext(session, [...messages, savedUser], setPhase);
    conversationMetrics.recordContextBuildMs(executionId, Date.now() - t0ctx);

    conversationStore.emit({
      type: "CONTEXT_READY",
      executionId,
      payload: { hasEntities: !!ctx.entitiesContext, hasTopics: !!ctx.topicsContext },
      timestamp: Date.now(),
    });
    setStep("context", "done");

    // ── 4. Route + Reason ────────────────────────────────────────────────
    if (this._cancelled) return;
    setStep("route", "running");
    conversationStore.setStatus("routing");
    setPhase("consulting_specialists");

    const historyMessages = [...messages, savedUser];
    conversationMetrics.markPhase(executionId, "llm_start");
    const t0synth = Date.now();

    let response = "";
    let sources: string[] = [];

    try {
      // Import lazily to avoid circular deps
      const { runReasoningPlan } = await import("@/lib/reasoning/memoryReasoningPlanner");
      const { primaryRouter } = await import("@/lib/primary-conversation-router/PrimaryConversationRouter");
      const { responseTracer } = await import("@/lib/response-binding/ResponseBindingTracer");
      const { conversationGoalBridge } = await import("@/lib/conversation-goal-bridge/ConversationGoalBridge");

      const traceId = responseTracer.beginTrace(userMessage, session.id);
      const routerResult = await primaryRouter.route(
        userMessage,
        session.id,
        session.project_id ?? null,
        historyMessages.length
      );
      responseTracer.recordRouterDecision(traceId, routerResult.decision, routerResult.intent?.intent, routerResult.durationMs);

      // ── Sprint 8.11: Unified Context Builder ────────────────────────────
      // Builds the full cognitive context BEFORE GoalBridge.
      // Pure composition: reads sources, no connectors executed, no planning.
      let unifiedCtx: import("@/lib/unified-context/UnifiedContextTypes").UnifiedContext | null = null;
      try {
        const { unifiedContextBuilder } = await import("@/lib/unified-context/UnifiedContextBuilder");
        unifiedCtx = await unifiedContextBuilder.build(
          userMessage,
          session.id,
          session.project_id ?? null,
          session.summary ?? null,
          historyMessages.map((m) => ({ role: m.role, content: m.content })),
        );
        conversationStore.emit({
          type: "PIPELINE_STEP",
          executionId,
          payload: {
            step:          "unified_context_built",
            buildId:       unifiedCtx.buildId,
            intent:        unifiedCtx.intent,
            durationMs:    unifiedCtx.durationMs,
            confidence:    unifiedCtx.confidence,
            sourceCount:   unifiedCtx.sources.length,
            sourcesUsed:   unifiedCtx.sources.map((s) => s.sourceId),
            connectors:    unifiedCtx.connectorAvailability,
          },
          timestamp: Date.now(),
        });
      } catch {
        // UCB failure is non-blocking — pipeline continues without unified context
      }
      // ── end Sprint 8.11 ─────────────────────────────────────────────────

      // ── Sprint 8.12 / 8.12.1: Knowledge Fusion Engine ───────────────────────
      // Official pipeline: UnifiedContext → KnowledgeNormalizer → RawKnowledgeUnit[]
      //                    → KnowledgeFusionEngine → UnifiedKnowledgeModel
      // No inline transformation. KnowledgeNormalizer is the sole UCB→KFE adapter.
      let kfmModel: import("@/lib/knowledge-fusion-engine/KFETypes").UnifiedKnowledgeModel | null = null;
      try {
        const { knowledgeFusionEngine } = await import("@/lib/knowledge-fusion-engine/KnowledgeFusionEngine");
        const { knowledgeNormalizer }   = await import("@/lib/knowledge-fusion-engine/KnowledgeNormalizer");

        // Step 1: Normalize — only if UCB produced a context
        const normResult = unifiedCtx
          ? knowledgeNormalizer.normalize(unifiedCtx)
          : { units: [], unitCount: 0, buildId: `kfe-${Date.now()}` };

        // Step 2: Fuse
        const kfeResult = knowledgeFusionEngine.fuse({
          buildId:   normResult.buildId,
          units:     normResult.units,
          sessionId: session.id,
        });
        if (kfeResult.success) {
          kfmModel = kfeResult.model;
          conversationStore.emit({
            type: "PIPELINE_STEP",
            executionId,
            payload: {
              step:          "knowledge_model_built",
              modelId:       kfmModel.modelId,
              entities:      kfmModel.statistics.totalEntities,
              relationships: kfmModel.statistics.totalRelationships,
              conflicts:     kfmModel.statistics.totalConflicts,
              duplicates:    kfmModel.statistics.duplicatesRemoved,
              confidence:    kfmModel.confidence,
              durationMs:    kfeResult.durationMs,
            },
            timestamp: Date.now(),
          });
        }
      } catch {
        // KFE failure is non-blocking
      }
      // ── Sprint M-03: Knowledge Graph Population ─────────────────────────────
      // Persist the UnifiedKnowledgeModel into KnowledgeGraphStore via the
      // KnowledgeGraphBridge. Non-blocking — never delays the user response.
      // Only executes when KFE produced a successful model with entities.
      if (kfmModel !== null && kfmModel.statistics.totalEntities > 0) {
        try {
          const { knowledgeGraphBridge } = await import("@/lib/knowledge-fusion-engine/KnowledgeGraphBridge");
          const bridgeResult = knowledgeGraphBridge.persist(kfmModel, session.id);
          conversationStore.emit({
            type: "PIPELINE_STEP",
            executionId,
            payload: {
              step:        "knowledge_graph_updated",
              persisted:   bridgeResult.persisted,
              reason:      bridgeResult.reason,
              entityCount: bridgeResult.entityCount,
              durationMs:  bridgeResult.durationMs,
            },
            timestamp: Date.now(),
          });
        } catch {
          // Non-blocking — KGS update failure never affects user response
        }
      }
      // ── end Sprint M-03 ──────────────────────────────────────────────────

      // ── end Sprint 8.12 ──────────────────────────────────────────────────

      // ── E-02.1: Conversation → Goal Bridge ──────────────────────────────
      // Derives a structured ConversationGoal from the user message + classified intent.
      // The goal is NOT executed here — it is produced for Sprint E-02.2 (Goal → Planning).
      // This call is pure (no network, no connectors, no side effects).
      const goalBridgeResult = conversationGoalBridge.derive(
        userMessage,
        routerResult.intent?.intent ?? "general_conversation",
        routerResult.intent?.confidence ?? 0,
      );
      conversationStore.emit({
        type: "PIPELINE_STEP",
        executionId,
        payload: {
          step: "goal_derived",
          goalId:      goalBridgeResult.goal.id,
          goalType:    goalBridgeResult.goal.type,
          confidence:  goalBridgeResult.goal.confidence,
          valid:       goalBridgeResult.goal.valid,
          durationMs:  goalBridgeResult.durationMs,
        },
        timestamp: Date.now(),
      });
      // ── end E-02.1 ───────────────────────────────────────────────────────

      // ── E-02.5A: Planning → Real Runtime → Connector → Synthesize ──────────
      // Uses the real ConnectorCapabilityExecutor (UCR + ConnectorRegistry + GmailConnector).
      // When the runtime produces connector data, the synthesizer builds the final response
      // so the LLM path below is bypassed entirely for connector goals.
      // For general_conversation / unknown goals, steps=0 → synthesizer returns handled=false
      // → execution falls through to the LLM path unchanged.
      if (goalBridgeResult.goal.valid) {
        const { conversationPlanningEngine } = await import("@/lib/planning-engine-e022/ConversationPlanningEngine");
        const planResult = conversationPlanningEngine.plan(goalBridgeResult.goal);

        if (planResult.success && planResult.plan.steps.length > 0) {
          setPhase("executing_capabilities");
          const { getRealRuntimeEngine, getRealConnectorRegistry } = await import("@/lib/connector-runtime-provider/ConnectorRuntimeProvider");
          // [RUNTIME-PROBE][CXP-01] Pipeline entering Runtime execution — snapshot registry state NOW
          const _probeReg = getRealConnectorRegistry();
          console.log("[RUNTIME-PROBE][CXP-01]", {
            probe:           "pipeline:enteringRuntimeExecution",
            t:               performance.now(),
            ts:              Date.now(),
            executionId,
            sessionId:       session.id,
            goalType:        goalBridgeResult.goal.type,
            planId:          planResult.plan.id,
            planSteps:       planResult.plan.steps.map(s => `${s.connector}.${s.capability}`),
            regSize:         _probeReg.count(),
            regContents:     _probeReg.list(),
            driveRegistered: _probeReg.list().includes("google-drive"),
            note:            "CRITICAL: regSize===0 or driveRegistered===false means placeholder engine will be used.",
          });
          const executionResult = await getRealRuntimeEngine().execute(planResult.plan);

          conversationStore.emit({
            type: "PIPELINE_STEP",
            executionId,
            payload: {
              step:        "runtime_executed",
              runtimeId:   executionResult.executionId,
              planId:      executionResult.planId,
              status:      executionResult.status,
              stepCount:   executionResult.steps.length,
              durationMs:  executionResult.durationMs,
              errors:      executionResult.errors,
            },
            timestamp: Date.now(),
          });

          // Synthesize connector output → user-facing response
          // Sprint M-05: pass kfmModel so the synthesizer can enrich the LLM prompt
          // with fused knowledge (entities, topics, decisions, tasks).
          const { synthesizeConnectorResult } = await import("@/lib/connector-runtime-provider/ConnectorResultSynthesizer");
          const synthesis = await synthesizeConnectorResult(
            executionResult,
            userMessage,
            goalBridgeResult.goal.type,
            kfmModel,
          );

          if (synthesis.handled && synthesis.response) {
            // Connector handled this request — bypass LLM path entirely
            response = synthesis.response;
            sources  = [];
            conversationStore.emit({
              type: "PIPELINE_STEP",
              executionId,
              payload: { step: "connector_response_synthesized", goalType: goalBridgeResult.goal.type },
              timestamp: Date.now(),
            });
          }
        }
      }
      // ── end E-02.5A ──────────────────────────────────────────────────────

      setStep("route", "done");
      setStep("synthesize", "running");
      conversationStore.setStatus("synthesizing");
      setPhase("building_response");

      // If a connector already handled the response (E-02.5A), skip the LLM path.
      if (response) {
        responseTracer.recordRendered(traceId, response);
      } else if (routerResult.decision === "cognitive_pipeline" && routerResult.cognitiveAnswer?.answer) {
        const ca = routerResult.cognitiveAnswer;
        responseTracer.recordPipelineAnswer(traceId, ca.answer, ca.executionId, ca.stagesExecuted, ca.confidence, ca.evidenceSources, ca.durationMs);
        response = ca.answer;
        sources = [];
      } else {
        setPhase("executing_capabilities");
        // Sprint M-05: build kfmContext string from UnifiedKnowledgeModel so the
        // LLM reasoning path also benefits from fused knowledge.
        // Non-blocking: if kfmModel is null or empty, kfmContext remains undefined.
        let kfmContext: string | undefined;
        if (kfmModel && kfmModel.statistics.totalEntities > 0) {
          const lines: string[] = [];
          if (kfmModel.entities.length > 0)
            lines.push(`- Entidades: ${kfmModel.entities.slice(0, 10).map((e) => e.canonicalValue).join(", ")}`);
          if (kfmModel.topics.length > 0)
            lines.push(`- Topicos ativos: ${kfmModel.topics.slice(0, 5).map((t) => t.canonicalValue).join(", ")}`);
          if (kfmModel.decisions.length > 0)
            lines.push(`- Decisoes: ${kfmModel.decisions.slice(0, 3).map((d) => d.canonicalValue).join("; ")}`);
          if (kfmModel.tasks.length > 0)
            lines.push(`- Tarefas: ${kfmModel.tasks.slice(0, 3).map((t) => t.canonicalValue).join("; ")}`);
          if (lines.length > 0)
            kfmContext = `Confianca do modelo: ${Math.round(kfmModel.confidence * 100)}%\n${lines.join("\n")}`;
        }
        const plan = await runReasoningPlan({
          userMsg: userMessage,
          session,
          historyMessages,
          kfmContext,
          setPhase: (p: string) => {
            if (p === "retrieving") setPhase("retrieving_memory");
            else if (p === "routing") setPhase("consulting_specialists");
            else if (p === "generating") setPhase("building_response");
            else setPhase("responding");
          },
        });
        response = plan.response;
        sources = (plan.sources ?? []).map((s: { id: string }) => s.id);
        const fallbackReason = routerResult.decision === "cognitive_pipeline" ? "EMPTY_PIPELINE_ANSWER" : "GENERAL_CONVERSATION";
        responseTracer.recordFallback(traceId, fallbackReason, response, Date.now() - t0synth);
        responseTracer.recordRendered(traceId, response);
      }
    } catch (err) {
      // Fallback response on reasoning failure
      response = "Nao consegui processar sua mensagem. Por favor, tente novamente.";
      sources = [];
    }

    conversationMetrics.recordSynthesisMs(executionId, Date.now() - t0synth);
    setStep("synthesize", "done");

    // ── 5. Stream Response ───────────────────────────────────────────────
    if (this._cancelled) return;
    setStep("stream", "running");
    conversationStore.setStatus("streaming");
    setPhase("responding");

    // Insert placeholder message for streaming
    const streamMsgId = makeMsgId();
    const streamingPlaceholder = {
      id: streamMsgId,
      session_id: session.id,
      role: "assistant" as const,
      content: "",
      streamingContent: "",
      isStreaming: true,
      memory_tier: "active" as const,
      sources_used: sources,
    };
    conversationStore.appendMessage(streamingPlaceholder);

    await conversationStreaming.streamResponse({
      executionId,
      messageId: streamMsgId,
      fullContent: response,
      onChunk: () => {
        // Record first token timing
        if (!conversationStore.state.streamSession?.firstTokenAt) {
          conversationMetrics.recordFirstToken(executionId);
        }
      },
    });

    setStep("stream", "done");

    // ── 6. Persist Assistant Message ─────────────────────────────────────
    if (this._cancelled) return;
    setStep("finalize", "running");
    conversationStore.setStatus("finalizing");

    try {
      const savedAssistant = await persistMessage({
        sessionId: session.id,
        projectId: session.project_id,
        role: "assistant",
        content: response,
        sources_used: sources,
      });

      // Replace the streaming placeholder with the persisted message
      conversationStore.updateMessage(streamMsgId, {
        id: savedAssistant.id,
        content: response,
        streamingContent: undefined,
        isStreaming: false,
        sources_used: sources,
      });

      conversationStore.emit({
        type: "MESSAGE_SAVED",
        executionId,
        payload: { messageId: savedAssistant.id, role: "assistant" },
        timestamp: Date.now(),
      });
    } catch {
      // Non-critical — message is visible even if persist fails
    }

    conversationStore.setStatus("idle");
    conversationStore.setReasoningPhase("idle");
    setStep("finalize", "done");

    // ── 7. Background batch processing ──────────────────────────────────
    this._backgroundProcessing(session, [...messages, savedUser]).catch(() => {});
  }

  // ── Background Processing ─────────────────────────────────────────────────

  private async _backgroundProcessing(
    session: { id: string; title: string; project_id?: string },
    allMessages: { role: string; content: string }[]
  ): Promise<void> {
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
    } catch {
      // background — never block UI
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  cancel(): void {
    this._cancelled = true;
    if (this._currentExecutionId) {
      conversationStreaming.cancel(this._currentExecutionId);
      conversationMetrics.recordCancellation(this._currentExecutionId);
    }
    conversationRecovery.safeReset(this._currentExecutionId ?? "");
    this._currentExecutionId = null;
  }

  // ── Retry ─────────────────────────────────────────────────────────────────

  async retry(userMessage: string): Promise<void> {
    this.cancel();
    await new Promise((r) => setTimeout(r, 300));
    return this.send(userMessage);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

// ─── Platform initialization ──────────────────────────────────────────────────
// Single call — all registries initialized before any pipeline executes.
initializePlatform();

const _key = "__CXP_PIPELINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_key]) {
  (globalThis as unknown as Record<string, unknown>)[_key] = new ConversationPipeline();
}

export const conversationPipeline: ConversationPipeline = (
  globalThis as unknown as Record<string, ConversationPipeline>
)[_key];

export { ConversationPipeline };