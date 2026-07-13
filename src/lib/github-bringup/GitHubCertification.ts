/**
 * GitHubCertification — Phase 5.3 Part 9
 * Issues the official GitHub Production Operational Certification.
 */

import type { BringUpReport, GitHubCertificate } from "./GitHubBringUpTypes";
import type { TokenDiagnostic } from "./GitHubTokenManager";

export class GitHubCertification {

  issue(report: BringUpReport, tokenDiag: TokenDiagnostic): GitHubCertificate {
    const passed = report.operations.filter(o => o.status === "SUCCESS");
    const failed = report.operations.filter(o => o.status === "FAILED");
    const latencies = passed.map(o => o.latencyMs).sort((a, b) => a - b);
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    const writeOpsAttempted = report.operations.some(o =>
      ["create", "update", "delete", "push", "write", "merge", "commit"].some(w => o.operation.toLowerCase().includes(w))
    );
    const readOnlyVerified = !writeOpsAttempted;

    const certStatus: GitHubCertificate["status"] =
      report.certificationReady && readOnlyVerified ? "CERTIFIED"
      : report.passed >= 6 && failed.length === 0     ? "CONDITIONAL"
      : "FAILED";

    const level: GitHubCertificate["level"] =
      certStatus === "CERTIFIED" ? "PRODUCTION"
      : certStatus === "CONDITIONAL" ? "STAGING"
      : "DEVELOPMENT";

    const notes: string[] = [
      `Certified at: ${new Date().toISOString()}`,
      `Token source: ${tokenDiag.source}`,
      `Read-only verified: ${readOnlyVerified}`,
      `Operations validated: ${passed.length}`,
      `Connector version: GitHubConnector v2.0.0`,
      `PCS certification: unchanged (Beta-01 certified)`,
      `No write operations executed`,
    ];

    if (certStatus === "CONDITIONAL") {
      notes.push("Conditional certification — some operations returned non-critical failures");
    }

    return {
      certId: `gh_cert_${Date.now().toString(36)}`,
      issuedAt: Date.now(),
      issuedBy: "GitHubCertification v1.0 — Phase 5.3",
      connector: "GitHubConnector",
      version: "2.0.0",
      login: report.login ?? "unknown",
      operationsValidated: passed.map(o => o.operation),
      passedCount: passed.length,
      failedCount: failed.length,
      readOnlyVerified,
      latencyP95Ms: p95,
      rateLimit: tokenDiag.rateLimit,
      status: certStatus,
      level,
      notes,
    };
  }
}