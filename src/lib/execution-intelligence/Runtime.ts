/**
 * Runtime.ts — EI-05 (RFC-008 / ADR-015)
 *
 * Facade publica unica. Refatorada em EI-04 para delegar o dispatch ao
 * ConversationRuntimeEngine EXISTENTE (preserva metricas, eventos, timeout
 * e o mapeamento de status do UCRBridge). Antes (EI-02/EI-03) chamava
 * connector.execute() direto — bypassava toda a instrumentacao de producao.
 *
 * Cadeia (EI-05):
 *   processCapability(request)
 *     → resolve connector no ConnectorRegistry (real)
 *     → le reversibility do metadata (EI-01)
 *     → ExecutionIntelligence.prepare(request) → PreparedExecution (EI-05)
 *     → SafetyGate.guard(prepared, reversibility)
 *     → se approved: build 1-step ExecutionPlan (enrichedParams) → engine.execute() →
 *         map ExecutionResult → ExecutionOutcome
 *     → se needs_confirmation/blocked: retorna SEM despachar
 *
 * O "Dispatcher" da cadeia (ADR-015) e o ConversationRuntimeEngine existente
 * (que internamente usa ExecutionDispatcher → ConnectorCapabilityExecutor →
 * UCRBridge → connector). Ao delegar a ele, processCapability herda TODA a
 * observabilidade de producao — nao reimplementation.
 *
 * Nenhum caller vivo usa processCapability ainda (migracao de callers e
 * EI-04 sub-step futuro, apos EI-06/EI-07 darem ao gate contexto real para
 * decidir irreversiveis sem quebrar automation). O caminho antigo
 * (getRealRuntimeEngine direto, usado pelo ConversationPipeline) segue 100%
 * intocado.
 *
 * Invariants ADR-015:
 *   1. Bypass impossivel — o dispatch (engine.execute) e interno a
 *      processCapability. Nenhum metodo `dispatch` publico e exportado.
 *   2. Nenhum exempt caller — so existe processCapability como entrada.
 *   3. processCapability e puro wiring — resolve + guard + build plan +
 *      engine.execute + map. Zero logica de negocio.
 */

