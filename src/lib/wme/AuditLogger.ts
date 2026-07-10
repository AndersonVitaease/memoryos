// ─── Working Memory Engine — AuditLogger ─────────────────────────────────────
// Sprint 1 · Foundation v1.0 · MDS Cap.6 (AuditTrail)

import type { AuditRecord, IdentityContext } from "./types";
import type { IAuditLogger } from "./interfaces";
import { contextNamespace } from "./utils";

/**
 * In-memory AuditLogger — production should swap for persistent store.
 * @implements IAuditLogger
 */
export class AuditLogger implements IAuditLogger {
  private readonly store = new Map<string, AuditRecord[]>();

  log(record: AuditRecord): void {
    const ns = contextNamespace(record.context);
    if (!this.store.has(ns)) this.store.set(ns, []);
    this.store.get(ns)!.push(record);
  }

  getLogs(context: IdentityContext): AuditRecord[] {
    const ns = contextNamespace(context);
    return [...(this.store.get(ns) ?? [])];
  }

  clear(context: IdentityContext): void {
    this.store.delete(contextNamespace(context));
  }

  /** Total log count across all contexts — for diagnostics */
  totalCount(): number {
    let n = 0;
    for (const arr of this.store.values()) n += arr.length;
    return n;
  }
}