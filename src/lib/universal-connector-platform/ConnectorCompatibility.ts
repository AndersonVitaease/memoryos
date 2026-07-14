/**
 * ConnectorCompatibility.ts — Sprint 6.3.0
 * Validates connector compatibility against Runtime, Workflow,
 * Governance, Architecture, and Engineering Memory layers.
 */

import type { ConnectorCompatibility, ConnectorDescriptor } from "./UCPTypes";
import { UCP_RUNTIME_VERSION, compareVersions, parseVersion } from "./ConnectorVersioning";

const REQUIRED_LAYERS = {
  runtimeVersion:          "6.3.0",
  workflowVersion:         "6.1.0",
  governanceVersion:       "6.2.2",
  architectureVersion:     "6.2.3",
  engineeringMemoryVersion:"6.2.4",
};

export function validateCompatibility(
  declared: Partial<ConnectorCompatibility>
): ConnectorCompatibility {
  const violations: string[] = [];

  const check = (field: keyof typeof REQUIRED_LAYERS, value: string | undefined) => {
    if (!value) {
      violations.push(`Missing ${field}`);
      return;
    }
    try {
      const required = parseVersion(REQUIRED_LAYERS[field]);
      const actual   = parseVersion(value);
      if (compareVersions(actual, required) < 0) {
        violations.push(`${field} ${value} < required ${REQUIRED_LAYERS[field]}`);
      }
    } catch {
      violations.push(`Invalid version format for ${field}: ${value}`);
    }
  };

  check("runtimeVersion",           declared.runtimeVersion);
  check("workflowVersion",          declared.workflowVersion);
  check("governanceVersion",        declared.governanceVersion);
  check("architectureVersion",      declared.architectureVersion);
  check("engineeringMemoryVersion", declared.engineeringMemoryVersion);

  return {
    runtimeVersion:           declared.runtimeVersion           ?? "",
    workflowVersion:          declared.workflowVersion          ?? "",
    governanceVersion:        declared.governanceVersion        ?? "",
    architectureVersion:      declared.architectureVersion      ?? "",
    engineeringMemoryVersion: declared.engineeringMemoryVersion ?? "",
    valid:      violations.length === 0,
    violations,
  };
}

export function defaultCompatibility(): ConnectorCompatibility {
  return validateCompatibility(REQUIRED_LAYERS);
}