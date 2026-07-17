// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeClockTypes
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

export interface IClock {
  now(): number;
  elapsed(since: number): number;
  label(): string;
}

export type ClockMode = "SYSTEM" | "VIRTUAL" | "MOCK" | "DETERMINISTIC";