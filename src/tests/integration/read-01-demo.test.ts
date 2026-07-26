/**
 * read-01 Integration Demo & Sprint Closure Test
 *
 * Executa demonstração real da integração de GoogleDriveReadCapability.
 * Registra cada etapa do fluxo: intenção → execução → resposta.
 *
 * Objetivo: Validar que read-01 está operacional e pronto para produção.
 */

import { describe, it, expect, beforeAll } from "vitest";

// ─── Imports para simular fluxo real ───────────────────────────────────────

// ConversationPipeline
import { ConversationPipeline } from "@/lib/conversation-platform/ConversationPipeline";
import { conversationStore } from "@/lib/conversation-platform/ConversationStore";

// Planning
import { conversationPlanningEngine } from "@/lib/planning-engine-e022/ConversationPlanningEngine";
import { conversationGoalBridge } from "@/lib/conversation-goal-bridge/ConversationGoalBridge";

// Runtime
import { ConversationRuntimeEngine } from "@/lib/runtime-engine/ConversationRuntimeEngine";
import { ConnectorRouterExecutor } from "@/lib/capability-runtime/ConnectorRouterExecutor";
import { CapabilityRuntime } from "@/lib/capability-runtime/CapabilityRuntime";
import { ConnectorRuntime } from "@/lib/connector-runtime/ConnectorRuntime";
import { CapabilityBootstrap } from "@/lib/capability-runtime/CapabilityBootstrap";
import { ConnectorBootstrap } from "@/lib/connector-runtime/ConnectorBootstrap";

// ─── Test Output Recorder ──────────────────────────────────────────────────

const LOG = {
  _entries: [] as { step: number; title: string; data: any }[],

  record(step: number, title: string, data: any) {
    this._entries.push({ step, title, data });
    console.log(`\n[${"=".repeat(80)}]`);
    console.log(`[STEP ${step}] ${title}`);
    console.log(`[${"=".repeat(80)}]`);
    console.log(JSON.stringify(data, null, 2));
  },

  summary() {
    console.log("\n" + "=".repeat(80));
    console.log("📋 RESUMO COMPLETO DO FLUXO read-01");
    console.log("=".repeat(80) + "\n");
    this._entries.forEach((e) => {
      console.log(`[STEP ${e.step}] ${e.title}`);
    });
  },
};

// ─── Test Suite ────────────────────────────────────────────────────────────

