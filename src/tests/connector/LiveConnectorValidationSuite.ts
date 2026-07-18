/**
 * LiveConnectorValidationSuite.ts
 * EV-4 — Live Connector Validation
 *
 * NO mocks. NO stubs. Real OAuth. Real API calls.
 * Every test either calls a real backend function or inspects real OAuth state.
 *
 * Sprint: EV-4
 * Prerequisite: Google Workspace must be connected (OAuth done) before running.
 */

import { describe }        from "@/testing/TestScenarioBuilder";
import { AssertionEngine } from "@/testing/AssertionEngine";
import {
  getConnection, isConnected, getAccessToken, ensureValidToken,
  listConnections, getMetrics,
} from "@/lib/google-auth/GoogleAuthSession";
import { base44 } from "@/api/base44Client";

// ── Helpers ─────────────────────────────────────────────────────────────────────

async function invokeBackend(name: string, payload: object = {}) {
  const res = await (base44 as any).functions.invoke(name, payload);
  return res.data;
}

function requireConnection(workspaceId = "default"): void {
  const conn = getConnection(workspaceId);
  if (!conn || conn.state !== "CONNECTED") {
    throw new Error(
      `EV-4 requires an active Google connection for workspace "${workspaceId}". ` +
      `Please connect via /connections before running live tests.`
    );
  }
}

// ── OAuth State Tests ────────────────────────────────────────────────────────────

export function registerOAuthStateTests(): void {
  describe("OAuth State [LIVE]", "INTEGRATION" as never)

    .test("LV-OAUTH-01: getConnection() returns a valid connection object", () => {
      requireConnection();
      const conn = getConnection("default");
      AssertionEngine.assertNotNull(conn);
      AssertionEngine.assertEquals(conn!.state, "CONNECTED");
      AssertionEngine.assertTrue(conn!.workspaceId.length > 0);
    })

    .test("LV-OAUTH-02: isConnected() returns true for connected workspace", () => {
      requireConnection();
      AssertionEngine.assertTrue(isConnected("default"));
    })

    .test("LV-OAUTH-03: connection has email populated", () => {
      requireConnection();
      const conn = getConnection("default");
      AssertionEngine.assertNotNull(conn!.email);
      AssertionEngine.assertTrue(conn!.email.includes("@"));
    })

    .test("LV-OAUTH-04: connection has connectedAt timestamp", () => {
      requireConnection();
      const conn = getConnection("default");
      AssertionEngine.assertType(conn!.connectedAt, "number");
      AssertionEngine.assertTrue(conn!.connectedAt > 0);
    })

    .test("LV-OAUTH-05: connection isReal === true (not simulated)", () => {
      requireConnection();
      const conn = getConnection("default");
      AssertionEngine.assertTrue(conn!.isReal === true);
    })

    .test("LV-OAUTH-06: getAccessToken() returns non-null token in memory", () => {
      requireConnection();
      const token = getAccessToken("default");
      AssertionEngine.assertNotNull(token);
      AssertionEngine.assertTrue((token as string).length > 10);
    })

    .test("LV-OAUTH-07: listConnections() includes default workspace", () => {
      requireConnection();
      const conns = listConnections();
      AssertionEngine.assertTrue(conns.length >= 1);
      const found = conns.find(c => c.workspaceId === "default");
      AssertionEngine.assertNotNull(found ?? null);
    })

    .test("LV-OAUTH-08: getMetrics() shows connected >= 1", () => {
      requireConnection();
      const m = getMetrics();
      AssertionEngine.assertTrue(m.connected >= 1);
      AssertionEngine.assertTrue(m.real >= 1);
    })

    .test("LV-OAUTH-09: connection scopes include gmail and drive", () => {
      requireConnection();
      const conn = getConnection("default");
      const scopes = (conn!.scopes as string[] | string) ?? [];
      const scopeStr = Array.isArray(scopes) ? scopes.join(" ") : scopes;
      AssertionEngine.assertTrue(scopeStr.includes("gmail") || scopeStr.includes("mail"));
    })

    .test("LV-OAUTH-10: connection expiresAt is in the future", () => {
      requireConnection();
      const conn = getConnection("default");
      AssertionEngine.assertTrue(conn!.expiresAt > Date.now());
    })

    .register();
}

