/**
 * ConversationPipeline.ts — v2 (Execution Outcome Architecture)
 *
 * Divides into: Prepare → Persist → Reason → Route → Capabilities → Synthesize → Stream → Finalize
 *
 * v2 CHANGES:
 *   - Every producer now creates an ExecutionOutcome via ExecutionOutcomeAdapterFactory.
 *   - All response-decision logic (if/else priority, short-circuit, manual precedence)
 *     removed from the Pipeline.
 *   - All candidates are collected and delivered to ResponseArbiter.
 *   - ResponseArbiter.arbitrate() is the SOLE authority on which response is used.
 *   - Pipeline becomes a pure orchestrator: execute → collect outcomes → arbiter → stream.
 *
 * MDS v2.0 compliant
 */

import { initializePlatform } from "@/lib/platform/PlatformBootstrap";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";
import { conversationStore } from "./ConversationStore";
import { conversationStreaming } from "./ConversationStreaming";
import { conversationRecovery } from "./ConversationRecovery";
import { conversationMetrics } from "./ConversationMetrics";
import { persistMessage } from "./ConversationPersistence";
import { buildConversationContext } from "./ConversationContext";
import type { PipelineExecution, PipelineStep, ReasoningPhase } from "./CXPTypes";
import { executionOutcomeAdapterFactory } from "@/lib/response-arbiter/ExecutionOutcomeAdapterFactory";
import { responseArbiter } from "@/lib/response-arbiter/ResponseArbiter";
import type { ResponseCandidate } from "@/lib/response-arbiter/ResponseCandidate";
import type { ArbitrationContext } from "@/lib/response-arbiter/ResponseArbiter";
import type { ExecutionDomain } from "@/lib/response-arbiter/ExecutionOutcomeTypes";

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

