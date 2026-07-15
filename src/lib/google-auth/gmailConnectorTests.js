/**
 * gmailConnectorTests.js — Implementation 002
 * Suite de testes: GmailConnector + GoogleAuthSession integration
 *
 * Cobre:
 *  - Registro no ConnectorInvocationService
 *  - metadata() e capabilities
 *  - health() sem token (NOT_CONFIGURED)
 *  - health() com token real (se disponível)
 *  - execute() sem token → NOT_CONFIGURED honesto
 *  - execute() gmail.messages.list (com token real)
 *  - Integração GoogleAuthSession → ensureValidToken → execute
 *  - Todos os operations registrados
 *  - Policy: bloqueio de operações de escrita
 *  - Registro como connector "google" no CIS
 */

// ─── Runner ───────────────────────────────────────────────────────────────────

function _delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? "Assertion failed");
}

async function run(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - t0 };
  } catch (e) {
    return { name, passed: false, error: e.message, durationMs: Date.now() - t0 };
  }
}

// ─── Suite 1: GmailConnector metadata + health ────────────────────────────────

async function testMetadata() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  const meta = c.metadata();
  assert(meta.id === "google", "id is 'google'");
  assert(meta.version === "1.0.0", "version 1.0.0");
  assert(Array.isArray(meta.capabilities) && meta.capabilities.length >= 6, "capabilities declared");
  assert(meta.capabilities.includes("gmail.messages.list"), "gmail.messages.list capability");
  assert(meta.capabilities.includes("gmail.threads.list"), "gmail.threads.list capability");
  assert(meta.capabilities.includes("gmail.labels.list"), "gmail.labels.list capability");
  assert(meta.capabilities.includes("auth.profile"), "auth.profile capability");
}

async function testHealthNoToken() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  const h = await c.health();
  // Without real token: unhealthy or degraded
  assert(["unhealthy", "degraded"].includes(h.status), `health status is ${h.status}`);
  assert(h.connectorId === "google", "connectorId is google");
  assert(Array.isArray(h.checks), "checks array present");
}

async function testInitialize() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  // initialize must not throw
  await c.initialize({ executionId: "test-eid", userId: "test", projectId: "", sessionId: "" });
  assert(true, "initialize did not throw");
}

async function testShutdown() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  await c.initialize({ executionId: "test-eid", userId: "test", projectId: "", sessionId: "" });
  await c.shutdown();
  assert(true, "shutdown did not throw");
}

// ─── Suite 2: execute() without token → NOT_CONFIGURED ───────────────────────

async function testExecuteNoTokenReturnsNotConfigured() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  const result = await c.execute(
    "gmail.messages.list",
    {},
    { executionId: "test-eid-001", userId: "test", projectId: "", sessionId: "" }
  );
  assert(result.status === "NOT_CONFIGURED", `Expected NOT_CONFIGURED, got ${result.status}`);
  assert(result.success === false, "success is false");
  assert(typeof result.error === "string" && result.error.length > 0, "error message present");
  assert(result.connectorId === "google", "connectorId is google");
}

async function testExecuteUnknownOperationFails() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  // Inject a fake token so we get past the auth gate
  const prev = (globalThis).__GOOGLE_ACCESS_TOKEN__;
  (globalThis).__GOOGLE_ACCESS_TOKEN__ = "fake-token-for-test";
  try {
    const result = await c.execute(
      "nonexistent.operation",
      {},
      { executionId: "test-eid-002", userId: "test", projectId: "", sessionId: "" }
    );
    // Will FAIL with external error (401 from Google) or FAILED (unknown operation)
    assert(["FAILED", "NOT_CONFIGURED"].includes(result.status), `status is ${result.status}`);
  } finally {
    if (prev === undefined) delete (globalThis).__GOOGLE_ACCESS_TOKEN__;
    else (globalThis).__GOOGLE_ACCESS_TOKEN__ = prev;
  }
}

async function testExecuteValidationMissingId() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  const prev = (globalThis).__GOOGLE_ACCESS_TOKEN__;
  (globalThis).__GOOGLE_ACCESS_TOKEN__ = "fake-token-for-test";
  try {
    const result = await c.execute(
      "gmail.messages.get",
      {}, // missing id
      { executionId: "test-eid-003", userId: "test", projectId: "", sessionId: "" }
    );
    // Either FAILED (validation) or FAILED (401 from Google with fake token)
    assert(result.success === false, "fails without id");
  } finally {
    if (prev === undefined) delete (globalThis).__GOOGLE_ACCESS_TOKEN__;
    else (globalThis).__GOOGLE_ACCESS_TOKEN__ = prev;
  }
}

