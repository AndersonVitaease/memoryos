/**
 * Connector Versioning (Sprint 29)
 *
 * Versionamento semântico (major.minor.patch) para Connectors.
 *
 * Comparações:
 *   equals(a, b)        — mesma versão
 *   compatible(a, b)    — mesma major version
 *   newerThan(a, b)     — a > b
 *   olderThan(a, b)     — a < b
 */

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

export function equals(v1, v2) {
  const c = compareVersions(v1, v2);
  return c !== null && c === 0;
}

export function newerThan(v1, v2) {
  const c = compareVersions(v1, v2);
  return c !== null && c > 0;
}

export function olderThan(v1, v2) {
  const c = compareVersions(v1, v2);
  return c !== null && c < 0;
}

export function compatible(v1, v2) {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  if (!p1 || !p2) return false;
  return p1.major === p2.major;
}

export function bumpMajor(version) {
  const p = parseVersion(version);
  if (!p) return null;
  return `${p.major + 1}.0.0`;
}

export function bumpMinor(version) {
  const p = parseVersion(version);
  if (!p) return null;
  return `${p.major}.${p.minor + 1}.0`;
}

export function bumpPatch(version) {
  const p = parseVersion(version);
  if (!p) return null;
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}

/**
 * SDK Compatibility parsing and evaluation.
 *
 * Supports operator-prefixed version strings: ">=1.0.0", ">1.0.0",
 * "<=2.0.0", "<2.0.0", "=1.0.0".
 *
 * parseSdkCompatibility(">=1.0.0") -> { operator: ">=", version: "1.0.0" }
 * checkSdkCompatibility(">=1.0.0", "1.5.0") -> true/false
 */

export function parseSdkCompatibility(compat) {
  if (typeof compat !== "string" || compat.length === 0) return null;
  const match = compat.match(/^(>=|<=|>|<|=)(.+)$/);
  if (!match) {
    // No operator — treat as exact match
    const parsed = parseVersion(compat.trim());
    if (!parsed) return null;
    return { operator: "=", version: compat.trim() };
  }
  const operator = match[1];
  const version = match[2].trim();
  if (!parseVersion(version)) return null;
  return { operator, version };
}

export function checkSdkCompatibility(compatString, sdkVersion) {
  const spec = parseSdkCompatibility(compatString);
  if (!spec) return false;
  const cmp = compareVersions(sdkVersion, spec.version);
  if (cmp === null) return false;
  switch (spec.operator) {
    case "=":
      return cmp === 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    default:
      return false;
  }
}

export function createVersioning() {
  return Object.freeze({
    parseVersion,
    compareVersions,
    equals,
    newerThan,
    olderThan,
    compatible,
    bumpMajor,
    bumpMinor,
    bumpPatch,
    parseSdkCompatibility,
    checkSdkCompatibility,
  });
}