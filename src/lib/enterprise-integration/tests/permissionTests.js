/**
 * Permission Manager Tests (Sprint 27)
 * grant, revoke, check, resolve, checkWithScopes, reset.
 */

import { createPermissionManager } from "../permissionManager.js";
import { _resetIdsForTests } from "../contracts.js";

export const PERMISSION_TESTS = [
  {
    id: 39,
    name: "grant stores and returns permission",
    run: () => {
      _resetIdsForTests();
      const pm = createPermissionManager();
      const perm = pm.grant({ scope: "user", scopeId: "u1", connectorId: "c1", type: "ALLOW" });
      return { perm, count: pm.count() };
    },
    assert: ({ perm, count }) =>
      perm.permissionId === "eil-perm-1" && perm.type === "ALLOW" && count === 1,
  },
  {
    id: 40,
    name: "check returns ALLOW for granted permission",
    run: () => {
      _resetIdsForTests();
      const pm = createPermissionManager();
      pm.grant({ scope: "user", scopeId: "u1", connectorId: "c1", type: "ALLOW" });
      return { result: pm.check("user", "u1", "c1") };
    },
    assert: ({ result }) => result === "ALLOW",
  },
  {
    id: 41,
    name: "check returns INHERIT for ungranted permission",
    run: () => {
      const pm = createPermissionManager();
      return { result: pm.check("user", "u1", "c1") };
    },
    assert: ({ result }) => result === "INHERIT",
  },
  {
    id: 42,
    name: "revoke removes permission",
    run: () => {
      _resetIdsForTests();
      const pm = createPermissionManager();
      const perm = pm.grant({ scope: "user", scopeId: "u1", connectorId: "c1", type: "DENY" });
      const revoked = pm.revoke(perm.permissionId);
      return { revoked, check: pm.check("user", "u1", "c1") };
    },
    assert: ({ revoked, check }) =>
      revoked === true && check === "INHERIT",
  },
  {
    id: 43,
    name: "resolve returns DENY when DENY and ALLOW present at same scope",
    run: () => {
      const pm = createPermissionManager();
      const result = pm.resolve([
        { scope: "user", scopeId: "u1", type: "ALLOW" },
        { scope: "user", scopeId: "u1", type: "DENY" },
      ]);
      return { result };
    },
    assert: ({ result }) => result === "DENY",
  },
  {
    id: 44,
    name: "resolve returns ALLOW when only ALLOW present",
    run: () => {
      const pm = createPermissionManager();
      const result = pm.resolve([
        { scope: "company", scopeId: "co1", type: "ALLOW" },
      ]);
      return { result };
    },
    assert: ({ result }) => result === "ALLOW",
  },
  {
    id: 45,
    name: "resolve returns INHERIT for empty array",
    run: () => {
      const pm = createPermissionManager();
      return { result: pm.resolve([]) };
    },
    assert: ({ result }) => result === "INHERIT",
  },
  {
    id: 46,
    name: "resolve — more specific scope wins (user DENY overrides company ALLOW)",
    run: () => {
      const pm = createPermissionManager();
      const result = pm.resolve([
        { scope: "company", scopeId: "co1", type: "ALLOW" },
        { scope: "user", scopeId: "u1", type: "DENY" },
      ]);
      return { result };
    },
    assert: ({ result }) => result === "DENY",
  },
  {
    id: 47,
    name: "checkWithScopes aggregates across multiple scope levels",
    run: () => {
      _resetIdsForTests();
      const pm = createPermissionManager();
      pm.grant({ scope: "company", scopeId: "co1", connectorId: "c1", type: "ALLOW" });
      pm.grant({ scope: "user", scopeId: "u1", connectorId: "c1", type: "DENY" });
      const result = pm.checkWithScopes(
        [
          { scope: "company", scopeId: "co1" },
          { scope: "user", scopeId: "u1" },
        ],
        "c1"
      );
      return { result };
    },
    assert: ({ result }) => result === "DENY",
  },
  {
    id: 48,
    name: "reset clears all permissions",
    run: () => {
      _resetIdsForTests();
      const pm = createPermissionManager();
      pm.grant({ scope: "user", scopeId: "u1", connectorId: "c1", type: "ALLOW" });
      pm.grant({ scope: "tenant", scopeId: "t1", connectorId: "c1", type: "DENY" });
      pm.reset();
      return { count: pm.count() };
    },
    assert: ({ count }) => count === 0,
  },
];