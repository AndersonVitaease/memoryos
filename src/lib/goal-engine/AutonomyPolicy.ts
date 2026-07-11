// ─── Autonomy Policy — Goal Runtime & Capability Runtime ─────────────────────
// Requisito Funcional Registrado: 2026-07-11
// Foundation v1.0 · Engineering First
//
// NOTA: Este módulo NÃO é uma RFC. É um requisito funcional a ser
// validado durante a implementação do Goal Runtime, Capability Runtime
// e Connector Runtime. A Foundation não é alterada.

// ─── Níveis de Autonomia ──────────────────────────────────────────────────────

/**
 * AutonomyLevel define o quanto o sistema pode executar sem confirmação humana.
 *
 * 0 — Manual:              toda ação exige confirmação explícita.
 * 1 — Autonomia Básica:    ações de baixo risco (arquivar, organizar, lembrar).
 * 2 — Autonomia Condicional: execução automática baseada em políticas (ex: boletos < limite).
 * 3 — Autonomia Avançada:  fluxos completos previamente autorizados, com log + audit + reversão.
 */
export type AutonomyLevel = 0 | 1 | 2 | 3;

// ─── Política de Autonomia ────────────────────────────────────────────────────

export interface AutonomyPolicy {
  /** Nível de autonomia configurado pelo usuário */
  level: AutonomyLevel;

  /** Limites específicos por domínio (ex: { financial: { maxAmount: 500 } }) */
  domainRules: Record<string, DomainRule>;

  /** Lista de ações que SEMPRE exigem confirmação, independente do nível */
  alwaysRequireConfirmation: string[];

  /** Lista de ações que NUNCA requerem confirmação (baixíssimo risco) */
  neverRequireConfirmation: string[];

  /** Versão da política — toda mudança gera nova versão */
  version: number;

  /** Timestamp da última alteração */
  updatedAt: number;
}

export interface DomainRule {
  /** Nível de autonomia específico para este domínio (sobrescreve o global) */
  level?: AutonomyLevel;

  /** Limite monetário para execução automática (domínio financeiro) */
  maxAmount?: number;

  /** Templates aprovados para execução automática (domínio comunicação) */
  approvedTemplates?: string[];

  /** Metadados adicionais do domínio */
  [key: string]: unknown;
}

// ─── Resultado da verificação de autonomia ────────────────────────────────────

export type AutonomyDecision = "execute" | "confirm" | "deny";

export interface AutonomyCheckResult {
  decision: AutonomyDecision;
  reason: string;
  requiresConfirmation: boolean;
  /** Ações que o usuário pode tomar (aprovar, rejeitar, configurar) */
  availableActions: string[];
}

// ─── Policy Engine — Contrato ─────────────────────────────────────────────────

/**
 * PolicyEngine é consultado pelo Capability Runtime ANTES de qualquer execução.
 *
 * Fluxo obrigatório:
 *   Goal → Planner → Capability Runtime → PolicyEngine → Autorizado? → Executa / Confirma
 */
export interface PolicyEngine {
  /**
   * Verifica se a ação pode ser executada com o nível de autonomia configurado.
   * @param actionId  Identificador da ação (ex: "financial.emit_boleto")
   * @param context   Contexto da ação (valor, destinatário, etc.)
   * @param policy    Política vigente do usuário
   */
  check(actionId: string, context: Record<string, unknown>, policy: AutonomyPolicy): AutonomyCheckResult;

  /**
   * Atualiza a política do usuário.
   * SEMPRE exige confirmação explícita antes de persistir.
   */
  updatePolicy(current: AutonomyPolicy, patch: Partial<AutonomyPolicy>): Promise<AutonomyPolicy>;
}

// ─── Regras invariantes ───────────────────────────────────────────────────────

/**
 * REGRAS QUE NUNCA PODEM SER REMOVIDAS:
 *
 * 1. O sistema nunca remove confirmações obrigatórias definidas por lei,
 *    políticas organizacionais ou requisitos de segurança.
 *
 * 2. Mudanças permanentes na política de autonomia SEMPRE solicitam
 *    confirmação explícita ao usuário.
 *
 * 3. Toda execução autônoma gera entrada no AuditTrail.
 *
 * 4. Execuções no Nível 3 mantêm log completo e reversão quando aplicável.
 *
 * Estas regras valem independente do nível de autonomia configurado.
 */
export const AUTONOMY_INVARIANTS: string[] = [
  "Confirmacoes obrigatorias por lei nunca podem ser removidas",
  "Mudancas na politica de autonomia exigem confirmacao explicita",
  "Toda execucao autonoma gera entrada no AuditTrail",
  "Nivel 3 mantem log completo e reversao quando aplicavel",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function makeDefaultPolicy(): AutonomyPolicy {
  return {
    level: 0,                         // padrão: Manual — máxima segurança
    domainRules: {},
    alwaysRequireConfirmation: [],
    neverRequireConfirmation: [],
    version: 1,
    updatedAt: Date.now(),
  };
}

export function describeLevel(level: AutonomyLevel): string {
  const descriptions: Record<number, string> = {
    0: "Manual - toda acao exige confirmacao",
    1: "Autonomia Basica - acoes de baixo risco executadas automaticamente",
    2: "Autonomia Condicional - execucao automatica baseada em politicas",
    3: "Autonomia Avancada - fluxos completos autorizados com audit e reversao",
  };
  return descriptions[level];
}