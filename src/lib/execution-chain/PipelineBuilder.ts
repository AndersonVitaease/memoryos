// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11B — EF-03/EF-14: PipelineBuilder
// Assembles the canonical 13-stage pipeline.
// All stages consume ExecutionState — no StageOutputBag, no Map, no _bag().
// ══════════════════════════════════════════════════════════════════════════════

import type { PipelineStage }    from "./PipelineStage";
import type { ExecutionContext }  from "./ExecutionContext";
import type { ExecutionState }   from "./ExecutionState";
import type { ChainStageRecord } from "./ExecutionChainTypes";
import { ExecutionPipeline }     from "./ExecutionPipeline";
import { PipelineValidator }     from "./PipelineValidator";

import type { IIntentRuntime }         from "./stages/IntentRuntimeStage";
import type { IGoalRuntime }           from "./stages/GoalRuntimeStage";
import type { IPlanningRuntime }       from "./stages/PlanningRuntimeStage";
import type { IKernel }                from "./stages/KernelStage";
import type { IRuntimeOrchestrator }   from "./stages/RuntimeOrchestratorStage";
import type { ICapabilityRuntime }     from "./stages/CapabilityRuntimeStage";
import type { IConnectorRuntimeStage } from "./stages/ConnectorRuntimeStageImpl";
import type { IConnectorStage }        from "./stages/ConnectorStage";
import type { IResultStage }           from "./stages/ResultStage";
import type { IMemoryEngine }          from "./stages/MemoryStage";
import type { IExplainabilityEngine }  from "./stages/ExplainabilityStage";
import type { IAuditEngine }           from "./stages/AuditStage";

// ── Stage factory functions ────────────────────────────────────────────────────
// Each stage receives the full ExecutionState and returns its typed output.

function userInputStage(): PipelineStage {
  return {
    id: "USER_INPUT",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      return state.userInput;
    },
  };
}

function intentStage(runtime: IIntentRuntime): PipelineStage {
  return {
    id: "INTENT_RUNTIME",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.userInput) throw new Error("INTENT_RUNTIME: userInput missing from state");
      return runtime.classify(state.userInput);
    },
  };
}

function goalStage(runtime: IGoalRuntime): PipelineStage {
  return {
    id: "GOAL_RUNTIME",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.intent)    throw new Error("GOAL_RUNTIME: intent missing");
      if (!state.userInput) throw new Error("GOAL_RUNTIME: userInput missing");
      return runtime.derive(state.intent, state.userInput);
    },
  };
}

function planningStage(runtime: IPlanningRuntime): PipelineStage {
  return {
    id: "PLANNING_RUNTIME",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.goal)   throw new Error("PLANNING_RUNTIME: goal missing");
      if (!state.intent) throw new Error("PLANNING_RUNTIME: intent missing");
      return runtime.plan(state.goal, state.intent);
    },
  };
}

function kernelStage(runtime: IKernel): PipelineStage {
  return {
    id: "KERNEL",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.plan)      throw new Error("KERNEL: plan missing");
      if (!state.userInput) throw new Error("KERNEL: userInput missing");
      return runtime.apply(state.plan, state.userInput);
    },
  };
}

function orchestratorStage(runtime: IRuntimeOrchestrator): PipelineStage {
  return {
    id: "RUNTIME_ORCHESTRATOR",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.kernel) throw new Error("RUNTIME_ORCHESTRATOR: kernel missing");
      if (!state.plan)   throw new Error("RUNTIME_ORCHESTRATOR: plan missing");
      return runtime.orchestrate(state.kernel, state.plan);
    },
  };
}

function capabilityStage(runtime: ICapabilityRuntime): PipelineStage {
  return {
    id: "CAPABILITY_RUNTIME",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.orchestrator) throw new Error("CAPABILITY_RUNTIME: orchestrator missing");
      return runtime.prepare(state.orchestrator);
    },
  };
}

function connectorRuntimeStage(runtime: IConnectorRuntimeStage): PipelineStage {
  return {
    id: "CONNECTOR_RUNTIME",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.orchestrator) throw new Error("CONNECTOR_RUNTIME: orchestrator missing");
      return runtime.connect(state.orchestrator);
    },
  };
}

