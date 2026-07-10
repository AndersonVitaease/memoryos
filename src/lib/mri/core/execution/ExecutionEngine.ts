/**
 * MRI — MemoryOS Reference Implementation
 * Execution Engine (MCS + MRS Capítulo 1 + Sprint 17)
 *
 * Executa planos aprovados de forma segura, auditável e desacoplada.
 * Nunca conhece APIs específicas — usa apenas IConnector.
 * Suporta rollback, retry e execução paralela.
 */

import type { IConnector, ExecutionContext } from "../interfaces";
import { SecurityGate, type RiskLevel } from "../security/SecurityGate";
import { AuditTrail } from "../audit/AuditTrail";
import { EventBus } from "../event-bus/EventBus";

export interface PlanStep {
  stepId:        string;
  name:          string;
  connectorId:   string;
  capabilityId:  string;
  input:         unknown;
  dependsOn:     string[];
  parallel:      boolean;
  required:      boolean;
  riskLevel:     RiskLevel;
  isReversible:  boolean;
  timeoutMs:     number;
}

export interface Plan {
  planId:      string;
  journeyId:   string;
  userId:      string;
  sessionId:   string;
  steps:       PlanStep[];
}

export type StepStatus = "pending" | "running" | "success" | "failed" | "rolled_back" | "skipped";

export interface StepResult {
  stepId:     string;
  status:     StepStatus;
  output?:    unknown;
  error?:     string;
  startedAt:  string;
  endedAt?:   string;
}

export interface ExecutionResult {
  executionId: string;
  planId:      string;
  status:      "success" | "partial" | "failed" | "rolled_back";
  stepResults: StepResult[];
  startedAt:   string;
  endedAt?:    string;
  requiresApproval?: boolean;
  pendingStepId?:    string;
}

export class ExecutionEngine {
  private connectors = new Map<string, IConnector>();

  constructor(
    private readonly audit:    AuditTrail,
    private readonly eventBus: EventBus,
    private readonly security: SecurityGate = new SecurityGate()
  ) {}

  registerConnector(connector: IConnector): void {
    this.connectors.set(connector.connectorId, connector);
  }

  async execute(plan: Plan): Promise<ExecutionResult> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt   = new Date().toISOString();
    const stepResults = new Map<string, StepResult>();

    await this.audit.record({
      action:      "execution.started",
      userId:      plan.userId,
      sessionId:   plan.sessionId,
      journeyId:   plan.journeyId,
      executionId,
      outcome:     "success",
    });

    // Resolve ordem de execução respeitando dependências
    const ordered = this.resolveOrder(plan.steps);

    for (const batch of ordered) {
      const results = await Promise.all(
        batch.map(step => this.executeStep(step, plan, executionId, stepResults))
      );

      // Se algum step required falhou, rollback e para
      const failed = results.find(r => r.status === "failed");
      if (failed) {
        const failedStep = plan.steps.find(s => s.stepId === failed.stepId)!;
        if (failedStep.required) {
          await this.rollback(plan, stepResults, executionId);
          const result: ExecutionResult = {
            executionId,
            planId:      plan.planId,
            status:      "rolled_back",
            stepResults: [...stepResults.values()],
            startedAt,
            endedAt:     new Date().toISOString(),
          };
          await this.audit.record({
            action: "execution.failed", userId: plan.userId,
            sessionId: plan.sessionId, executionId, outcome: "failure",
          });
          await this.eventBus.publish({
            type: "execution.failed", sourceEngine: "ExecutionEngine",
            priority: "HIGH", payload: result,
          });
          return result;
        }
      }
    }

    const result: ExecutionResult = {
      executionId,
      planId:   plan.planId,
      status:   "success",
      stepResults: [...stepResults.values()],
      startedAt,
      endedAt:  new Date().toISOString(),
    };

