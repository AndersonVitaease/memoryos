// ══════════════════════════════════════════════════════════════════════════════
// Architecture Certification Layer — Main Runner
// Orchestrates ACL-01 through ACL-10 in sequence.
// Sprint P-01.1
// ══════════════════════════════════════════════════════════════════════════════

import type { ACLAuditResult, ACLFinding, ACLReport } from "./ACLTypes";
import type { AVPReport } from "@/lib/avp/AVPTypes";
import { runACL01 } from "./audits/ACL01_DependencyGraph";
import { runACL02 } from "./audits/ACL02_LayerBoundary";
import { runACL03 } from "./audits/ACL03_PipelineIntegrity";
import { runACL04 } from "./audits/ACL04_RegistryIntegrity";
import { runACL05 } from "./audits/ACL05_PublicAPI";
import { runACL06 } from "./audits/ACL06_ArchitectureDrift";
import { runACL07 } from "./audits/ACL07_EngineeringRules";
import { runACL08 } from "./audits/ACL08_RuntimeOwnership";
import { runACL09 } from "./audits/ACL09_ArchitectureScore";
import { runACL10 } from "./audits/ACL10_FinalCertification";

export type ACLProgressCallback = (auditId: string, result: ACLAuditResult) => void;

export async function runACL(
  avpReport: AVPReport,
  onProgress?: ACLProgressCallback,
): Promise<ACLReport> {
  const t0 = Date.now();

  const acl01 = await runACL01(); onProgress?.("ACL-01", acl01);
  const acl02 = await runACL02(); onProgress?.("ACL-02", acl02);
  const acl03 = await runACL03(); onProgress?.("ACL-03", acl03);
  const acl04 = await runACL04(); onProgress?.("ACL-04", acl04);
  const acl05 = await runACL05(); onProgress?.("ACL-05", acl05);
  const acl06 = await runACL06(); onProgress?.("ACL-06", acl06);
  const acl07 = await runACL07(); onProgress?.("ACL-07", acl07);
  const acl08 = await runACL08(); onProgress?.("ACL-08", acl08);
  const acl09 = await runACL09(); onProgress?.("ACL-09", acl09);
  const acl10 = await runACL10({ avpReport, acl01, acl02, acl03, acl04, acl05, acl06, acl07, acl08, acl09 });
  onProgress?.("ACL-10", acl10);

  const all = [acl01, acl02, acl03, acl04, acl05, acl06, acl07, acl08, acl09, acl10];
  const certified = all.every(a => a.status !== "FAIL") && avpReport.certified;

  const criticalFindings: ACLFinding[] = all
    .flatMap(a => a.findings)
    .filter(f => f.severity === "CRITICAL");

  const overallScore = Math.round(all.reduce((s, a) => s + a.score, 0) / all.length);

  return {
    acl01, acl02, acl03, acl04, acl05, acl06, acl07, acl08, acl09, acl10,
    certified,
    overallScore,
    dependencyCycles:  Number(acl01.metrics["cycles"]          ?? 0),
    layerBypasses:     Number(acl02.metrics["bypasses"]        ?? 0),
    pipelineBypasses:  Number(acl03.metrics["orderViolations"] ?? 0),
    deadCodeCount:     Number(acl05.metrics["deadCode"]        ?? 0),
    driftComponents:   Number(acl06.metrics["driftScore"]      ?? 0),
    architectureScore: Number(acl09.metrics["architectureScore"] ?? acl09.score),
    totalDurationMs:   Date.now() - t0,
    criticalFindings,
  };
}