// SRPAuditor.ts — Sprint EF-39.6 — Single Responsibility Principle
import type { SOLIDCheck } from "../../auditor/ArchitecturalAuditor";
import { CertificationConfig } from "../CertificationConfig";

export async function auditSRP(): Promise<SOLIDCheck> {
  const mods = await Promise.all([
    import("../../memory/MemoryStoreIndex").then(m => ({ name: "MemoryStoreIndex",          exports: Object.keys(m) })),
    import("../../memory/MemoryStoreQuery").then(m => ({ name: "MemoryStoreQuery",          exports: Object.keys(m) })),
    import("../../memory/MemoryStoreSearch").then(m => ({ name: "MemoryStoreSearch",        exports: Object.keys(m) })),
    import("../../memory/MemoryStoreStatistics").then(m => ({ name: "MemoryStoreStatistics",exports: Object.keys(m) })),
    import("../../memory/MemoryStoreVersionManager").then(m => ({ name: "MemoryStoreVersionManager", exports: Object.keys(m) })),
    import("../../memory/MemoryStoreArchive").then(m => ({ name: "MemoryStoreArchive",      exports: Object.keys(m) })),
    import("../../memory/MemoryStoreSnapshots").then(m => ({ name: "MemoryStoreSnapshots",  exports: Object.keys(m) })),
  ]);

  const max = CertificationConfig.maxModuleExports;
  const violators = mods.filter(m => m.exports.length > max);

  return Object.freeze({
    principle: "SRP — Single Responsibility",
    verdict:   violators.length === 0 ? "PASS" as const : "WARNING" as const,
    rationale: `Each sub-module measured by export count (<=${max} = focused). Violators: ${violators.length}`,
    evidence:  mods.map(m => `${m.name}=${m.exports.length}`).join(", "),
  });
}