/**
 * EngineeringPermissionEngine.ts — Sprint 6.2.2
 * Enforces the 5-level permission model: READ → PLAN → SIMULATE → IMPLEMENT → DEPLOY.
 * DEPLOY is disabled by default. IMPLEMENT requires explicit approval on record.
 */

import type { PermissionLevel, RiskLevel } from "./GovernanceTypes";

export interface PermissionCheck {
  granted:   boolean;
  level:     PermissionLevel;
  reason:    string;
  requires?: string;
}

const PERMISSION_CAPABILITIES: Record<PermissionLevel, string[]> = {
  READ:      ["Repository inspection", "Knowledge Graph inspection", "Connector inspection", "Diagnostics"],
  PLAN:      ["Engineering plans", "Architecture proposals", "Risk analysis", "Dependency analysis"],
  SIMULATE:  ["Generate patches", "Estimate impact", "Run dry-run", "Regression simulation"],
  IMPLEMENT: ["Apply code changes", "Create files", "Modify non-protected files"],
  DEPLOY:    ["Production deployment", "Environment promotion"],
};

export class EngineeringPermissionEngine {
  // DEPLOY disabled globally
  private _deployEnabled = false;

  allowDeploy(enabled: boolean) { this._deployEnabled = enabled; }

  check(
    requested: PermissionLevel,
    riskLevel: RiskLevel,
    hasHumanApproval: boolean,
    protectedFilesHit: number,
  ): PermissionCheck {
    // DEPLOY always blocked unless explicitly enabled
    if (requested === "DEPLOY" && !this._deployEnabled) {
      return { granted: false, level: "DEPLOY", reason: "DEPLOY is disabled by default — requires explicit platform unlock" };
    }

    // READ, PLAN, SIMULATE — always allowed
    if (requested === "READ" || requested === "PLAN" || requested === "SIMULATE") {
      return { granted: true, level: requested, reason: `${requested} is always permitted` };
    }

    // IMPLEMENT — requires human approval for CRITICAL or protected files
    if (requested === "IMPLEMENT") {
      if (riskLevel === "CRITICAL") {
        return { granted: false, level: "IMPLEMENT", reason: "CRITICAL risk — IMPLEMENT blocked automatically", requires: "Human approval of governance proposal" };
      }
      if (protectedFilesHit > 0 && !hasHumanApproval) {
        return { granted: false, level: "IMPLEMENT", reason: `${protectedFilesHit} protected component(s) require human approval before IMPLEMENT`, requires: "Human approval" };
      }
      return { granted: true, level: "IMPLEMENT", reason: hasHumanApproval ? "IMPLEMENT authorized — human approval on record" : "IMPLEMENT authorized — no protected components affected" };
    }

    return { granted: false, level: requested, reason: "Unknown permission level" };
  }

  capabilities(level: PermissionLevel): string[] {
    return PERMISSION_CAPABILITIES[level] ?? [];
  }

  allLevels(): PermissionLevel[] {
    return ["READ", "PLAN", "SIMULATE", "IMPLEMENT", "DEPLOY"];
  }
}