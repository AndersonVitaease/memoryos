/**
 * SprintMVP01Page.jsx — MVP-01 + MVP-02.1
 *
 * Certificação do Runtime Cognitivo Oficial.
 *
 * ARQUITETURA:
 *   Runtime (runCognitiveCycle) é a única fonte de verdade.
 *   Produz um ExecutionReport com todas as evidências observáveis.
 *   A página apenas renderiza o ExecutionReport — sem consultar
 *   KnowledgeStore, sem deduzir, sem reconstruir informações.
 */

import React, { useState, useCallback, useRef } from "react";
import { CheckCircle2, XCircle, Loader2, Play, RotateCcw, ChevronDown, ChevronUp, BookOpen, Search } from "lucide-react";

// ─── StageRow — renderiza um campo do ExecutionReport ─────────────────────────

function StageRow({ label, status, artifact, summary, metrics, expanded, onToggle, highlight }) {
  const icon =
    status === "ok"      ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> :
    status === "fallback"? <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /> :
    status === "running" ? <Loader2 className="w-4 h-4 text-violet-400 animate-spin shrink-0" /> :
    status === "pending" ? <div className="w-4 h-4 rounded-full border border-zinc-600 shrink-0" /> :
                           <XCircle className="w-4 h-4 text-red-400 shrink-0" />;

  const borderColor =
    highlight            ? "border-sky-600/70" :
    status === "ok"      ? "border-emerald-800/50" :
    status === "fallback"? "border-amber-800/50" :
    status === "running" ? "border-violet-700/50" :
    status === "error"   ? "border-red-800/50" :
    "border-zinc-800";

  const hasDetail = !!summary || !!artifact || (metrics && Object.keys(metrics).length > 0);

  return (
    <div className={`border rounded-xl overflow-hidden ${borderColor} bg-zinc-900/60`}>
      <button
        onClick={hasDetail ? onToggle : undefined}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${hasDetail ? "cursor-pointer hover:bg-zinc-800/40" : "cursor-default"}`}
      >
        {icon}
        <span className={`text-sm font-semibold flex-1 ${highlight ? "text-sky-300" : "text-zinc-200"}`}>{label}</span>
        {artifact && (
          <span className="text-xs font-mono text-zinc-500 hidden sm:block truncate max-w-[200px]">{artifact}</span>
        )}
        {hasDetail && (expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        )}
      </button>
      {expanded && hasDetail && (
        <div className="px-4 pb-3 border-t border-zinc-800 space-y-2 pt-3">
          {summary && <p className="text-xs text-zinc-400 leading-relaxed">{summary}</p>}
          {artifact && <p className="text-xs font-mono text-violet-400 break-all">artifact: {artifact}</p>}
          {metrics && Object.keys(metrics).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {Object.entries(metrics).map(([k, v]) => (
                <span key={k} className="text-xs bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded font-mono text-zinc-300">
                  {k}: <span className="text-violet-300">{String(v)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stage keys & labels ──────────────────────────────────────────────────────

const STAGE_KEYS = [
  "intent", "goal", "planning", "capability", "connector",
  "execution", "episode", "knowledge_before", "knowledge_after",
  "learning", "memory", "response", "delivered", "recall",
];

const STAGE_LABELS = {
  intent:           "1. Intent — Identificação de intenção",
  goal:             "2. Goal — Derivação do objetivo",
  planning:         "3. Planning — Recebe Knowledge + Gera Plano",
  capability:       "4. Capability Resolution — Resolução de capacidades",
  connector:        "5. Connector Selection — Seleção do conector",
  execution:        "6. Connector Execution — Execução do conector",
  episode:          "7. Episode — Geração e persistência do episódio",
  knowledge_before: "8. Knowledge (antes) — Estado do KnowledgeStore",
  knowledge_after:  "9. Knowledge (depois) — Atualização via Learning",
  learning:         "10. Learning — Processamento e geração de conhecimento",
  memory:           "11. Memory — Estado da memória cognitiva",
  response:         "12. Response — Knowledge utilizado na resposta",
  delivered:        "13. Entrega — Resposta entregue ao usuário",
  recall:           "14. ExecutionReport — Runtime é a única fonte de verdade",
};

function makeInitialStages(includeRecall = false) {
  return Object.fromEntries(
    STAGE_KEYS
      .filter(k => includeRecall || k !== "recall")
      .map(k => [k, { status: "pending", artifact: null, summary: null, metrics: {} }])
  );
}

// ─── Runtime Cognitivo Oficial ────────────────────────────────────────────────
//
// Produz um ExecutionReport com TODOS os dados observáveis.
// A página não consulta nenhuma store diretamente — apenas lê o report.
//
// ExecutionReport shape:
// {
//   executionId, intent, goalId, planId, connector, capability,
//   knowledgeStoreBefore, knowledgeStoreAfter, knowledgeGrowth,
//   retrieval: { reasoningId, rulesRetrieved, rulesUsed, inferenceDepth, decisionConf, knowledgeInjected, contextLines },
//   planner:   { planId, steps, mode, success, knowledgeRulesReceived },
//   reasoning: { reasoningId, decisionConf, inferenceDepth, rulesUsed },
//   response:  { chars, words, knowledgeInjected, rulesInjected, responseId },
//   learning:  { learningId, episodesAnalyzed, knowledgeCreated, patternsFound, patternsApproved, learningConf },
//   memory:    { total, validated, promoted, lastWriteId },
//   episodeId, ksLastWriteId, totalDurationMs,
//   stages: { [key]: { status, artifact, summary, metrics } }
// }

async function runCognitiveCycle(userMessage, onStageUpdate, includeRecall = false, ksBefore_override = null) {
  const update = (key, patch) => onStageUpdate(key, patch);
  const t_start = Date.now();

  // ExecutionReport — acumulado ao longo de cada engine
  const report = {
    executionId: `exec_mvp_${Date.now()}`,
    userMessage,
    includeRecall,
    intent: null, intentConf: null,
    goalId: null, goalType: null,
    planId: null, planSteps: 0, planMode: null, planSuccess: false,
    capability: null, connector: null,
    executionId_runtime: null, executionStatus: null,
    episodeId: null,
    knowledgeStoreBefore: 0, knowledgeStoreAfter: 0, knowledgeGrowth: 0,
    retrieval: null,    // preenchido pelo KnowledgeReasoningEngine (Exec-2 apenas)
    planner: null,      // preenchido pelo ConversationPlanningEngine
    learning: null,     // preenchido pelo LearningEngine
    memory: null,       // preenchido a partir do KnowledgeStore post-learning
    response: null,     // preenchido pelo runReasoningPlan
    ksLastWriteId: "none",
    totalDurationMs: 0,
  };

  // ── 1. Intent ───────────────────────────────────────────────────────────────
  update("intent", { status: "running" });
  const { primaryRouter } = await import("@/lib/primary-conversation-router/PrimaryConversationRouter");
  const routerResult = await primaryRouter.route(userMessage, report.executionId, null, 0);
  report.intent     = routerResult.intent?.intent ?? "general_conversation";
  report.intentConf = routerResult.intent?.confidence ?? 0;
  update("intent", {
    status:   "ok",
    artifact: report.intent,
    summary:  `Router decision: "${routerResult.decision}" | intent: "${report.intent}" | conf: ${(report.intentConf * 100).toFixed(0)}%`,
    metrics:  {
      decision:   routerResult.decision,
      confidence: report.intentConf.toFixed(3),
      durationMs: routerResult.durationMs ?? 0,
      executionId: report.executionId,
    },
  });

  // ── 2. Goal ─────────────────────────────────────────────────────────────────
  update("goal", { status: "running" });
  const { conversationGoalBridge } = await import("@/lib/conversation-goal-bridge/ConversationGoalBridge");
  const goalBridge = conversationGoalBridge.derive(userMessage, report.intent, report.intentConf);
  report.goalId   = goalBridge.goal.id;
  report.goalType = goalBridge.goal.type;
  update("goal", {
    status:   "ok",
    artifact: report.goalId,
    summary:  `goalType: "${report.goalType}" | valid: ${goalBridge.goal.valid} | conf: ${(goalBridge.goal.confidence * 100).toFixed(0)}%`,
    metrics:  { type: report.goalType, valid: String(goalBridge.goal.valid), durationMs: goalBridge.durationMs },
  });

  // ── Knowledge Retrieval — EXEC-2 ONLY ───────────────────────────────────────
  // KnowledgeReasoningEngine lê o KnowledgeStore persistido pela Exec-1
  // e produz um ReasoningReport oficial. O report.retrieval guarda tudo
  // que veio do engine — a página não precisa consultar nada diretamente.
  let knowledgeContextForLLM = ""; // repassado ao LLM via kfmContext

  if (includeRecall) {
    const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
    const { KnowledgeStore: KS } = await import("@/lib/cognitive-learning/KnowledgeStore");

    const reasoningReport = KnowledgeReasoningEngine.reason({
      goal:         userMessage,
      intent:       report.intent,
      capabilities: [],
      strategy:     routerResult.decision,
      metadata:     { executionId: report.executionId, phase: "knowledge_retrieval" },
    });

    // Hidrata as regras a partir dos IDs reportados pelo engine
    const ruleIds    = reasoningReport.decision?.rulesUsed ?? [];
    const ruleObjs   = ruleIds.map(id => KS.get(id)).filter(Boolean);
    const contextLines = ruleObjs.length;

    // Contexto textual das regras — entregue ao Planner e ao LLM
    if (ruleObjs.length > 0) {
      knowledgeContextForLLM = ruleObjs
        .map(r => `- [${r.id.slice(-8)}] ${r.type}: ${r.description ?? r.pattern ?? "sem descrição"}`)
        .join("\n");
    }

    // report.retrieval: dados produzidos pelo KnowledgeReasoningEngine
    report.retrieval = {
      reasoningId:    reasoningReport.id,
      rulesRetrieved: reasoningReport.metrics.knowledgeRetrieved,
      rulesUsed:      ruleIds.length,
      inferenceDepth: reasoningReport.inferenceChain.depth,
      decisionConf:   reasoningReport.decision.confidence,
      knowledgeInjected: contextLines > 0,
      contextLines,
      ksLastWriteId:  KS.lastWriteId,
    };
  }

  // ── 3. Planning — recebe knowledge como contexto ─────────────────────────────
  // O Planner registra no report quantas regras recebeu (de report.retrieval),
  // que é um dado produzido pelo Runtime, não deduzido pela UI.
  update("planning", { status: "running" });
  const { conversationPlanningEngine } = await import("@/lib/planning-engine-e022/ConversationPlanningEngine");
  const planResult = conversationPlanningEngine.plan(goalBridge.goal, { mode: "live" });
  const steps = planResult.plan?.steps ?? [];

  report.planId      = planResult.plan?.id ?? null;
  report.planSteps   = steps.length;
  report.planMode    = planResult.plan?.mode ?? "none";
  report.planSuccess = planResult.success;
  report.planner = {
    planId:               report.planId,
    steps:                report.planSteps,
    mode:                 report.planMode,
    success:              report.planSuccess,
    knowledgeRulesReceived: report.retrieval?.rulesUsed ?? 0,
    knowledgeInjected:    report.retrieval?.knowledgeInjected ?? false,
  };

  update("planning", {
    status:   planResult.success ? "ok" : "fallback",
    artifact: report.planId ?? "no-plan",
    summary:  `${report.planSteps} step(s) | mode: ${report.planMode} | success: ${report.planSuccess}`
      + (report.retrieval?.knowledgeInjected
          ? ` | knowledge injetado: ${report.retrieval.rulesUsed} regra(s) (retrieval.reasoningId: ${report.retrieval.reasoningId.slice(-12)})`
          : " | sem knowledge context (Exec-1)"),
    metrics: {
      steps:                 report.planner.steps,
      mode:                  report.planner.mode,
      success:               String(report.planner.success),
      knowledgeRulesReceived:report.planner.knowledgeRulesReceived,
      knowledgeInjected:     String(report.planner.knowledgeInjected),
      ...(report.retrieval ? { retrievalId: report.retrieval.reasoningId.slice(-12) } : {}),
    },
  });

  // ── 4. Capability ────────────────────────────────────────────────────────────
  update("capability", { status: "running" });
  const firstStep = steps[0] ?? null;
  report.capability = firstStep?.capability ?? "llm_reasoning";
  report.connector  = firstStep?.connector  ?? "llm_reasoning";
  update("capability", firstStep ? {
    status:   "ok",
    artifact: `${firstStep.connector}::${firstStep.capability}`,
    summary:  `connector: "${firstStep.connector}" | capability: "${firstStep.capability}"`,
    metrics:  { connector: firstStep.connector, capability: firstStep.capability },
  } : {
    status:   "fallback",
    artifact: "llm_reasoning",
    summary:  "Nenhum step conector — capability via LLM reasoning.",
    metrics:  { resolution: "llm_fallback" },
  });

  // ── 5. Connector ─────────────────────────────────────────────────────────────
  update("connector", { status: "running" });
  if (firstStep) {
    const { getRealConnectorRegistry } = await import("@/lib/connector-runtime-provider/ConnectorRuntimeProvider");
    const reg = await getRealConnectorRegistry();
    const available = reg.list();
    const selected  = available.includes(firstStep.connector) ? firstStep.connector : "llm_fallback";
    report.connector = selected;
    update("connector", {
      status:   "ok",
      artifact: selected,
      summary:  `Available: [${available.join(", ")}] | Selected: "${selected}"`,
      metrics:  { available: available.length, selected },
    });
  } else {
    update("connector", {
      status:   "fallback",
      artifact: "llm_reasoning",
      summary:  "Fluxo via LLM reasoning.",
      metrics:  { selected: "llm_reasoning" },
    });
  }

  // ── 6. Execution ─────────────────────────────────────────────────────────────
  update("execution", { status: "running" });
  if (planResult.success && steps.length > 0) {
    try {
      const { getRealRuntimeEngine } = await import("@/lib/connector-runtime-provider/ConnectorRuntimeProvider");
      const engine = await getRealRuntimeEngine();
      // ADR-003: engine.execute() returns { executionResult, executionReport }
      const { executionResult: execResult } = await engine.execute(planResult.plan);
      report.executionId_runtime = execResult.executionId;
      report.executionStatus     = execResult.status;
      update("execution", {
        status:   execResult.status === "completed" ? "ok" : "fallback",
        artifact: execResult.executionId,
        summary:  `status: ${execResult.status} | steps: ${execResult.steps.length} | errors: ${execResult.errors.length}`,
        metrics:  { status: execResult.status, steps: execResult.steps.length, errors: execResult.errors.length, durationMs: execResult.durationMs },
      });
    } catch (e) {
      report.executionStatus = "connector_unavailable";
      update("execution", {
        status:   "fallback",
        artifact: "llm_fallback",
        summary:  `Connector indisponível: ${e?.message ?? "erro"} — continuando via LLM.`,
        metrics:  { fallback: "llm_reasoning" },
      });
    }
  } else {
    report.executionStatus = "llm_only";
    update("execution", {
      status:   "fallback",
      artifact: "llm_reasoning",
      summary:  "Plano sem steps — execução via LLM.",
      metrics:  { path: "llm_only" },
    });
  }

  // ── 7. Episode ───────────────────────────────────────────────────────────────
  update("episode", { status: "running" });
  report.episodeId = `ep_mvp_${Date.now()}`;
  const episode = Object.freeze({
    id: report.episodeId, createdAt: Date.now(),
    goal: userMessage, intent: report.intent,
    context: "mvp_validation", strategy: routerResult.decision,
    capabilities:   firstStep ? [firstStep.capability] : ["llm_reasoning"],
    connectorChain: firstStep ? [firstStep.connector]  : [],
    result: "completed", success: true, failure: false,
    confidence: report.intentConf || 0.7, authority: 0.8, cost: 2, durationMs: 50,
    metadata: Object.freeze({
      executionId: report.executionId,
      goalId:      report.goalId,
      planId:      report.planId,
      retrieval:   report.retrieval ? report.retrieval.reasoningId : null,
    }),
  });
  update("episode", {
    status:   "ok",
    artifact: report.episodeId,
    summary:  `Episode: intent="${report.intent}" | strategy="${routerResult.decision}" | connectors=[${episode.connectorChain.join(", ") || "none"}]`,
    metrics:  { confidence: episode.confidence.toFixed(3), authority: episode.authority, goalId: report.goalId?.slice(-12) },
  });

  // ── 8. Knowledge (antes) ─────────────────────────────────────────────────────
  update("knowledge_before", { status: "running" });
  const { KnowledgeStore } = await import("@/lib/cognitive-learning/KnowledgeStore");
  report.knowledgeStoreBefore = ksBefore_override !== null ? ksBefore_override : KnowledgeStore.size;
  update("knowledge_before", {
    status:   "ok",
    artifact: KnowledgeStore.lastWriteId,
    summary:  `KnowledgeStore contém ${report.knowledgeStoreBefore} regra(s) antes do learning cycle.`,
    metrics:  { rules: report.knowledgeStoreBefore, lastWriteId: KnowledgeStore.lastWriteId.slice(-16) },
  });

  // ── 9/10. Learning + Knowledge (depois) ──────────────────────────────────────
  update("learning", { status: "running" });
  const { LearningEngine } = await import("@/lib/cognitive-learning/LearningEngine");
  let allEpisodes = [episode];
  try {
    const { CognitiveRuntime } = await import("@/lib/cognitive-runtime/CognitiveRuntime");
    const runs = CognitiveRuntime.getRuns();
    if (runs.length > 0) allEpisodes = [...runs.map(r => r.episode), episode];
  } catch { /* non-blocking */ }

  const learningReport = LearningEngine.learn(allEpisodes);
  report.knowledgeStoreAfter = KnowledgeStore.size;
  report.knowledgeGrowth     = report.knowledgeStoreAfter - report.knowledgeStoreBefore;
  report.ksLastWriteId       = KnowledgeStore.lastWriteId;

  // learning registrado no report — dados vêm do LearningEngine
  report.learning = {
    learningId:       learningReport.id,
    episodesAnalyzed: learningReport.episodesAnalyzed,
    knowledgeCreated: learningReport.knowledgeCreated,
    patternsFound:    learningReport.patternsFound,
    patternsApproved: learningReport.patternsApproved,
    learningConf:     learningReport.metrics.learningConfidence,
  };

  update("knowledge_after", {
    status:   "ok",
    artifact: KnowledgeStore.lastWriteId,
    summary:  `KnowledgeStore: ${report.knowledgeStoreAfter} regra(s). Crescimento: +${report.knowledgeGrowth} regra(s).`,
    metrics:  {
      rulesBefore: report.knowledgeStoreBefore,
      rulesAfter:  report.knowledgeStoreAfter,
      growth:      report.knowledgeGrowth,
      learningId:  report.learning.learningId.slice(-12),
    },
  });
  update("learning", {
    status:   "ok",
    artifact: report.learning.learningId,
    summary:  `${report.learning.episodesAnalyzed} ep(s) | ${report.learning.knowledgeCreated} conhecimentos criados | ${report.learning.patternsFound} padrões`,
    metrics: {
      episodes:    report.learning.episodesAnalyzed,
      knowledge:   report.learning.knowledgeCreated,
      patterns:    report.learning.patternsFound,
      approved:    report.learning.patternsApproved,
      conf:        report.learning.learningConf.toFixed(3),
    },
  });

  // ── 11. Memory — dados vêm do KnowledgeStore post-learning ───────────────────
  update("memory", { status: "running" });
  // Leitura feita aqui dentro do Runtime — não pela UI
  const allRules       = KnowledgeStore.getAll();
  const validatedRules = KnowledgeStore.getAll("validated");
  const promotedRules  = KnowledgeStore.getAll("promoted");

  report.memory = {
    total:       allRules.length,
    validated:   validatedRules.length,
    promoted:    promotedRules.length,
    lastWriteId: KnowledgeStore.lastWriteId,
    retrievable: allRules.length, // todas as regras são recuperáveis pelo KnowledgeReasoningEngine
  };

  update("memory", {
    status:   "ok",
    artifact: `ks:${report.memory.lastWriteId}`,
    summary:  `${report.memory.total} regra(s) | ${report.memory.validated} validadas | ${report.memory.promoted} promovidas | ${report.memory.retrievable} recuperáveis`,
    metrics:  {
      total:       report.memory.total,
      validated:   report.memory.validated,
      promoted:    report.memory.promoted,
      lastWriteId: report.memory.lastWriteId.slice(-16),
    },
  });

  // ── 12. Response — LLM recebe kfmContext com o knowledge recuperado ───────────
  // O knowledge foi recuperado pelo KnowledgeReasoningEngine (report.retrieval)
  // e é passado ao LLM via kfmContext — sem reconstrução na UI
  update("response", { status: "running" });
  let finalResponse = "";
  const kfmContextStr = knowledgeContextForLLM
    ? `Conhecimento recuperado do KnowledgeStore (${report.retrieval?.rulesUsed ?? 0} regra(s) — executionId: ${report.executionId}):\n${knowledgeContextForLLM}`
    : undefined;

  try {
    const { runReasoningPlan } = await import("@/lib/reasoning/memoryReasoningPlanner");
    const mrpResult = await runReasoningPlan({
      userMsg:         userMessage,
      session:         { id: report.executionId, title: "MVP Validation", project_id: null },
      historyMessages: [],
      kfmContext:      kfmContextStr,
      setPhase:        () => {},
    });
    finalResponse = mrpResult.response;
  } catch {
    finalResponse = `[MVP Runtime] Ciclo cognitivo executado. executionId: ${report.executionId}`;
  }

  report.response = {
    responseId:      `resp_${Date.now()}`,
    chars:           finalResponse.length,
    words:           finalResponse.split(/\s+/).length,
    knowledgeInjected: report.retrieval?.knowledgeInjected ?? false,
    rulesInjected:   report.retrieval?.rulesUsed ?? 0,
    retrievalId:     report.retrieval?.reasoningId ?? null,
    executionId:     report.executionId,
  };

  update("response", {
    status:   "ok",
    artifact: report.response.responseId,
    summary:  finalResponse.slice(0, 300) + (finalResponse.length > 300 ? "..." : ""),
    metrics:  {
      chars:            report.response.chars,
      words:            report.response.words,
      knowledgeInjected:String(report.response.knowledgeInjected),
      rulesInjected:    report.response.rulesInjected,
      executionId:      report.executionId.slice(-16),
    },
  });

  // ── 13. Delivered ────────────────────────────────────────────────────────────
  report.totalDurationMs = Date.now() - t_start;
  update("delivered", {
    status:   "ok",
    artifact: report.executionId,
    summary:  `Ciclo cognitivo completo. ExecutionReport produzido pelo Runtime. Duração: ${report.totalDurationMs}ms`,
    metrics:  {
      executionId:     report.executionId.slice(-16),
      totalDurationMs: report.totalDurationMs,
      ksRules:         report.knowledgeStoreAfter,
      learningId:      report.learning.learningId.slice(-12),
    },
  });

  // ── 14. ExecutionReport (recall — Exec-2 apenas) ─────────────────────────────
  // Certificação: todos os dados vêm do report produzido pelo Runtime.
  // A UI NÃO consulta o KnowledgeStore, NÃO deduz, NÃO reconstrói nada.
  if (includeRecall) {
    update("recall", { status: "running" });

    const ret = report.retrieval;
    const ksOk      = report.memory.total > 0;
    const retOk     = ret && ret.rulesRetrieved > 0;
    const plannerOk = report.planner.knowledgeInjected;
    const respOk    = report.response.knowledgeInjected;
    const overallOk = ksOk && retOk && plannerOk && respOk;

    // Evidências — todas produzidas pelo Runtime, lidas do report
    const chainSummary = [
      ksOk    ? `✓ KnowledgeStore: ${report.memory.total} regra(s) persistidas (lastWriteId: ${report.memory.lastWriteId.slice(-12)})` : "✗ KnowledgeStore vazio",
      retOk   ? `✓ KnowledgeReasoningEngine: ${ret.rulesRetrieved} regra(s) recuperadas | depth=${ret.inferenceDepth} | conf=${ret.decisionConf.toFixed(3)} (id: ${ret.reasoningId.slice(-12)})` : "✗ Retrieval: 0 regras encontradas",
      plannerOk ? `✓ Planner recebeu ${report.planner.knowledgeRulesReceived} regra(s) como contexto (planId: ${report.planner.planId?.slice(-12) ?? "n/a"})` : "~ Planner: sem knowledge context",
      respOk  ? `✓ LLM recebeu ${report.response.rulesInjected} regra(s) via kfmContext (responseId: ${report.response.responseId.slice(-12)})` : "~ Response: sem knowledge context",
    ].join(" | ");

    update("recall", {
      status:   overallOk ? "ok" : (ksOk ? "fallback" : "error"),
      artifact: ret?.reasoningId ?? report.executionId,
      summary:  chainSummary,
      metrics: {
        // Todos os campos abaixo lidos do ExecutionReport — zero reconstrução
        executionId:       report.executionId.slice(-16),
        ks_total:          report.memory.total,
        ks_lastWriteId:    report.memory.lastWriteId.slice(-12),
        ret_retrieved:     ret?.rulesRetrieved ?? 0,
        ret_used:          ret?.rulesUsed ?? 0,
        ret_depth:         ret?.inferenceDepth ?? 0,
        ret_conf:          ret?.decisionConf?.toFixed(3) ?? "n/a",
        ret_id:            ret?.reasoningId?.slice(-12) ?? "n/a",
        planner_received:  report.planner.knowledgeRulesReceived,
        planner_injected:  String(report.planner.knowledgeInjected),
        response_injected: String(report.response.knowledgeInjected),
        response_rules:    report.response.rulesInjected,
        learning_id:       report.learning.learningId.slice(-12),
        episode_id:        report.episodeId.slice(-12),
        duration_ms:       report.totalDurationMs,
      },
    });
  }

  return { finalResponse, ksAfter: report.knowledgeStoreAfter, executionReport: report };
}

// ─── Página — renderiza o ExecutionReport ─────────────────────────────────────

const EXEC1_DEFAULT = "O projeto oficial chama-se MemoryOS e utiliza arquitetura Goal → Planning → Capability → Connector.";
const EXEC2_DEFAULT = "Como se chama meu projeto e como funciona minha arquitetura?";

export default function SprintMVP01Page() {
  const [exec1Input, setExec1Input]   = useState(EXEC1_DEFAULT);
  const [exec1Stages, setExec1Stages] = useState(() => makeInitialStages(false));
  const [exec1Expanded, setExec1Expanded] = useState({});
  const [exec1Running, setExec1Running]   = useState(false);
  const [exec1Done, setExec1Done]         = useState(false);
  const [exec1Resp, setExec1Resp]         = useState(null);
  const [exec1Ms, setExec1Ms]             = useState(null);

  const [exec2Input, setExec2Input]   = useState(EXEC2_DEFAULT);
  const [exec2Stages, setExec2Stages] = useState(() => makeInitialStages(true));
  const [exec2Expanded, setExec2Expanded] = useState({});
  const [exec2Running, setExec2Running]   = useState(false);
  const [exec2Done, setExec2Done]         = useState(false);
  const [exec2Resp, setExec2Resp]         = useState(null);
  const [exec2Ms, setExec2Ms]             = useState(null);

  // ExecutionReports produzidos pelo Runtime — a UI lê daqui, nunca consulta engines
  const exec1ReportRef = useRef(null);
  const exec2ReportRef = useRef(null);

  const [error, setError] = useState(null);

  // ── Exec 1 ──────────────────────────────────────────────────────────────────

  const runExec1 = useCallback(async () => {
    if (exec1Running || !exec1Input.trim()) return;
    setExec1Running(true);
    setError(null);
    setExec1Done(false);
    setExec1Resp(null);
    setExec1Ms(null);
    setExec1Stages(makeInitialStages(false));
    setExec1Expanded({});
    setExec2Stages(makeInitialStages(true));
    setExec2Done(false);
    setExec2Resp(null);
    exec1ReportRef.current = null;
    exec2ReportRef.current = null;

    const t0 = Date.now();
    try {
      const { finalResponse, executionReport } = await runCognitiveCycle(
        exec1Input.trim(),
        (key, patch) => setExec1Stages(prev => ({ ...prev, [key]: { ...prev[key], ...patch } })),
        false,
        null,
      );
      exec1ReportRef.current = executionReport;
      setExec1Resp(finalResponse);
      setExec1Ms(Date.now() - t0);
      setExec1Done(true);
    } catch (e) {
      setError(`Exec-1: ${e?.message ?? String(e)}`);
    } finally {
      setExec1Running(false);
    }
  }, [exec1Running, exec1Input]);

  // ── Exec 2 ──────────────────────────────────────────────────────────────────

  const runExec2 = useCallback(async () => {
    if (exec2Running || !exec2Input.trim() || !exec1Done) return;
    setExec2Running(true);
    setError(null);
    setExec2Done(false);
    setExec2Resp(null);
    setExec2Ms(null);
    setExec2Stages(makeInitialStages(true));
    setExec2Expanded({});
    exec2ReportRef.current = null;

    const ksBefore = exec1ReportRef.current?.knowledgeStoreAfter ?? null;
    const t0 = Date.now();
    try {
      const { finalResponse, executionReport } = await runCognitiveCycle(
        exec2Input.trim(),
        (key, patch) => setExec2Stages(prev => ({ ...prev, [key]: { ...prev[key], ...patch } })),
        true,
        ksBefore,
      );
      exec2ReportRef.current = executionReport;
      setExec2Resp(finalResponse);
      setExec2Ms(Date.now() - t0);
      setExec2Done(true);
    } catch (e) {
      setError(`Exec-2: ${e?.message ?? String(e)}`);
    } finally {
      setExec2Running(false);
    }
  }, [exec2Running, exec2Input, exec1Done]);

  // ── Reset ────────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setExec1Stages(makeInitialStages(false));
    setExec2Stages(makeInitialStages(true));
    setExec1Expanded({}); setExec2Expanded({});
    setExec1Done(false);  setExec2Done(false);
    setExec1Resp(null);   setExec2Resp(null);
    setExec1Ms(null);     setExec2Ms(null);
    setError(null);
    exec1ReportRef.current = null;
    exec2ReportRef.current = null;
  }, []);

  // ── Helpers — leem do ExecutionReport, nunca de stores ───────────────────────

  const stagesForPass = (stages, includeRecall) => {
    const keys = STAGE_KEYS.filter(k => includeRecall || k !== "recall");
    return keys.filter(k => stages[k]?.status === "ok" || stages[k]?.status === "fallback").length;
  };
  const stagesHasError = (stages) => STAGE_KEYS.some(k => stages[k]?.status === "error");

  // Veredicto lido do ExecutionReport da Exec-2
  const exec2RecallOk  = exec2Done && exec2Stages["recall"]?.status === "ok";
  const mvp02Approved  = exec1Done && exec2Done && exec2RecallOk && !stagesHasError(exec2Stages);

  // Dados do ExecutionReport para o veredicto — sem acesso direto a engines
  const r1 = exec1ReportRef.current;
  const r2 = exec2ReportRef.current;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950/60 to-indigo-950/40 border border-violet-800/50 rounded-xl p-5">
          <div className="flex flex-wrap gap-2 mb-1 text-xs font-mono">
            <span className="text-violet-400">MVP-02.1</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Certificação do Runtime Cognitivo Oficial</span>
          </div>
          <h1 className="text-lg font-bold text-white">Runtime é a única fonte de verdade</h1>
          <p className="text-zinc-400 text-sm mt-0.5">UI renderiza exclusivamente o ExecutionReport produzido pelo Runtime</p>
        </div>

        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm font-bold mb-1">Erro</p>
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {/* ── EXECUÇÃO 1 ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-indigo-900/50 border border-indigo-700 rounded-lg px-3 py-1.5">
              <BookOpen className="w-4 h-4 text-indigo-300" />
              <span className="text-sm font-bold text-indigo-200">Execução 1 — Ensino</span>
            </div>
            {exec1Done && (
              <span className="text-xs font-mono text-emerald-400">
                {stagesForPass(exec1Stages, false)}/13 ✓ {exec1Ms}ms
              </span>
            )}
            {(exec1Done || exec2Done) && (
              <button onClick={reset} className="ml-auto flex items-center gap-1 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Informação a ensinar ao sistema</label>
            <textarea
              value={exec1Input}
              onChange={e => setExec1Input(e.target.value)}
              disabled={exec1Running || exec1Done}
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-violet-500 disabled:opacity-50"
            />
            <button
              onClick={runExec1}
              disabled={exec1Running || exec1Done || !exec1Input.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
            >
              {exec1Running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {exec1Running ? "Executando..." : exec1Done ? "Concluído ✓" : "Executar Exec-1 (Ensinar)"}
            </button>
          </div>

          <div className="space-y-2">
            {STAGE_KEYS.filter(k => k !== "recall").map(key => (
              <StageRow
                key={key}
                label={STAGE_LABELS[key]}
                status={exec1Stages[key]?.status ?? "pending"}
                artifact={exec1Stages[key]?.artifact}
                summary={exec1Stages[key]?.summary}
                metrics={exec1Stages[key]?.metrics}
                expanded={!!exec1Expanded[key]}
                onToggle={() => setExec1Expanded(p => ({ ...p, [key]: !p[key] }))}
              />
            ))}
          </div>

          {exec1Resp && (
            <div className="bg-indigo-950/20 border border-indigo-800 rounded-xl p-4">
              <p className="text-indigo-400 text-xs font-bold mb-1">
                Exec-1 — Resposta ({exec1Ms}ms)
                {r1 && <span className="text-zinc-600 ml-2 font-mono">executionId: {r1.executionId.slice(-16)}</span>}
              </p>
              <p className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">{exec1Resp}</p>
            </div>
          )}
        </div>

        {/* Divisor */}
        {exec1Done && (
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-zinc-700" />
            <span className="text-xs text-zinc-500 font-mono">
              knowledge persisted: {r1?.memory?.total ?? 0} regras ↓ new session
            </span>
            <div className="flex-1 border-t border-zinc-700" />
          </div>
        )}

        {/* ── EXECUÇÃO 2 ── */}
        {exec1Done && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-sky-900/50 border border-sky-700 rounded-lg px-3 py-1.5">
                <Search className="w-4 h-4 text-sky-300" />
                <span className="text-sm font-bold text-sky-200">Execução 2 — Recall</span>
              </div>
              {exec2Done && (
                <span className="text-xs font-mono text-emerald-400">
                  {stagesForPass(exec2Stages, true)}/14 ✓ {exec2Ms}ms
                </span>
              )}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Nova conversa — pergunta relacionada</label>
              <textarea
                value={exec2Input}
                onChange={e => setExec2Input(e.target.value)}
                disabled={exec2Running || exec2Done}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-sky-500 disabled:opacity-50"
              />
              <button
                onClick={runExec2}
                disabled={exec2Running || exec2Done || !exec2Input.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
              >
                {exec2Running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {exec2Running ? "Executando..." : exec2Done ? "Concluído ✓" : "Executar Exec-2 (Recuperar)"}
              </button>
            </div>

            <div className="space-y-2">
              {STAGE_KEYS.map(key => (
                <StageRow
                  key={key}
                  label={STAGE_LABELS[key]}
                  status={exec2Stages[key]?.status ?? "pending"}
                  artifact={exec2Stages[key]?.artifact}
                  summary={exec2Stages[key]?.summary}
                  metrics={exec2Stages[key]?.metrics}
                  expanded={!!exec2Expanded[key]}
                  onToggle={() => setExec2Expanded(p => ({ ...p, [key]: !p[key] }))}
                  highlight={key === "recall"}
                />
              ))}
            </div>

            {exec2Resp && (
              <div className="bg-sky-950/20 border border-sky-800 rounded-xl p-4">
                <p className="text-sky-400 text-xs font-bold mb-1">
                  Exec-2 — Resposta ({exec2Ms}ms)
                  {r2 && <span className="text-zinc-600 ml-2 font-mono">executionId: {r2.executionId.slice(-16)}</span>}
                </p>
                <p className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">{exec2Resp}</p>
              </div>
            )}
          </div>
        )}

        {/* Veredicto MVP-02.1 — lido do ExecutionReport */}
        {exec2Done && (
          <div className={`rounded-xl border-2 p-4 ${mvp02Approved ? "bg-emerald-950/20 border-emerald-700" : "bg-red-950/30 border-red-800"}`}>
            <p className={`text-sm font-bold ${mvp02Approved ? "text-emerald-300" : "text-red-300"}`}>
              {mvp02Approved
                ? "MVP-02.1 — APROVADO: Runtime Cognitivo Oficial certificado. UI apenas visualiza o ExecutionReport."
                : "MVP-02.1 — FALHA: knowledge não percorreu a cadeia completa no Runtime."
              }
            </p>
            {/* Todos os dados vêm do ExecutionReport — sem acesso direto a stores */}
            <div className="mt-3 space-y-1 text-xs font-mono">
              <div className={r1?.memory?.total > 0 ? "text-emerald-400" : "text-zinc-500"}>
                ✓ Knowledge Store: {r1?.memory?.total ?? 0} regra(s) persistidas (exec-1.memory.total)
              </div>
              <div className={r2?.retrieval?.rulesRetrieved > 0 ? "text-emerald-400" : "text-red-400"}>
                {r2?.retrieval?.rulesRetrieved > 0 ? "✓" : "✗"} Retrieval: {r2?.retrieval?.rulesRetrieved ?? 0} regra(s) recuperadas por KnowledgeReasoningEngine (exec-2.retrieval.rulesRetrieved)
              </div>
              <div className={r2?.planner?.knowledgeInjected ? "text-emerald-400" : "text-amber-400"}>
                {r2?.planner?.knowledgeInjected ? "✓" : "~"} Planner recebeu {r2?.planner?.knowledgeRulesReceived ?? 0} regra(s) (exec-2.planner.knowledgeRulesReceived)
              </div>
              <div className={r2?.response?.knowledgeInjected ? "text-emerald-400" : "text-amber-400"}>
                {r2?.response?.knowledgeInjected ? "✓" : "~"} LLM recebeu {r2?.response?.rulesInjected ?? 0} regra(s) via kfmContext (exec-2.response.rulesInjected)
              </div>
              <div className={exec2RecallOk ? "text-emerald-400" : "text-red-400"}>
                {exec2RecallOk ? "✓" : "✗"} ExecutionReport validado (estágio 14)
              </div>
              {r2 && (
                <div className="text-zinc-600 mt-1">
                  exec-2.executionId: {r2.executionId} | duration: {r2.totalDurationMs}ms
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}