// ─── ConversationPipeline v2 ──────────────────────────────────────────────────

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
      makeStep("prepare",      "Preparando"),
      makeStep("persist_user", "Salvando mensagem"),
      makeStep("context",      "Recuperando memoria"),
      makeStep("route",        "Consultando especialistas"),
      makeStep("synthesize",   "Construindo resposta"),
      makeStep("stream",       "Respondendo"),
      makeStep("finalize",     "Finalizando"),
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

    // ── [M1.11 AUDIT PROBE — PIPELINE] ───────────────────────────────────
    try {
      const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
      if (AUDIT_MODE) {
        driveAuditStore.beginTrace(executionId, userMessage);
        driveAuditStore.record("pipeline", "ok", {
          executionId,
          userMessage: userMessage.slice(0, 200),
          sessionId: session.id,
          timestamp: new Date().toISOString(),
          version: "v2",
        });
      }
    } catch { /* non-blocking */ }
    // ── [END M1.11 AUDIT PROBE] ──────────────────────────────────────────

    conversationMetrics.begin(executionId, session.id);

    // ── [EF-49.2] Pipeline Instrument — non-blocking, zero behavioral impact ──
    try {
      const { ef492Store } = await import("@/lib/ef492/RuntimePipelineInstrument");
      ef492Store.begin(executionId, userMessage);
      ef492Store.record(executionId, {
        layer: "ConversationPipeline", source: "production_runtime",
        timestamp: Date.now(), durationMs: null,
        input: `userMessage="${userMessage.slice(0, 80)}"`,
        output: "pipeline started",
        caller: "ConversationManager.send()",
        next: "PrimaryConversationRouter",
        status: "executed",
      });
    } catch { /* never block production */ }
    // ── [END EF-49.2] ────────────────────────────────────────────────────────

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
          maxAttempts: 1,
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
    const session  = conversationStore.session!;
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

    // ── 4. Route + Reason + Collect Candidates ───────────────────────────
    // v2: Each producer generates a ResponseCandidate via ExecutionOutcome.
    //     No manual if/else decision. All candidates go to ResponseArbiter.
    if (this._cancelled) return;
    setStep("route", "running");
    conversationStore.setStatus("routing");
    setPhase("consulting_specialists");

    const historyMessages = [...messages, savedUser];
    conversationMetrics.markPhase(executionId, "llm_start");
    const t0synth = Date.now();

    // ── Candidate collection — ONE per producer ───────────────────────────
    const candidates: ResponseCandidate[] = [];
    let sources: string[] = [];

    // Detect preferred domain for arbiter (from router, non-blocking)
    let preferredDomain: ArbitrationContext["preferredDomain"] = null;

    try {
      const { runReasoningPlan }      = await import("@/lib/reasoning/memoryReasoningPlanner");
      const { primaryRouter }         = await import("@/lib/primary-conversation-router/PrimaryConversationRouter");
      const { responseTracer }        = await import("@/lib/response-binding/ResponseBindingTracer");
      const { conversationGoalBridge }= await import("@/lib/conversation-goal-bridge/ConversationGoalBridge");

      const traceId     = responseTracer.beginTrace(userMessage, session.id);
      const t0route     = Date.now();

      // [EF-49.2] Router probe
      try {
        const { ef492Store } = await import("@/lib/ef492/RuntimePipelineInstrument");
        ef492Store.record(executionId, {
          layer: "PrimaryConversationRouter", source: "production_runtime",
          timestamp: Date.now(), durationMs: null,
          input: `message="${userMessage.slice(0, 80)}"`,
          output: "RouterResult { decision, intent }",
          caller: "ConversationPipeline._runPipeline",
          next: "ConversationGoalBridge",
          status: "executed",
        });
      } catch { /* non-blocking */ }

      const routerResult = await primaryRouter.route(
        userMessage,
        session.id,
        session.project_id ?? null,
        historyMessages.length
      );
      responseTracer.recordRouterDecision(traceId, routerResult.decision, routerResult.intent?.intent, routerResult.durationMs);

      // ── Sprint 8.11: Unified Context Builder ────────────────────────────
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
            step:        "unified_context_built",
            buildId:     unifiedCtx.buildId,
            intent:      unifiedCtx.intent,
            durationMs:  unifiedCtx.durationMs,
            confidence:  unifiedCtx.confidence,
            sourceCount: unifiedCtx.sources.length,
            sourcesUsed: unifiedCtx.sources.map((s) => s.sourceId),
            connectors:  unifiedCtx.connectorAvailability,
          },
          timestamp: Date.now(),
        });
      } catch { /* non-blocking */ }
      // ── end Sprint 8.11 ─────────────────────────────────────────────────

      // ── Sprint 8.12: Knowledge Fusion Engine ────────────────────────────
      let kfmModel: import("@/lib/knowledge-fusion-engine/KFETypes").UnifiedKnowledgeModel | null = null;
      try {
        const { knowledgeFusionEngine } = await import("@/lib/knowledge-fusion-engine/KnowledgeFusionEngine");
        const { knowledgeNormalizer }   = await import("@/lib/knowledge-fusion-engine/KnowledgeNormalizer");
        const normResult = unifiedCtx
          ? knowledgeNormalizer.normalize(unifiedCtx)
          : { units: [], unitCount: 0, buildId: `kfe-${Date.now()}` };
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
      } catch { /* non-blocking */ }

      // ── Sprint M-03: Knowledge Graph Population ──────────────────────────
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
        } catch { /* non-blocking */ }
      }
      // ── end Sprint M-03 / 8.12 ──────────────────────────────────────────

      // ── [EF-42] Runtime Introspection Intercept ──────────────────────────────
      // Detects questions about the Runtime's own internal state and answers
      // them directly — zero Connector, zero LLM, zero Planner.
      // REVERSAO: remover este bloco try/catch e apagar src/lib/runtime-introspection/.
      try {
        const { runtimeIntrospectionRouter } = await import("@/lib/runtime-introspection/RuntimeIntrospectionRouter");
        const rifResult = runtimeIntrospectionRouter.intercept(userMessage);
        if (rifResult.intercepted && rifResult.candidate) {
          candidates.push(rifResult.candidate);
          preferredDomain = "general";
          conversationStore.emit({
            type: "PIPELINE_STEP", executionId,
            payload: { step: "runtime_introspection_intercepted", reason: rifResult.reason },
            timestamp: Date.now(),
          });
          setStep("route", "done");
          setStep("synthesize", "running");
          conversationStore.setStatus("synthesizing");
          setPhase("building_response");
          const _rifArb = responseArbiter.arbitrate(candidates, { preferredDomain, userMessage, sessionId: session.id });
          const _rifFinal = _rifArb.selected.answer ?? "Nao foi possivel responder a introspeccao de runtime.";
          conversationMetrics.recordSynthesisMs(executionId, Date.now() - t0synth);
          setStep("synthesize", "done");
          setStep("stream", "running");
          conversationStore.setStatus("streaming");
          setPhase("responding");
          const _rifMsgId = makeMsgId();
          conversationStore.appendMessage({ id: _rifMsgId, session_id: session.id, role: "assistant", content: "", streamingContent: "", isStreaming: true, memory_tier: "active", sources_used: [] });
          await conversationStreaming.streamResponse({ executionId, messageId: _rifMsgId, fullContent: _rifFinal, onChunk: () => {} });
          setStep("stream", "done");
          setStep("finalize", "running");
          conversationStore.setStatus("finalizing");
          try {
            const _rifSaved = await persistMessage({ sessionId: session.id, projectId: session.project_id, role: "assistant", content: _rifFinal, sources_used: [] });
            conversationStore.updateMessage(_rifMsgId, { id: _rifSaved.id, content: _rifFinal, streamingContent: undefined, isStreaming: false, sources_used: [] });
          } catch { /* non-critical */ }
          conversationStore.setStatus("idle");
          conversationStore.setReasoningPhase("idle");
          setStep("finalize", "done");
          return; // Pipeline complete via introspection path
        }
      } catch { /* non-blocking — fall through to normal pipeline */ }
      // ── [END EF-42] ──────────────────────────────────────────────────────────

      // ── E-02.1: Conversation → Goal Bridge ──────────────────────────────
      // [EXP-RUNTIME-CONTEXT-LAYER] resolveContinuation — BEFORE Router/GoalBridge
      // REVERSAO: remover este bloco try/catch e apagar src/lib/runtime-context/
      let _rclContinuation: import("@/lib/runtime-context/RuntimeContextLayer").ContinuationResolution | null = null;
      try {
        const { runtimeContextLayer } = await import("@/lib/runtime-context/RuntimeContextLayer");
        _rclContinuation = runtimeContextLayer.resolveContinuation(userMessage);
      } catch { /* non-blocking */ }
      // [END EXP-RUNTIME-CONTEXT-LAYER]

      // [EF-49.2 probe] GoalBridge
      try { const { ef492Store: _s } = await import("@/lib/ef492/RuntimePipelineInstrument"); _s.record(executionId, { layer: "ConversationGoalBridge", source: "production_runtime", timestamp: Date.now(), durationMs: null, input: "routerResult.intent", output: "GoalBridgeResult.goal", caller: "ConversationPipeline", next: "ConversationPlanningEngine", status: "executed" }); } catch { /* non-blocking */ }
      const goalBridgeResult = conversationGoalBridge.derive(
        userMessage,
        // [EXP-RUNTIME-CONTEXT-LAYER] inject resolved goalType for continuation messages
        _rclContinuation?.resolvedGoalType ?? routerResult.intent?.intent ?? "general_conversation",
        routerResult.intent?.confidence ?? 0,
      );
      try {
        const { runtimeTraceStore } = await import("@/lib/runtime-trace/RuntimeTraceStore");
        runtimeTraceStore.beginTrace(executionId, userMessage);
        runtimeTraceStore.recordStep("goal", "executed", {
          goalType:   goalBridgeResult.goal.type,
          confidence: goalBridgeResult.goal.confidence,
          valid:      goalBridgeResult.goal.valid,
          parameters: goalBridgeResult.goal.parameters,
          durationMs: goalBridgeResult.durationMs,
        });
      } catch { /* non-blocking */ }
      conversationStore.emit({
        type: "PIPELINE_STEP",
        executionId,
        payload: {
          step:       "goal_derived",
          goalId:     goalBridgeResult.goal.id,
          goalType:   goalBridgeResult.goal.type,
          confidence: goalBridgeResult.goal.confidence,
          valid:      goalBridgeResult.goal.valid,
          durationMs: goalBridgeResult.durationMs,
        },
        timestamp: Date.now(),
      });

      // ── Sprint 2: Resource Intent Canonicalization Layer (RICL) ─────────
      // Pass-through only: builds CanonicalResourceRequest in parallel.
      // No planning/runtime decision depends on this output in this sprint.
      let canonicalRequestForPlanning: import("@/lib/resource-intent-canonicalization").CanonicalResourceRequestV1 | null = null;
      try {
        const {
          resourceIntentCanonicalizerProvider,
        } = await import("@/lib/resource-intent-canonicalization");

        const canonicalizer = resourceIntentCanonicalizerProvider.get();
        const canonicalized = canonicalizer.canonicalize({
          userMessage,
          goal: goalBridgeResult.goal,
          parameters: goalBridgeResult.goal.parameters,
          traceId: executionId,
        });
        canonicalRequestForPlanning = canonicalized.request;

        conversationStore.emit({
          type: "PIPELINE_STEP",
          executionId,
          payload: {
            step: "ricl_canonicalized",
            canonicalizerId: canonicalizer.id,
            contractVersion: canonicalized.request.version,
            durationMs: canonicalized.durationMs,
          },
          timestamp: Date.now(),
        });
      } catch {
        // Non-blocking by design: canonicalization must never alter flow.
      }

      // ── [M1.11 AUDIT PROBE — GOAL] ────────────────────────────────────────
      try {
        const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
        if (AUDIT_MODE) {
          driveAuditStore.record("goal", "ok", {
            goalId:     goalBridgeResult.goal.id,
            goalType:   goalBridgeResult.goal.type,
            intent:     routerResult.intent?.intent ?? null,
            confidence: goalBridgeResult.goal.confidence,
            valid:      goalBridgeResult.goal.valid,
            parameters: goalBridgeResult.goal.parameters,
            durationMs: goalBridgeResult.durationMs,
          });
        }
      } catch { /* non-blocking */ }
      // ── [END M1.11 AUDIT PROBE] ──────────────────────────────────────────

      // ── PRODUCER A: Cognitive Gateway (short-circuit path) ───────────────
      // v2: Gateway answer → ExecutionOutcome → ResponseCandidate
      // No special-casing. Candidate enters the pool like any other.
      if (
        routerResult.decision === "cognitive_pipeline" &&
        routerResult.cognitiveAnswer?.answer
      ) {
        const ca = routerResult.cognitiveAnswer;
        const gatewayResult = executionOutcomeAdapterFactory.fromInput({
          producer:     "cognitive_gateway",
          startedAt:    t0route,
          finishedAt:   Date.now(),
          success:      true,
          errorType:    "none",
          errorMessage: null,
          domain:       _intentToDomain(routerResult.intent?.intent),
          capability:   null,
          payload:      null,
          metadata:     { executionId: ca.executionId, stagesExecuted: ca.stagesExecuted },
          cost:         { apiCalls: 1, cacheHit: false, estimatedLatencyMs: ca.durationMs ?? 0 },
          confidence:   { score: ca.confidence ?? 0.85, reason: "cognitive gateway", producerConfidence: ca.confidence ?? 0.85 },
          hint:         { synthesizedAnswer: ca.answer, sourceOverride: "cognitive_gateway" },
        });
        if (gatewayResult.ok && gatewayResult.candidate) {
          candidates.push(gatewayResult.candidate);
          preferredDomain = gatewayResult.candidate.explicitDomain;
          responseTracer.recordPipelineAnswer(traceId, ca.answer, ca.executionId, ca.stagesExecuted, ca.confidence, ca.evidenceSources, ca.durationMs);
        }
        conversationStore.emit({
          type: "PIPELINE_STEP",
          executionId,
          payload: { step: "gateway_candidate_added", intent: routerResult.intent?.intent },
          timestamp: Date.now(),
        });
      }

      // ── PRODUCER B: Planning → Runtime → Connector → Synthesize ──────────
      // v2: Connector answer → ExecutionOutcome → ResponseCandidate
      if (goalBridgeResult.goal.valid) {
        const { conversationPlanningEngine } = await import("@/lib/planning-engine-e022/ConversationPlanningEngine");
        const {
          isCanonicalResourceRequestEnabled,
          isCanonicalResourceReadEnabled,
        } = await import("@/lib/resource-intent-canonicalization");
        const crrEnabled = isCanonicalResourceRequestEnabled();
        const crrReadEnabled = isCanonicalResourceReadEnabled();
        const planningContextEnabled = crrEnabled || crrReadEnabled;

        const planningContext: import("@/lib/planning-engine-e022/PlanningContextTypes").PlanningContext | null = planningContextEnabled
          ? Object.freeze({
              goal: goalBridgeResult.goal,
              canonicalResourceRequest: canonicalRequestForPlanning,
              runtimeContext: Object.freeze({
                sessionId: session.id,
                executionId,
                routerIntent: routerResult.intent?.intent ?? null,
              }),
              metadata: Object.freeze({
                source: "conversation-pipeline",
                traceId: executionId,
                featureFlagEnabled: planningContextEnabled,
                receivedAtMs: Date.now(),
              }),
            })
          : null;

        // [EF-49.2 probe] PlanningEngine
        try { const { ef492Store: _s } = await import("@/lib/ef492/RuntimePipelineInstrument"); _s.record(executionId, { layer: "ConversationPlanningEngine", source: "production_runtime", timestamp: Date.now(), durationMs: null, input: `goalType="${goalBridgeResult.goal.type}"`, output: "ExecutionPlan", caller: "ConversationPipeline", next: "ConversationRuntimeEngine", status: "executed" }); } catch { /* non-blocking */ }
        const planResult = conversationPlanningEngine.plan(goalBridgeResult.goal, {
          mode: "live",
          context: planningContext,
        });

        try {
          const { runtimeTraceStore } = await import("@/lib/runtime-trace/RuntimeTraceStore");
          const _steps = planResult.plan?.steps ?? [];
          runtimeTraceStore.recordStep("plan", planResult.success ? "executed" : "skipped", {
            success:   planResult.success,
            stepCount: _steps.length,
            steps:     _steps.map((s: { connector: string; capability: string; id: string }) => ({
              id: s.id, connector: s.connector, capability: s.capability,
            })),
          });
          if (_steps.length > 0) {
            runtimeTraceStore.recordStep("capability", "executed", {
              connector:  _steps[0].connector,
              capability: _steps[0].capability,
              parameters: (_steps[0] as Record<string, unknown>).parameters ?? {},
            });
          }
        } catch { /* non-blocking */ }

        try {
          const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
          if (AUDIT_MODE) {
            const _pSteps = planResult.plan?.steps ?? [];
            driveAuditStore.record("planner", planResult.success ? "ok" : "error", {
              success:   planResult.success,
              goalType:  goalBridgeResult.goal.type,
              stepCount: _pSteps.length,
              steps:     _pSteps.map((s: Record<string, unknown>) => ({
                id: s.id, connector: s.connector, capability: s.capability, parameters: s.parameters,
              })),
            });
          }
        } catch { /* non-blocking */ }

        // ── Static Analysis path ──────────────────────────────────────────
        if (planResult.plan.mode === "static_analysis") {
          const { staticAnalysisEngine } = await import("@/lib/static-analysis/StaticAnalysisEngine");
          const saResult = await staticAnalysisEngine.analyze(planResult.plan, userMessage);
          const t0sa = Date.now();
          const saAdapted = executionOutcomeAdapterFactory.fromInput({
            producer:     "static_analysis",
            startedAt:    t0sa - (planResult.plan.estimatedDurationMs ?? 0),
            finishedAt:   t0sa,
            success:      true,
            errorType:    "none",
            errorMessage: null,
            domain:       _intentToDomain(routerResult.intent?.intent),
            capability:   "static_analysis",
            payload:      null,
            metadata:     { goalType: planResult.plan.goalType },
            cost:         { apiCalls: 1, cacheHit: false, estimatedLatencyMs: 0 },
            confidence:   { score: 0.8, reason: "static analysis", producerConfidence: 0.8 },
            hint:         { synthesizedAnswer: saResult.response, sourceOverride: "static_analysis" },
          });
          if (saAdapted.ok && saAdapted.candidate) {
            candidates.push(saAdapted.candidate);
          }
          conversationStore.emit({
            type: "PIPELINE_STEP",
            executionId,
            payload: { step: "static_analysis_candidate_added", goalType: planResult.plan.goalType },
            timestamp: Date.now(),
          });
        }

        // ── Live Connector Runtime path ───────────────────────────────────
        else if (planResult.success && planResult.plan.steps.length > 0) {
          setPhase("executing_capabilities");

          // [EXP-GITHUB-PLAN] Enrich plan with owner/repo/branch for GitHub steps.
          // REVERSAO: remover este bloco (3 linhas) e apagar GitHubPlanningContextProvider.ts
          const { gitHubPlanningContextProvider } = await import("@/lib/github-plan-context/GitHubPlanningContextProvider");
          const _enrichedPlan = await gitHubPlanningContextProvider.enrich(planResult.plan, userMessage).catch(() => planResult.plan);
          const _activePlan = _enrichedPlan;
          // [END EXP-GITHUB-PLAN]

          const { getRealRuntimeEngine, getRealConnectorRegistry } = await import("@/lib/connector-runtime-provider/ConnectorRuntimeProvider");
          const [_realEngine, _probeReg] = await Promise.all([
            getRealRuntimeEngine(),
            getRealConnectorRegistry(),
          ]);
          console.log("[RUNTIME] Pipeline v2: engine READY — registry:", _probeReg.list(), `connectors=${_probeReg.count()}`);
          // [EF-49.2 probe] RuntimeEngine
          try { const { ef492Store: _s } = await import("@/lib/ef492/RuntimePipelineInstrument"); _s.record(executionId, { layer: "ConversationRuntimeEngine", source: "production_runtime", timestamp: Date.now(), durationMs: null, input: `ExecutionPlan(${planResult.plan.steps.length} steps)`, output: "ExecutionResult", caller: "ConversationPipeline", next: "UniversalConnectorRouter", status: "executed" }); } catch { /* non-blocking */ }
          // ADR-003/ADR-004: engine.execute() returns { executionResult, executionReport }
          // A-01: pass Pipeline's executionId so Runtime reuses it — single canonical ID
          // B-02: build real connectorCtx from session — no synthetic values.
          // userId resolved via base44.auth.me() (non-blocking, best-effort).
          let _pipelineUserId = "pipeline-caller";
          try {
            const { base44 } = await import("@/api/base44Client");
            const _me = await base44.auth.me();
            if (_me?.id) _pipelineUserId = _me.id;
          } catch { /* non-blocking — fall back to sentinel */ }
          const _pipelineConnCtx = Object.freeze({
            userId:      _pipelineUserId,
            workspaceId: getActiveWorkspaceId(),
            sessionId:   session.id,
            goalId:      goalBridgeResult.goal.id,
            origin:      "pipeline",
          });
          const { executionResult } = await _realEngine.execute(_activePlan, executionId, _pipelineConnCtx);
          const t0connector = Date.now();

          conversationStore.emit({
            type: "PIPELINE_STEP",
            executionId,
            payload: {
              step:       "runtime_executed",
              runtimeId:  executionResult.executionId,
              planId:     executionResult.planId,
              status:     executionResult.status,
              stepCount:  executionResult.steps.length,
              durationMs: executionResult.durationMs,
              errors:     executionResult.errors,
            },
            timestamp: Date.now(),
          });

          try {
            const { driveAuditStore, AUDIT_MODE } = await import("@/lib/audit/DriveAuditStore");
            if (AUDIT_MODE) {
              driveAuditStore.record("runtime", executionResult.status === "completed" ? "ok" : "error", {
                executionId:  executionResult.executionId,
                planId:       executionResult.planId,
                status:       executionResult.status,
                durationMs:   executionResult.durationMs,
                errors:       executionResult.errors,
                steps: executionResult.steps.map((s) => ({
                  connector:      s.connector,
                  capability:     s.capability,
                  status:         s.status,
                  durationMs:     s.durationMs,
                  error:          s.error,
                  hasOutput:      s.output !== null && s.output !== undefined,
                  outputKeys:     s.output && typeof s.output === "object" ? Object.keys(s.output as object) : [],
                  outputPreview:  s.output ? JSON.stringify(s.output).slice(0, 300) : null,
                })),
              });
            }
          } catch { /* non-blocking */ }

          // Synthesize connector output → text answer
          const { synthesizeConnectorResult } = await import("@/lib/connector-runtime-provider/ConnectorResultSynthesizer");
          const synthesis = await synthesizeConnectorResult(
            executionResult,
            userMessage,
            goalBridgeResult.goal.type,
            kfmModel,
          );

          try {
            const { runtimeTraceStore } = await import("@/lib/runtime-trace/RuntimeTraceStore");
            runtimeTraceStore.recordStep("connector", executionResult.status === "completed" ? "executed" : "error", {
              status:      executionResult.status,
              durationMs:  executionResult.durationMs,
              errors:      executionResult.errors,
              stepCount:   executionResult.steps.length,
              stepOutputs: executionResult.steps.map((s) => ({
                connector:  s.connector,
                capability: s.capability,
                status:     s.status,
                error:      s.error,
                hasOutput:  s.output !== null,
                outputKeys: s.output ? Object.keys(s.output as object) : [],
              })),
            });
            if (synthesis.connectorData) {
              runtimeTraceStore.recordStep("llm_input", "executed", {
                connectorData: synthesis.connectorData,
                goalType: goalBridgeResult.goal.type,
              });
            }
          } catch { /* non-blocking */ }

          // ── v2: connector result → ExecutionOutcome → ResponseCandidate ──
          const connectorDomain = _goalTypeToDomain(goalBridgeResult.goal.type);

          // [EXP-RUNTIME-CONTEXT-LAYER] update after successful connector execution
          // REVERSAO: remover este bloco try/catch
          if (synthesis.handled && synthesis.connectorData) {
            try {
              const { runtimeContextLayer } = await import("@/lib/runtime-context/RuntimeContextLayer");
              const _enrichedOwner = (_activePlan.steps[0]?.parameters as Record<string, unknown>)?.owner as string | undefined;
              const _enrichedRepo  = (_activePlan.steps[0]?.parameters as Record<string, unknown>)?.repo  as string | undefined;
              const _connectorId   = _activePlan.steps[0]?.connector ?? "unknown";
              const _capability    = _activePlan.steps[0]?.capability ?? "unknown";
              runtimeContextLayer.update({
                executionId,
                goalType:      goalBridgeResult.goal.type,
                connectorId:   _connectorId,
                capability:    _capability,
                connectorData: synthesis.connectorData,
                sessionId:     session.id,
                enrichedOwner: _enrichedOwner,
                enrichedRepo:  _enrichedRepo,
              });
            } catch { /* non-blocking */ }
          }
          // [END EXP-RUNTIME-CONTEXT-LAYER]

          if (synthesis.handled && synthesis.response) {
            // Success: synthesizer produced a response
            const connResult = executionOutcomeAdapterFactory.fromConnectorSuccess({
              producer:          "connector_runtime",
              domain:            connectorDomain,
              capability:        goalBridgeResult.goal.type,
              payload:           synthesis.connectorData,
              durationMs:        executionResult.durationMs,
              synthesizedAnswer: synthesis.response,
              metadata:          { runtimeId: executionResult.executionId, planId: executionResult.planId },
            });
            if (connResult.ok && connResult.candidate) {
              candidates.push(connResult.candidate);
              preferredDomain = preferredDomain ?? connResult.candidate.explicitDomain;
            }
            try {
              const { runtimeTraceStore } = await import("@/lib/runtime-trace/RuntimeTraceStore");
              runtimeTraceStore.recordStep("llm_response", "executed", {
                responseLen:  synthesis.response.length,
                responseHead: synthesis.response.slice(0, 300),
              });
              runtimeTraceStore.finishTrace();
            } catch { /* non-blocking */ }
            conversationStore.emit({
              type: "PIPELINE_STEP",
              executionId,
              payload: { step: "connector_candidate_added", goalType: goalBridgeResult.goal.type },
              timestamp: Date.now(),
            });
          } else if (!synthesis.handled && executionResult.errors.length > 0) {
            // Failure: connector execution failed → error candidate
            const firstError = executionResult.errors[0] ?? "Connector execution failed";
            const errResult = executionOutcomeAdapterFactory.fromConnectorFailure({
              producer:     "connector_runtime",
              domain:       connectorDomain,
              capability:   goalBridgeResult.goal.type,
              errorType:    _classifyError(firstError),
              errorMessage: firstError,
              durationMs:   executionResult.durationMs,
              metadata:     { runtimeId: executionResult.executionId },
            });
            if (errResult.ok && errResult.candidate) {
              candidates.push(errResult.candidate);
            }
          }
          // synthesis.handled=false + no errors → connector produced no data → no candidate added
          // Pipeline will fall through to LLM path
        }
      }

      setStep("route", "done");
      setStep("synthesize", "running");
      conversationStore.setStatus("synthesizing");
      setPhase("building_response");

      // ── PRODUCER C: LLM Reasoning (always runs if no high-confidence candidate yet) ──
      // v2: Run LLM when no candidate with handled=true and confidence>=0.7 exists yet.
      // This keeps the LLM as the reliable fallback without special-casing it in the Pipeline.
      const hasHighConfidenceCandidate = candidates.some(
        (c) => c.handled && c.confidence >= 0.7,
      );

      if (!hasHighConfidenceCandidate) {
        setPhase("executing_capabilities");

        // Build kfmContext string for LLM prompt enrichment (Sprint M-05)
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

        const t0llm = Date.now();
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

        // ── EF-40.6: UCME Shadow Mode (fire-and-forget, non-blocking) ────────
        // O Planner ja recebeu a resposta legacy acima.
        // O UCME executa em paralelo APENAS para gerar diagnosticos.
        // Nenhuma resposta ao usuario e afetada.
        try {
          const { MemoryContextProviderFactory } = await import("@/lib/memory-context/MemoryContextProviderFactory");
          if (MemoryContextProviderFactory.getMode() === "SHADOW") {
            const { runMemoryPipeline } = await import("@/lib/memoryPipeline");
            const { detectSkills }      = await import("@/lib/skills/detector");
            const { detectGoal }        = await import("@/lib/reasoning/goalDetector");
            void (async () => {
              try {
                const _mem  = await runMemoryPipeline(userMessage, session.id, session.project_id);
                const _sk   = detectSkills(userMessage, { sessionSummary: _mem.sessionSummary, context: _mem.context, sources: _mem.sources });
                const _goal = detectGoal(userMessage);
                const _hist = historyMessages.map((m: { role: string; content: string }) => `${m.role === "user" ? "Usuario" : "Assistente"}: ${m.content}`).join("\n\n");
                await MemoryContextProviderFactory.execute({
                  messageId: executionId,
                  legacyInput: {
                    userMsg: userMessage,
                    memory: _mem,
                    skills: _sk,
                    goal: _goal,
                    historyText: _hist,
                    totalMessages: historyMessages.length,
                    capabilities: {},
                    capabilityResults: {},
                    needsMoreInfo: false,
                    kfmContext,
                  },
                  ucmeInput: {
                    userMsg:   userMessage,
                    sessionId: session.id,
                    projectId: session.project_id ?? null,
                    intent:    routerResult.intent?.intent,
                  },
                });
                conversationStore.emit({
                  type: "PIPELINE_STEP",
                  executionId,
                  payload: { step: "ucme_shadow_executed", mode: "SHADOW", reportCount: MemoryContextProviderFactory.getShadowReports().length },
                  timestamp: Date.now(),
                });
              } catch { /* shadow nao bloqueia nunca */ }
            })();
          }
        } catch { /* non-blocking */ }
        // ── END EF-40.6 ──────────────────────────────────────────────────────

        sources = (plan.sources ?? []).map((s: { id: string }) => s.id);

        // LLM answer → ExecutionOutcome → ResponseCandidate
        const llmResult = executionOutcomeAdapterFactory.fromLLMReasoning({
          answer:     plan.response,
          durationMs: Date.now() - t0llm,
          confidence: 0.7,
          metadata:   { sessionId: session.id },
        });
        if (llmResult.ok && llmResult.candidate) {
          candidates.push(llmResult.candidate);
        }

        const fallbackReason = routerResult.decision === "cognitive_pipeline"
          ? "EMPTY_PIPELINE_ANSWER"
          : "GENERAL_CONVERSATION";
        responseTracer.recordFallback(traceId, fallbackReason, plan.response, Date.now() - t0synth);
        responseTracer.recordRendered(traceId, plan.response);

        try {
          const { runtimeTraceStore } = await import("@/lib/runtime-trace/RuntimeTraceStore");
          runtimeTraceStore.recordStep("llm_response", "executed", {
            path:         "llm_only",
            fallbackReason,
            responseLen:  plan.response.length,
            responseHead: plan.response.slice(0, 300),
          });
          runtimeTraceStore.finishTrace();
        } catch { /* non-blocking */ }

        conversationStore.emit({
          type: "PIPELINE_STEP",
          executionId,
          payload: { step: "llm_candidate_added", candidateCount: candidates.length },
          timestamp: Date.now(),
        });
      }

      // ── ARBITRATION — sole decision authority ─────────────────────────────
      // v2: ResponseArbiter receives ALL candidates and decides.
      // No if/else. No short-circuit. No manual priority.
      const arbContext: ArbitrationContext = {
        preferredDomain,
        userMessage,
        sessionId: session.id,
      };
      // [EF-49.2 probe] Arbiter + finish trace
      try { const { ef492Store: _s } = await import("@/lib/ef492/RuntimePipelineInstrument"); _s.record(executionId, { layer: "ResponseArbiter", source: "production_runtime", timestamp: Date.now(), durationMs: null, input: `${candidates.length} candidates`, output: "ArbitrationResult.selected", caller: "ConversationPipeline", next: "StreamResponse → User", status: "executed" }); _s.finish(executionId); } catch { /* non-blocking */ }
      const arbResult = responseArbiter.arbitrate(candidates, arbContext);

      conversationStore.emit({
        type: "PIPELINE_STEP",
        executionId,
        payload: {
          step:         "arbiter_decision",
          reason:       arbResult.reason,
          totalCount:   arbResult.totalCount,
          handledCount: arbResult.handledCount,
          selected:     arbResult.selected.source,
          confidence:   arbResult.selected.confidence,
          domain:       arbResult.selected.explicitDomain,
          durationMs:   arbResult.durationMs,
        },
        timestamp: Date.now(),
      });

      // ── Extract final response from arbitration result ────────────────────
      const finalResponse = arbResult.selected.answer
        ?? "Nao consegui processar sua mensagem. Por favor, tente novamente.";

    conversationMetrics.recordSynthesisMs(executionId, Date.now() - t0synth);
    setStep("synthesize", "done");

    // ── 5. Stream Response ───────────────────────────────────────────────
    if (this._cancelled) return;
    setStep("stream", "running");
    conversationStore.setStatus("streaming");
    setPhase("responding");

    const streamMsgId = makeMsgId();
    conversationStore.appendMessage({
      id:               streamMsgId,
      session_id:       session.id,
      role:             "assistant",
      content:          "",
      streamingContent: "",
      isStreaming:      true,
      memory_tier:      "active",
      sources_used:     sources,
    });

    await conversationStreaming.streamResponse({
      executionId,
      messageId:   streamMsgId,
      fullContent: finalResponse,
      onChunk: () => {
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
        sessionId:    session.id,
        projectId:    session.project_id,
        role:         "assistant",
        content:      finalResponse,
        sources_used: sources,
      });
      conversationStore.updateMessage(streamMsgId, {
        id:               savedAssistant.id,
        content:          finalResponse,
        streamingContent: undefined,
        isStreaming:      false,
        sources_used:     sources,
      });
      conversationStore.emit({
        type: "MESSAGE_SAVED",
        executionId,
        payload: { messageId: savedAssistant.id, role: "assistant" },
        timestamp: Date.now(),
      });
    } catch { /* non-critical */ }

    conversationStore.setStatus("idle");
    conversationStore.setReasoningPhase("idle");
    setStep("finalize", "done");

    // ── 7. Background batch processing ──────────────────────────────────
    this._backgroundProcessing(session, [...messages, savedUser]).catch(() => {});

    } catch (err) {
      console.error('[IA-044][PIPELINE-CATCH]', { message: err?.message, stack: err?.stack, name: err?.name });
      // ── Fallback: arbitrate with whatever candidates we have ──────────────
      // Even on error, we attempt to deliver the best available candidate.
      let finalResponse = "Nao consegui processar sua mensagem. Por favor, tente novamente.";
      if (candidates.length > 0) {
        const fallbackArb = responseArbiter.arbitrate(candidates, { preferredDomain });
        if (fallbackArb.selected.answer) {
          finalResponse = fallbackArb.selected.answer;
        }
      }

      conversationMetrics.recordSynthesisMs(executionId, Date.now() - t0synth);
      setStep("synthesize", "done");

      if (!this._cancelled) {
        setStep("stream", "running");
        conversationStore.setStatus("streaming");
        setPhase("responding");

        const streamMsgId = makeMsgId();
        conversationStore.appendMessage({
          id: streamMsgId, session_id: session.id, role: "assistant",
          content: "", streamingContent: "", isStreaming: true, memory_tier: "active", sources_used: [],
        });
        await conversationStreaming.streamResponse({
          executionId, messageId: streamMsgId, fullContent: finalResponse, onChunk: () => {},
        });
        setStep("stream", "done");
      }

      setStep("finalize", "running");
      conversationStore.setStatus("idle");
      conversationStore.setReasoningPhase("idle");
      setStep("finalize", "done");
    }
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
    } catch { /* background — never block UI */ }
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

