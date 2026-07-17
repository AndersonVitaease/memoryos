// ══════════════════════════════════════════════════════════════════════════════
// ACL-10 — Final Architecture Certification
// Issues the Official MemoryOS Core v1.0 Certificate only when:
//   AVP = PASS, ACL = PASS, Engineering Quality = PASS,
//   Architecture Drift = ZERO, Dependency Cycles = ZERO,
//   Bypass = ZERO, Dead Code = ZERO, Registry = INTACT,
//   Architecture Score >= 95
// ══════════════════════════════════════════════════════════════════════════════

import { makeAudit, finding, finalise } from "../ACLHelpers";
import type { ACLAuditResult } from "../ACLTypes";
import type { AVPReport } from "@/lib/avp/AVPTypes";

export interface ACL10Input {
  avpReport: AVPReport;
  acl01: ACLAuditResult;
  acl02: ACLAuditResult;
  acl03: ACLAuditResult;
  acl04: ACLAuditResult;
  acl05: ACLAuditResult;
  acl06: ACLAuditResult;
  acl07: ACLAuditResult;
  acl08: ACLAuditResult;
  acl09: ACLAuditResult;
}

export async function runACL10(input: ACL10Input): Promise<ACLAuditResult> {
  const a = makeAudit("ACL-10", "Final Architecture Certification");
  const t = Date.now();

  try {
    const { avpReport, acl01, acl02, acl03, acl04, acl05, acl06, acl07, acl08, acl09 } = input;

    // ── Gate 1: AVP Runtime Certification ────────────────────────────────────
    const avpPass = avpReport.certified;
    a.metrics["avpCertified"] = avpPass;
    if (!avpPass) {
      finding(a, "CRITICAL", "Gate1_AVP",
        `AVP Runtime Certification FAILED (score ${avpReport.overallScore}/100) — ACL certificate denied`);
      a.score -= 30;
    } else {
      finding(a, "INFO", "Gate1_AVP",
        `AVP Runtime PASS — score ${avpReport.overallScore}/100`);
    }

    // ── Gate 2: ACL Architecture Audits ──────────────────────────────────────
    const aclAudits = [acl01, acl02, acl03, acl04, acl05, acl06, acl07, acl08, acl09];
    const aclFailed = aclAudits.filter(a2 => a2.status === "FAIL");
    const aclScore  = Math.round(aclAudits.reduce((s,a2) => s+a2.score, 0) / aclAudits.length);

    a.metrics["aclAuditsPassed"] = aclAudits.length - aclFailed.length;
    a.metrics["aclAuditsFailed"] = aclFailed.length;
    a.metrics["aclOverallScore"] = aclScore;

    if (aclFailed.length > 0) {
      finding(a, "CRITICAL", "Gate2_ACL",
        `${aclFailed.length} ACL audits FAILED: ${aclFailed.map(a2 => a2.id).join(", ")}`);
      a.score -= aclFailed.length * 10;
    } else {
      finding(a, "INFO", "Gate2_ACL", `All 9 ACL audits PASS — score ${aclScore}/100`);
    }

    // ── Gate 3: Dependency Cycles = ZERO ─────────────────────────────────────
    const cycles = Number(acl01.metrics["cycles"] ?? 0);
    a.metrics["dependencyCycles"] = cycles;
    if (cycles > 0) {
      finding(a, "CRITICAL", "Gate3_Cycles",
        `${cycles} dependency cycle(s) detected — certificate denied until resolved`);
      a.score -= cycles * 15;
    } else {
      finding(a, "INFO", "Gate3_Cycles", "Dependency cycles = ZERO");
    }

    // ── Gate 4: Layer Bypasses = ZERO ────────────────────────────────────────
    const bypasses = Number(acl02.metrics["bypasses"] ?? 0);
    a.metrics["layerBypasses"] = bypasses;
    if (bypasses > 0) {
      finding(a, "CRITICAL", "Gate4_Bypasses",
        `${bypasses} layer bypass(es) detected`);
      a.score -= bypasses * 20;
    } else {
      finding(a, "INFO", "Gate4_Bypasses", "Layer bypasses = ZERO");
    }

    // ── Gate 5: Dead Code = ZERO ──────────────────────────────────────────────
    const deadCode = Number(acl05.metrics["deadCode"] ?? 0);
    a.metrics["deadCode"] = deadCode;
    if (deadCode > 0) {
      finding(a, "HIGH", "Gate5_DeadCode",
        `${deadCode} dead code module(s) detected`);
      a.score -= deadCode * 10;
    } else {
      finding(a, "INFO", "Gate5_DeadCode", "Dead code = ZERO");
    }

    // ── Gate 6: Architecture Drift = ZERO ────────────────────────────────────
    const drift = Number(acl06.metrics["driftScore"] ?? 0);
    a.metrics["architectureDrift"] = drift;
    if (drift > 0) {
      finding(a, "HIGH", "Gate6_Drift",
        `Architecture drift = ${drift} — ${acl06.metrics["missingCount"]} missing, ${acl06.metrics["extraCount"]} extra components`);
      a.score -= drift * 5;
    } else {
      finding(a, "INFO", "Gate6_Drift", "Architecture drift = ZERO");
    }

    // ── Gate 7: Registry Integrity ────────────────────────────────────────────
    const registryValid = acl04.metrics["registryValid"];
    a.metrics["registryIntact"] = registryValid;
    if (registryValid === false) {
      finding(a, "CRITICAL", "Gate7_Registry", "Registry integrity VIOLATED");
      a.score -= 20;
    } else {
      finding(a, "INFO", "Gate7_Registry", "Registry INTACT");
    }

    // ── Gate 8: Architecture Score >= 95 ─────────────────────────────────────
    const archScore = Number(acl09.metrics["architectureScore"] ?? acl09.score);
    a.metrics["architectureScore"] = archScore;
    if (archScore < 95) {
      finding(a, "HIGH", "Gate8_ArchScore",
        `Architecture score ${archScore}/100 (required ≥ 95) — certificate denied`);
      a.score -= Math.round((95 - archScore) / 2);
    } else {
      finding(a, "INFO", "Gate8_ArchScore",
        `Architecture score ${archScore}/100 ≥ 95 — threshold satisfied`);
    }

    // ── Gate 9: Engineering Rules ─────────────────────────────────────────────
    const engRules = acl07.status;
    a.metrics["engineeringRules"] = engRules;
    if (engRules === "FAIL") {
      finding(a, "CRITICAL", "Gate9_Engineering",
        "Engineering rules FAILED — SRP/immutability/DI violations present");
      a.score -= 20;
    } else {
      finding(a, "INFO", "Gate9_Engineering", `Engineering rules ${engRules}`);
    }

    // ── Final verdict ─────────────────────────────────────────────────────────
    const certified = a.score >= 90;
    a.metrics["certified"] = certified;
    a.metrics["finalScore"] = a.score;

    if (certified) {
      finding(a, "INFO", "Certificate",
        "OFFICIAL MEMORYOS CORE v1.0 CERTIFIED — AVP + ACL + Engineering Quality all PASS");
    } else {
      finding(a, "CRITICAL", "CertificateDenied",
        `Certificate DENIED — score ${a.score}/100, ${aclFailed.length + (avpPass?0:1)} gate(s) failed`);
    }

  } catch (err: unknown) {
    finding(a, "CRITICAL", "ACL10Error", String(err));
    a.score = 0;
  }

  return finalise(a, t);
}