/**
 * MRI — MemoryOS Reference Implementation
 * Security Gate (MCS + MRS Capítulo 12 + MDIS Capítulo 10)
 *
 * Sequência obrigatória: Permission → Risk → Approval
 * Nunca ignorado. Nunca bypassado.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityContext {
  userId:          string;
  sessionId:       string;
  action:          string;
  resource?:       string;
  estimatedImpact: RiskLevel;
  isReversible:    boolean;
}

export interface GateResult {
  authorized:       boolean;
  requiresApproval: boolean;
  riskLevel:        RiskLevel;
  reason?:          string;
  blockedBy?:       "permission" | "risk" | "policy";
}

/** Permissões por ação (simplificado para MRI) */
const ALLOWED_ACTIONS = new Set([
  "memory.store", "memory.retrieve",
  "connector.execute", "connector.rollback",
  "specialist.process",
  "journey.create", "journey.update",
  "audit.record",
]);

/** Aprovação obrigatória por nível de risco */
const REQUIRES_APPROVAL: RiskLevel[] = ["HIGH", "CRITICAL"];

export class SecurityGate {
  /**
   * Executa o pipeline de segurança completo.
   * Toda execução passa aqui antes de qualquer Step.
   */
  evaluate(ctx: SecurityContext): GateResult {
    // 1. Permission Engine
    if (!ALLOWED_ACTIONS.has(ctx.action)) {
      return {
        authorized:       false,
        requiresApproval: false,
        riskLevel:        ctx.estimatedImpact,
        reason:           `Action '${ctx.action}' not permitted`,
        blockedBy:        "permission",
      };
    }

    // 2. Risk Engine
    const requiresApproval = REQUIRES_APPROVAL.includes(ctx.estimatedImpact);

    // 3. Policy Engine (CRITICAL irreversível = bloqueio absoluto)
    if (ctx.estimatedImpact === "CRITICAL" && !ctx.isReversible) {
      return {
        authorized:       false,
        requiresApproval: true,
        riskLevel:        "CRITICAL",
        reason:           "Critical irreversible action requires explicit human approval",
        blockedBy:        "policy",
      };
    }

    return {
      authorized:       true,
      requiresApproval,
      riskLevel:        ctx.estimatedImpact,
    };
  }
}