// engineering.vps.reconcile — READ-ONLY drift detection supertool (MVP).
// EXPECTED STATE: exclusively the existing release-state.json written by the
// release runner (scripts/eng-mcp-release.mjs saveState). No new entity, no
// database, no manifest, no baseline, no DesiredStateEngine, no framework.
// ACTUAL STATE: only mechanisms that already exist (internal tool catalog;
// container inspection is injected by the registration site and defaults to
// unavailable). Absence of evidence is NEVER drift: any comparison that
// cannot be determined stays unknown and never produces a mismatch finding.
// Zero mutation (no execute/approval input exists); no LLM; no SSH/shell; no
// Base44; no Dokploy changes; no VPS changes; never writes release-state.json.
import { readFile } from "node:fs/promises";
import path from "node:path";

export type ReconcileStatus = "IN_SYNC" | "DRIFTED" | "UNKNOWN";
export type ReconcileSeverity = "critical" | "warning" | "info";

export interface ReconcileFinding {
  code: string;
  severity: ReconcileSeverity;
  expected?: unknown;
  actual?: unknown;
}

export interface ExpectedStateSnapshot {
  currentRelease?: string;
  productionImageId?: string;
  sourceHash?: string;
  productionCatalogHash?: string;
  toolCount?: number;
  catalogVersion?: string;
  deployStatus?: string;
  smokeStatus?: string;
  rollbackStatus?: string;
}

export interface ActualContainerSnapshot {
  image?: string;
  imageId?: string;
  running?: boolean;
}

export interface ActualCatalogSnapshot {
  catalogHash?: string;
  catalogVersion?: string;
  toolCount?: number;
}

export interface ActualStateSnapshot {
  container: ActualContainerSnapshot | null;
  catalog: ActualCatalogSnapshot | null;
}

export interface VpsReconcileDeps {
  readReleaseState?: () => Promise<unknown>;
  inspectContainer?: () => Promise<ActualContainerSnapshot | null>;
  readCatalog?: () => Promise<ActualCatalogSnapshot | null>;
}

const RELEASE_STATE_FILE = "release-state.json";

function pickExpected(raw: unknown): ExpectedStateSnapshot {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) return {};
  const state = raw as Record<string, unknown>;
  const str = (key: string): string | undefined => (typeof state[key] === "string" && (state[key] as string).length > 0 ? (state[key] as string) : undefined);
  const num = (key: string): number | undefined => (typeof state[key] === "number" && Number.isFinite(state[key]) ? (state[key] as number) : undefined);
  return {
    currentRelease: str("currentRelease"),
    productionImageId: str("productionImageId") ?? str("imageId"),
    sourceHash: str("sourceHash"),
    productionCatalogHash: str("productionCatalogHash"),
    toolCount: num("toolCount"),
    catalogVersion: str("catalogVersion"),
    deployStatus: str("deployStatus"),
    smokeStatus: str("smokeStatus"),
    rollbackStatus: str("rollbackStatus")
  };
}

export async function defaultReadReleaseState(): Promise<unknown> {
  const root = process.env.ENG_MCP_REPOSITORY_ROOT;
  if (!root) return null;
  try {
    return JSON.parse(await readFile(path.join(root, RELEASE_STATE_FILE), "utf8"));
  } catch {
    return null;
  }
}

export async function runVpsReconcile(deps: VpsReconcileDeps = {}): Promise<{
  status: ReconcileStatus;
  expected: ExpectedStateSnapshot;
  actual: ActualStateSnapshot;
  findings: ReconcileFinding[];
  mutationPerformed: false;
}> {
  const readReleaseState = deps.readReleaseState ?? defaultReadReleaseState;
  const inspectContainer = deps.inspectContainer ?? (async () => null);
  const readCatalog = deps.readCatalog ?? (async () => null);

  const findings: ReconcileFinding[] = [];
  const push = (code: string, severity: ReconcileSeverity, expected?: unknown, actual?: unknown): void => {
    findings.push({ code, severity, expected, actual });
  };

  let rawExpected: unknown = null;
  try {
    rawExpected = await readReleaseState();
  } catch {
    rawExpected = null;
  }
  const expected = pickExpected(rawExpected);
  if (rawExpected === null || rawExpected === undefined) {
    push("EXPECTED_STATE_INCOMPLETE", "info", undefined, "release-state.json unavailable");
  } else if (
    expected.currentRelease === undefined &&
    expected.productionImageId === undefined &&
    expected.productionCatalogHash === undefined &&
    expected.toolCount === undefined &&
    expected.catalogVersion === undefined
  ) {
    push("EXPECTED_STATE_INCOMPLETE", "info", undefined, "no comparable release-state fields");
  }

  let container: ActualContainerSnapshot | null = null;
  let catalog: ActualCatalogSnapshot | null = null;
  try {
    container = await inspectContainer();
  } catch {
    container = null;
  }
  try {
    catalog = await readCatalog();
  } catch {
    catalog = null;
  }
  if (container === null && catalog === null) push("ACTUAL_STATE_UNAVAILABLE", "info");

  let matched = 0;
  let mismatched = 0;

  if (container !== null && container.running === false) {
    push("CONTAINER_NOT_RUNNING", "critical", true, false);
    mismatched += 1;
  }
  if (container !== null && typeof container.image === "string" && expected.currentRelease !== undefined) {
    if (container.image === expected.currentRelease) matched += 1;
    else {
      push("IMAGE_MISMATCH", "critical", expected.currentRelease, container.image);
      mismatched += 1;
    }
  }
  if (container !== null && typeof container.imageId === "string" && expected.productionImageId !== undefined) {
    if (container.imageId === expected.productionImageId) matched += 1;
    else {
      push("IMAGE_ID_MISMATCH", "critical", expected.productionImageId, container.imageId);
      mismatched += 1;
    }
  }
  if (catalog !== null && typeof catalog.catalogHash === "string" && expected.productionCatalogHash !== undefined) {
    if (catalog.catalogHash === expected.productionCatalogHash) matched += 1;
    else {
      push("CATALOG_HASH_MISMATCH", "critical", expected.productionCatalogHash, catalog.catalogHash);
      mismatched += 1;
    }
  }
  if (catalog !== null && typeof catalog.catalogVersion === "string" && expected.catalogVersion !== undefined) {
    if (catalog.catalogVersion === expected.catalogVersion) matched += 1;
    else {
      push("CATALOG_VERSION_MISMATCH", "critical", expected.catalogVersion, catalog.catalogVersion);
      mismatched += 1;
    }
  }
  if (catalog !== null && typeof catalog.toolCount === "number" && typeof expected.toolCount === "number") {
    if (catalog.toolCount === expected.toolCount) matched += 1;
    else {
      push("TOOL_COUNT_MISMATCH", "critical", expected.toolCount, catalog.toolCount);
      mismatched += 1;
    }
  }

  if (expected.deployStatus === "IN_PROGRESS") push("DEPLOY_IN_PROGRESS", "warning", expected.deployStatus);
  if (expected.deployStatus === "FAIL") push("DEPLOY_FAILED", "warning", expected.deployStatus);
  if (expected.rollbackStatus === "PASS") push("ROLLBACK_DETECTED", "info", expected.rollbackStatus);

  const determined = matched + mismatched;
  let status: ReconcileStatus;
  if (mismatched > 0) status = "DRIFTED";
  else if (determined === 0) status = "UNKNOWN";
  else status = "IN_SYNC";

  return { status, expected, actual: { container, catalog }, findings, mutationPerformed: false };
}