import type { ConnectorRegistry } from "@/lib/connector-runtime/ConnectorRegistry";
import type { ConnectorMetadata, Reversibility } from "@/lib/connector-runtime/ConnectorTypes";
import type { ConversationRuntimeEngine } from "@/lib/runtime-engine/ConversationRuntimeEngine";
import type {
  ConnectorExecutionContext,
  ExecutionWithReport,
} from "@/lib/runtime-engine/RuntimeTypes";
import type { ExecutionPlan, ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import { makePlanId, makeStepId } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { ExecutionRequest, ExecutionOutcome, PreparedExecution, SafetyDecision } from "./ExecutionTypes";
import { ExecutionIntelligence } from "./ExecutionIntelligence";
import { SafetyGate } from "./SafetyGate";

export class ExecutionRuntime {
  private readonly _intelligence: ExecutionIntelligence;
  private readonly _safety: SafetyGate;

  constructor(
    private readonly _registry: ConnectorRegistry,
    private readonly _engine: ConversationRuntimeEngine,
  ) {
    // Intelligence + SafetyGate stateless — instanciados internamente, sem DI.
    this._intelligence = new ExecutionIntelligence();
    this._safety = new SafetyGate();
  }

  /**
   * Unica entrada publica para execucao de capability.
   *
   * Hoje (EI-07): resolve connector → le reversibility → Intelligence.prepare →
   * (se approved) build 1-step plan (enrichedParams) → delega ao engine real (preserva
   * metricas/eventos/timeout) → map ExecutionResult → ExecutionOutcome.
   * Se o SafetyGate pedir confirmacao ou bloquear, retorna sem despachar.
   */
  async processCapability(request: ExecutionRequest): Promise<ExecutionOutcome> {
    const { connectorId, capability, context } = request;

    const connector = this._registry.get(connectorId);
    if (!connector) {
      return this._buildOutcome(request, "failed", null, `Unknown connector: "${connectorId}"`, "safe", null, null);
    }

    // Reversibility do metadata (EI-01). Default "safe" quando nao declarado.
    const meta: ConnectorMetadata = connector.metadata();
    const reversibility: Reversibility = meta.capabilityReversibility?.[capability] ?? "safe";
    // AP-04 (RFC-010/ADR-017): le o flag composite (AP-01). Default nao-composite.
    // Composite = Adaptive Process: o connector detem um loop reflexivo que invoca
    // sub-capabilities via processCapability (reentrada pela cadeia completa).
    // Politica composta: auth propagada (ja via connectorCtx), parentExecutionId
    // threading (requestId), sub-budget via MAX_ITERATIONS do processo, timeout
    // estendido e breaker isolado sao concerns do processo/engine (futuro).
    // Non-composite segue 100% identico ao anterior (paridade ADR-015).
    const isComposite: boolean = meta.capabilityComposite?.[capability] ?? false;

    // EI-07: Execution Intelligence itera investigators ativos (Convergence/API/LLM
    // Budget + grafo aciclivo) e enriquece enrichedParams antes do Safety Gate.
    const prepared: PreparedExecution = await this._intelligence.prepare(request);

    // EI-03: Safety Gate consome o PreparedExecution (EI-05).
    const decision: SafetyDecision = this._safety.guard(prepared, reversibility);
    if (decision.type !== "approved") {
      const message = decision.type === "needs_confirmation" ? decision.summary : decision.reason;
      return this._buildOutcome(request, decision.type, null, message, reversibility, null, null);
    }

    // Approved → build 1-step ExecutionPlan com os enrichedParams e delegar.
    const step: ExecutionStep = Object.freeze({
      id: makeStepId(1),
      connector: connectorId,
      capability,
      parameters: prepared.enrichedParams,
    });
    const plan: ExecutionPlan = Object.freeze({
      id: makePlanId(),
      goalId: `ei-${request.executionId ?? Date.now()}`,
      goalType: "execution_intelligence",
      status: "planned",
      steps: Object.freeze([step]),
      createdAt: Date.now(),
      durationMs: 0,
      mode: "live",
    });

    // ConnectorExecutionContext: identidade real propagada ao connector.
    // context ja e ConnectorExecutionContext (userId/workspaceId/sessionId obrigatorios).
    const connectorCtx: ConnectorExecutionContext = {
      userId: context.userId,
      workspaceId: context.workspaceId,
      sessionId: context.sessionId,
      goalId: context.goalId,
      // AP-04: composite marcado no origin para observabilidade/tracing.
      origin: isComposite ? "execution-intelligence:composite" : (context.origin ?? "execution-intelligence"),
      // AP-04: parentExecutionId threading — sub-caps correlate as children via
      // requestId (end-to-end trace). Undefined para non-composite (paridade ADR-015).
      requestId: request.parentExecutionId ?? context.requestId,
    };

    try {
      const { executionResult }: ExecutionWithReport = await this._engine.execute(
        plan,
        request.executionId,
        connectorCtx,
      );
      const completed = executionResult.status === "completed";
      const stepResult = executionResult.steps[0] ?? null;
      const output = completed && stepResult ? stepResult.output : null;
      const message = completed
        ? null
        : (executionResult.errors[0] ?? stepResult?.error ?? `Execution ${executionResult.status}`);
      return this._buildOutcome(
        request,
        completed ? "success" : "failed",
        output,
        message,
        reversibility,
        executionResult.executionId,
        executionResult.durationMs,
      );
    } catch (e) {
      return this._buildOutcome(request, "failed", null, (e as Error).message, reversibility, null, null);
    }
  }

  private _buildOutcome(
    request: ExecutionRequest,
    status: ExecutionOutcome["status"],
    output: unknown,
    message: string | null,
    reversibility: Reversibility,
    executionId: string | null,
    durationMs: number | null,
  ): ExecutionOutcome {
    return Object.freeze({
      status,
      connectorId: request.connectorId,
      capability: request.capability,
      output,
      message,
      reversibility,
      executionId,
      durationMs,
    });
  }
}