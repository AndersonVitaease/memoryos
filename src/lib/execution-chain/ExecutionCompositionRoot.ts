// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11B — EF-04/EF-18: ExecutionCompositionRoot
// THE ONLY place where runtime objects are instantiated.
//
// EF-18: RuntimeRegistry now auto-registers from stage.descriptor().
//        No manual registration list.
// ══════════════════════════════════════════════════════════════════════════════

import { SystemClock }                                  from "../runtime-infra/RuntimeClock";
import { UUIDProvider }                                from "../runtime-infra/RuntimeExecutionIdProvider";
import { RuntimeEventBus }                             from "../runtime-infra/RuntimeEventBus";
import { RuntimeMetrics }                              from "../runtime-infra/RuntimeMetrics";

import { ConnectorRegistry }                           from "./ConnectorRegistry";
import { RuntimeRegistry }                             from "./RuntimeRegistry";
import type { RuntimeDescriptor }                      from "./RuntimeRegistry";
import { RuntimeAuditSink }                            from "./RuntimeAuditSink";
import { PipelineBuilder }                             from "./PipelineBuilder";
import { ExecutionReportAssembler }                    from "./ExecutionReportAssembler";
// ExecutionReportAssembler is now a class with both instance + static assemble methods
import { PipelineInstrumentation }                    from "./PipelineInstrumentation";

import { IntentRuntimeStage }                          from "./stages/IntentRuntimeStage";
import { GoalRuntimeStage }                            from "./stages/GoalRuntimeStage";
import { PlanningRuntimeStage }                        from "./stages/PlanningRuntimeStage";
import { KernelStage }                                 from "./stages/KernelStage";
import { RuntimeOrchestratorStage }                    from "./stages/RuntimeOrchestratorStage";
import { CapabilityRuntimeStageImpl }                  from "./stages/CapabilityRuntimeStage";
import { ConnectorRuntimeStageImpl }                   from "./stages/ConnectorRuntimeStageImpl";
import { ConnectorStageImpl }                          from "./stages/ConnectorStage";
import { ResultStageImpl }                             from "./stages/ResultStage";
import { MemoryStageImpl }                             from "./stages/MemoryStage";
import { ExplainabilityStageImpl }                     from "./stages/ExplainabilityStage";
import { AuditStageImpl }                              from "./stages/AuditStage";

import type { IClock }               from "../runtime-infra/RuntimeClockTypes";
import type { IExecutionIdProvider } from "../runtime-infra/RuntimeExecutionIdProvider";
import type { IConnectorRegistry }   from "./ConnectorRegistry";
import type { ExecutionContext, ExecutionConfig, ExecutionPermissions } from "./ExecutionContext";
import type { ExplainabilityEvidence } from "./PipelineStage";
import type { ExecutionPipeline }    from "./ExecutionPipeline";

export interface CompositionDeps {
  runtimeClock?:        IClock;
  executionIdProvider?: IExecutionIdProvider;
  eventBus?:            RuntimeEventBus;
  metrics?:             RuntimeMetrics;
  connectorRegistry?:   IConnectorRegistry;
  // Override any individual stage runtime
  intentRuntime?:       InstanceType<typeof IntentRuntimeStage>;
  goalRuntime?:         InstanceType<typeof GoalRuntimeStage>;
  planningRuntime?:     InstanceType<typeof PlanningRuntimeStage>;
  kernel?:              InstanceType<typeof KernelStage>;
  runtimeOrchestrator?: InstanceType<typeof RuntimeOrchestratorStage>;
  capabilityRuntime?:   InstanceType<typeof CapabilityRuntimeStageImpl>;
  connectorRuntime?:    InstanceType<typeof ConnectorRuntimeStageImpl>;
  connectorStage?:      InstanceType<typeof ConnectorStageImpl>;
  resultStage?:         InstanceType<typeof ResultStageImpl>;
  memoryEngine?:        InstanceType<typeof MemoryStageImpl>;
  explainability?:      InstanceType<typeof ExplainabilityStageImpl>;
  auditEngine?:         InstanceType<typeof AuditStageImpl>;
}

/** All assembled runtime services — immutable after construction. */
export interface ComposedRuntime {
  readonly clock:             IClock;
  readonly idProvider:        IExecutionIdProvider;
  readonly eventBus:          RuntimeEventBus;
  readonly metrics:           RuntimeMetrics;
  readonly connectorRegistry: IConnectorRegistry;
  readonly runtimeRegistry:   RuntimeRegistry;
  readonly auditSink:         RuntimeAuditSink;
  readonly pipeline:          ExecutionPipeline;
  /** EF-26: Injected into ExecutionChain — no concrete instantiation in chain. */
  readonly reportAssembler:   ExecutionReportAssembler;
}

/**
 * EF-18: Default descriptor factory for stages that do not provide descriptor().
 */
function defaultDescriptor(id: string, clock: IClock): RuntimeDescriptor {
  return {
    id,
    version:      "1.0",
    owner:        "core",
    capabilities: [],
    dependencies: [],
    lifecycle:    "singleton",
    health:       () => ({ status: "healthy", uptime: clock.now(), version: "1.0", dependencies: [] }),
  };
}

