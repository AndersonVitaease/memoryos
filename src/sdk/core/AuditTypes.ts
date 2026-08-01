/**
 * AuditTypes.ts — Core SDK
 * Public contracts for AuditTrail interaction.
 * MCS-compliant — SDK consumers record audit entries via these interfaces only.
 */

export type AuditSeverity = "info" | "warn" | "error" | "critical";

export interface AuditEntry {
  readonly id: string;
  readonly component: string;
  readonly action: string;
  readonly severity: AuditSeverity;
  readonly details: Record<string, unknown>;
  readonly executionId?: string;
  readonly sessionId?: string;
  readonly timestamp: number;
}

export interface IAuditTrailWriter {
  record(entry: Omit<AuditEntry, "id" | "timestamp">): void;
}