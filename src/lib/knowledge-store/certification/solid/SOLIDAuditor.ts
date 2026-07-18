// SOLIDAuditor.ts — Sprint EF-39.6
// Orchestrates all 5 principle sub-auditors. Each is independent.
// No principle depends on another.

import { auditSRP } from "./SRPAuditor";
import { auditOCP } from "./OCPAuditor";
import { auditLSP } from "./LSPAuditor";
import { auditISP } from "./ISPAuditor";
import { auditDIP } from "./DIPAuditor";
import type { SOLIDReport } from "../../auditor/ArchitecturalAuditor";

export async function runSOLIDAudit(): Promise<SOLIDReport> {
  const t0 = performance.now();

  // Each principle is independent — run in parallel
  const [srp, ocp, lsp, isp, dip] = await Promise.all([
    auditSRP(),
    auditOCP(),
    auditLSP(),
    auditISP(),
    auditDIP(),
  ]);

  const checks = Object.freeze([srp, ocp, lsp, isp, dip]);
  const allPass = checks.every(c => c.verdict === "PASS");

  return Object.freeze({
    ok:          allPass,
    checks,
    durationMs:  Math.round((performance.now() - t0) * 100) / 100,
  });
}