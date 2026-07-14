/**
 * ConnectorDiagnostics.ts — Sprint 6.3.0
 * Executes self-test, readiness, dependency check, config validation.
 */

import type { ConnectorDescriptor, ConnectorDiagnosticsResult } from "./UCPTypes";
import { validateCapabilities } from "./ConnectorCapabilities";

export class ConnectorDiagnostics {
  run(descriptor: ConnectorDescriptor): ConnectorDiagnosticsResult {
    const t0 = Date.now();
    const details: string[] = [];

    // Self-test: descriptor has required fields
    const selfTest = !!(descriptor.id && descriptor.provider && descriptor.version);
    if (!selfTest) details.push("FAIL self-test: missing id, provider, or version");
    else           details.push("PASS self-test: descriptor fields present");

    // Readiness: lifecycle is READY or CONFIGURED
    const readiness = descriptor.lifecycle === "READY" || descriptor.lifecycle === "CONFIGURED";
    if (!readiness) details.push(`FAIL readiness: lifecycle=${descriptor.lifecycle}`);
    else            details.push(`PASS readiness: lifecycle=${descriptor.lifecycle}`);

    // Dependency check: compatibility valid
    const dependencyCheck = descriptor.compatibility.valid;
    if (!dependencyCheck) {
      details.push(`FAIL dependency check: ${descriptor.compatibility.violations.join(", ")}`);
    } else {
      details.push("PASS dependency check: all layer versions compatible");
    }

    // Configuration validation: capabilities have at least one active
    const capResult = validateCapabilities(descriptor.capabilities);
    const configurationValid = capResult.valid;
    if (!configurationValid) {
      details.push(`FAIL config validation: ${capResult.violations.join(", ")}`);
    } else {
      details.push("PASS config validation: capabilities declared");
    }

    const overall = selfTest && readiness && dependencyCheck && configurationValid;

    return {
      selfTest,
      readiness,
      dependencyCheck,
      configurationValid,
      overall,
      details,
      ranAt: Date.now(),
      durationMs: Date.now() - t0,
    };
  }
}