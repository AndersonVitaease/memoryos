/**
 * ConnectorCertificationVersioning.ts — Engineering Sprint E-03.3
 * Manages connector version records and change detection.
 */

import type { ConnectorVersion, InvalidationTrigger } from "./CCCTypes";

// ── File-to-trigger mapping ───────────────────────────────────────────────────

const FILE_TRIGGER_MAP: Array<[RegExp, InvalidationTrigger]> = [
  [/GmailConnector\.(ts|js)$/,        "connector_changed"],
  [/EmailAliasRegistry\.ts$/,         "alias_registry_changed"],
  [/DomainRegistry\.ts$/,             "domain_registry_changed"],
  [/SmartQueryBuilder\.ts$/,          "query_builder_changed"],
  [/SmartQueryExecutor\.ts$/,         "query_executor_changed"],
  [/SmartQueryTypes\.ts$/,            "config_changed"],
  [/SemanticEmailQueryBuilder\.ts$/,  "query_builder_changed"],
  [/GmailActions\.(ts|js)$/,          "connector_changed"],
  [/GmailAdvanced\.(ts|js)$/,         "capability_changed"],
  [/Capability\.(ts|js)$/,            "capability_changed"],
  [/config\.(ts|js|json)$/,           "config_changed"],
];

export function classifyChangedFile(file: string): InvalidationTrigger | null {
  for (const [pattern, trigger] of FILE_TRIGGER_MAP) {
    if (pattern.test(file)) return trigger;
  }
  return null;
}

// ── Version builder ───────────────────────────────────────────────────────────

let _buildCounter = 1;

export function buildVersion(
  connectorId: string,
  semver: string,
  changedFiles: string[],
  author = "system",
  changelog = "",
): ConnectorVersion {
  const triggers = changedFiles
    .map((f) => classifyChangedFile(f))
    .filter(Boolean) as InvalidationTrigger[];

  return Object.freeze({
    connectorId,
    version:      semver,
    buildId:      `build-${Date.now()}-${(_buildCounter++).toString().padStart(4, "0")}`,
    commit:       `${Math.random().toString(16).slice(2, 10)}`,
    changedFiles,
    changedAt:    Date.now(),
    author,
    changelog,
    // Derived
    detectedTriggers: [...new Set(triggers)],
  });
}

// ── Semver bump ───────────────────────────────────────────────────────────────

export function bumpVersion(current: string, type: "patch" | "minor" | "major"): string {
  const parts = current.replace(/^v/, "").split(".").map(Number);
  const [maj, min, pat] = parts.length === 3 ? parts : [1, 0, 0];
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

// ── Versioning registry ───────────────────────────────────────────────────────

class VersionRegistry {
  private readonly _versions = new Map<string, ConnectorVersion[]>();

  record(v: ConnectorVersion): void {
    const list = this._versions.get(v.connectorId) ?? [];
    list.push(v);
    this._versions.set(v.connectorId, list);
  }

  getHistory(connectorId: string): readonly ConnectorVersion[] {
    return this._versions.get(connectorId) ?? [];
  }

  latest(connectorId: string): ConnectorVersion | null {
    const list = this._versions.get(connectorId) ?? [];
    return list[list.length - 1] ?? null;
  }
}

const _VK = "__CERT_VERSION_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_VK]) {
  (globalThis as unknown as Record<string, unknown>)[_VK] = new VersionRegistry();
}
export const versionRegistry: VersionRegistry = (
  globalThis as unknown as Record<string, VersionRegistry>
)[_VK];