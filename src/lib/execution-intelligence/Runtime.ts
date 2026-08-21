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
import {
  COMPOSITE_EXECUTION_POLICY,
  DEFAULT_EXECUTION_POLICY,
} from "@/lib/runtime-engine/ExecutionPolicy";
import type { ExecutionPolicy, ParallelismConfig } from "@/lib/runtime-engine/ExecutionPolicy";

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
    // threading (requestId), sub-budget via MAX_ITERATIONS do processo.
    // Sub-capabilities despachadas por um processo composite (identificaveis por
    // request.parentExecutionId) herdam o orçamento estendido (COMPOSITE_EXECUTION_POLICY)
    // para que sub-capabilities long-running (ex: openhands.runTask) nao morram no
    // step timeout default de 10s. O orçamento ja e naturalmente limitado pelo deadline
    // do parent (240s), entao nao ha risco de extrapolação. Non-composite e nao-sub
    // segue 100% identico ao anterior (paridade ADR-015).
    const isComposite: boolean = meta.capabilityComposite?.[capability] ?? false;
    const isSubCapability: boolean = !!request.parentExecutionId;

    // CC-01: capacidade de concorrência por capability (metadata opcional).
    // Ausência/inválido → null → policy padrão (parallelism.enabled=false,
    // comportamento irrestrito preservado). Nunca reduz para maxConcurrent=1.
    const concurrencyParallelism = this._deriveParallelism(meta, capability);
    // CT-01: step timeout override por capability (metadata opcional).
    // Permite que capabilities long-running (ex: openhands.runTask = 300s)
    // tenham stepTimeout maior que o padrão sem aumentar globalmente.
    const stepTimeoutOverride = this._deriveStepTimeout(meta, capability);
    const basePolicy: ExecutionPolicy | undefined =
      (isComposite || isSubCapability) ? COMPOSITE_EXECUTION_POLICY : undefined;
    const policyWithTimeout: ExecutionPolicy | undefined = stepTimeoutOverride
      ? Object.freeze({
          ...(basePolicy ?? DEFAULT_EXECUTION_POLICY),
          stepTimeoutMs: stepTimeoutOverride,
          timeoutMs: Math.max(basePolicy?.timeoutMs ?? DEFAULT_EXECUTION_POLICY.timeoutMs, stepTimeoutOverride),
        })
      : basePolicy;
    const policy: ExecutionPolicy | undefined = concurrencyParallelism
      ? Object.freeze({ ...(policyWithTimeout ?? DEFAULT_EXECUTION_POLICY), parallelism: concurrencyParallelism })
      : policyWithTimeout;

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
        // AP-04 + CC-01: policy derivada do metadata de concorrência por capability
        // (quando presente) sobre a base composite/default. Undefined → engine usa
        // policy padrão (parallelism.enabled=false, comportamento irrestrito).
        policy,
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

  /**
   * CT-01: deriva stepTimeoutMs override a partir de ConnectorMetadata.capabilityTimeout.
   * - ausente/inválido (0, negativo, NaN, não-inteiro) → null → sem override.
   * - positivo inteiro → retorna o valor (ms).
   * Nunca reduz o timeout abaixo do padrão — apenas aumenta.
   */
  private _deriveStepTimeout(meta: ConnectorMetadata, capability: string): number | null {
    const raw = meta.capabilityTimeout?.[capability];
    if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) return null;
    return raw;
  }

  /**
   * CC-01: deriva ParallelismConfig a partir de ConnectorMetadata.capabilityConcurrency.
   * - ausente/inválido (0, negativo, NaN, não-inteiro) → null → enabled=false preservado.
   * - positivo inteiro → { enabled:true, maxConcurrent:N }.
   * Nunca retorna maxConcurrent=1 como fallback: null é o único "sem metadata".
   */
  private _deriveParallelism(meta: ConnectorMetadata, capability: string): ParallelismConfig | null {
    const raw = meta.capabilityConcurrency?.[capability];
    if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) return null;
    return Object.freeze({ enabled: true, maxConcurrent: raw });
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