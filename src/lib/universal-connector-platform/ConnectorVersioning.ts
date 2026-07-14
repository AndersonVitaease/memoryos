/**
 * ConnectorVersioning.ts — Sprint 6.3.0
 * Version parsing, comparison, compatibility ranges.
 */

import type { ConnectorVersion } from "./UCPTypes";

export function parseVersion(label: string): ConnectorVersion {
  const parts = label.split(".").map(Number);
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
    label,
  };
}

export function versionLabel(v: ConnectorVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function compareVersions(a: ConnectorVersion, b: ConnectorVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function isCompatibleWith(
  connectorVersion: ConnectorVersion,
  runtimeMinVersion: ConnectorVersion
): boolean {
  return compareVersions(connectorVersion, runtimeMinVersion) >= 0;
}

export const UCP_RUNTIME_VERSION = parseVersion("6.3.0");
export const UCP_MIN_CONNECTOR_VERSION = parseVersion("1.0.0");