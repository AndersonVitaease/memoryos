/**
 * RuntimeEnvironment.ts — Sprint EF-7.2.5
 *
 * Represents the execution environment.
 * Provider declares its environment — RuntimeReason consumes it.
 * Zero environment detection in RuntimeReason.
 *
 * SRP: environment identity only.
 * Immutable enum-style constants.
 */

export const RuntimeEnvironment = {
  BROWSER:   "Browser",
  NODE:      "Node",
  BASE44:    "Base44",
  CLOUD:     "Cloud",
  WORKER:    "Worker",
  CLI:       "CLI",
  ELECTRON:  "Electron",
  UNKNOWN:   "Unknown",
} as const;

export type RuntimeEnvironmentType = typeof RuntimeEnvironment[keyof typeof RuntimeEnvironment];

/** Detect the current environment automatically (used only by providers — never by RuntimeReason). */
export function detectEnvironment(): RuntimeEnvironmentType {
  if (typeof import.meta !== "undefined" && typeof (import.meta as any).glob === "function") {
    return RuntimeEnvironment.BROWSER;
  }
  if (typeof process !== "undefined" && typeof process.versions?.node === "string") {
    return RuntimeEnvironment.NODE;
  }
  if (typeof globalThis !== "undefined" && (globalThis as any).__BASE44__) {
    return RuntimeEnvironment.BASE44;
  }
  return RuntimeEnvironment.UNKNOWN;
}