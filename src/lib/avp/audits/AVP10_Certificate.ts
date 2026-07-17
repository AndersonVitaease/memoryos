// ══════════════════════════════════════════════════════════════════════════════
// AVP-10 — Architecture Freeze Certification
// Reviews all previous audits and issues or denies the certificate.
// ══════════════════════════════════════════════════════════════════════════════

import type { AVPAuditResult } from "../AVPTypes";
import { makeAudit, finalise, finding } from "../AVPHelpers";
import { runEngineeringQualityCertification } from "../../../lib/execution-chain/tests/EngineeringQuality.cert";

interface PreviousAudits {
  avp01: AVPAuditResult;
  avp02: AVPAuditResult;
  avp03: AVPAuditResult;
  avp04: AVPAuditResult;
  avp05: AVPAuditResult;
  avp06: AVPAuditResult;
  avp07: AVPAuditResult;
  avp08: AVPAuditResult;
  avp09: AVPAuditResult;
}

export async function runAVP10(prev: PreviousAudits): Promise<AVPAuditResult> {
  const a = makeAudit("AVP-10", "Architecture Freeze Certification");

  // ── Review previous audits ────────────────────────────────────────────────
  const auditMap = [
    { key: "avp01", name: "Structural Architecture Audit" },
    { key: "avp02", name: "Runtime Integrity Audit" },
    { key: "avp03", name: "Concurrency Audit" },
    { key: "avp04", name: "Session Isolation Audit" },
    { key: "avp05", name: "Failure Injection Audit" },
    { key: "avp06", name: "Explainability Audit" },
    { key: "avp07", name: "Constitution Audit" },
    { key: "avp08", name: "Chaos Engineering Audit" },
    { key: "avp09", name: "Performance Certification" },
  ] as const;

  let totalScore = 0;
  let auditsPass = 0;

  for (const { key, name } of auditMap) {
    const audit = prev[key] as AVPAuditResult;
    totalScore += audit.score;

    if (audit.status === "FAIL") {
      finding(a, "CRITICAL", "AuditFailed",
        `${key.toUpperCase()} — ${name} FAILED (score: ${audit.score})`,
        audit.findings.filter(f => f.severity === "CRITICAL").map(f => f.message).join("; ")
      );
      a.score -= 10;
    } else if (audit.status === "WARN") {
      finding(a, "HIGH", "AuditWarning",
        `${key.toUpperCase()} — ${name} has warnings (score: ${audit.score})`
      );
      a.score -= 3;
    } else {
      auditsPass++;
    }

    a.metrics[`${key}_score`] = audit.score;
    a.metrics[`${key}_status`] = audit.status;
  }

  // ── Engineering Quality Certification ─────────────────────────────────────
  try {
    const eq = await runEngineeringQualityCertification();
    a.metrics["eqCertified"]  = eq.certified;
    a.metrics["eqPassRate"]   = eq.passRate;
    a.metrics["eqPassed"]     = eq.passed;
    a.metrics["eqTotal"]      = eq.total;

    if (!eq.certified) {
      finding(a, "CRITICAL", "EngineeringQuality",
        `Engineering Quality Certification failed: ${eq.passed}/${eq.total} (${eq.passRate})`
      );
      a.score -= 20;
    } else {
      auditsPass++;
    }
  } catch (e: unknown) {
    finding(a, "CRITICAL", "EngineeringQualityError",
      "Engineering Quality suite threw: " + String((e as Error).message ?? e)
    );
    a.score -= 20;
  }

  // ── Final determination ───────────────────────────────────────────────────
  a.metrics["auditsPassed"]  = auditsPass;
  a.metrics["auditsTotal"]   = 10;  // 9 prev + EQ
  a.metrics["averageScore"]  = Math.round(totalScore / 9);
  a.score = Math.max(0, Math.min(100, a.score));

  return finalise(a);
}