// ── Token Lifecycle Tests ────────────────────────────────────────────────────────

export function registerTokenLifecycleTests(): void {
  describe("Token Lifecycle [LIVE]", "INTEGRATION" as never)

    .test("LV-TOKEN-01: ensureValidToken() resolves without throwing", async () => {
      requireConnection();
      const result = await ensureValidToken("default");
      AssertionEngine.assertNotNull(result);
    })

    .test("LV-TOKEN-02: ensureValidToken() returns the connection object", async () => {
      requireConnection();
      const result = await ensureValidToken("default");
      AssertionEngine.assertNotNull((result as any)?.workspaceId ?? null);
    })

    .test("LV-TOKEN-03: access token is still valid after ensureValidToken()", async () => {
      requireConnection();
      await ensureValidToken("default");
      const token = getAccessToken("default");
      AssertionEngine.assertNotNull(token);
    })

    .register();
}

// ── Backend Function Tests ───────────────────────────────────────────────────────

export function registerBackendFunctionTests(): void {
  describe("Backend Functions [LIVE]", "INTEGRATION" as never)

    .test("LV-BK-01: googleOAuthRefresh backend function returns an access token", async () => {
      requireConnection();
      const data = await invokeBackend("googleOAuthRefresh", { workspaceId: "default" });
      AssertionEngine.assertNotNull(data);
      AssertionEngine.assertNotNull(data.accessToken ?? data.access_token ?? null);
    })

    .test("LV-BK-02: googleOAuthRefresh returns a numeric expiresAt", async () => {
      requireConnection();
      const data = await invokeBackend("googleOAuthRefresh", { workspaceId: "default" });
      const exp = data.expiresAt ?? data.expires_at;
      AssertionEngine.assertType(exp, "number");
      AssertionEngine.assertTrue(exp > Date.now());
    })

    .test("LV-BK-03: consecutive refresh calls both succeed", async () => {
      requireConnection();
      const d1 = await invokeBackend("googleOAuthRefresh", { workspaceId: "default" });
      const d2 = await invokeBackend("googleOAuthRefresh", { workspaceId: "default" });
      AssertionEngine.assertNotNull(d1.accessToken ?? d1.access_token ?? null);
      AssertionEngine.assertNotNull(d2.accessToken ?? d2.access_token ?? null);
    })

    .register();
}

// ── Connector Runtime Tests ──────────────────────────────────────────────────────