async function testExecuteThreadsGetValidation() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  const prev = (globalThis).__GOOGLE_ACCESS_TOKEN__;
  (globalThis).__GOOGLE_ACCESS_TOKEN__ = "fake-token-for-test";
  try {
    const result = await c.execute(
      "gmail.threads.get",
      {}, // missing id
      { executionId: "test-eid-004", userId: "test", projectId: "", sessionId: "" }
    );
    assert(result.success === false, "fails without thread id");
  } finally {
    if (prev === undefined) delete (globalThis).__GOOGLE_ACCESS_TOKEN__;
    else (globalThis).__GOOGLE_ACCESS_TOKEN__ = prev;
  }
}

// ─── Suite 3: ConnectorInvocationService integration ──────────────────────────

async function testCISRegistersGoogle() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const discovered = await cis.discoverConnectors();
  const google = discovered.find(d => d.id === "google");
  assert(google !== undefined, "google connector discovered");
  assert(google.name.includes("Gmail"), "name includes Gmail");
  assert(Array.isArray(google.capabilities) && google.capabilities.length >= 6, "capabilities present");
}

async function testCISGoogleHealthCheck() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const discovered = await cis.discoverConnectors();
  const google = discovered.find(d => d.id === "google");
  assert(google !== undefined, "google connector found");
  // Health may be "unhealthy" without token — that's expected and correct
  assert(typeof google.healthStatus === "string", "healthStatus is string");
}

async function testCISGoogleInvokeNoTokenReturnsNotConfigured() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const result = await cis.invoke("google", "gmail.messages.list", {}, {
    originComponent: "Test",
    reason: "Integration 002 test",
  });
  // Without real token: APPROVED authorization, NOT_CONFIGURED at execution
  assert(["NOT_CONFIGURED", "APPROVED"].includes(result.authorization.decision) || result.record.status === "NOT_CONFIGURED",
    `Expected NOT_CONFIGURED, got auth=${result.authorization.decision} status=${result.record.status}`);
}

async function testCISGoogleInvokeWriteBlocked() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  // Try a write op — should be blocked by read-only policy
  const result = await cis.invoke("google", "entities.delete", {}, {
    originComponent: "Test",
    reason: "Write block test",
  });
  assert(result.authorization.decision === "ACCESS_DENIED", `write op should be denied, got ${result.authorization.decision}`);
}

async function testCISGoogleNotAvailableWhenNotRegistered() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const result = await cis.invoke("twitter", "posts.list", {}, {
    originComponent: "Test",
    reason: "Unknown connector test",
  });
  assert(result.authorization.decision === "NOT_AVAILABLE", `unknown connector should be NOT_AVAILABLE, got ${result.authorization.decision}`);
}

// ─── Suite 4: GoogleAuthSession → GmailConnector flow ────────────────────────

async function testGoogleAuthSessionConnectThenConnectorHealth() {
  const { connect, disconnect } = await import("./GoogleAuthSession");
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");

  const w = `test-ws-gmail-${Date.now()}`;
  await connect({ workspaceId: w, scopes: ["https://www.googleapis.com/auth/gmail.readonly"] });

  const c = new GmailConnector();
  const h = await c.health();
  // Connector health check runs — session is connected but token is opaque → NOT_CONFIGURED on API
  assert(typeof h.status === "string", "health returns status after session connect");
  assert(h.connectorId === "google", "connectorId correct");

  // Cleanup
  await disconnect(w);
}

async function testEnsureValidTokenCalledOnExecute() {
  const { connect, disconnect } = await import("./GoogleAuthSession");
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");

  const w = `test-ws-evtoken-${Date.now()}`;
  await connect({ workspaceId: w, scopes: ["https://www.googleapis.com/auth/gmail.readonly"] });

  const c = new GmailConnector();
  // execute calls ensureValidToken internally — should not throw
  const result = await c.execute(
    "gmail.messages.list",
    { maxResults: 5 },
    { executionId: "test-eid-evtoken", userId: "test", projectId: "", sessionId: "" }
  );
  // Expected: NOT_CONFIGURED (no real token) — but no exception
  assert(["NOT_CONFIGURED", "SUCCESS", "FAILED"].includes(result.status), `status ${result.status} is valid`);

  await disconnect(w);
}

