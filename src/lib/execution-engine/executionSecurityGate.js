/**
 * Execution Security Gate (Sprint 17)
 *
 * Valida todas as autorizações antes que qualquer Step seja executado.
 *
 * Fluxo obrigatório:
 *   Permission Engine → Approval Engine → Risk Engine → Security Intelligence → Execution Engine
 *
 * O Execution Engine NUNCA ignora estas validações.
 *
 * Este módulo é determinístico e sem efeitos externos.
 * Define as interfaces para integração futura com os engines de segurança.
 */

import { deepFreeze, EXECUTION_ERROR_TYPE } from "./executionContracts.js";

// ─── Authorization Result ─────────────────────────────────────────────────────

export function buildAuthorizationResult({
  stepId,
  capability,
  authorized,
  reason         = null,
  requiresApproval = false,
  approvalId     = null,
  riskLevel      = "low",
  securityFlags  = [],
}) {
  if (!stepId)     throw new Error("AuthorizationResult: stepId required");
  if (!capability) throw new Error("AuthorizationResult: capability required");

  return deepFreeze({
    stepId:          String(stepId),
    capability:      String(capability),
    authorized:      Boolean(authorized),
    reason:          reason ?? null,
    requiresApproval: Boolean(requiresApproval),
    approvalId:      approvalId   ?? null,
    riskLevel:       String(riskLevel || "low"),
    securityFlags:   Array.isArray(securityFlags) ? [...securityFlags] : [],
    checkedAt:       new Date().toISOString(),
  });
}

// ─── Permission Engine Interface ──────────────────────────────────────────────

/**
 * Interface para o Permission Engine.
 * Na Sprint 17 é determinístico (mock seguro).
 * Preparado para integração futura com o Permission Engine real.
 */
export function createPermissionEngine(config = {}) {
  const { deniedCapabilities = [], deniedUsers = [] } = config;

  return {
    /**
     * Verifica se o usuário tem permissão para executar a capability.
     * @returns {AuthorizationResult}
     */
    check({ stepId, capability, userId, orgId }) {
      if (!stepId || !capability || !userId) {
        return buildAuthorizationResult({
          stepId: stepId ?? "unknown", capability: capability ?? "unknown",
          authorized: false, reason: "Missing required fields for permission check",
        });
      }

      if (deniedUsers.includes(userId)) {
        return buildAuthorizationResult({
          stepId, capability, authorized: false,
          reason: `User "${userId}" is not permitted to execute any capability`,
        });
      }

      if (deniedCapabilities.includes(capability)) {
        return buildAuthorizationResult({
          stepId, capability, authorized: false,
          reason: `Capability "${capability}" is not permitted`,
        });
      }

      return buildAuthorizationResult({ stepId, capability, authorized: true });
    },

    getType() { return "PermissionEngine"; },
  };
}

// ─── Approval Engine Interface ────────────────────────────────────────────────

/**
 * Interface para o Approval Engine.
 * Capabilities com requiresApproval=true aguardam aprovação humana.
 */
export function createApprovalEngine(config = {}) {
  const { autoApprove = true, requireApprovalFor = [] } = config;

  return {
    check({ stepId, capability, userId }) {
      if (!stepId || !capability) {
        return buildAuthorizationResult({
          stepId: stepId ?? "unknown", capability: capability ?? "unknown",
          authorized: false, reason: "Missing fields for approval check",
        });
      }

      const needsApproval = requireApprovalFor.includes(capability);

      if (needsApproval && !autoApprove) {
        return buildAuthorizationResult({
          stepId, capability, authorized: false,
          requiresApproval: true,
          reason: `Capability "${capability}" requires human approval`,
        });
      }

      return buildAuthorizationResult({
        stepId, capability, authorized: true,
        requiresApproval: needsApproval,
        approvalId: needsApproval ? `apv-auto-${stepId}` : null,
      });
    },

    getType() { return "ApprovalEngine"; },
  };
}

// ─── Risk Engine Interface ────────────────────────────────────────────────────

export const RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"]);

/**
 * Interface para o Risk Engine.
 * Avalia o risco de executar uma capability e bloqueia execuções críticas.
 */
export function createRiskEngine(config = {}) {
  const { maxAllowedRisk = "high", highRiskCapabilities = [] } = config;

  const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  const maxRiskIdx = riskOrder[maxAllowedRisk] ?? 2;

  return {
    check({ stepId, capability, userId, context }) {
      if (!stepId || !capability) {
        return buildAuthorizationResult({
          stepId: stepId ?? "unknown", capability: capability ?? "unknown",
          authorized: false, reason: "Missing fields for risk check",
        });
      }

      const isHighRisk    = highRiskCapabilities.includes(capability);
      const level         = isHighRisk ? "high" : "low";
      const levelIdx      = riskOrder[level] ?? 0;
      const blocked       = levelIdx > maxRiskIdx;

      return buildAuthorizationResult({
        stepId, capability,
        authorized:  !blocked,
        riskLevel:   level,
        reason:      blocked ? `Risk level "${level}" exceeds maximum allowed "${maxAllowedRisk}"` : null,
        securityFlags: isHighRisk ? ["HIGH_RISK_CAPABILITY"] : [],
      });
    },

    getType() { return "RiskEngine"; },
  };
}

