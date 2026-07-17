// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — EF-03: PipelineBuilder
// Assembles the canonical 13-stage pipeline in the correct order.
// ExecutionChain MUST use this — never assemble stages inline.
// ══════════════════════════════════════════════════════════════════════════════

import type { PipelineStage }    from "./PipelineStage";
import type { ExecutionContext }  from "./ExecutionContext";
import type {
  UserInput, IntentResult, GoalResult, PlanResult, KernelResult,
  OrchestratorResult, CapabilityResult, ConnectorRuntimeResult,
  ConnectorResult, ResultOutput, MemoryResult,
  ExplainabilityResult, AuditResult,
  ChainStageRecord,
} from "./ExecutionChainTypes";
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

// ── Internal carry-bag — ECR populates this per execution ─────────────────────
export interface StageOutputBag {
  userInput: UserInput;
  intent:    IntentResult;
  goal:      GoalResult;
  plan:      PlanResult;
  kern:      KernelResult;
  orch:      OrchestratorResult;
  cap:       CapabilityResult;
  cr:        ConnectorRuntimeResult;
  conn:      ConnectorResult;
  result:    ResultOutput;
  mem:       MemoryResult;
  records:   ChainStageRecord[];
}

// Helper to retrieve the bag from context
function _bag(ctx: ExecutionContext): StageOutputBag {
  return (ctx as unknown as { _bag: StageOutputBag })._bag;
}

// ── Stage factory functions ───────────────────────────────────────────────────

function userInputStage(): PipelineStage<UserInput, UserInput> {
  return {
    id: "USER_INPUT",
    async execute(_ctx: ExecutionContext, input: UserInput): Promise<UserInput> {
      return input;
    },
  };
}

function intentStage(runtime: IIntentRuntime): PipelineStage<UserInput, IntentResult> {
  return {
    id: "INTENT_RUNTIME",
    async execute(_ctx: ExecutionContext, input: UserInput): Promise<IntentResult> {
      return runtime.classify(input);
    },
  };
}

function goalStage(runtime: IGoalRuntime): PipelineStage<IntentResult, GoalResult> {
  return {
    id: "GOAL_RUNTIME",
    async execute(ctx: ExecutionContext, intent: IntentResult): Promise<GoalResult> {
      return runtime.derive(intent, _bag(ctx).userInput);
    },
  };
}

function planningStage(runtime: IPlanningRuntime): PipelineStage<GoalResult, PlanResult> {
  return {
    id: "PLANNING_RUNTIME",
    async execute(ctx: ExecutionContext, goal: GoalResult): Promise<PlanResult> {
      return runtime.plan(goal, _bag(ctx).intent);
    },
  };
}

function kernelStage(runtime: IKernel): PipelineStage<PlanResult, KernelResult> {
  return {
    id: "KERNEL",
    async execute(ctx: ExecutionContext, plan: PlanResult): Promise<KernelResult> {
      return runtime.apply(plan, _bag(ctx).userInput);
    },
  };
}

function orchestratorStage(runtime: IRuntimeOrchestrator): PipelineStage<KernelResult, OrchestratorResult> {
  return {
    id: "RUNTIME_ORCHESTRATOR",
    async execute(ctx: ExecutionContext, kern: KernelResult): Promise<OrchestratorResult> {
      return runtime.orchestrate(kern, _bag(ctx).plan);
    },
  };
}

function capabilityStage(runtime: ICapabilityRuntime): PipelineStage<OrchestratorResult, CapabilityResult> {
  return {
    id: "CAPABILITY_RUNTIME",
    async execute(_ctx: ExecutionContext, orch: OrchestratorResult): Promise<CapabilityResult> {
      return runtime.prepare(orch);
    },
  };
}

function connectorRuntimeStage(runtime: IConnectorRuntimeStage): PipelineStage<CapabilityResult, ConnectorRuntimeResult> {
  return {
    id: "CONNECTOR_RUNTIME",
    async execute(ctx: ExecutionContext, _cap: CapabilityResult): Promise<ConnectorRuntimeResult> {
      return runtime.connect(_bag(ctx).orch);
    },
  };
}

function connectorStage(runtime: IConnectorStage): PipelineStage<ConnectorRuntimeResult, ConnectorResult> {
  return {
    id: "CONNECTOR",
    async execute(ctx: ExecutionContext, cr: ConnectorRuntimeResult): Promise<ConnectorResult> {
      return runtime.execute(_bag(ctx).orch, cr, _bag(ctx).userInput);
    },
  };
}

function resultStage(runtime: IResultStage): PipelineStage<ConnectorResult, ResultOutput> {
  return {
    id: "RESULT",
    async execute(ctx: ExecutionContext, conn: ConnectorResult): Promise<ResultOutput> {
      return runtime.produce(conn, _bag(ctx).intent);
    },
  };
}

function memoryStage(runtime: IMemoryEngine): PipelineStage<ResultOutput, MemoryResult> {
  return {
    id: "MEMORY",
    async execute(ctx: ExecutionContext, result: ResultOutput): Promise<MemoryResult> {
      return runtime.memorize(result, _bag(ctx).goal, _bag(ctx).userInput);
    },
  };
}

function explainabilityStage(runtime: IExplainabilityEngine): PipelineStage<MemoryResult, ExplainabilityResult> {
  return {
    id: "EXPLAINABILITY",
    async execute(ctx: ExecutionContext, _mem: MemoryResult): Promise<ExplainabilityResult> {
      const evids = ctx.evidences.map(e => e.decision);
      return runtime.explain(_bag(ctx).records, _bag(ctx).result, _bag(ctx).intent, evids);
    },
  };
}

function auditStage(runtime: IAuditEngine): PipelineStage<ExplainabilityResult, AuditResult> {
  return {
    id: "AUDIT",
    async execute(ctx: ExecutionContext, expl: ExplainabilityResult): Promise<AuditResult> {
      return runtime.audit(ctx.executionId, _bag(ctx).mem, expl, ctx.eventBus);
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