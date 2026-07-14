/**
 * MigrationPlanner.ts — Sprint 6.2.3
 * Generates Migration Plan + Rollback + Compatibility Layer + Deprecation Plan whenever a breaking change exists.
 */

import type { MigrationPlan, BreakingChange } from "./AATypes";

let _seq = 0;
function makeId(): string { return `migration_${Date.now()}_${++_seq}`; }

export class MigrationPlanner {
  generate(proposalId: string, objective: string, breakingChanges: BreakingChange[], affectedComponents: string[]): MigrationPlan {
    const steps: string[] = [
      `1. Run full Regression Shield before any changes (baseline must pass 5/5)`,
      `2. Read all affected files: ${affectedComponents.join(", ")}`,
      `3. Implement behind a Feature Flag (disabled by default)`,
      `4. Apply changes in isolation — no side effects to stable components`,
      `5. Run Regression Shield after each isolated change`,
      `6. Enable Feature Flag in staging environment only`,
      `7. Run full acceptance suite with Feature Flag enabled`,
      `8. Await human review and final approval`,
      `9. Promote to production only after approval`,
    ];

    const rollbackSteps: string[] = [
      `1. Disable Feature Flag immediately`,
      `2. Revert all modified files to pre-implementation state`,
      `3. Verify ${affectedComponents.join(", ")} return to original behavior`,
      `4. Run Regression Shield — must restore to 5/5`,
      `5. Archive this migration plan with ROLLED_BACK status`,
    ];

    const compatibilityLayer = breakingChanges.length > 0
      ? `Adapter pattern: wrap existing API with new interface; old signature remains callable until deprecation window ends`
      : "No compatibility layer required — no breaking changes detected";

    const deprecationPlan = breakingChanges.some(c => c.level === "HIGH" || c.level === "CRITICAL")
      ? `Deprecation window: 2 sprints minimum. Old methods remain callable with deprecation warnings. Remove only after all consumers are migrated.`
      : "No deprecation required";

    const riskReport = `Affected: ${affectedComponents.length} component(s). Breaking changes: ${breakingChanges.length} (${breakingChanges.filter(c => c.autoBlocked).length} auto-blocked). Rollback available: YES.`;

    return {
      id:                 makeId(),
      proposalId,
      steps,
      rollbackSteps,
      compatibilityLayer,
      deprecationPlan,
      riskReport,
      createdAt:          Date.now(),
    };
  }
}