/**
 * ExecutionCompositionRoot — builds the complete runtime graph.
 * Call `compose()` once; share the result across executions.
 */
export class ExecutionCompositionRoot {
  static compose(deps: CompositionDeps = {}): ComposedRuntime {
    // ── Infrastructure ──────────────────────────────────────────────────────
    const clock      = deps.runtimeClock        ?? new SystemClock();
    const idProvider = deps.executionIdProvider ?? new UUIDProvider();
    const eventBus   = deps.eventBus            ?? new RuntimeEventBus(1000);
    const metrics    = deps.metrics             ?? new RuntimeMetrics(60000, () => clock.now());

    const connectorRegistry = deps.connectorRegistry ?? new ConnectorRegistry();
    const runtimeRegistry   = new RuntimeRegistry(clock.now());
    const auditSink         = new RuntimeAuditSink();

    // Attach audit sink to bus before any stage runs
    auditSink.attach(eventBus);

    // ── Stage construction ──────────────────────────────────────────────────
    const intentRuntime       = deps.intentRuntime       ?? new IntentRuntimeStage();
    const goalRuntime         = deps.goalRuntime         ?? new GoalRuntimeStage(idProvider);
    const planningRuntime     = deps.planningRuntime     ?? new PlanningRuntimeStage(idProvider, connectorRegistry);
    const kernel              = deps.kernel              ?? new KernelStage(idProvider);
    const runtimeOrchestrator = deps.runtimeOrchestrator ?? new RuntimeOrchestratorStage(idProvider);
    const capabilityRuntime   = deps.capabilityRuntime   ?? new CapabilityRuntimeStageImpl(idProvider);
    const connectorRuntime    = deps.connectorRuntime    ?? new ConnectorRuntimeStageImpl(idProvider);
    const connectorStage      = deps.connectorStage      ?? new ConnectorStageImpl(clock);
    const resultStage         = deps.resultStage         ?? new ResultStageImpl(idProvider);
    const memoryEngine        = deps.memoryEngine        ?? new MemoryStageImpl(idProvider);
    const explainability      = deps.explainability      ?? new ExplainabilityStageImpl(idProvider);
    const auditEngine         = deps.auditEngine         ?? new AuditStageImpl(idProvider, clock);

    // ── EF-22: Instrumentation layer ────────────────────────────────────────
    const instrumentation = new PipelineInstrumentation();

    // ── EF-26: Report assembler constructed here, injected into chain ────────
    const reportAssembler = new ExecutionReportAssembler();

    // ── Pipeline assembly ───────────────────────────────────────────────────
    const builder  = new PipelineBuilder();
    const pipeline = builder.build({
      intentRuntime, goalRuntime, planningRuntime, kernel,
      runtimeOrchestrator, capabilityRuntime, connectorRuntime,
      connectorStage, resultStage, memoryEngine, explainability, auditEngine,
    }, instrumentation);

    // ── EF-18: Auto self-registration ───────────────────────────────────────
    // Stage IDs that have corresponding runtimes to register (USER_INPUT is infra-only)
    const stageToId: Array<[unknown, string]> = [
      [intentRuntime,       "INTENT_RUNTIME"       ],
      [goalRuntime,         "GOAL_RUNTIME"          ],
      [planningRuntime,     "PLANNING_RUNTIME"      ],
      [kernel,              "KERNEL"                ],
      [runtimeOrchestrator, "RUNTIME_ORCHESTRATOR"  ],
      [capabilityRuntime,   "CAPABILITY_RUNTIME"    ],
      [connectorRuntime,    "CONNECTOR_RUNTIME"     ],
      [connectorStage,      "CONNECTOR"             ],
      [resultStage,         "RESULT"                ],
      [memoryEngine,        "MEMORY"                ],
      [explainability,      "EXPLAINABILITY"        ],
      [auditEngine,         "AUDIT"                 ],
    ];

    for (const [stage, id] of stageToId) {
      const desc =
        typeof (stage as { descriptor?: () => RuntimeDescriptor }).descriptor === "function"
          ? (stage as { descriptor: () => RuntimeDescriptor }).descriptor()
          : defaultDescriptor(id, clock);
      runtimeRegistry.register(desc);
    }

    return Object.freeze({ clock, idProvider, eventBus, metrics, connectorRegistry, runtimeRegistry, auditSink, pipeline, reportAssembler });
  }

  /** Build an ExecutionContext for a single execution. */
  static buildContext(
    rt: ComposedRuntime,
    executionId: string,
    sessionId: string,
    userId: string,
  ): Omit<ExecutionContext, "evidences"> {
    const permissions: ExecutionPermissions = { userId, scopes: ["memory:read", "memory:write"], roles: ["user"] };
    const config: ExecutionConfig = { maxTimeMs: 30000, maxRetries: 3, environment: "production" };

    return {
      executionId,
      sessionId,
      clock:              rt.clock,
      idProvider:         rt.idProvider,
      eventBus:           rt.eventBus,
      metrics:            rt.metrics,
      auditSink:          rt.auditSink,
      connectorRegistry:  rt.connectorRegistry,
      runtimeRegistry:    rt.runtimeRegistry,
      permissions,
      config,
    };
  }
}