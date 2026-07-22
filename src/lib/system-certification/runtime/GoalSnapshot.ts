/**
 * GoalSnapshot.ts — Sprint EF-55.1
 *
 * Snapshot de um Goal: registra entrada real e artefatos produzidos.
 */

export interface GoalSnapshot {
  readonly goalId:    string;
  readonly goal:      string;
  readonly intent:    string;
  readonly context:   string;
  readonly capturedAt: number;
}