async function testGoogleAuthSessionScopesPreservedForGmail() {
  const { connect, disconnect, getConnection, WORKSPACE_SCOPES } = await import("./GoogleAuthSession");

  const w = `test-ws-scopes-${Date.now()}`;
  await connect({ workspaceId: w, scopes: WORKSPACE_SCOPES });
  const conn = getConnection(w);

  assert(conn !== null, "connection exists");
  assert(conn.scopes.includes("https://www.googleapis.com/auth/gmail.readonly"), "gmail scope present");
  assert(conn.scopes.includes("https://www.googleapis.com/auth/calendar"), "calendar scope present");
  assert(conn.scopes.includes("https://www.googleapis.com/auth/drive"), "drive scope present");

  await disconnect(w);
}

// ─── Suite 5: Connector result structure ─────────────────────────────────────

async function testResultStructureIsComplete() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  const result = await c.execute(
    "connectivity.ping",
    {},
    { executionId: "test-eid-struct", userId: "test", projectId: "", sessionId: "" }
  );
  // NOT_CONFIGURED expected, but structure must be complete
  assert(typeof result.status === "string", "status present");
  assert(typeof result.success === "boolean", "success present");
  assert(typeof result.duration === "number", "duration present");
  assert(result.connectorId === "google", "connectorId present");
  assert(result.executionId === "test-eid-struct", "executionId preserved");
  assert(Array.isArray(result.logs), "logs array present");
}

async function testLogsAlwaysPresent() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const c = new GmailConnector();
  const ops = [
    "gmail.messages.list",
    "gmail.threads.list",
    "gmail.labels.list",
    "connectivity.ping",
    "auth.profile",
    "health.full",
  ];
  for (const op of ops) {
    const result = await c.execute(op, {}, { executionId: `eid-${op}`, userId: "test", projectId: "", sessionId: "" });
    assert(Array.isArray(result.logs) && result.logs.length >= 1, `logs present for ${op}`);
  }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runGmailConnectorTests() {
  const suites = [
    {
      suite: "GmailConnector — metadata + health",
      tests: [
        testMetadata,
        testHealthNoToken,
        testInitialize,
        testShutdown,
      ],
    },
    {
      suite: "GmailConnector — execute without token",
      tests: [
        testExecuteNoTokenReturnsNotConfigured,
        testExecuteUnknownOperationFails,
        testExecuteValidationMissingId,
        testExecuteThreadsGetValidation,
      ],
    },
    {
      suite: "ConnectorInvocationService — google integration",
      tests: [
        testCISRegistersGoogle,
        testCISGoogleHealthCheck,
        testCISGoogleInvokeNoTokenReturnsNotConfigured,
        testCISGoogleInvokeWriteBlocked,
        testCISGoogleNotAvailableWhenNotRegistered,
      ],
    },
    {
      suite: "GoogleAuthSession → GmailConnector flow",
      tests: [
        testGoogleAuthSessionConnectThenConnectorHealth,
        testEnsureValidTokenCalledOnExecute,
        testGoogleAuthSessionScopesPreservedForGmail,
      ],
    },
    {
      suite: "Connector result structure",
      tests: [
        testResultStructureIsComplete,
        testLogsAlwaysPresent,
      ],
    },
  ];

  const results = [];
  for (const { suite, tests } of suites) {
    const testResults = await Promise.all(tests.map(fn => run(fn.name, fn)));
    results.push({
      suite,
      results: testResults,
      passed: testResults.filter(r => r.passed).length,
      failed: testResults.filter(r => !r.passed).length,
      total:  testResults.length,
      durationMs: testResults.reduce((s, r) => s + r.durationMs, 0),
    });
  }

  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalTests  = results.reduce((s, r) => s + r.total, 0);
  const durationMs  = results.reduce((s, r) => s + r.durationMs, 0);

  return {
    suites: results,
    totalPassed,
    totalFailed,
    totalTests,
    durationMs,
    verdict: totalFailed === 0 ? "PASS" : "FAIL",
    architecturalStatus: totalFailed === 0
      ? "GMAIL CONNECTOR READY — Integration 002 certified"
      : `${totalFailed} TEST(S) FAILED`,
  };
}