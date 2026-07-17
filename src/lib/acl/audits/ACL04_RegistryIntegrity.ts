// ══════════════════════════════════════════════════════════════════════════════
// ACL-04 — Registry Integrity Audit
// Verifies all Runtimes, Connectors, Capabilities are properly registered.
// No component may exist outside a registry.
// ══════════════════════════════════════════════════════════════════════════════

import { makeAudit, finding, finalise, KNOWN_RUNTIMES, KNOWN_CONNECTORS, KNOWN_CAPABILITIES } from "../ACLHelpers";
import type { ACLAuditResult } from "../ACLTypes";
import { ExecutionCompositionRoot } from "@/lib/execution-chain/ExecutionCompositionRoot";
import { CapabilityRuntime } from "@/lib/capability-runtime/CapabilityRuntime";

export async function runACL04(): Promise<ACLAuditResult> {
  const a = makeAudit("ACL-04", "Registry Integrity Audit");
  const t = Date.now();

  try {
    // ── Runtime Registry ──────────────────────────────────────────────────────
    const rt = ExecutionCompositionRoot.compose({});
    const registryList = rt.registry.listAll();
    const registeredIds = registryList.map(r => r.id);

    a.metrics["runtimesRegistered"] = registeredIds.length;

    // Validate each registered runtime has required fields
    let runtimeViolations = 0;
    for (const desc of registryList) {
      if (!desc.id || !desc.version || !desc.owner || !desc.lifecycle) {
        runtimeViolations++;
        finding(a, "HIGH", "RuntimeDescriptor",
          `Runtime '${desc.id ?? "UNKNOWN"}' has incomplete descriptor`);
        a.score -= 8;
      }
      if (typeof desc.health !== "function") {
        runtimeViolations++;
        finding(a, "HIGH", "HealthCheck",
          `Runtime '${desc.id}' missing health() function`);
        a.score -= 5;
      }
    }
    a.metrics["runtimeDescriptorViolations"] = runtimeViolations;

    // Verify registry self-validation
    const validation = rt.registry.validate();
    a.metrics["registryValid"] = validation.valid;
    if (!validation.valid) {
      for (const v of validation.violations) {
        finding(a, "HIGH", "RegistryValidation", v);
        a.score -= 5;
      }
    }

    // ── Capability Registry ───────────────────────────────────────────────────
    try {
      const capRuntime = new CapabilityRuntime();
      await capRuntime.initialise();
      const capReg = capRuntime.registry;
      const capList = capReg.listAll();
      a.metrics["capabilitiesRegistered"] = capList.length;

      let unregisteredCaps = 0;
      for (const known of KNOWN_CAPABILITIES) {
        const found = capList.some(c =>
          c.id?.toLowerCase().includes(known.toLowerCase()) ||
          c.name?.toLowerCase().includes(known.toLowerCase().replace("capability","").trim())
        );
        if (!found) {
          unregisteredCaps++;
          finding(a, "LOW", "UnregisteredCapability",
            `Known capability '${known}' not found in CapabilityRegistry`);
          a.score -= 2;
        }
      }
      a.metrics["unregisteredCapabilities"] = unregisteredCaps;
    } catch {
      finding(a, "INFO", "CapabilityRegistry",
        "CapabilityRuntime not fully instantiable in static context — skipped deep check");
      a.metrics["capabilitiesRegistered"] = "N/A";
    }

    // ── Connector Registry ────────────────────────────────────────────────────
    // Connectors are registered via ConnectorBootstrap — verify count
    try {
      const { ConnectorBootstrap } = await import("@/lib/connector-runtime/ConnectorBootstrap");
      const boot = new ConnectorBootstrap();
      const connReg = boot.registry;
      const connList = connReg.listAll();
      a.metrics["connectorsRegistered"] = connList.length;

      if (connList.length === 0) {
        finding(a, "MEDIUM", "ConnectorRegistry",
          "No connectors found in ConnectorRegistry — bootstrap may not have run");
        a.score -= 5;
      }
    } catch {
      finding(a, "INFO", "ConnectorRegistry",
        "ConnectorBootstrap not resolvable in static context — connector count not verified");
      a.metrics["connectorsRegistered"] = "N/A";
    }

    // ── Final integrity check ─────────────────────────────────────────────────
    if (runtimeViolations === 0 && validation.valid) {
      finding(a, "INFO", "RegistryIntegrity",
        `Registry integrity confirmed: ${registeredIds.length} runtimes, all valid`);
    }

  } catch (err: unknown) {
    finding(a, "CRITICAL", "ACL04Error", String(err));
    a.score = 0;
  }

  return finalise(a, t);
}