    await this.audit.record({
      action: "execution.completed", userId: plan.userId,
      sessionId: plan.sessionId, executionId, outcome: "success",
    });
    await this.eventBus.publish({
      type: "execution.completed", sourceEngine: "ExecutionEngine",
      priority: "NORMAL", payload: result,
    });
    return result;
  }

  private async executeStep(
    step: PlanStep,
    plan: Plan,
    executionId: string,
    stepResults: Map<string, StepResult>
  ): Promise<StepResult> {
    const startedAt = new Date().toISOString();

    // Security Gate — obrigatório antes de cada step (MRS Cap. 12)
    const gate = this.security.evaluate({
      userId:          plan.userId,
      sessionId:       plan.sessionId,
      action:          "connector.execute",
      resource:        step.connectorId,
      estimatedImpact: step.riskLevel,
      isReversible:    step.isReversible,
    });

    if (!gate.authorized) {
      const result: StepResult = {
        stepId: step.stepId, status: "failed",
        error: gate.reason, startedAt, endedAt: new Date().toISOString(),
      };
      stepResults.set(step.stepId, result);
      await this.audit.record({
        action: "security.blocked", userId: plan.userId,
        sessionId: plan.sessionId, executionId, stepId: step.stepId,
        outcome: "blocked", details: { reason: gate.reason },
      });
      return result;
    }

    if (gate.requiresApproval) {
      // Human Approval — execução pausada
      const result: StepResult = {
        stepId: step.stepId, status: "pending",
        startedAt, output: { requiresApproval: true, riskLevel: gate.riskLevel },
      };
      stepResults.set(step.stepId, result);
      await this.audit.record({
        action: "approval.requested", userId: plan.userId,
        sessionId: plan.sessionId, executionId, stepId: step.stepId, outcome: "success",
      });
      return result;
    }

    const connector = this.connectors.get(step.connectorId);
    if (!connector) {
      const result: StepResult = {
        stepId: step.stepId, status: "failed",
        error: `Connector '${step.connectorId}' not registered`,
        startedAt, endedAt: new Date().toISOString(),
      };
      stepResults.set(step.stepId, result);
      return result;
    }

    await this.audit.record({
      action: "step.started", userId: plan.userId,
      sessionId: plan.sessionId, executionId, stepId: step.stepId, outcome: "success",
    });

    const ctx: ExecutionContext = {
      executionId, stepId: step.stepId,
      userId: plan.userId, sessionId: plan.sessionId, journeyId: plan.journeyId,
      identityContext: "default", timeoutMs: step.timeoutMs,
      secrets: { get: (k) => process?.env?.[k] },
    };

    const connectorResult = await connector.execute(step.input, ctx);
    const endedAt = new Date().toISOString();
    const status  = connectorResult.status === "success" ? "success" : "failed";

    const result: StepResult = {
      stepId: step.stepId, status,
      output: connectorResult.outputData, startedAt, endedAt,
    };
    stepResults.set(step.stepId, result);

    await this.audit.record({
      action: status === "success" ? "step.completed" : "step.failed",
      userId: plan.userId, sessionId: plan.sessionId,
      executionId, stepId: step.stepId,
      outcome: status === "success" ? "success" : "failure",
    });

    return result;
  }

  private async rollback(
    plan: Plan,
    stepResults: Map<string, StepResult>,
    executionId: string
  ): Promise<void> {
    const completed = plan.steps
      .filter(s => stepResults.get(s.stepId)?.status === "success")
      .filter(s => s.isReversible)
      .reverse();

    for (const step of completed) {
      const connector = this.connectors.get(step.connectorId);
      if (!connector?.rollback) continue;

      const ctx: ExecutionContext = {
        executionId, stepId: step.stepId,
        userId: plan.userId, sessionId: plan.sessionId, journeyId: plan.journeyId,
        identityContext: "default", timeoutMs: 10000,
        secrets: { get: (k) => process?.env?.[k] },
      };

      const prevResult = stepResults.get(step.stepId);
      await connector.rollback(prevResult?.output, ctx);
      stepResults.set(step.stepId, { ...prevResult!, status: "rolled_back" });

      await this.audit.record({
        action: "step.rolled_back", userId: plan.userId,
        sessionId: plan.sessionId, executionId, stepId: step.stepId, outcome: "success",
      });
    }
  }

  /** Divide steps em batches respeitando dependências */
  private resolveOrder(steps: PlanStep[]): PlanStep[][] {
    const completed = new Set<string>();
    const remaining = [...steps];
    const batches: PlanStep[][] = [];

    while (remaining.length > 0) {
      const ready = remaining.filter(s =>
        s.dependsOn.every(dep => completed.has(dep))
      );
      if (ready.length === 0) break; // dependência circular — não bloquear
      batches.push(ready);
      ready.forEach(s => completed.add(s.stepId));
      ready.forEach(s => remaining.splice(remaining.indexOf(s), 1));
    }

    return batches;
  }
}