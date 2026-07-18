// IAuditor.ts — Sprint EF-39.6
// Plugin interface that all auditors must implement.
// New auditors (SecurityAuditor, MemoryLeakAuditor, etc.) only need to implement this.

export interface AuditorResult {
  readonly auditorId:  string;
  readonly ok:         boolean;
  readonly durationMs: number;
  readonly data:       Readonly<Record<string, unknown>>;
}

export interface IAuditor {
  readonly id: string;
  run(): Promise<AuditorResult>;
}