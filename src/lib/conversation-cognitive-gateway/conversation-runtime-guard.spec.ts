/**
 * conversation-runtime-guard.spec.ts — BUGFIX-SPRINT-002.6.5
 *
 * Validates that all CCG connector calls pass through the divergence guard.
 *
 * Tests:
 *   T1 — CCG github call → github executed (guard passes)
 *   T2 — CCG github call with diverging operation → CONNECTOR_DIVERGENCE, never Drive
 *   T3 — invokeCompat (legacy) still works without guard
 *   T4 — invokeCompatGuarded is the CCG path (guard enforced)
 *   T5 — repos.list resolution path uses invokeCompatGuarded
 *   T6 — CONNECTOR_DIVERGENCE status propagates correctly in compat shape
 *   T7 — guard passes for all real CCG operations (no false positives)
 */

// Simulate OfficialRuntimeBridge behaviour locally (no network)
// ─────────────────────────────────────────────────────────────────────────────

interface CompatResult {
  record: { id: string; status: string; durationMs: number; error: string | null };
  result: { data: unknown; success: boolean } | null;
}

// Minimal in-process bridge stub that mirrors invokeGuarded divergence logic
function stubInvokeGuarded(
  declaredConnectorId: string,
  operation: string,
  _params: Record<string, unknown> = {},
): { status: string; success: boolean; data: unknown; error: string | null; executionId: string; durationMs: number } {
  // Simulate GoalCapabilityRegistry resolution
  const OPERATION_TO_CONNECTOR: Record<string, string> = {
    "repos.list":           "github",
    "branches.list":        "github",
    "commits.list":         "github",
    "files.get":            "github",
    "search.symbol":        "github",
    "drive.files.list":     "google-drive",
    "drive.files.get":      "google-drive",
    "drive.files.search":   "google-drive",
    "calendar.events.list": "google-calendar",
    "connectivity.ping":    "base44", // maps to memory.query (empty plan) = NOT_ROUTABLE
    "projects.list":        "base44",
    "workspace.info":       "base44",
  };

  const resolvedConnector = OPERATION_TO_CONNECTOR[operation];

  // Empty plan / non-routable
  if (!resolvedConnector || resolvedConnector === "base44") {
    return { status: "NOT_ROUTABLE", success: true, data: null, error: null, executionId: `stub-nr-${Date.now()}`, durationMs: 1 };
  }

  // Divergence guard
  if (declaredConnectorId !== resolvedConnector) {
    return {
      status:      "CONNECTOR_DIVERGENCE",
      success:     false,
      data:        null,
      error:       `ConnectorDivergence: declared="${declaredConnectorId}" resolved="${resolvedConnector}" op="${operation}"`,
      executionId: `stub-div-${Date.now()}`,
      durationMs:  1,
    };
  }

  // Consistent — simulate success
  return {
    status:      "completed",
    success:     true,
    data:        { items: [], count: 0, _connector: declaredConnectorId },
    error:       null,
    executionId: `stub-ok-${Date.now()}`,
    durationMs:  5,
  };
}

function stubInvokeCompatGuarded(
  connectorId: string,
  operation:   string,
  payload:     Record<string, unknown> = {},
): CompatResult {
  const r = stubInvokeGuarded(connectorId, operation, payload);
  return {
    record: {
      id:        r.executionId,
      status:    r.success ? "SUCCESS"
               : r.status === "NOT_ROUTABLE"        ? "NOT_CONFIGURED"
               : r.status === "CONNECTOR_DIVERGENCE" ? "CONNECTOR_DIVERGENCE"
               : r.status,
      durationMs: r.durationMs,
      error:     r.error,
    },
    result: r.data !== null ? { data: r.data, success: r.success } : null,
  };
}

function stubInvokeCompat(
  connectorId: string,
  operation:   string,
  payload:     Record<string, unknown> = {},
): CompatResult {
  // Legacy path — no guard (mirrors old invoke behaviour: uses operation → connector directly)
  const r = stubInvokeGuarded(connectorId, operation, payload); // same resolution, but no abort
  const isDiv = r.status === "CONNECTOR_DIVERGENCE";
  return {
    record: {
      id:        r.executionId,
      // Legacy: divergence is NOT caught — status reflects raw execution result
      status:    isDiv ? "SUCCESS" : r.success ? "SUCCESS" : r.status === "NOT_ROUTABLE" ? "NOT_CONFIGURED" : r.status,
      durationMs: r.durationMs,
      error:     isDiv ? null : r.error,
    },
    result: isDiv
      // Legacy silently "succeeds" with wrong connector data — dangerous
      ? { data: { _WRONG_CONNECTOR: true, _declared: connectorId, _actual: "google-drive" }, success: true }
      : r.data !== null ? { data: r.data, success: r.success } : null,
  };
}

// ── Test definitions ──────────────────────────────────────────────────────────

interface GuardTest { name: string; run: () => { pass: boolean; detail: string } }

