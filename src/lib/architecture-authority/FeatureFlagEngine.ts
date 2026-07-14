/**
 * FeatureFlagEngine.ts — Sprint 6.2.3
 * Every architectural change is born behind a Feature Flag (disabled by default).
 * No architectural change goes directly to production.
 */

import type { FeatureFlag } from "./AATypes";

export class FeatureFlagEngine {
  private readonly _flags = new Map<string, FeatureFlag>();

  create(proposalId: string, objective: string): FeatureFlag {
    const key = this._keyFor(objective);
    if (this._flags.has(key)) return this._flags.get(key)!;

    const flag: FeatureFlag = {
      key,
      enabled:     false,   // always starts disabled
      description: `Architecture change: ${objective.slice(0, 80)}`,
      proposalId,
      createdAt:   Date.now(),
      enabledAt:   null,
    };
    this._flags.set(key, flag);
    return flag;
  }

  enable(key: string): boolean {
    const flag = this._flags.get(key);
    if (!flag) return false;
    flag.enabled   = true;
    flag.enabledAt = Date.now();
    return true;
  }

  disable(key: string): boolean {
    const flag = this._flags.get(key);
    if (!flag) return false;
    flag.enabled  = false;
    flag.enabledAt = null;
    return true;
  }

  isEnabled(key: string): boolean {
    return this._flags.get(key)?.enabled ?? false;
  }

  all(): FeatureFlag[] { return [...this._flags.values()]; }

  private _keyFor(objective: string): string {
    const slug = objective.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join(".");
    return `architecture.${slug}`;
  }
}