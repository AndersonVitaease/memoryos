/**
 * CapabilityVersioning.ts — Engineering Sprint 7.0.2
 * Semver management for capability versions.
 */

export function bumpCapabilityVersion(current: string, type: "patch" | "minor" | "major"): string {
  const parts = current.replace(/^v/, "").split(".").map(Number);
  const [maj, min, pat] = parts.length === 3 ? parts : [1, 0, 0];
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

export function parseVersion(v: string): { major: number; minor: number; patch: number } {
  const [major = 1, minor = 0, patch = 0] = v.replace(/^v/, "").split(".").map(Number);
  return { major, minor, patch };
}

export function isCompatible(required: string, available: string): boolean {
  const r = parseVersion(required);
  const a = parseVersion(available);
  // Major must match; available minor/patch must be >= required
  return r.major === a.major && (a.minor > r.minor || (a.minor === r.minor && a.patch >= r.patch));
}