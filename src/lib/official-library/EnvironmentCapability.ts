/**
 * EnvironmentCapability.ts — Sprint EF-7.2.6
 *
 * Pure representation of execution environment capabilities.
 * No logic. No detection. No side effects.
 * Providers declare; RuntimeReason consumes.
 *
 * SRP: capability identity only.
 * Immutable value objects.
 */

export const EnvironmentCapability = {
  BROWSER:   "Browser",
  NODE:      "Node",
  WORKER:    "Worker",
  ELECTRON:  "Electron",
  CLI:       "CLI",
  CLOUD:     "Cloud",
  BASE44:    "Base44",
  UNKNOWN:   "Unknown",
} as const;

export type EnvironmentCapabilityType =
  typeof EnvironmentCapability[keyof typeof EnvironmentCapability];

/** Supported capabilities per environment. */
export const ENVIRONMENT_FEATURES: Record<EnvironmentCapabilityType, readonly string[]> = {
  [EnvironmentCapability.BROWSER]:  ["dom", "fetch", "import.meta.glob", "sessionStorage"],
  [EnvironmentCapability.NODE]:     ["fs", "path", "process", "require"],
  [EnvironmentCapability.WORKER]:   ["fetch", "self"],
  [EnvironmentCapability.ELECTRON]: ["dom", "fs", "path", "process"],
  [EnvironmentCapability.CLI]:      ["process", "fs", "path"],
  [EnvironmentCapability.CLOUD]:    ["fetch", "env"],
  [EnvironmentCapability.BASE44]:   ["base44-api"],
  [EnvironmentCapability.UNKNOWN]:  [],
};