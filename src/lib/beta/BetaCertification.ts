/**
 * BetaCertification.ts — Sprint Beta-01
 *
 * Produces the Beta certification report from BetaStore metrics
 * and the upstream ProductValidationCertificate.
 */

import { BetaStore } from "./BetaStore";
import type { ProductValidationCertificate } from "@/lib/validation/CertificationReport";

export interface BetaCertificate {
  readonly certId:            string;
  readonly issuedAt:          number;
  readonly program:           "Beta-01";
  readonly certified:         boolean;
  readonly totalSessions:     number;
  readonly approvedSessions:  number;
  readonly failedSessions:    number;
  readonly errorsFound:       number;
  readonly regressions:       number;
  readonly availability:      number;   // 0–1
  readonly avgPerformanceMs:  number;
  readonly avgConfidence:     number;
  readonly reportCoverage:    number;
  readonly snapshotCoverage:  number;
  readonly auditCoverage:     number;
  readonly explainCoverage:   number;
  readonly connectorHealth:   readonly { connectorId: string; successRate: number; avgMs: number }[];
  readonly stability:         number;   // successRate
  readonly summary:           string;
  readonly p02cert:           ProductValidationCertificate | null;
}

export const BetaCertificationBuilder = {
  build(
    p02cert: ProductValidationCertificate | null,
    regressions: number,
  ): BetaCertificate {
    const m = BetaStore.metrics();

    const total      = m?.total      ?? 0;
    const passed     = m?.passed     ?? 0;
    const failed     = m?.failed     ?? 0;
    const errors     = m?.failed     ?? 0;
    const avail      = total > 0 ? passed / total : 0;
    const stability  = avail;
    const avgMs      = m?.avgDurationMs    ?? 0;
    const avgConf    = m?.avgConfidence    ?? 0;
    const repCov     = m?.reportCoverage   ?? 0;
    const snapCov    = m?.snapshotCoverage ?? 0;
    const audCov     = m?.auditCoverage    ?? 0;
    const expCov     = m?.explainCoverage  ?? 0;
    const connHealth = (m?.connectorUsage ?? []).map(c => ({
      connectorId: c.connectorId,
      successRate: +c.successRate.toFixed(4),
      avgMs:       c.avgMs,
    }));

    const certified =
      (p02cert?.certified ?? false) &&
      regressions === 0 &&
      avail >= 0.9;

    const certId = `BETA-01-${Date.now()}`;

    const summary = certified
      ? `MemoryOS Beta-01 CERTIFIED. ${passed}/${total} sessions approved, ` +
        `${(avail * 100).toFixed(0)}% availability, ${(avgConf * 100).toFixed(0)}% avg confidence, zero regressions.`
      : `Beta-01 INCOMPLETE. ${passed}/${total} approved. Availability: ${(avail * 100).toFixed(0)}%. Regressions: ${regressions}.`;

    return Object.freeze({
      certId,
      issuedAt:          Date.now(),
      program:           "Beta-01",
      certified,
      totalSessions:     total,
      approvedSessions:  passed,
      failedSessions:    failed,
      errorsFound:       errors,
      regressions,
      availability:      +avail.toFixed(4),
      avgPerformanceMs:  avgMs,
      avgConfidence:     avgConf,
      reportCoverage:    repCov,
      snapshotCoverage:  snapCov,
      auditCoverage:     audCov,
      explainCoverage:   expCov,
      connectorHealth:   Object.freeze(connHealth),
      stability,
      summary,
      p02cert:           p02cert ?? null,
    });
  },
};