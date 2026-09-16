import { test } from "node:test";
import assert from "node:assert/strict";
import { runVpsReconcile, type VpsReconcileDeps } from "../src/vpsReconcile.ts";

// SPRINT VPS-RECONCILE-01 — engineering.vps.reconcile (READ-ONLY drift detection MVP).
// All tests inject FAKE deps: no filesystem, no env, no network, no LLM, no SSH/shell,
// no Dokploy calls, zero mutation. Fake values are obviously synthetic. Core invariant
// under test: absence of evidence is NEVER drift (undeterminable comparisons stay
// UNKNOWN and never produce a mismatch finding).

const CURRENT_RELEASE = "eng-mcp-candidate:candidate-20260831142724456-935f05adf412";
const PROD_IMAGE_ID = "sha256:8e361c2d-fake";
const PROD_CATALOG_HASH = "85049df64a70e0a69009d1ee03306498f52dc24f1ffe2eafc524bb7985c14ca0";
const PROD_CATALOG_VERSION = "eng-mcp-tools-v48";
const PROD_TOOL_COUNT = 48;

const expectedState = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  currentRelease: CURRENT_RELEASE,
  productionImageId: PROD_IMAGE_ID,
  sourceHash: "935f05ad-fake",
  productionCatalogHash: PROD_CATALOG_HASH,
  toolCount: PROD_TOOL_COUNT,
  catalogVersion: PROD_CATALOG_VERSION,
  deployStatus: "PASS",
  smokeStatus: "PASS",
  rollbackStatus: "PASS",
  ...over,
});

const catalog = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  catalogHash: PROD_CATALOG_HASH,
  catalogVersion: PROD_CATALOG_VERSION,
  toolCount: PROD_TOOL_COUNT,
  ...over,
});

const container = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  image: CURRENT_RELEASE,
  imageId: PROD_IMAGE_ID,
  running: true,
  ...over,
});

const run = (over: VpsReconcileDeps = {}): Promise<Record<string, unknown>> =>
  runVpsReconcile({
    readReleaseState: over.readReleaseState ?? (async () => expectedState()),
    inspectContainer: over.inspectContainer ?? (async () => container() as never),
    readCatalog: over.readCatalog ?? (async () => catalog() as never),
  }) as Promise<Record<string, unknown>>;

const findingsOf = (result: Record<string, unknown>): Array<Record<string, unknown>> =>
  result.findings as Array<Record<string, unknown>>;

const hasFinding = (result: Record<string, unknown>, code: string): boolean =>
  findingsOf(result).some((f) => f.code === code);

test("01 full agreement between expected and actual -> IN_SYNC, zero findings", async () => {
  const result = await run();
  assert.equal(result.status, "IN_SYNC");
  assert.deepEqual(findingsOf(result).map((f) => f.code), ["ROLLBACK_DETECTED"]);
  assert.equal(result.mutationPerformed, false);
  const expected = result.expected as Record<string, unknown>;
  assert.equal(expected.currentRelease, CURRENT_RELEASE);
  assert.equal(expected.productionCatalogHash, PROD_CATALOG_HASH);
  assert.equal(expected.toolCount, PROD_TOOL_COUNT);
  const actual = result.actual as Record<string, unknown>;
  assert.deepEqual(actual.catalog, catalog());
  assert.deepEqual(actual.container, container());
});

test("02 image mismatch -> DRIFTED + IMAGE_MISMATCH (critical) with expected/actual evidence", async () => {
  const result = await run({ inspectContainer: async () => container({ image: "eng-mcp-candidate:candidate-OTHER" }) as never });
  assert.equal(result.status, "DRIFTED");
  assert.ok(hasFinding(result, "IMAGE_MISMATCH"));
  const finding = findingsOf(result).find((f) => f.code === "IMAGE_MISMATCH") as Record<string, unknown>;
  assert.equal(finding.severity, "critical");
  assert.equal(finding.expected, CURRENT_RELEASE);
  assert.equal(finding.actual, "eng-mcp-candidate:candidate-OTHER");
  assert.equal(result.mutationPerformed, false);
});

