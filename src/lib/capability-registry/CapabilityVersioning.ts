/**
 * CapabilityVersioning.ts — P9 Capability Registry
 * Versionamento de capabilities com historico e changelog.
 * MDS v2.0 · P9 · Version: 1.0.0
 */

import type { VersionRecord, VersionBump, VersioningReport } from "./CapabilityRegistryTypes";

const GLOBAL_KEY = "__MEMORY_OS_VERSIONING__";

function bumpVersion(version: string, bump: VersionBump): string {
  const [major, minor, patch] = version.split(".").map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

class CapabilityVersioningImpl {
  private readonly history = new Map<string, VersionRecord[]>();
  private publishCount = 0;

  // Seed official v1.0.0 baselines
  private seeded = false;
  private seed(): void {
    if (this.seeded) return;
    this.seeded = true;
    const ids = [
      "com.memoryos.financial-specialist",
      "com.memoryos.legal-specialist",
      "com.memoryos.medical-specialist",
      "com.memoryos.tech-specialist",
      "com.memoryos.financial",
      "com.memoryos.legal",
      "com.memoryos.brazilian-government",
      "com.memoryos.email-connector",
      "com.memoryos.filesystem-connector",
      "com.memoryos.database-connector",
    ];
    const publishedAt = "2026-08-01T00:00:00.000Z";
    for (const id of ids) {
      this.history.set(id, [{
        capabilityId: id,
        version: "1.0.0",
        previousVersion: null,
        bump: "major",
        publishedAt,
        changelog: "Initial release — MDS v2.0 Engineering First",
        deprecated: false,
      }]);
    }
  }

  publish(capabilityId: string, bump: VersionBump, changelog: string): VersionRecord {
    this.seed();
    const records = this.history.get(capabilityId) ?? [];
    const currentVersion = records.length > 0 ? records[records.length - 1].version : "0.0.0";
    const newVersion = bumpVersion(currentVersion, bump);

    const record: VersionRecord = Object.freeze({
      capabilityId,
      version: newVersion,
      previousVersion: currentVersion === "0.0.0" ? null : currentVersion,
      bump,
      publishedAt: new Date().toISOString(),
      changelog,
      deprecated: false,
    });

    this.history.set(capabilityId, [...records, record]);
    this.publishCount++;
    return record;
  }

  deprecate(capabilityId: string, version: string): boolean {
    this.seed();
    const records = this.history.get(capabilityId);
    if (!records) return false;
    const idx = records.findIndex((r) => r.version === version);
    if (idx === -1) return false;
    const updated = records.map((r, i) =>
      i === idx ? Object.freeze({ ...r, deprecated: true }) : r
    );
    this.history.set(capabilityId, updated);
    return true;
  }

  getReport(capabilityId: string): VersioningReport | null {
    this.seed();
    const records = this.history.get(capabilityId);
    if (!records || records.length === 0) return null;
    return Object.freeze({
      capabilityId,
      currentVersion: records[records.length - 1].version,
      history: Object.freeze([...records]),
      totalVersions: records.length,
    });
  }

  listAll(): readonly string[] {
    this.seed();
    return Array.from(this.history.keys());
  }

  getPublishCount(): number { return this.publishCount; }
}

function getVersioning(): CapabilityVersioningImpl {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new CapabilityVersioningImpl();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

export const CapabilityVersioning = getVersioning();