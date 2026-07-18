/**
 * GovernancePolicyRegistryTests.ts
 * Unit tests for GovernancePolicyRegistry.
 *
 * Sprint: EV-1
 */

import { describe } from "@/testing/TestScenarioBuilder";
import { AssertionEngine } from "@/testing/AssertionEngine";
import { GovernancePolicyRegistry } from "@/lib/operational-knowledge/governance/GovernancePolicyRegistry";

export function registerGovernancePolicyRegistryTests(): void {
  describe("GovernancePolicyRegistry", "UNIT")

    .test("getAll() returns all policies including defaults", () => {
      const all = GovernancePolicyRegistry.getAll();
      AssertionEngine.assertTrue(all.length >= 5, "At least 5 default policies");
    })

    .test("getActive() returns only ACTIVE policies", () => {
      const active = GovernancePolicyRegistry.getActive();
      AssertionEngine.assertTrue(active.length > 0);
      for (const p of active) {
        AssertionEngine.assertEquals(p.status, "ACTIVE");
      }
    })

    .test("getById() finds GP-001", () => {
      const policy = GovernancePolicyRegistry.getById("GP-001");
      AssertionEngine.assertNotNull(policy);
      AssertionEngine.assertEquals(policy!.id, "GP-001");
    })

    .test("getById() returns undefined for unknown ID", () => {
      const policy = GovernancePolicyRegistry.getById("GP-NONEXISTENT");
      AssertionEngine.assertNull(policy ?? null);
    })

    .test("getActive() is sorted by priority (P0 first)", () => {
      const active = GovernancePolicyRegistry.getActive();
      if (active.length >= 2) {
        AssertionEngine.assertTrue(
          active[0].priority.localeCompare(active[1].priority) <= 0
        );
      }
    })

    .test("register() adds a new policy", () => {
      const before = GovernancePolicyRegistry.getAll().length;
      GovernancePolicyRegistry.register({
        name:        "Test Policy EV-1",
        description: "Created by EV-1 test suite",
        version:     "1.0",
        scope:       "GLOBAL",
        status:      "ACTIVE",
        priority:    "P4",
        rules:       [],
      });
      const after = GovernancePolicyRegistry.getAll().length;
      AssertionEngine.assertEquals(after, before + 1);
    })

    .test("count() returns correct totals", () => {
      const counts = GovernancePolicyRegistry.count();
      AssertionEngine.assertNotNull(counts);
      AssertionEngine.assertTrue(counts.total >= 5);
      AssertionEngine.assertTrue(counts.active >= 1);
    })

    .test("setStatus() changes policy status", () => {
      // Register a test policy first
      const p = GovernancePolicyRegistry.register({
        name: "Status Test Policy", description: "test", version: "1.0",
        scope: "GLOBAL", status: "ACTIVE", priority: "P4", rules: [],
      });
      const updated = GovernancePolicyRegistry.setStatus(p.id, "INACTIVE");
      AssertionEngine.assertNotNull(updated);
      AssertionEngine.assertEquals(updated!.status, "INACTIVE");
    })

    .register();
}