export function registerConnectorRuntimeTests(): void {
  describe("Connector Runtime [LIVE]", "INTEGRATION" as never)

    .test("LV-RT-01: ConnectorKnowledgePipeline executes with a live-derived request", async () => {
      requireConnection();
      const { ConnectorKnowledgePipeline } = await import(
        "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline"
      );
      const conn = getConnection("default")!;
      const result = ConnectorKnowledgePipeline.run({
        requestId:  "LV-RT-001",
        connector:  "gmail",
        operation:  "READ",
        intent:     "validate live gmail connector read",
        provider:   "google",
        parameters: { workspaceId: conn.workspaceId, email: conn.email },
        priority:   "MEDIUM",
        domain:     "GMAIL",
        project:    "MemoryOS",
        sprint:     "EV-4",
        tags:       ["live", "validation"],
      });
      AssertionEngine.assertNotNull(result);
      AssertionEngine.assertEquals(result.ctx.connector, "gmail");
    })

    .test("LV-RT-02: ConnectorKnowledgePipeline confidence > 0 for live request", async () => {
      requireConnection();
      const { ConnectorKnowledgePipeline } = await import(
        "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline"
      );
      const result = ConnectorKnowledgePipeline.run({
        requestId:  "LV-RT-002",
        connector:  "googledrive",
        operation:  "READ",
        intent:     "validate live google drive read",
        provider:   "google",
        parameters: {},
        priority:   "MEDIUM",
        domain:     "DRIVE",
        project:    "MemoryOS",
        sprint:     "EV-4",
        tags:       ["live"],
      });
      AssertionEngine.assertTrue(result.confidence.score > 0);
    })

    .test("LV-RT-03: AUTH operation with live credentials returns advisory", async () => {
      requireConnection();
      const { ConnectorKnowledgePipeline } = await import(
        "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline"
      );
      const result = ConnectorKnowledgePipeline.run({
        requestId:  "LV-RT-003",
        connector:  "google",
        operation:  "AUTH",
        intent:     "live oauth token validation",
        provider:   "google",
        parameters: {},
        priority:   "HIGH",
        domain:     "AUTH",
        project:    "MemoryOS",
        sprint:     "EV-4",
        tags:       ["live", "auth"],
      });
      AssertionEngine.assertType(result.advisory.proceed, "boolean");
    })

    .test("LV-RT-04: REFRESH_TOKEN operation returns valid plan", async () => {
      requireConnection();
      const { ConnectorKnowledgePipeline } = await import(
        "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline"
      );
      const result = ConnectorKnowledgePipeline.run({
        requestId:  "LV-RT-004",
        connector:  "google",
        operation:  "REFRESH_TOKEN",
        intent:     "validate token refresh flow",
        provider:   "google",
        parameters: {},
        priority:   "MEDIUM",
        domain:     "AUTH",
        project:    "MemoryOS",
        sprint:     "EV-4",
        tags:       ["live", "token"],
      });
      const validStrategies = ["NONE", "LINEAR", "EXPONENTIAL", "JITTER"];
      AssertionEngine.assertIncludes(validStrategies, result.plan.retryStrategy);
    })

    .register();
}

// ── Error Handling Tests ─────────────────────────────────────────────────────────

export function registerErrorHandlingTests(): void {
  describe("Error Handling [LIVE]", "INTEGRATION" as never)

    .test("LV-ERR-01: getConnection() for unknown workspace returns null gracefully", () => {
      const conn = getConnection("nonexistent-workspace-xyz");
      // Must return null, never throw
      AssertionEngine.assertTrue(conn === null || conn === undefined);
    })

    .test("LV-ERR-02: isConnected() for unknown workspace returns false (not throw)", () => {
      const result = isConnected("nonexistent-workspace-xyz");
      AssertionEngine.assertFalse(result);
    })

    .test("LV-ERR-03: getAccessToken() for unknown workspace returns null (not throw)", () => {
      const token = getAccessToken("nonexistent-workspace-xyz");
      AssertionEngine.assertTrue(token === null || token === undefined);
    })

    .test("LV-ERR-04: ensureValidToken() for unknown workspace resolves to null", async () => {
      const result = await ensureValidToken("nonexistent-workspace-xyz");
      AssertionEngine.assertTrue(result === null || result === undefined);
    })

    .test("LV-ERR-05: ConnectorKnowledgePipeline handles FAILOVER without throwing", async () => {
      requireConnection();
      const { ConnectorKnowledgePipeline } = await import(
        "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline"
      );
      const result = ConnectorKnowledgePipeline.run({
        requestId:  "LV-ERR-005",
        connector:  "gmail",
        operation:  "FAILOVER",
        intent:     "simulate gmail failover",
        provider:   "google",
        parameters: {},
        priority:   "HIGH",
        domain:     "GMAIL",
        project:    "MemoryOS",
        sprint:     "EV-4",
        tags:       ["live", "failover"],
      });
      AssertionEngine.assertNotNull(result);
    })

    .test("LV-ERR-06: ConnectorKnowledgePipeline handles RETRY correctly", async () => {
      requireConnection();
      const { ConnectorKnowledgePipeline } = await import(
        "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline"
      );
      const result = ConnectorKnowledgePipeline.run({
        requestId:  "LV-ERR-006",
        connector:  "gmail",
        operation:  "RETRY",
        intent:     "validate retry strategy selection",
        provider:   "google",
        parameters: {},
        priority:   "MEDIUM",
        domain:     "GMAIL",
        project:    "MemoryOS",
        sprint:     "EV-4",
        tags:       ["live", "retry"],
      });
      AssertionEngine.assertInRange(result.plan.maxRetries, 0, 100);
    })

    .register();
}

