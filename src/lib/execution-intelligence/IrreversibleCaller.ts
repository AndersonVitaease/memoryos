/**
 * IrreversibleCaller.ts — EI-04 (primeiro caller irreversível migrado)
 *
 * Bridge reutilizável que executa uma capability pelo caminho ARQUITETURAL
 * irreversível (ExecutionRuntime.processCapability + SafetyGate +
 * RuntimeConfirmationEngine), em vez de um gate UI ad-hoc seguido de
 * chamada direta ao connector.
 *
 * FLUXO (loop confirmar-then-despachar):
 *   1. processCapability(request)  — confirmedByUser ausente.
 *   2. SafetyGate le reversibility="irreversible" do metadata → retorna
 *      needs_confirmation com o resumo da acao (NAO despacha).
 *   3. RuntimeConfirmationEngine.requestConfirmation(...) — surfacing via
 *      onPending(pendingRequest) para a UI mostrar o dialog.
 *   4. Usuario decide: confirm(id) | cancel(id) | expira.
 *   5. Confirmado → processCapability({ ...request, confirmedByUser: true })
 *      → SafetyGate approved → dispatch real pelo ConversationRuntimeEngine
 *      (mesmo engine do pipeline de producao — herda metricas/eventos/timeout).
 *   6. Cancelado/Expirado → outcome sintetizado (nao despacha).
 *
 * INVARIANTS ADR-015 preservados:
 *   - Bypass impossivel: o dispatch e interno ao processCapability. Nenhum
 *     metodo `dispatch` publico aqui.
 *   - SafetyGate decide; o Runtime despacha; este bridge so orquestra o
 *     loop de confirmacao. Nao duplica logica de gate.
 *
 * PRINCIPIOS: read-only sobre a decisao, sem LLM, sem nova entidade. O
 * caller vivo (GmailActionsCard.sendEmail) migra deste modulo em diante;
 * callers futuros (calendar.createEvent, drive.deleteFile) reusam o mesmo.
 */

import { getExecutionRuntime } from "./index";
import type { ExecutionRequest, ExecutionOutcome } from "./ExecutionTypes";
import type { ConnectorExecutionContext } from "@/lib/runtime-engine/RuntimeTypes";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";
import { base44 } from "@/api/base44Client";
import {
  requestConfirmation,
  listPending,
} from "@/lib/runtime/RuntimeConfirmationEngine";

// ── Tipos (RuntimeConfirmationEngine e JS puro — contratos minimos locais) ────

export interface ConfirmationResult {
  readonly confirmed: boolean;
  readonly cancelled: boolean;
  readonly expired: boolean;
}

