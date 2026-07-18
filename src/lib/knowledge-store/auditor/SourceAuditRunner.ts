// SourceAuditRunner.ts — EF-39.8
// Isolated wrapper that forces ?raw imports into their own static chunk.
// Import this module (not SourceAudit directly) when doing dynamic import()
// to avoid Vite bundle collision between ?raw and normal TS imports.

export { runSourceAudit } from "./SourceAudit";
export type { SourceAuditReport, SourceFinding, FileMetrics } from "./SourceAudit";