// ─── Security Intelligence Interface ─────────────────────────────────────────

/**
 * Interface para o Security Intelligence Engine.
 * Detecta padrões anômalos antes da execução.
 */
export function createSecurityIntelligence(config = {}) {
  const { blockedPatterns = [] } = config;

  return {
    check({ stepId, capability, userId, context }) {
      if (!stepId || !capability) {
        return buildAuthorizationResult({
          stepId: stepId ?? "unknown", capability: capability ?? "unknown",
          authorized: false, reason: "Missing fields for security check",
        });
      }

      const flagged = blockedPatterns.some((p) =>
        capability.includes(p) || (context && JSON.stringify(context).includes(p))
      );

      return buildAuthorizationResult({
        stepId, capability,
        authorized:   !flagged,
        securityFlags: flagged ? ["SECURITY_PATTERN_MATCHED"] : [],
        reason:        flagged ? "Security Intelligence blocked this capability" : null,
      });
    },

    getType() { return "SecurityIntelligence"; },
  };
}

// ─── Security Gate (Orchestrator) ────────────────────────────────────────────

/**
 * Orquestra todos os engines de segurança.
 * Executa em sequência: Permission → Approval → Risk → Security Intelligence.
 * A execução é bloqueada se qualquer verificação falhar.
 */
export function createSecurityGate({
  permissionEngine    = null,
  approvalEngine      = null,
  riskEngine          = null,
  securityIntelligence = null,
} = {}) {
  // Defaults seguros (permite tudo) se engines não forem injetados
  const pe  = permissionEngine     ?? createPermissionEngine();
  const ae  = approvalEngine       ?? createApprovalEngine();
  const re  = riskEngine           ?? createRiskEngine();
  const si  = securityIntelligence ?? createSecurityIntelligence();

  return {
    /**
     * Executa todas as verificações de segurança em sequência.
     * Retorna o resultado combinado.
     */
    authorize({ stepId, capability, userId, orgId, context }) {
      const ctx = { stepId, capability, userId, orgId, context };

      // 1. Permission
      const permResult = pe.check(ctx);
      if (!permResult.authorized) {
        return deepFreeze({
          authorized:  false,
          blockedBy:   "PermissionEngine",
          reason:      permResult.reason,
          errorType:   EXECUTION_ERROR_TYPE.PERMISSION_ERROR,
          details:     permResult,
          checkedAt:   new Date().toISOString(),
        });
      }

      // 2. Approval
      const appResult = ae.check(ctx);
      if (!appResult.authorized) {
        return deepFreeze({
          authorized:  false,
          blockedBy:   "ApprovalEngine",
          reason:      appResult.reason,
          errorType:   EXECUTION_ERROR_TYPE.PERMISSION_ERROR,
          details:     appResult,
          checkedAt:   new Date().toISOString(),
        });
      }

      // 3. Risk
      const riskResult = re.check(ctx);
      if (!riskResult.authorized) {
        return deepFreeze({
          authorized:  false,
          blockedBy:   "RiskEngine",
          reason:      riskResult.reason,
          errorType:   EXECUTION_ERROR_TYPE.PERMISSION_ERROR,
          details:     riskResult,
          checkedAt:   new Date().toISOString(),
        });
      }

      // 4. Security Intelligence
      const siResult = si.check(ctx);
      if (!siResult.authorized) {
        return deepFreeze({
          authorized:  false,
          blockedBy:   "SecurityIntelligence",
          reason:      siResult.reason,
          errorType:   EXECUTION_ERROR_TYPE.PERMISSION_ERROR,
          details:     siResult,
          checkedAt:   new Date().toISOString(),
        });
      }

      return deepFreeze({
        authorized:    true,
        blockedBy:     null,
        reason:        null,
        errorType:     null,
        riskLevel:     riskResult.riskLevel,
        requiresApproval: appResult.requiresApproval,
        approvalId:    appResult.approvalId,
        securityFlags: [
          ...permResult.securityFlags,
          ...appResult.securityFlags,
          ...riskResult.securityFlags,
          ...siResult.securityFlags,
        ],
        checkedAt:     new Date().toISOString(),
      });
    },

    getType() { return "SecurityGate"; },
  };
}