// DG01R REAL-CORE-IN-OFFICIAL-IMAGE discriminator (test-only artifact; zero production changes).
//
// Why this file exists: the existing DG01R import probe (vps-change-safe-guardian.test.ts) is
// honest but two-branch - it passes BOTH when the real frozen Guardian Core loads AND when the
// import fails with a structured unavailability reason. A green suite therefore does not, by
// itself, prove the real Core executed inside the official test image. This file is the hard
// discriminator requested by the DG01R validation mission ("214/214 ou maior se algum probe
// valido tiver sido acrescentado"):
//
//   Test 1 FAILS unless loadGuardianCore() - the exact production resolution path used by
//   runVpsChangeSafe Phase 5 (src/vpsChangeSafe.ts -> src/guardianVpsAdapter.ts) - yields a
//   functional real Core in THIS runtime, proven by a refusal round trip through the REAL
//   executeGuardianIntent with apply provably unreachable.
//
//   Test 2 pins the installed package identity by reading node_modules/memoryos-guardian-core/
//   package.json directly from THIS runtime's node_modules.
//
// Documented fact (not worked around): memoryos-guardian-core v0.1.0 ships NO main and NO
// exports entry, so the bare specifier "memoryos-guardian-core" cannot resolve under Node.
// The REAL frozen module is the explicit source subpath "memoryos-guardian-core/src/guardianCore.ts"
// - the same convention the production adapter uses. Importing that subpath imports the REAL
// frozen source (commit e10626c3787a3f4c659a76fa2efb545c9b1f770a, pinned in eng-mcp/package.json
// and package-lock.json "resolved" + integrity). No mirror, no fallback, no substitute is used
// as proof here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGuardianCore } from "../src/guardianVpsAdapter.ts";

test("DG01R REAL CORE discriminator: frozen Guardian Core v0.1.0 loads and executes in this official test image", async () => {
  const loaded = await loadGuardianCore();
  assert.notEqual(
    loaded.core,
    null,
    `REAL CORE REQUIRED IN OFFICIAL IMAGE - loadGuardianCore() failed: ${loaded.error ?? "unknown error"}`,
  );
  const core = loaded.core;
  if (core === null) {
    assert.fail("unreachable: core must be non-null here (hard discriminator)");
  }
  assert.equal(typeof core.executeGuardianIntent, "function");

  // Functional round trip on the REAL module: refuse at the gate, prove the refusal crosses
  // the real executeGuardianIntent verbatim, and prove apply is unreachable (zero mutation).
  let applyReached = false;
  const result = await core.executeGuardianIntent(
    { probe: "DG01R_REAL_CORE_DISCRIMINATOR" },
    {
      async bind() {
        return {
          outcome: "NOT_EXECUTED",
          stage: "ELIGIBILITY",
          refusal: "BLOCKED",
          effect: { dispatched: false, state: "NONE_PROVEN" },
          reasons: ["DG01R_REAL_CORE_REFUSAL"],
        };
      },
      async apply() {
        applyReached = true;
        throw new Error("DG01R_REAL_CORE_APPLY_MUST_BE_UNREACHABLE");
      },
    },
  );
  assert.equal(result.outcome, "NOT_EXECUTED");
  assert.equal(result.effect.dispatched, false);
  assert.deepEqual(result.reasons, ["DG01R_REAL_CORE_REFUSAL"]);
  assert.equal(applyReached, false);
});

test("DG01R REAL CORE identity: installed package is memoryos-guardian-core@0.1.0", () => {
  const manifestUrl = new URL("../node_modules/memoryos-guardian-core/package.json", import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as {
    name?: string;
    version?: string;
    gitHead?: string;
  };
  assert.equal(manifest.name, "memoryos-guardian-core");
  assert.equal(manifest.version, "0.1.0");
  // The pinned tarball is the codeload archive of commit
  // e10626c3787a3f4c659a76fa2efb545c9b1f770a (eng-mcp/package.json dependency +
  // package-lock.json "resolved"/"integrity"). A GitHub codeload tarball carries no commit
  // metadata inside package.json (v0.1.0 has no gitHead field), so the resolved commit is
  // proven by the lock's resolved URL; if a commit marker is ever present, pin it here.
  if (typeof manifest.gitHead === "string" && manifest.gitHead.length > 0) {
    assert.equal(manifest.gitHead, "e10626c3787a3f4c659a76fa2efb545c9b1f770a");
  }
});
