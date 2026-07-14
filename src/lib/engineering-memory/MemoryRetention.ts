/**
 * MemoryRetention.ts — Sprint 6.2.4
 * Knowledge is NEVER deleted. Entries are only marked ARCHIVED or SUPERSEDED.
 */
import type { AnyMemoryEntry, MemoryStatus } from "./MEMTypes";

export class MemoryRetention {
  archive(entry: AnyMemoryEntry): void   { entry.status = "ARCHIVED"; }
  supersede(entry: AnyMemoryEntry): void { entry.status = "SUPERSEDED"; }

  // All entries remain searchable regardless of status
  filter(entries: AnyMemoryEntry[], includeArchived = true, includeSuperseded = true): AnyMemoryEntry[] {
    return entries.filter(e =>
      (e.status === "ACTIVE") ||
      (includeArchived   && e.status === "ARCHIVED") ||
      (includeSuperseded && e.status === "SUPERSEDED")
    );
  }

  stats(entries: AnyMemoryEntry[]): Record<MemoryStatus, number> {
    return {
      ACTIVE:     entries.filter(e => e.status === "ACTIVE").length,
      ARCHIVED:   entries.filter(e => e.status === "ARCHIVED").length,
      SUPERSEDED: entries.filter(e => e.status === "SUPERSEDED").length,
    };
  }
}