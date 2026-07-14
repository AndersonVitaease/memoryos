/**
 * GovernanceMiddleware.ts
 * Sprint 6.2.3 — Engineering Workflow Integration
 *
 * Camada única de acesso à governança dentro do Engineering Workflow.
 * NENHUM outro componente do workflow chamará EngineeringGovernance diretamente.
 * SRP: traduzir EngineeringRequest em GovernanceRequest e retornar GovernanceDecision.
 * Sem lógica de negócio — apenas adaptação e delegação.
 */

import { EngineeringGovernance } from '../engineering-governance/EngineeringGovernance';
import type { GovernanceDecision, GovernanceRequest } from '../engineering-governance/EngineeringGovernance';
import type { EngineeringRequest } from './WorkflowTypes';

export interface MiddlewareResult {
  decision: GovernanceDecision;
  durationMs: number;
  evaluatedAt: string;
}

export class GovernanceMiddleware {
  /**
   * Evaluates a governance decision for an engineering request.
   * This is the ONLY place in the workflow layer that calls EngineeringGovernance.
   */
  static evaluate(request: EngineeringRequest): MiddlewareResult {
    const t0 = Date.now();

    const govRequest: GovernanceRequest = {
      principalId:   request.principalId,
      principalRole: request.principalRole,
      targetPath:    request.targetPath,
      operation:     request.operation,
    };

    const decision = EngineeringGovernance.evaluate(govRequest);

    return {
      decision,
      durationMs:  Date.now() - t0,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Executes a task through the full governance pipeline (evaluate + snapshot + sandbox).
   * Internally delegates to EngineeringGovernance.execute() which handles P1 (auto-snapshot).
   */
  static async execute(
    request: EngineeringRequest,
    task: () => Promise<unknown> | unknown
  ): Promise<{ decision: GovernanceDecision; sandboxId?: string; snapshotId?: string; durationMs: number }> {
    const t0 = Date.now();

    const govRequest: GovernanceRequest = {
      principalId:   request.principalId,
      principalRole: request.principalRole,
      targetPath:    request.targetPath,
      operation:     request.operation,
    };

    const result = await EngineeringGovernance.execute(govRequest, task);

    return {
      decision:   result.decision,
      sandboxId:  result.sandboxId,
      snapshotId: result.snapshotId,
      durationMs: Date.now() - t0,
    };
  }

  /** Returns governance health via the facade only. */
  static health(): Record<string, unknown> {
    return EngineeringGovernance.health();
  }
}