test("03 imageId mismatch -> DRIFTED + IMAGE_ID_MISMATCH", async () => {
  const result = await run({ inspectContainer: async () => container({ imageId: "sha256:stale-fake" }) as never });
  assert.equal(result.status, "DRIFTED");
  assert.ok(hasFinding(result, "IMAGE_ID_MISMATCH"));
});

test("04 catalog hash mismatch -> DRIFTED + CATALOG_HASH_MISMATCH", async () => {
  const result = await run({ readCatalog: async () => catalog({ catalogHash: "deadbeef-fake" }) as never });
  assert.equal(result.status, "DRIFTED");
  const finding = findingsOf(result).find((f) => f.code === "CATALOG_HASH_MISMATCH") as Record<string, unknown>;
  assert.equal(finding.severity, "critical");
  assert.equal(finding.expected, PROD_CATALOG_HASH);
  assert.equal(finding.actual, "deadbeef-fake");
});

test("05 catalog version mismatch -> DRIFTED + CATALOG_VERSION_MISMATCH", async () => {
  const result = await run({ readCatalog: async () => catalog({ catalogVersion: "eng-mcp-tools-v49" }) as never });
  assert.equal(result.status, "DRIFTED");
  assert.ok(hasFinding(result, "CATALOG_VERSION_MISMATCH"));
});

test("06 toolCount mismatch -> DRIFTED + TOOL_COUNT_MISMATCH", async () => {
  const result = await run({ readCatalog: async () => catalog({ toolCount: 49 }) as never });
  assert.equal(result.status, "DRIFTED");
  const finding = findingsOf(result).find((f) => f.code === "TOOL_COUNT_MISMATCH") as Record<string, unknown>;
  assert.equal(finding.expected, PROD_TOOL_COUNT);
  assert.equal(finding.actual, 49);
});

test("07 container not running -> DRIFTED + CONTAINER_NOT_RUNNING (critical)", async () => {
  const result = await run({ inspectContainer: async () => container({ running: false }) as never });
  assert.equal(result.status, "DRIFTED");
  const finding = findingsOf(result).find((f) => f.code === "CONTAINER_NOT_RUNNING") as Record<string, unknown>;
  assert.equal(finding.severity, "critical");
  assert.equal(finding.expected, true);
  assert.equal(finding.actual, false);
});

test("08 no expected state AND no actual state -> UNKNOWN, never DRIFTED", async () => {
  const result = await run({
    readReleaseState: async () => null,
    inspectContainer: async () => null,
    readCatalog: async () => null,
  });
  assert.equal(result.status, "UNKNOWN");
  assert.ok(hasFinding(result, "EXPECTED_STATE_INCOMPLETE"));
  assert.ok(hasFinding(result, "ACTUAL_STATE_UNAVAILABLE"));
  assert.equal(findingsOf(result).filter((f) => f.severity === "critical").length, 0);
  assert.equal(result.mutationPerformed, false);
});

test("09 expected present but actual unavailable -> UNKNOWN, never DRIFTED (absence of evidence is not drift)", async () => {
  const result = await run({
    inspectContainer: async () => null,
    readCatalog: async () => null,
  });
  assert.equal(result.status, "UNKNOWN");
  assert.ok(hasFinding(result, "ACTUAL_STATE_UNAVAILABLE"));
  assert.equal(findingsOf(result).filter((f) => f.code === "IMAGE_MISMATCH" || f.code === "CATALOG_HASH_MISMATCH" || f.code === "TOOL_COUNT_MISMATCH").length, 0);
});

test("10 non-object release-state (array) -> EXPECTED_STATE_INCOMPLETE, no throw", async () => {
  const result = await run({ readReleaseState: async () => [1, 2, 3], inspectContainer: async () => null, readCatalog: async () => null });
  assert.equal(result.status, "UNKNOWN");
  assert.ok(hasFinding(result, "EXPECTED_STATE_INCOMPLETE"));
});

