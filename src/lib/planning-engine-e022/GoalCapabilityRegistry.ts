/**
 * GoalCapabilityRegistry.ts — Engineering Sprint E-02.2A
 * Goal → Capability mapping registry.
 *
 * Replaces GoalPlanTemplates entirely.
 *
 * SRP: registrar e consultar CapabilityMappings (GoalType → ExecutionStep[]).
 *
 * Open/Closed: novos Connectors registram suas proprias capabilities
 *              via GoalCapabilityRegistry.register() — o Planner nao muda.
 *
 * Dependency Inversion: o Planner depende deste Registry (abstrato),
 *                       nao de implementacoes concretas de Connectors.
 *
 * Planning Engine NAO conhece:
 *   - Runtime
 *   - OAuth / sessao
 *   - Retry / timeout
 *   - Summarize / noop
 *   - Nenhum Connector concreto
 *
 * Cada entrada mapeia um GoalType para uma lista de CapabilityDescriptors.
 * O Runtime e responsavel por envolver cada step com autenticacao,
 * retry, timeout, summarize, auditoria etc.
 */

import type { GoalType }    from "@/lib/goals/GoalTypes";
import type { ConnectorId } from "./ExecutionPlanTypes";

// ── CapabilityDescriptor ───────────────────────────────────────────────────────

export interface CapabilityDescriptor {
  /** Target connector namespace (e.g. "gmail", "calendar", "drive", "memory") */
  readonly connector:  ConnectorId;
  /** Capability name within the connector (e.g. "readInbox", "listToday") */
  readonly capability: string;
  /** Static default parameters — merged with goal parameters at plan time */
  readonly params:     Record<string, unknown>;
}

// ── CapabilityMapping ──────────────────────────────────────────────────────────

export interface CapabilityMapping {
  readonly goalType:    GoalType;
  readonly descriptors: readonly CapabilityDescriptor[];
}

// ── GoalCapabilityRegistry ────────────────────────────────────────────────────

class GoalCapabilityRegistryClass {
  private readonly _mappings = new Map<GoalType, CapabilityMapping>();

  /**
   * Registers a GoalType → CapabilityDescriptor[] mapping.
   * Idempotent: subsequent calls for the same goalType are ignored.
   * Connectors call this during their initialization phase.
   */
  register(mapping: CapabilityMapping): void {
    if (this._mappings.has(mapping.goalType)) return; // idempotent
    this._mappings.set(mapping.goalType, mapping);
  }

  /**
   * Returns the capability descriptors for a given GoalType, or null.
   */
  resolve(goalType: GoalType): readonly CapabilityDescriptor[] | null {
    return this._mappings.get(goalType)?.descriptors ?? null;
  }

  /** Total number of registered mappings. */
  get size(): number { return this._mappings.size; }

  /** All registered mappings (immutable copy). */
  listAll(): readonly CapabilityMapping[] {
    return [...this._mappings.values()];
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__GOAL_CAP_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new GoalCapabilityRegistryClass();
}

export const GoalCapabilityRegistry: GoalCapabilityRegistryClass = (
  globalThis as unknown as Record<string, GoalCapabilityRegistryClass>
)[_KEY];

// ── Built-in capability mappings (registered at module load) ──────────────────
// Each entry maps a GoalType to pure connector capability descriptors.
// NO validate_session, NO summarize, NO noop — those belong to the Runtime.

const _builtins: CapabilityMapping[] = [

  // ── Gmail ──────────────────────────────────────────────────────────────────
  {
    goalType: "gmail.readInbox",
    descriptors: [
      { connector: "gmail", capability: "readInbox",      params: {} },
    ],
  },
  {
    goalType: "gmail.searchMessages",
    descriptors: [
      { connector: "gmail", capability: "searchEmails", params: {} },
    ],
  },
  {
    goalType: "gmail.readMessage",
    descriptors: [
      { connector: "gmail", capability: "readMessage",    params: {} },
    ],
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  {
    goalType: "calendar.listToday",
    descriptors: [
      { connector: "calendar", capability: "listToday",    params: {} },
    ],
  },
  {
    goalType: "calendar.listTomorrow",
    descriptors: [
      { connector: "calendar", capability: "listTomorrow", params: {} },
    ],
  },
  {
    goalType: "calendar.listWeek",
    descriptors: [
      { connector: "calendar", capability: "listWeek",     params: {} },
    ],
  },
  {
    goalType: "calendar.createEvent",
    descriptors: [
      { connector: "calendar", capability: "createEvent",  params: {} },
    ],
  },

  // ── Drive ──────────────────────────────────────────────────────────────────
  {
    goalType: "drive.searchFiles",
    descriptors: [
      { connector: "drive", capability: "searchFiles",   params: {} },
    ],
  },
  {
    goalType: "drive.listRecent",
    descriptors: [
      { connector: "drive", capability: "listRecent",    params: {} },
    ],
  },
  {
    goalType: "drive.openDocument",
    descriptors: [
      { connector: "drive", capability: "openDocument",  params: {} },
    ],
  },

  // ── Memory ─────────────────────────────────────────────────────────────────
  {
    goalType: "memory.query",
    descriptors: [
      { connector: "memory", capability: "query",     params: {} },
    ],
  },
  {
    goalType: "memory.summarize",
    descriptors: [
      { connector: "memory", capability: "summarize", params: {} },
    ],
  },

  // ── General / Unknown — no capability steps; Runtime handles gracefully ───
  {
    goalType: "general.conversation",
    descriptors: [],
  },
  {
    goalType: "unknown",
    descriptors: [],
  },
];

_builtins.forEach((m) => GoalCapabilityRegistry.register(m));