/**
 * Connector Compatibility (Sprint 30)
 *
 * Verificação de compatibilidade de SDK, versão e MemoryOS.
 *
 * SDK Compatibility:      verifica sdkCompatibility vs targetSdkVersion
 * Version Compatibility:  compara duas versões semânticas
 * MemoryOS Compatibility: verifica minimumMemoryOSVersion
 */

import { SDK_VERSION, deepFreeze } from "./registryContracts.js";

// === Version Parsing ===

export function parseVersion(version) {
  if (typeof version !== "string") return null;
  const parts = version.split(".");
  if (parts.length !== 3) return null;
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parseInt(parts[2], 10);
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null;
  if (major < 0 || minor < 0 || patch < 0) return null;
  return { major, minor, patch };
}

export function compareVersions(v1, v2) {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  if (!p1 || !p2) return null;
  if (p1.major !== p2.major) return p1.major - p2.major;
  if (p1.minor !== p2.minor) return p1.minor - p2.minor;
  return p1.patch - p2.patch;
}

// === SDK Compatibility ===

export function parseSdkCompatibility(compat) {
  if (typeof compat !== "string" || compat.length === 0) return null;
  const match = compat.match(/^(>=|<=|>|<|=)(.+)$/);
  if (!match) {
    const parsed = parseVersion(compat.trim());
    if (!parsed) return null;
    return { operator: "=", version: compat.trim() };
  }
  const operator = match[1];
  const version = match[2].trim();
  if (!parseVersion(version)) return null;
  return { operator, version };
}

export function checkSdkCompatibility(connector, targetSdkVersion) {
  if (!connector || typeof targetSdkVersion !== "string") return false;
  const spec = parseSdkCompatibility(connector.sdkCompatibility);
  if (!spec) return false;
  const cmp = compareVersions(targetSdkVersion, spec.version);
  if (cmp === null) return false;
  switch (spec.operator) {
    case "=": return cmp === 0;
    case ">": return cmp > 0;
    case ">=": return cmp >= 0;
    case "<": return cmp < 0;
    case "<=": return cmp <= 0;
    default: return false;
  }
}

// === Version Compatibility ===

export function checkVersionCompatibility(version1, version2) {
  const cmp = compareVersions(version1, version2);
  if (cmp === null) return false;
  return cmp === 0;
}

export function isVersionNewer(v1, v2) {
  const cmp = compareVersions(v1, v2);
  return cmp !== null && cmp > 0;
}

export function isVersionOlder(v1, v2) {
  const cmp = compareVersions(v1, v2);
  return cmp !== null && cmp < 0;
}

// === MemoryOS Compatibility ===

export function checkMemoryOSCompatibility(connector, memoryOSVersion) {
  if (!connector || typeof memoryOSVersion !== "string") return false;
  const minVersion = connector.minimumMemoryOSVersion || "1.0.0";
  const cmp = compareVersions(memoryOSVersion, minVersion);
  if (cmp === null) return false;
  return cmp >= 0;
}

// === Full Compatibility Check ===

export function isCompatible(connector, config = {}) {
  if (!connector) {
    return deepFreeze({ compatible: false, sdkCompatible: false, memoryOSCompatible: false, reason: "connector is null" });
  }

  const targetSdk = config.sdkVersion || SDK_VERSION;
  const targetMOS = config.memoryOSVersion || "1.0.0";

  const sdkOk = checkSdkCompatibility(connector, targetSdk);
  const mosOk = checkMemoryOSCompatibility(connector, targetMOS);

  return deepFreeze({
    compatible: sdkOk && mosOk,
    sdkCompatible: sdkOk,
    memoryOSCompatible: mosOk,
    connectorId: connector.connectorId,
    targetSdkVersion: targetSdk,
    targetMemoryOSVersion: targetMOS,
  });
}