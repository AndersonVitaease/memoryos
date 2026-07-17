// ══════════════════════════════════════════════════════════════════════════════
// ACL-08 — Runtime Ownership Audit
// Validates every registered runtime has: Owner, Interface, Descriptor,
// Lifecycle, Registration, HealthCheck, Version.
// ══════════════════════════════════════════════════════════════════════════════

import { makeAudit, finding, finalise } from "../ACLHelpers";
import type { ACLAuditResult } from "../ACLTypes";
import { ExecutionCompositionRoot } from "@/lib/execution-chain/ExecutionCompositionRoot";

const REQUIRED_DESCRIPTOR_FIELDS = [
  "id", "version", "owner", "capabilities", "dependencies", "lifecycle", "health"
] as const;

const VALID_LIFECYCLES = ["singleton", "scoped", "transient"] as const;

export async function runACL08(): Promise<ACLAuditResult> {
  const a = makeAudit("ACL-08", "Runtime Ownership Audit");
  const t = Date.now();

  try {
    const rt = ExecutionCompositionRoot.compose({});
    const descriptors = rt.registry.listAll();

    a.metrics["totalRuntimes"] = descriptors.length;

    if (descriptors.length === 0) {
      finding(a, "HIGH", "EmptyRegistry", "No runtimes registered — ownership cannot be validated");
      a.score -= 30;
      return finalise(a, t);
    }

    let fullyCompliant = 0;
    let missingOwner   = 0;
    let missingVersion = 0;
    let missingHealth  = 0;
    let badLifecycle   = 0;

    for (const desc of descriptors) {
      const issues: string[] = [];

      // Owner
      if (!desc.owner || desc.owner.trim() === "") {
        missingOwner++;
        issues.push("missing owner");
      }

      // Version
      if (!desc.version || desc.version.trim() === "") {
        missingVersion++;
        issues.push("missing version");
      }

      // Lifecycle
      if (!VALID_LIFECYCLES.includes(desc.lifecycle as typeof VALID_LIFECYCLES[number])) {
        badLifecycle++;
        issues.push(`invalid lifecycle '${desc.lifecycle}'`);
      }

      // HealthCheck
      if (typeof desc.health !== "function") {
        missingHealth++;
        issues.push("missing health() function");
      } else {
        // Run the health check
        try {
          const h = desc.health();
          if (!h.status || !h.version) {
            issues.push("health() returned incomplete status");
          }
        } catch (he) {
          issues.push(`health() threw: ${String(he)}`);
        }
      }

      // Capabilities (must be array)
      if (!Array.isArray(desc.capabilities)) {
        issues.push("capabilities must be array");
      }

      // Dependencies (must be array)
      if (!Array.isArray(desc.dependencies)) {
        issues.push("dependencies must be array");
      }

      if (issues.length === 0) {
        fullyCompliant++;
        finding(a, "INFO", "OwnershipVerified",
          `✓ ${desc.id} [${desc.lifecycle}] v${desc.version} — owner: ${desc.owner}`);
      } else {
        finding(a, "HIGH", "OwnershipViolation",
          `${desc.id}: ${issues.join(", ")}`);
        a.score -= Math.min(15, issues.length * 5);
      }
    }

    a.metrics["fullyCompliant"] = fullyCompliant;
    a.metrics["missingOwner"]   = missingOwner;
    a.metrics["missingVersion"] = missingVersion;
    a.metrics["missingHealth"]  = missingHealth;
    a.metrics["badLifecycle"]   = badLifecycle;
    a.metrics["complianceRate"] = `${Math.round((fullyCompliant/descriptors.length)*100)}%`;

    if (fullyCompliant === descriptors.length) {
      finding(a, "INFO", "OwnershipAudit",
        `All ${fullyCompliant} runtimes fully compliant — ownership verified`);
    }

  } catch (err: unknown) {
    finding(a, "CRITICAL", "ACL08Error", String(err));
    a.score = 0;
  }

  return finalise(a, t);
}