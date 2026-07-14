/**
 * AcceptanceRegistry.ts — Sprint 6.3.2
 * Stores sprint registrations and their acceptance criteria
 */

import type { AcceptanceCriterion, SprintRegistration } from "./EAFTypes";
import type { AcceptanceScenario } from "./AcceptanceScenario";
import { SHR_CRITERIA, EAF_CRITERIA } from "./AcceptanceCriteria";

// ── Sprint-to-scenario mapping ────────────────────────────────────────────────

export class AcceptanceRegistry {
  private _sprints = new Map<string, SprintRegistration>();
  private _scenarios = new Map<string, AcceptanceScenario[]>();

  register(sprintId: string, objective: string, criteria: AcceptanceCriterion[]): SprintRegistration {
    const reg: SprintRegistration = { sprintId, objective, criteria, registeredAt: Date.now() };
    this._sprints.set(sprintId, reg);
    return reg;
  }

  bindScenarios(sprintId: string, scenarios: AcceptanceScenario[]): void {
    this._scenarios.set(sprintId, scenarios);
  }

  get(sprintId: string): SprintRegistration | undefined {
    return this._sprints.get(sprintId);
  }

  scenarios(sprintId: string): AcceptanceScenario[] {
    return this._scenarios.get(sprintId) ?? [];
  }

  all(): SprintRegistration[] {
    return [...this._sprints.values()];
  }

  count(): number { return this._sprints.size; }

  has(sprintId: string): boolean { return this._sprints.has(sprintId); }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const G = globalThis as any;
if (!G.__eaf_registry) {
  G.__eaf_registry = new AcceptanceRegistry();

  // Pre-register known sprints
  G.__eaf_registry.register("6.3.1", "Self-Healing Runtime — automatic restart and recovery", SHR_CRITERIA);
  G.__eaf_registry.register("6.3.2", "Engineering Acceptance Framework — automated sprint validation", EAF_CRITERIA);
}

export const globalRegistry: AcceptanceRegistry = G.__eaf_registry;