test("11 readReleaseState rejection is swallowed -> treated as unavailable, no throw", async () => {
  const result = await run({
    readReleaseState: async () => { throw new Error("FAKE_FS_FAILURE"); },
    inspectContainer: async () => null,
    readCatalog: async () => null,
  });
  assert.equal(result.status, "UNKNOWN");
  assert.ok(hasFinding(result, "EXPECTED_STATE_INCOMPLETE"));
});

test("12 container evidence absent but catalog matches -> IN_SYNC (one side missing never drifts)", async () => {
  const result = await run({ inspectContainer: async () => null });
  assert.equal(result.status, "IN_SYNC");
  assert.equal(findingsOf(result).filter((f) => f.severity === "critical").length, 0);
  const actual = result.actual as Record<string, unknown>;
  assert.equal(actual.container, null);
  assert.notEqual(actual.catalog, null);
});

test("13 inspectContainer rejection is swallowed -> catalog-only comparison still works", async () => {
  const result = await run({ inspectContainer: async () => { throw new Error("FAKE_DOCKER_FAILURE"); } });
  assert.equal(result.status, "IN_SYNC");
  assert.equal(findingsOf(result).filter((f) => f.severity === "critical").length, 0);
});

test("14 deployStatus IN_PROGRESS -> warning DEPLOY_IN_PROGRESS, status stays IN_SYNC", async () => {
  const result = await run({ readReleaseState: async () => expectedState({ deployStatus: "IN_PROGRESS" }) });
  assert.equal(result.status, "IN_SYNC");
  const finding = findingsOf(result).find((f) => f.code === "DEPLOY_IN_PROGRESS") as Record<string, unknown>;
  assert.equal(finding.severity, "warning");
});

test("15 deployStatus FAIL -> warning DEPLOY_FAILED, status stays IN_SYNC", async () => {
  const result = await run({ readReleaseState: async () => expectedState({ deployStatus: "FAIL" }) });
  assert.equal(result.status, "IN_SYNC");
  assert.ok(hasFinding(result, "DEPLOY_FAILED"));
});

test("16 rollbackStatus PASS -> info ROLLBACK_DETECTED", async () => {
  const result = await run();
  assert.ok(hasFinding(result, "ROLLBACK_DETECTED"));
  const finding = findingsOf(result).find((f) => f.code === "ROLLBACK_DETECTED") as Record<string, unknown>;
  assert.equal(finding.severity, "info");
});

test("17 productionImageId falls back to legacy imageId key -> comparison still determined", async () => {
  const result = await run({
    readReleaseState: async () => ({ imageId: PROD_IMAGE_ID }),
    inspectContainer: async () => ({ imageId: PROD_IMAGE_ID }) as never,
    readCatalog: async () => null,
  });
  assert.equal(result.status, "IN_SYNC");
  const expected = result.expected as Record<string, unknown>;
  assert.equal(expected.productionImageId, PROD_IMAGE_ID);
  assert.ok(hasFinding(result, "EXPECTED_STATE_INCOMPLETE") === false);
});

test("18 comparable field present but counterpart undefined -> UNKNOWN, never DRIFTED", async () => {
  const result = await run({
    readReleaseState: async () => expectedState(),
    inspectContainer: async () => null,
    readCatalog: async () => catalog({ catalogHash: undefined, catalogVersion: undefined, toolCount: undefined }) as never,
  });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(findingsOf(result).filter((f) => f.severity === "critical").length, 0);
});

test("19 mutation is structurally impossible: mutationPerformed is false for every outcome", async () => {
  for (const deps of [
    {},
    { readReleaseState: async () => null },
    { inspectContainer: async () => container({ running: false }) as never },
    { readCatalog: async () => catalog({ toolCount: 999 }) as never },
  ] as VpsReconcileDeps[]) {
    const result = await run(deps);
    assert.equal(result.mutationPerformed, false);
  }
});