function connectorStage(runtime: IConnectorStage): PipelineStage {
  return {
    id: "CONNECTOR",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.orchestrator)     throw new Error("CONNECTOR: orchestrator missing");
      if (!state.connectorRuntime) throw new Error("CONNECTOR: connectorRuntime missing");
      if (!state.userInput)        throw new Error("CONNECTOR: userInput missing");
      return runtime.execute(state.orchestrator, state.connectorRuntime, state.userInput);
    },
  };
}

function resultStage(runtime: IResultStage): PipelineStage {
  return {
    id: "RESULT",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.connector) throw new Error("RESULT: connector missing");
      if (!state.intent)    throw new Error("RESULT: intent missing");
      return runtime.produce(state.connector, state.intent);
    },
  };
}

function memoryStage(runtime: IMemoryEngine): PipelineStage {
  return {
    id: "MEMORY",
    async execute(_ctx: ExecutionContext, state: ExecutionState) {
      if (!state.result)    throw new Error("MEMORY: result missing");
      if (!state.goal)      throw new Error("MEMORY: goal missing");
      if (!state.userInput) throw new Error("MEMORY: userInput missing");
      return runtime.memorize(state.result, state.goal, state.userInput);
    },
  };
}

function explainabilityStage(runtime: IExplainabilityEngine): PipelineStage {
  return {
    id: "EXPLAINABILITY",
    async execute(ctx: ExecutionContext, state: ExecutionState) {
      if (!state.result) throw new Error("EXPLAINABILITY: result missing");
      if (!state.intent) throw new Error("EXPLAINABILITY: intent missing");
      // EF-17: evidences collected automatically by ExecutionPipeline
      const evids = ctx.evidences.map(e => e.decision);
      const recs  = state.records as readonly ChainStageRecord[];
      return runtime.explain(recs as ChainStageRecord[], state.result, state.intent, evids);
    },
  };
}

function auditStage(runtime: IAuditEngine): PipelineStage {
  return {
    id: "AUDIT",
    async execute(ctx: ExecutionContext, state: ExecutionState) {
      return runtime.audit(ctx.executionId, state.memory ?? null, state.explainability ?? null, ctx.eventBus);
    },
  };
}

// ── PipelineStageAdapters — exported for ECR ──────────────────────────────────
export const StageAdapters = {
  userInput:        userInputStage,
  intent:           intentStage,
  goal:             goalStage,
  planning:         planningStage,
  kernel:           kernelStage,
  orchestrator:     orchestratorStage,
  capability:       capabilityStage,
  connectorRuntime: connectorRuntimeStage,
  connector:        connectorStage,
  result:           resultStage,
  memory:           memoryStage,
  explainability:   explainabilityStage,
  audit:            auditStage,
};

// ── PipelineBuilder ───────────────────────────────────────────────────────────

export interface PipelineStageFactories {
  intentRuntime:       IIntentRuntime;
  goalRuntime:         IGoalRuntime;
  planningRuntime:     IPlanningRuntime;
  kernel:              IKernel;
  runtimeOrchestrator: IRuntimeOrchestrator;
  capabilityRuntime:   ICapabilityRuntime;
  connectorRuntime:    IConnectorRuntimeStage;
  connectorStage:      IConnectorStage;
  resultStage:         IResultStage;
  memoryEngine:        IMemoryEngine;
  explainability:      IExplainabilityEngine;
  auditEngine:         IAuditEngine;
}

export class PipelineBuilder {
  private readonly _validator = new PipelineValidator();

  build(factories: PipelineStageFactories): ExecutionPipeline {
    const stages: PipelineStage[] = [
      StageAdapters.userInput(),
      StageAdapters.intent(factories.intentRuntime),
      StageAdapters.goal(factories.goalRuntime),
      StageAdapters.planning(factories.planningRuntime),
      StageAdapters.kernel(factories.kernel),
      StageAdapters.orchestrator(factories.runtimeOrchestrator),
      StageAdapters.capability(factories.capabilityRuntime),
      StageAdapters.connectorRuntime(factories.connectorRuntime),
      StageAdapters.connector(factories.connectorStage),
      StageAdapters.result(factories.resultStage),
      StageAdapters.memory(factories.memoryEngine),
      StageAdapters.explainability(factories.explainability),
      StageAdapters.audit(factories.auditEngine),
    ];

    const validation = this._validator.validate(stages);
    if (!validation.valid) {
      throw new Error(`PipelineValidator rejected pipeline: ${validation.errors.join("; ")}`);
    }

    return new ExecutionPipeline(stages);
  }
}