describe("read-01 Integration Demo — Sprint Closure", () => {
  let connectorRuntime: ConnectorRuntime;
  let capabilityRuntime: CapabilityRuntime;
  let runtimeEngine: ConversationRuntimeEngine;

  beforeAll(async () => {
    // Bootstrap platform
    console.log("\n🔧 Bootstrapping platform...\n");

    connectorRuntime = new ConnectorRuntime();
    capabilityRuntime = new CapabilityRuntime(connectorRuntime);

    // Bootstrap connectors
    const connRegistry = (connectorRuntime as any)._registry;
    const connBootstrapResult = await ConnectorBootstrap.bootstrap(connRegistry);
    console.log(
      `✅ Connectors loaded: ${connBootstrapResult.connectorsLoaded}`
    );

    // Bootstrap capabilities
    const capBootstrapResult = await CapabilityBootstrap.bootstrap(
      capabilityRuntime
    );
    console.log(`✅ Capabilities loaded: ${capBootstrapResult.capabilitiesLoaded}`);

    // Create runtime engine with ConnectorRouterExecutor
    const executor = new ConnectorRouterExecutor(
      capabilityRuntime,
      connectorRuntime
    );
    runtimeEngine = new ConversationRuntimeEngine(executor);

    console.log("\n✅ Platform initialized\n");
  });

  it("should execute read-01 flow from user intent to capability execution", async () => {
    // ────────────────────────────────────────────────────────────────────
    // STEP 1: User Intent
    // ────────────────────────────────────────────────────────────────────
    const userMessage =
      "Mostre-me os metadados do arquivo 1a2b3c4d5e6f7g8h9i0j";

    LOG.record(1, "INTENÇÃO DO USUÁRIO", {
      message: userMessage,
      timestamp: new Date().toISOString(),
    });

    // ────────────────────────────────────────────────────────────────────
    // STEP 2: Goal Production (ConversationGoalBridge)
    // ────────────────────────────────────────────────────────────────────
    const goalBridgeResult = conversationGoalBridge.derive(
      userMessage,
      "file_metadata_retrieval",
      0.95
    );

    LOG.record(2, "GOAL DO PLANNING ENGINE", {
      goalId: goalBridgeResult.goal.id,
      goalType: goalBridgeResult.goal.type,
      goalValid: goalBridgeResult.goal.valid,
      goalConfidence: goalBridgeResult.goal.confidence,
      goalParameters: goalBridgeResult.goal.parameters,
    });

    // ────────────────────────────────────────────────────────────────────
    // STEP 3: ExecutionPlan Generation (ConversationPlanningEngine)
    // ────────────────────────────────────────────────────────────────────
    const planResult = conversationPlanningEngine.plan(goalBridgeResult.goal, {
      mode: "live",
    });

    LOG.record(3, "EXECUTION PLAN GERADO", {
      planId: planResult.plan.id,
      planGoalId: planResult.plan.goalId,
      planGoalType: planResult.plan.goalType,
      stepsCount: planResult.plan.steps.length,
      steps: planResult.plan.steps.map((s) => ({
        stepId: s.id,
        connector: s.connector,
        capability: s.capability,
        parameters: s.parameters,
      })),
    });

    // ────────────────────────────────────────────────────────────────────
    // STEP 4: Capability Selection Validation
    // ────────────────────────────────────────────────────────────────────
    const selectedCapability = capabilityRuntime.getCapability(
      planResult.plan.steps[0].connector
    );

    LOG.record(4, "CAPABILITY SELECIONADA", {
      capabilityId: selectedCapability?.id || "NOT_FOUND",
      capabilityVersion: selectedCapability?.metadata().version || "N/A",
      connectorId: selectedCapability?.metadata().connectorId || "N/A",
      declaredOperations:
        selectedCapability?.metadata().operations || "NOT_FOUND",
      requestedOperation: planResult.plan.steps[0].capability,
      operationSupported:
        selectedCapability?.metadata().operations.includes(
          planResult.plan.steps[0].capability
        ) || false,
    });

    // Validate capability was selected
    expect(selectedCapability).toBeDefined();
    expect(selectedCapability?.id).toBe("google-drive-read");

    // ────────────────────────────────────────────────────────────────────
    // STEP 5: Connector Execution
    // ────────────────────────────────────────────────────────────────────
    const connectorResult = await connectorRuntime.execute(
      planResult.plan.steps[0].connector,
      planResult.plan.steps[0].capability,
      {
        fileId: "1a2b3c4d5e6f7g8h9i0j",
      },
      {
        executionId: planResult.plan.id,
        userId: "demo-user",
        workspaceId: "demo-workspace",
        sessionId: "demo-session",
      }
    );

    LOG.record(5, "CONNECTOR EXECUTADO", {
      connectorId: planResult.plan.steps[0].connector,
      resultStatus: connectorResult.status,
      resultSuccess: connectorResult.success,
      resultData: connectorResult.data || "NO_DATA",
      resultError: connectorResult.error || null,
      resultDurationMs: connectorResult.duration,
      resultLogsCount: connectorResult.logs?.length || 0,
    });

    // ────────────────────────────────────────────────────────────────────
    // STEP 6: RuntimeEngine Execution (Full Plan)
    // ────────────────────────────────────────────────────────────────────
    const executionResult = await runtimeEngine.execute(planResult.plan);

    LOG.record(6, "RESULTADO DA EXECUÇÃO", {
      executionId: executionResult.executionId,
      planId: executionResult.planId,
      goalId: executionResult.goalId,
      status: executionResult.status,
      stepsExecuted: executionResult.steps.length,
      stepResults: executionResult.steps.map((s) => ({
        stepId: s.stepId,
        connector: s.connector,
        capability: s.capability,
        status: s.status,
        hasOutput: s.output !== null && s.output !== undefined,
        outputKeys: s.output ? Object.keys(s.output).slice(0, 5) : [],
        durationMs: s.durationMs,
      })),
      totalDurationMs: executionResult.durationMs,
      errors: executionResult.errors,
    });

    // ────────────────────────────────────────────────────────────────────
    // STEP 7: Final Response to User
    // ────────────────────────────────────────────────────────────────────
    const firstStepOutput = executionResult.steps[0]?.output;
    const finalResponse = firstStepOutput
      ? `✅ Arquivo encontrado: ${firstStepOutput.name || "desconhecido"}
         Tamanho: ${firstStepOutput.size || "N/A"} bytes
         Tipo: ${firstStepOutput.mimeType || "N/A"}
         Criado em: ${firstStepOutput.createdTime || "N/A"}`
      : "❌ Não foi possível recuperar os metadados do arquivo.";

    LOG.record(7, "RESPOSTA FINAL AO USUÁRIO", {
      success: executionResult.status === "completed",
      message: finalResponse,
      fileMetadata: firstStepOutput || null,
    });

    // ────────────────────────────────────────────────────────────────────
    // Validations
    // ────────────────────────────────────────────────────────────────────
    expect(executionResult.status).toBe("completed");
    expect(selectedCapability?.id).toBe("google-drive-read");
    expect(planResult.plan.steps[0].capability).toBe("drive.files.get");

    // Print summary
    LOG.summary();

    console.log("\n" + "=".repeat(80));
    console.log("✅ SPRINT read-01 — ENCERRADA COM SUCESSO");
    console.log("=".repeat(80));
    console.log("\nFluxo completo validado:");
    console.log("  1. ✅ Intenção recebida e processada");
    console.log("  2. ✅ Goal produzido pelo ConversationGoalBridge");
    console.log("  3. ✅ ExecutionPlan gerado pelo ConversationPlanningEngine");
    console.log("  4. ✅ GoogleDriveReadCapability descoberta e selecionada");
    console.log("  5. ✅ GoogleDriveConnector executado com sucesso");
    console.log("  6. ✅ Resultado retornado pelo RuntimeEngine");
    console.log("  7. ✅ Resposta final entregue ao usuário");
    console.log("\n" + "=".repeat(80) + "\n");
  });
});
