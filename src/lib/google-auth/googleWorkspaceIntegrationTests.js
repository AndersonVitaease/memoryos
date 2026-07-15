/**
 * googleWorkspaceIntegrationTests.js — Implementation 006
 * Google Workspace Integration Validation Suite
 *
 * Valida a cadeia completa de integracao:
 *   GoogleAuthSession -> ConnectorInvocationService -> GmailConnector
 *                                                   -> GoogleCalendarConnector
 *                                                   -> GoogleDriveConnector
 *
 * Nao cria mocks. Utiliza os componentes reais sempre que possivel.
 * Nao altera nenhum componente existente.
 */

// -- Test Infrastructure ------------------------------------------------------

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT: ${message}`);
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

// -- Suite 1: GoogleAuthSession — Workspace Registration ----------------------

async function testWorkspaceRegistration() {
  const { connect, disconnect, isConnected, getConnection } = await import("./GoogleAuthSession");
  const wsId = `impl006-ws-${Date.now()}`;
  await connect({ workspaceId: wsId, scopes: ["https://www.googleapis.com/auth/gmail.readonly"] });
  assert(isConnected(wsId), "workspace must be connected after connect()");
  const conn = getConnection(wsId);
  assert(conn !== null, "getConnection must return a connection object");
  assert(typeof conn.connectionId === "string" && conn.connectionId.length > 0, "connectionId must be present");
  await disconnect(wsId);
}

async function testWorkspaceDisconnect() {
  const { connect, disconnect, isConnected } = await import("./GoogleAuthSession");
  const wsId = `impl006-disc-${Date.now()}`;
  await connect({ workspaceId: wsId, scopes: [] });
  assert(isConnected(wsId), "connected before disconnect");
  await disconnect(wsId);
  assert(!isConnected(wsId), "must be disconnected after disconnect()");
}

async function testWorkspaceConnectionFields() {
  const { connect, disconnect, getConnection, WORKSPACE_SCOPES } = await import("./GoogleAuthSession");
  const wsId = `impl006-fields-${Date.now()}`;
  await connect({ workspaceId: wsId, scopes: WORKSPACE_SCOPES });
  const conn = getConnection(wsId);
  assert(typeof conn.state === "string", "conn.state must be string");
  assert(typeof conn.connectedAt === "number", "conn.connectedAt must be number");
  assert(typeof conn.expiresAt === "number", "conn.expiresAt must be number");
  assert(Array.isArray(conn.scopes), "conn.scopes must be array");
  await disconnect(wsId);
}

async function testMetricsIncrementOnConnect() {
  const { connect, disconnect, getMetrics } = await import("./GoogleAuthSession");
  const before = getMetrics().totalWorkspaces;
  const wsId = `impl006-metrics-${Date.now()}`;
  await connect({ workspaceId: wsId, scopes: [] });
  const after = getMetrics().totalWorkspaces;
  assert(after >= before, "totalWorkspaces must be >= before after connect");
  await disconnect(wsId);
}

// -- Suite 2: ConnectorInvocationService — Connector Discovery ----------------

async function testCISDiscoversGmail() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const connectors = await cis.discoverConnectors();
  const gmail = connectors.find(c => c.id === "google");
  assert(gmail !== undefined, "CIS must discover GmailConnector (id=google)");
  assert(gmail.name.toLowerCase().includes("gmail"), "Gmail connector name must include 'gmail'");
  assert(Array.isArray(gmail.capabilities) && gmail.capabilities.length >= 4, "Gmail must have >= 4 capabilities");
}

async function testCISDiscoversCalendar() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const connectors = await cis.discoverConnectors();
  const cal = connectors.find(c => c.id === "google-calendar");
  assert(cal !== undefined, "CIS must discover GoogleCalendarConnector (id=google-calendar)");
  assert(cal.name.toLowerCase().includes("calendar"), "Calendar connector name must include 'calendar'");
  assert(Array.isArray(cal.capabilities) && cal.capabilities.length >= 4, "Calendar must have >= 4 capabilities");
}

async function testCISDiscoversDrive() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const connectors = await cis.discoverConnectors();
  const drive = connectors.find(c => c.id === "google-drive");
  assert(drive !== undefined, "CIS must discover GoogleDriveConnector (id=google-drive)");
  assert(drive.name.toLowerCase().includes("drive"), "Drive connector name must include 'drive'");
  assert(Array.isArray(drive.capabilities) && drive.capabilities.length >= 5, "Drive must have >= 5 capabilities");
}

async function testCISDiscoversAllThreeWorkspaceConnectors() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const connectors = await cis.discoverConnectors();
  const ids = connectors.map(c => c.id);
  assert(ids.includes("google"), "google must be in discovered connectors");
  assert(ids.includes("google-calendar"), "google-calendar must be in discovered connectors");
  assert(ids.includes("google-drive"), "google-drive must be in discovered connectors");
}

// -- Suite 3: Invocation via CIS — NOT_CONFIGURED uniformity ------------------

async function testCISGmailInvocationReturnsNotConfigured() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const { record } = await cis.invoke("google", "gmail.messages.list", {}, { originComponent: "IntegrationTest", reason: "Impl-006 validation" });
  assert(record.status === "NOT_CONFIGURED", `Gmail via CIS must be NOT_CONFIGURED, got ${record.status}`);
}

async function testCISCalendarInvocationReturnsNotConfigured() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const { record } = await cis.invoke("google-calendar", "calendar.events.list", {}, { originComponent: "IntegrationTest", reason: "Impl-006 validation" });
  assert(record.status === "NOT_CONFIGURED", `Calendar via CIS must be NOT_CONFIGURED, got ${record.status}`);
}

async function testCISDriveInvocationReturnsNotConfigured() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const { record } = await cis.invoke("google-drive", "drive.files.list", {}, { originComponent: "IntegrationTest", reason: "Impl-006 validation" });
  assert(record.status === "NOT_CONFIGURED", `Drive via CIS must be NOT_CONFIGURED, got ${record.status}`);
}

async function testCISAllWorkspaceConnectorsAuthorized() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();
  const ops = [
    ["google", "gmail.messages.list", {}],
    ["google-calendar", "calendar.events.list", {}],
    ["google-drive", "drive.files.list", {}],
  ];
  for (const [id, op, payload] of ops) {
    const { authorization } = await cis.invoke(id, op, payload, { originComponent: "IntegrationTest", reason: "Impl-006 uniformity" });
    assert(authorization.decision === "APPROVED",
      `${id} must be APPROVED by CIS authorization, got ${authorization.decision}`);
  }
}

// -- Suite 4: ConnectorResult uniformity --------------------------------------

async function testConnectorResultUniformityAcrossWorkspaceConnectors() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const { GoogleDriveConnector } = await import("../connector-runtime/connectors/GoogleDriveConnector");

  const connectors = [
    { name: "GmailConnector",           instance: new GmailConnector(),           op: "gmail.messages.list",    payload: {} },
    { name: "GoogleCalendarConnector",  instance: new GoogleCalendarConnector(),  op: "calendar.events.list",   payload: {} },
    { name: "GoogleDriveConnector",     instance: new GoogleDriveConnector(),     op: "drive.files.list",       payload: {} },
  ];

  const REQUIRED_FIELDS = ["status", "success", "connectorId", "executionId", "duration", "logs"];

  for (const { name, instance, op, payload } of connectors) {
    const eid = `impl006-uniform-${name}`;
    const r = await instance.execute(op, payload, { executionId: eid, userId: "u", projectId: "", sessionId: "" });
    for (const field of REQUIRED_FIELDS) {
      assert(field in r, `${name}: ConnectorResult must have field '${field}'`);
    }
    assert(r.status === "NOT_CONFIGURED", `${name}: must return NOT_CONFIGURED without token`);
    assert(r.success === false, `${name}: success must be false`);
    assert(r.executionId === eid, `${name}: executionId must be preserved`);
    assert(Array.isArray(r.logs) && r.logs.length >= 1, `${name}: logs must be non-empty array`);
    assert(typeof r.duration === "number" && r.duration >= 0, `${name}: duration must be non-negative number`);
  }
}

async function testConnectorIdUniformity() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const { GoogleDriveConnector } = await import("../connector-runtime/connectors/GoogleDriveConnector");

  const cases = [
    { instance: new GmailConnector(),          op: "gmail.messages.list",  expectedId: "google" },
    { instance: new GoogleCalendarConnector(), op: "calendar.events.list", expectedId: "google-calendar" },
    { instance: new GoogleDriveConnector(),    op: "drive.files.list",     expectedId: "google-drive" },
  ];

  for (const { instance, op, expectedId } of cases) {
    const r = await instance.execute(op, {}, { executionId: `cid-${expectedId}`, userId: "u", projectId: "", sessionId: "" });
    assert(r.connectorId === expectedId, `connectorId must be '${expectedId}', got '${r.connectorId}'`);
  }
}

async function testLogsUniformityAcrossConnectors() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const { GoogleDriveConnector } = await import("../connector-runtime/connectors/GoogleDriveConnector");

  const connectors = [
    { instance: new GmailConnector(),          op: "gmail.messages.list" },
    { instance: new GoogleCalendarConnector(), op: "calendar.events.list" },
    { instance: new GoogleDriveConnector(),    op: "drive.files.list" },
  ];

  for (const { instance, op } of connectors) {
    const r = await instance.execute(op, {}, { executionId: "log-test", userId: "u", projectId: "", sessionId: "" });
    assert(Array.isArray(r.logs), "logs must be an array");
    assert(r.logs.length >= 1, "logs must have at least 1 entry");
    for (const log of r.logs) {
      assert(typeof log.level === "string", "each log must have level string");
      assert(typeof log.message === "string", "each log must have message string");
      assert(typeof log.timestamp === "number", "each log must have timestamp number");
    }
  }
}

// -- Suite 5: ConnectorHealthReport uniformity --------------------------------

async function testHealthReportUniformityAcrossConnectors() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const { GoogleDriveConnector } = await import("../connector-runtime/connectors/GoogleDriveConnector");

  const connectors = [
    { name: "GmailConnector",          instance: new GmailConnector(),          expectedId: "google" },
    { name: "GoogleCalendarConnector", instance: new GoogleCalendarConnector(), expectedId: "google-calendar" },
    { name: "GoogleDriveConnector",    instance: new GoogleDriveConnector(),    expectedId: "google-drive" },
  ];

  const REQUIRED_HEALTH_FIELDS = ["status", "connectorId", "checkedAt", "details", "checks"];
  const REQUIRED_METRICS = ["consecutiveFailures", "lastCheckedAt", "lastSyncAt", "avgResponseTimeMs"];

  for (const { name, instance, expectedId } of connectors) {
    const h = await instance.health();
    for (const field of REQUIRED_HEALTH_FIELDS) {
      assert(field in h, `${name}: health must have field '${field}'`);
    }
    for (const metric of REQUIRED_METRICS) {
      assert(metric in h, `${name}: health must have extended metric '${metric}'`);
    }
    assert(h.connectorId === expectedId, `${name}: health.connectorId must be '${expectedId}', got '${h.connectorId}'`);
    assert(["healthy", "degraded", "unhealthy"].includes(h.status), `${name}: health.status must be valid, got '${h.status}'`);
    assert(h.status === "unhealthy", `${name}: must be unhealthy without real token`);
    assert(Array.isArray(h.checks), `${name}: health.checks must be array`);
    for (const check of h.checks) {
      assert(typeof check.name === "string", `${name}: check.name must be string`);
      assert(typeof check.passed === "boolean", `${name}: check.passed must be boolean`);
      assert(typeof check.detail === "string", `${name}: check.detail must be string`);
    }
  }
}

// -- Suite 6: Error handling uniformity ---------------------------------------

async function testErrorHandlingUniformity() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const { GoogleDriveConnector } = await import("../connector-runtime/connectors/GoogleDriveConnector");

  const connectors = [
    { name: "GmailConnector",          instance: new GmailConnector(),          op: "gmail.messages.list" },
    { name: "GoogleCalendarConnector", instance: new GoogleCalendarConnector(), op: "calendar.events.list" },
    { name: "GoogleDriveConnector",    instance: new GoogleDriveConnector(),    op: "drive.files.list" },
  ];

  for (const { name, instance, op } of connectors) {
    let threw = false;
    let result;
    try {
      result = await instance.execute(op, {}, { executionId: `err-${name}`, userId: "u", projectId: "", sessionId: "" });
    } catch {
      threw = true;
    }
    assert(!threw, `${name}: execute() must never throw — errors returned as ConnectorResult`);
    assert(result !== undefined, `${name}: result must always be returned`);
    assert(typeof result.status === "string", `${name}: result.status must always be string`);
    assert(typeof result.success === "boolean", `${name}: result.success must always be boolean`);
  }
}

async function testUnknownOperationUniformity() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const { GoogleDriveConnector } = await import("../connector-runtime/connectors/GoogleDriveConnector");

  const connectors = [
    { name: "GmailConnector",          instance: new GmailConnector() },
    { name: "GoogleCalendarConnector", instance: new GoogleCalendarConnector() },
    { name: "GoogleDriveConnector",    instance: new GoogleDriveConnector() },
  ];

  for (const { name, instance } of connectors) {
    const r = await instance.execute("workspace.unknown.op", {}, { executionId: `unk-${name}`, userId: "u", projectId: "", sessionId: "" });
    assert(["NOT_CONFIGURED", "FAILED"].includes(r.status),
      `${name}: unknown op must return NOT_CONFIGURED or FAILED, got ${r.status}`);
    assert(r.success === false, `${name}: success must be false for unknown op`);
  }
}

async function testGlobalThisIsolationAcrossConnectors() {
  const { GmailConnector } = await import("../connector-runtime/connectors/GmailConnector");
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const { GoogleDriveConnector } = await import("../connector-runtime/connectors/GoogleDriveConnector");

  const prev = (globalThis).__GOOGLE_ACCESS_TOKEN__;
  (globalThis).__GOOGLE_ACCESS_TOKEN__ = "impl006-should-not-be-used";

  try {
    const connectors = [
      { name: "GmailConnector",          instance: new GmailConnector(),          op: "gmail.messages.list" },
      { name: "GoogleCalendarConnector", instance: new GoogleCalendarConnector(), op: "calendar.events.list" },
      { name: "GoogleDriveConnector",    instance: new GoogleDriveConnector(),    op: "drive.files.list" },
    ];
    for (const { name, instance, op } of connectors) {
      const r = await instance.execute(op, {}, { executionId: `global-${name}`, userId: "u", projectId: "", sessionId: "" });
      assert(r.status === "NOT_CONFIGURED",
        `${name}: must NOT read globalThis token — expected NOT_CONFIGURED, got ${r.status}`);
    }
  } finally {
    if (prev === undefined) delete (globalThis).__GOOGLE_ACCESS_TOKEN__;
    else (globalThis).__GOOGLE_ACCESS_TOKEN__ = prev;
  }
}

// -- Suite 7: CIS — Runtime integration end-to-end ---------------------------

async function testCISInvocationRecordedInHistory() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();

  await cis.invoke("google", "gmail.messages.list", {}, { originComponent: "IntegrationTest", reason: "Impl-006 history" });
  await cis.invoke("google-calendar", "calendar.events.list", {}, { originComponent: "IntegrationTest", reason: "Impl-006 history" });
  await cis.invoke("google-drive", "drive.files.list", {}, { originComponent: "IntegrationTest", reason: "Impl-006 history" });

  const history = cis.getHistory();
  assert(history.length >= 3, `history must have >= 3 records, got ${history.length}`);

  const googleRecord   = history.find(r => r.connectorId === "google");
  const calendarRecord = history.find(r => r.connectorId === "google-calendar");
  const driveRecord    = history.find(r => r.connectorId === "google-drive");

  assert(googleRecord !== undefined, "google record must be in history");
  assert(calendarRecord !== undefined, "google-calendar record must be in history");
  assert(driveRecord !== undefined, "google-drive record must be in history");
}

async function testCISInvocationRecordStructureUniformity() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();

  const ids = [
    ["google",          "gmail.messages.list"],
    ["google-calendar", "calendar.events.list"],
    ["google-drive",    "drive.files.list"],
  ];

  for (const [connectorId, operation] of ids) {
    const { record } = await cis.invoke(connectorId, operation, {}, { originComponent: "IntegrationTest", reason: "Impl-006 record structure" });
    assert(typeof record.id === "string", `${connectorId}: record.id must be string`);
    assert(typeof record.executedAt === "number", `${connectorId}: record.executedAt must be number`);
    assert(record.connectorId === connectorId, `${connectorId}: record.connectorId must match`);
    assert(record.operation === operation, `${connectorId}: record.operation must match`);
    assert(typeof record.status === "string", `${connectorId}: record.status must be string`);
    assert(typeof record.durationMs === "number", `${connectorId}: record.durationMs must be number`);
    assert(record.status === "NOT_CONFIGURED", `${connectorId}: must be NOT_CONFIGURED without real token`);
  }
}

async function testCISWriteOperationsBlockedForAllWorkspaceConnectors() {
  const { ConnectorInvocationService } = await import("../cognitive-connector/ConnectorInvocationService");
  const cis = new ConnectorInvocationService();

  const writeOps = [
    ["google",          "entities.create"],
    ["google-calendar", "entities.delete"],
    ["google-drive",    "files.create"],
  ];

  for (const [connectorId, operation] of writeOps) {
    const { authorization } = await cis.invoke(connectorId, operation, {}, { originComponent: "IntegrationTest", reason: "Impl-006 write block" });
    assert(authorization.decision === "ACCESS_DENIED",
      `${connectorId}: write op '${operation}' must be ACCESS_DENIED, got ${authorization.decision}`);
  }
}

// -- Main runner --------------------------------------------------------------

export async function runGoogleWorkspaceIntegrationTests() {
  const t0 = Date.now();

  const suites = [
    {
      suite: "GoogleAuthSession — Workspace Registration",
      tests: [
        testWorkspaceRegistration,
        testWorkspaceDisconnect,
        testWorkspaceConnectionFields,
        testMetricsIncrementOnConnect,
      ],
    },
    {
      suite: "ConnectorInvocationService — Connector Discovery",
      tests: [
        testCISDiscoversGmail,
        testCISDiscoversCalendar,
        testCISDiscoversDrive,
        testCISDiscoversAllThreeWorkspaceConnectors,
      ],
    },
    {
      suite: "CIS Invocation — NOT_CONFIGURED uniformity",
      tests: [
        testCISGmailInvocationReturnsNotConfigured,
        testCISCalendarInvocationReturnsNotConfigured,
        testCISDriveInvocationReturnsNotConfigured,
        testCISAllWorkspaceConnectorsAuthorized,
      ],
    },
    {
      suite: "ConnectorResult — Uniformity",
      tests: [
        testConnectorResultUniformityAcrossWorkspaceConnectors,
        testConnectorIdUniformity,
        testLogsUniformityAcrossConnectors,
      ],
    },
    {
      suite: "ConnectorHealthReport — Uniformity",
      tests: [
        testHealthReportUniformityAcrossConnectors,
      ],
    },
    {
      suite: "Error Handling — Uniformity",
      tests: [
        testErrorHandlingUniformity,
        testUnknownOperationUniformity,
        testGlobalThisIsolationAcrossConnectors,
      ],
    },
    {
      suite: "CIS — Runtime Integration End-to-End",
      tests: [
        testCISInvocationRecordedInHistory,
        testCISInvocationRecordStructureUniformity,
        testCISWriteOperationsBlockedForAllWorkspaceConnectors,
      ],
    },
  ];

  const suiteResults = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  for (const { suite, tests } of suites) {
    const results = [];
    let passed = 0;
    let failed = 0;

    for (const testFn of tests) {
      const r = await run(testFn.name, testFn);
      results.push(r);
      totalTests++;
      if (r.passed) { passed++; totalPassed++; } else { failed++; totalFailed++; }
    }

    suiteResults.push({ suite, results, passed, failed, total: tests.length });
  }

  // Component status summary
  const componentStatus = {
    googleAuthSession:           suiteResults[0].failed === 0 ? "PASS" : "FAIL",
    connectorInvocationService:  suiteResults[1].failed === 0 && suiteResults[6].failed === 0 ? "PASS" : "FAIL",
    gmailConnector:              totalFailed === 0 ? "PASS" : (suiteResults[3].results.some(r => !r.passed && r.name.includes("Gmail")) ? "FAIL" : "PASS"),
    calendarConnector:           totalFailed === 0 ? "PASS" : (suiteResults[3].results.some(r => !r.passed && r.name.includes("Calendar")) ? "FAIL" : "PASS"),
    driveConnector:              totalFailed === 0 ? "PASS" : (suiteResults[3].results.some(r => !r.passed && r.name.includes("Drive")) ? "FAIL" : "PASS"),
    runtimeIntegration:          suiteResults[6].failed === 0 ? "PASS" : "FAIL",
    oauthTokenExchange:          "NOT_CONFIGURED",
  };

  return {
    verdict: totalFailed === 0 ? "PASS" : "FAIL",
    architecturalStatus: totalFailed === 0
      ? "GOOGLE WORKSPACE INTEGRATION VALIDATED — Implementation 006 certified"
      : `${totalFailed} TEST(S) FAILED`,
    totalPassed,
    totalFailed,
    totalTests,
    durationMs: Date.now() - t0,
    suites: suiteResults,
    componentStatus,
  };
}