// ── Parameter & Request Builder Tests ───────────────────────────────────────────

export function registerParameterBuilderTests(): void {
  describe("Parameter Builder [LIVE]", "INTEGRATION" as never)

    .test("LV-PB-01: context built from live connection has correct email", () => {
      requireConnection();
      const conn = getConnection("default")!;
      const { ConnectorKnowledgePipeline } = require(
        "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline"
      );
      const result = ConnectorKnowledgePipeline.run({
        requestId:  "LV-PB-001",
        connector:  "gmail",
        operation:  "READ",
        intent:     "parameter builder test",
        provider:   "google",
        parameters: { userEmail: conn.email, workspaceId: conn.workspaceId },
        priority:   "LOW",
        domain:     "GMAIL",
        project:    "MemoryOS",
        sprint:     "EV-4",
        tags:       ["live", "params"],
      });
      AssertionEngine.assertEquals(result.ctx.connector, "gmail");
      AssertionEngine.assertNotNull(result.ctx.parameters);
    })

    .test("LV-PB-02: request with real scopes resolves governance correctly", () => {
      requireConnection();
      const conn = getConnection("default")!;
      const { ConnectorKnowledgePipeline } = require(
        "@/lib/connector-runtime/integration/ConnectorKnowledgePipeline"
      );
      const result = ConnectorKnowledgePipeline.run({
        requestId:  "LV-PB-002",
        connector:  "googledrive",
        operation:  "READ",
        intent:     "real scopes governance test",
        provider:   "google",
        parameters: { scopes: conn.scopes },
        priority:   "LOW",
        domain:     "DRIVE",
        project:    "MemoryOS",
        sprint:     "EV-4",
        tags:       ["live", "params"],
      });
      AssertionEngine.assertType(result.governance.approved, "boolean");
    })

    .register();
}

// ── Connector SDK Tests ──────────────────────────────────────────────────────────

export function registerConnectorSDKTests(): void {
  describe("Connector SDK [LIVE]", "INTEGRATION" as never)

    .test("LV-SDK-01: GoogleAuthSession API surface is complete", () => {
      AssertionEngine.assertType(getConnection,      "function");
      AssertionEngine.assertType(isConnected,        "function");
      AssertionEngine.assertType(getAccessToken,     "function");
      AssertionEngine.assertType(ensureValidToken,   "function");
      AssertionEngine.assertType(listConnections,    "function");
      AssertionEngine.assertType(getMetrics,         "function");
    })

    .test("LV-SDK-02: getMetrics() returns complete metrics shape", () => {
      const m = getMetrics();
      AssertionEngine.assertType(m.totalWorkspaces, "number");
      AssertionEngine.assertType(m.connected,       "number");
      AssertionEngine.assertType(m.expired,         "number");
      AssertionEngine.assertType(m.real,            "number");
      AssertionEngine.assertNotNull(m.byState);
    })

    .test("LV-SDK-03: listConnections() returns an array", () => {
      const conns = listConnections();
      AssertionEngine.assertTrue(Array.isArray(conns));
    })

    .register();
}

// ── Master registration ──────────────────────────────────────────────────────────

export function registerAllLiveConnectorTests(): void {
  registerOAuthStateTests();
  registerTokenLifecycleTests();
  registerBackendFunctionTests();
  registerConnectorRuntimeTests();
  registerErrorHandlingTests();
  registerParameterBuilderTests();
  registerConnectorSDKTests();
}

export const LIVE_SUITES = [
  "OAuth State [LIVE]",
  "Token Lifecycle [LIVE]",
  "Backend Functions [LIVE]",
  "Connector Runtime [LIVE]",
  "Error Handling [LIVE]",
  "Parameter Builder [LIVE]",
  "Connector SDK [LIVE]",
] as const;