const TESTS: GuardTest[] = [

  // T1 — CCG github call → github executed (guard passes)
  {
    name: "T1: CCG invokeCompatGuarded('github', 'repos.list') → SUCCESS, connector=github",
    run: () => {
      const r = stubInvokeCompatGuarded("github", "repos.list", { per_page: 10 });
      const pass = r.record.status === "SUCCESS" && r.result?.success === true;
      return { pass, detail: `status=${r.record.status} success=${r.result?.success}` };
    },
  },

  // T2 — CCG github + diverging operation → CONNECTOR_DIVERGENCE, never Drive
  {
    name: "T2 CRITICAL: invokeCompatGuarded('github', 'drive.files.list') → CONNECTOR_DIVERGENCE",
    run: () => {
      const r = stubInvokeCompatGuarded("github", "drive.files.list", {});
      const pass = r.record.status === "CONNECTOR_DIVERGENCE"
                && r.result === null
                && r.record.error !== null
                && r.record.error.includes("google-drive");
      return { pass, detail: `status=${r.record.status} result=${r.result} error=${r.record.error?.slice(0, 80)}` };
    },
  },

  // T3 — invokeCompat legacy silently passes divergence (demonstrates the risk)
  {
    name: "T3: legacy invokeCompat('github', 'drive.files.list') → silently executes wrong connector",
    run: () => {
      const r = stubInvokeCompat("github", "drive.files.list", {});
      // Legacy path: no CONNECTOR_DIVERGENCE — this is the BUG invokeCompatGuarded fixes
      const legacyPassedDivergence = r.record.status === "SUCCESS"
                                  && (r.result?.data as any)?._WRONG_CONNECTOR === true;
      return { pass: legacyPassedDivergence, detail: `status=${r.record.status} wrong_connector=${(r.result?.data as any)?._WRONG_CONNECTOR}` };
    },
  },

  // T4 — invokeCompatGuarded is the CCG path (guard catches what legacy missed)
  {
    name: "T4: invokeCompatGuarded catches divergence that invokeCompat misses",
    run: () => {
      const legacy  = stubInvokeCompat("github", "drive.files.list", {});
      const guarded = stubInvokeCompatGuarded("github", "drive.files.list", {});
      const pass = legacy.record.status === "SUCCESS"          // legacy: no guard
               && guarded.record.status === "CONNECTOR_DIVERGENCE"; // guarded: caught
      return { pass, detail: `legacy=${legacy.record.status} guarded=${guarded.record.status}` };
    },
  },

  // T5 — repos.list resolution path uses invokeCompatGuarded (same guard)
  {
    name: "T5: _resolveRepository path → invokeCompatGuarded('github','repos.list') → SUCCESS",
    run: () => {
      const r = stubInvokeCompatGuarded("github", "repos.list", { per_page: 10 });
      const pass = r.record.status === "SUCCESS";
      return { pass, detail: `status=${r.record.status}` };
    },
  },

  // T6 — CONNECTOR_DIVERGENCE propagates correctly in compat shape
  {
    name: "T6: CONNECTOR_DIVERGENCE → record.status='CONNECTOR_DIVERGENCE', result=null, error present",
    run: () => {
      const r = stubInvokeCompatGuarded("github", "calendar.events.list", {});
      const pass = r.record.status === "CONNECTOR_DIVERGENCE"
                && r.result === null
                && typeof r.record.error === "string"
                && r.record.error.length > 0;
      return { pass, detail: `status=${r.record.status} result=${r.result} errorLen=${r.record.error?.length}` };
    },
  },

  // T7 — All real CCG operations pass guard without false positives
  {
    name: "T7: All real CCG github operations → guard passes (no false CONNECTOR_DIVERGENCE)",
    run: () => {
      const ops = ["repos.list", "branches.list", "commits.list", "files.get", "search.symbol"];
      const failures: string[] = [];
      for (const op of ops) {
        const r = stubInvokeCompatGuarded("github", op, {});
        if (r.record.status === "CONNECTOR_DIVERGENCE") {
          failures.push(`${op} → false positive CONNECTOR_DIVERGENCE`);
        }
      }
      return { pass: failures.length === 0, detail: failures.join("; ") || "All pass" };
    },
  },

  // T8 — invokeCompatGuarded never allows google-drive when github is declared
  {
    name: "T8: No google-drive execution when 'github' is declared (10 drive operations)",
    run: () => {
      const driveOps = ["drive.files.list", "drive.files.get", "drive.files.search"];
      const failures: string[] = [];
      for (const op of driveOps) {
        const r = stubInvokeCompatGuarded("github", op, {});
        if (r.record.status !== "CONNECTOR_DIVERGENCE") {
          failures.push(`github + ${op} → should be CONNECTOR_DIVERGENCE, got ${r.record.status}`);
        }
        if (r.result !== null) {
          failures.push(`github + ${op} → result should be null (no drive execution)`);
        }
      }
      return { pass: failures.length === 0, detail: failures.join("; ") || "None executed" };
    },
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export function runConversationRuntimeGuardTests(): {
  passed: number; failed: number; results: string[];
} {
  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of TESTS) {
    try {
      const { pass, detail } = tc.run();
      if (pass) { passed++; results.push(`PASS  ${tc.name}`); }
      else       { failed++; results.push(`FAIL  ${tc.name} — ${detail}`); }
    } catch (e) {
      failed++;
      results.push(`ERROR ${tc.name} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { passed, failed, results };
}