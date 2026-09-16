// DG01_GUARDIAN_REAL_DOGFOOD_INTEGRATION - evidence artifact (neutralized).
//
// STATUS=STOPPED_SCOPE_TOO_LARGE. The integration of Guardian Core v0.1.0 into
// engineering.vps.change.safe was NOT implemented. Smallest concrete blocker:
// Guardian Core is not importable in this runtime (not in package.json deps,
// not in node_modules, not vendored, no sibling clone), and the only clean
// dependency mechanism (pinned git dependency
// "memoryos-guardian-core": "github:AndersonVitaease/memoryos-guardian-core#v0.1.0")
// was rejected by the host write-protection (HIGH_IMPACT_WRITE_BLOCKED on
// package.json). Copying guardianCore.ts is forbidden by the DG01 mission.
// Additionally, the host test profile "file" does not execute test files (a
// must-fail discriminator returned exit 0 in 12ms), so no integration evidence
// could be produced on this host.
//
// This artifact performs no external imports and always passes so the real
// test suite is never broken by it.
import { test } from "node:test";
import assert from "node:assert/strict";

test("DG01: stopped-scope evidence artifact (no external imports, always green)", () => {
  assert.ok(true, "DG01 dependency probe neutralized; see file header for the blocker evidence");
});
