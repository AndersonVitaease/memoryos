/**
 * CapabilitySelectionTypes.ts — Sprint C-03.6
 * Contratos oficiais do Capability Selection Engine.
 *
 * SRP: apenas tipos — sem logica.
 */

// ── Goal (contrato minimo para selecao) ──────────────────────────────────────

export interface Goal {
  readonly id:          string;
  readonly type:        string;   // ex: "retrieve_resource", "search_email", "create_event"
  readonly category:    string;   // ex: "knowledge", "communication", "productivity"
  readonly action:      string;   // ex: "get", "search", "create", "update", "delete", "list"
  readonly priority:    "low" | "medium" | "high" | "critical";
  readonly description: string;
}

// ── CapabilityDescriptor — contrato expandido (Sprint C-03.6) ─────────────────

export interface CapabilityDescriptor {
  readonly id:                string;
  readonly name:              string;
  readonly description:       string;
  /** Goal types compatíveis: ex ["retrieve_resource", "search_email"] */
  readonly goalTypes:         readonly string[];
  /** Categorias de Goal suportadas: ex ["knowledge", "communication"] */
  readonly supportedCategories: readonly string[];
  /** Ações suportadas: ex ["get", "search", "list"] */
  readonly supportedActions:  readonly string[];
  /** Prioridade base: menor = maior prioridade (1 = máxima) */
  readonly priority:          number;
  /** Peso de confiança [0, 1] — multiplica o score final */
  readonly confidenceWeight:  number;
  /** Runtimes necessários: ex ["google-drive", "gmail"] */
  readonly requiredRuntimes:  readonly string[];
  /** Estado do capability */
  readonly status:            "ready" | "degraded" | "unavailable";
}

// ── Request / Result ──────────────────────────────────────────────────────────

export interface CapabilitySelectionRequest {
  readonly goal:                  Goal;
  readonly availableCapabilities: readonly CapabilityDescriptor[];
  /** Runtimes disponíveis no momento da seleção */
  readonly availableRuntimes?:    readonly string[];
}

export interface CapabilitySelectionResult {
  readonly success:         true;
  readonly capabilityId:    string;
  readonly capabilityName:  string;
  readonly confidence:      number;
  readonly explanation:     string;
  readonly ranking:         readonly RankedCandidate[];
  readonly durationMs:      number;
}

export interface CapabilityNotFoundResult {
  readonly success:      false;
  readonly capabilityId: null;
  readonly confidence:   0;
  readonly explanation:  string;
  readonly durationMs:   number;
  readonly reason:       "NO_COMPATIBLE_CAPABILITY" | "NO_CAPABILITIES_PROVIDED" | "GOAL_INVALID";
}

export type SelectionResult = CapabilitySelectionResult | CapabilityNotFoundResult;

// ── Ranking ───────────────────────────────────────────────────────────────────

export interface RankedCandidate {
  readonly capabilityId:   string;
  readonly capabilityName: string;
  readonly score:          number;
  readonly priorityScore:  number;
  readonly actionScore:    number;
  readonly categoryScore:  number;
  readonly runtimeScore:   number;
  readonly selected:       boolean;
  readonly discardReason:  string | null;
}

// ── Health ────────────────────────────────────────────────────────────────────

export type EngineHealthStatus = "READY" | "DEGRADED" | "FAILED";

export interface EngineHealth {
  readonly status:          EngineHealthStatus;
  readonly totalSelections: number;
  readonly successRate:     string;
  readonly avgDurationMs:   number;
}