// ─── Domain resolution helpers ────────────────────────────────────────────────

function _intentToDomain(intent: string | undefined): ExecutionDomain {
  if (!intent) return "general";
  if (intent.includes("github"))   return "github";
  if (intent.includes("drive"))    return "google_drive";
  if (intent.includes("gmail") || intent.includes("email")) return "gmail";
  if (intent.includes("calendar")) return "google_calendar";
  if (intent.includes("memory"))   return "memory";
  return "general";
}

function _goalTypeToDomain(goalType: string): ExecutionDomain {
  if (goalType.startsWith("github"))          return "github";
  if (goalType.startsWith("drive"))           return "google_drive";
  if (goalType.startsWith("gmail") || goalType.startsWith("email")) return "gmail";
  if (goalType.startsWith("calendar"))        return "google_calendar";
  if (goalType.startsWith("memory"))          return "memory";
  return "general";
}

function _classifyError(error: string): import("@/lib/response-arbiter/ExecutionOutcomeTypes").ErrorType {
  const e = error.toLowerCase();
  if (e.includes("401") || e.includes("auth") || e.includes("oauth") || e.includes("expirado")) return "auth";
  if (e.includes("403") || e.includes("acesso negado") || e.includes("escopos")) return "auth";
  if (e.includes("404") || e.includes("nao encontrado")) return "not_found";
  if (e.includes("timeout") || e.includes("demorou")) return "timeout";
  if (e.includes("network") || e.includes("conectividade")) return "network";
  if (e.includes("validation") || e.includes("parametro")) return "validation";
  return "runtime";
}

// ─── Singleton ────────────────────────────────────────────────────────────────

initializePlatform();

const _key = "__CXP_PIPELINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_key]) {
  (globalThis as unknown as Record<string, unknown>)[_key] = new ConversationPipeline();
}

export const conversationPipeline: ConversationPipeline = (
  globalThis as unknown as Record<string, ConversationPipeline>
)[_key];

export { ConversationPipeline };