export interface ConfirmationRequest {
  readonly id: string;
  readonly capability: string;
  readonly title: string;
  readonly description: string;
  readonly payload: unknown;
  readonly userId: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface IrreversibleCallerContext {
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly origin?: string;
}

export interface IrreversibleCallerOptions {
  /**
   * Chamado quando o SafetyGate retorna needs_confirmation, com a solicitacao
   * pendente. O adapter de UI deve surfacear o dialog e eventualmente chamar
   * confirm(id)/cancel(id) no RuntimeConfirmationEngine para resolve-la.
   */
  readonly onPending?: (request: ConfirmationRequest) => void;
  /** Override do timeout de confirmacao (ms). Default 120s. */
  readonly timeoutMs?: number;
}

export interface IrreversibleResult {
  /** Outcome final do ExecutionRuntime (success | failed) ou sintetizado (cancelado/expirado). */
  readonly outcome: ExecutionOutcome;
  /** Resultado da confirmacao. Null se a capability nao exigiu confirmacao (safe/reversible). */
  readonly confirmation: ConfirmationResult | null;
}

// ── IrreversibleCaller ────────────────────────────────────────────────────────

export const IrreversibleCaller = {
  /**
   * Executa uma capability pelo caminho irreversivel.
   *
   * @param request  { connectorId, capability, params, context? }
   * @param options  { onPending?, timeoutMs? }
   */
  async execute(
    request: {
      readonly connectorId: string;
      readonly capability: string;
      readonly params: Record<string, unknown>;
      readonly context?: IrreversibleCallerContext;
    },
    options: IrreversibleCallerOptions = {},
  ): Promise<IrreversibleResult> {
    const ctx = await this._resolveContext(request.context);
    const executionId = `irrev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseRequest: ExecutionRequest = {
      connectorId: request.connectorId,
      capability: request.capability,
      params: request.params,
      context: ctx,
      executionId,
    };

    const runtime = await getExecutionRuntime();

    // 1+2. Primeira passagem: sem confirmedByUser. Para irreversible, o
    // SafetyGate retorna needs_confirmation (NAO despacha). Para safe/
    // reversible, despacha direto e retorna success/failed.
    const firstOutcome = await runtime.processCapability(baseRequest);

    if (firstOutcome.status !== "needs_confirmation") {
      // safe/reversible ja despachou, ou falhou/blocked antes do gate.
      return { outcome: firstOutcome, confirmation: null };
    }

    // 3. Irreversible: surfacear confirmacao via RuntimeConfirmationEngine.
    const enginePromise = requestConfirmation({
      capability: `${request.connectorId}.${request.capability}`,
      title: `Confirmar ${request.capability}`,
      description: firstOutcome.message ?? `Ação irreversível em ${request.connectorId}.${request.capability}`,
      payload: request.params,
      timeoutMs: options.timeoutMs,
      userId: ctx.userId,
    });

    // requestConfirmation adiciona ao pending sincronamente; captura a ultima.
    const pending = listPending();
    const pendingReq = (pending[pending.length - 1] ?? null) as ConfirmationRequest | null;
    if (pendingReq) options.onPending?.(pendingReq);

    // 4. Aguarda decisao do usuario (confirm/cancel/expira).
    const confirmation = (await enginePromise) as ConfirmationResult;

    // 6a. Cancelado/Expirado → outcome sintetizado com status dedicado (nao
    // despacha). Antes sintetizava "failed" — semanticamente errado: um
    // cancelamento do usuario ou timeout de confirmacao nao e falha do
    // connector, e nao deve poluir metricas de failure rate do OIE.
    if (!confirmation.confirmed) {
      return {
        outcome: Object.freeze({
          status: confirmation.cancelled ? "cancelled" : "expired",
          connectorId: request.connectorId,
          capability: request.capability,
          output: null,
          message: confirmation.cancelled
            ? "Ação cancelada pelo usuário."
            : "Confirmação expirou — ação não executada.",
          reversibility: firstOutcome.reversibility,
          executionId: null,
          durationMs: null,
        }),
        confirmation,
      };
    }

    // 5. Confirmado → re-despacha com confirmedByUser=true (SafetyGate approved).
    const confirmedRequest: ExecutionRequest = { ...baseRequest, confirmedByUser: true };
    const finalOutcome = await runtime.processCapability(confirmedRequest);
    return { outcome: finalOutcome, confirmation };
  },

  /**
   * Resolve o ConnectorExecutionContext. Defaults honestos:
   *   - workspaceId: getActiveWorkspaceId() (unica fonte de verdade).
   *   - userId: base44.auth.me() (usuario autenticado da sessao).
   *   - sessionId: derivado do caller se omitido (nao sintetico aleatorio).
   */
  async _resolveContext(ctx?: IrreversibleCallerContext): Promise<ConnectorExecutionContext> {
    const workspaceId = ctx?.workspaceId ?? getActiveWorkspaceId();
    let userId = ctx?.userId ?? "";
    if (!userId) {
      try {
        const me = await base44.auth.me();
        userId = me?.id ?? "";
      } catch {
        userId = "";
      }
    }
    const sessionId = ctx?.sessionId ?? `irreversible-caller:${userId || "anon"}`;
    return {
      userId,
      workspaceId,
      sessionId,
      origin: ctx?.origin ?? "irreversible-caller",
    };
  },
};