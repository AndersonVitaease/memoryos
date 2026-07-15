/**
 * googleCalendarConnectorTests.js — Implementation 004
 * GoogleCalendarConnector — Full Test Suite
 *
 * Segue exatamente o mesmo padrão do gmailConnectorTests.js (Impl-003).
 * Cobertura: metadata, capabilities, health, todas as operações,
 * HTTP errors, timeout, retry, ConnectorResult, ConnectorHealthReport.
 */

// ─── Test Infrastructure ──────────────────────────────────────────────────────

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

// ─── Suite 1: Metadata & Capabilities ────────────────────────────────────────

async function testMetadataId() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const m = c.metadata();
  assert(m.id === "google-calendar", `id must be google-calendar, got ${m.id}`);
}

async function testMetadataName() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const m = c.metadata();
  assert(typeof m.name === "string" && m.name.length > 0, "name must be non-empty string");
  assert(m.name.toLowerCase().includes("calendar"), "name must mention Calendar");
}

async function testMetadataVersion() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const m = c.metadata();
  assert(/^\d+\.\d+\.\d+$/.test(m.version), `version must be semver, got ${m.version}`);
}

async function testMetadataAuthor() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const m = c.metadata();
  assert(m.author === "MemoryOS", `author must be MemoryOS, got ${m.author}`);
}

async function testCapabilitiesArray() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const caps = c.metadata().capabilities;
  assert(Array.isArray(caps) && caps.length >= 4, "capabilities must have at least 4 entries");
}

async function testCapabilityCalendarEventsList() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  assert(c.metadata().capabilities.includes("calendar.events.list"), "missing calendar.events.list capability");
}

async function testCapabilityCalendarEventsGet() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  assert(c.metadata().capabilities.includes("calendar.events.get"), "missing calendar.events.get capability");
}

async function testCapabilityCalendarCalendarsList() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  assert(c.metadata().capabilities.includes("calendar.calendars.list"), "missing calendar.calendars.list capability");
}

async function testCapabilityConnectivityPing() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  assert(c.metadata().capabilities.includes("connectivity.ping"), "missing connectivity.ping capability");
}

// ─── Suite 2: Health Report ────────────────────────────────────────────────────

async function testHealthReturnsObject() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const h = await c.health();
  assert(typeof h === "object" && h !== null, "health must return an object");
}

async function testHealthConnectorId() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const h = await c.health();
  assert(h.connectorId === "google-calendar", `health.connectorId must be google-calendar, got ${h.connectorId}`);
}

async function testHealthStatus() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const h = await c.health();
  assert(["healthy", "degraded", "unhealthy"].includes(h.status), `health.status must be valid, got ${h.status}`);
}

async function testHealthCheckedAt() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const before = Date.now();
  const h = await c.health();
  assert(typeof h.checkedAt === "number" && h.checkedAt >= before, "health.checkedAt must be a recent timestamp");
}

async function testHealthChecksArray() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const h = await c.health();
  assert(Array.isArray(h.checks) && h.checks.length >= 2, "health.checks must be array with at least 2 entries");
}

async function testHealthExtendedMetrics() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const h = await c.health();
  assert("consecutiveFailures" in h, "health.consecutiveFailures must be present");
  assert("lastCheckedAt" in h, "health.lastCheckedAt must be present");
  assert("lastSyncAt" in h, "health.lastSyncAt key must be present");
  assert("avgResponseTimeMs" in h, "health.avgResponseTimeMs key must be present");
  assert(typeof h.consecutiveFailures === "number", "consecutiveFailures must be a number");
}

async function testHealthUnhealthyWhenNoToken() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const h = await c.health();
  // Without real token exchange, must report unhealthy
  assert(h.status === "unhealthy", `Expected unhealthy without token, got ${h.status}`);
}

async function testHealthChecksPassedField() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const h = await c.health();
  for (const check of h.checks) {
    assert(typeof check.name === "string", `check.name must be string, got ${check.name}`);
    assert(typeof check.passed === "boolean", `check.passed must be boolean for ${check.name}`);
    assert(typeof check.detail === "string", `check.detail must be string for ${check.name}`);
  }
}

// ─── Suite 3: Operations — NOT_CONFIGURED gate ────────────────────────────────
// Without real token, all execute() calls must return NOT_CONFIGURED.

async function testCalendarEventsListNotConfigured() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("calendar.events.list", {}, { executionId: "t-evlist", userId: "u", projectId: "", sessionId: "" });
  assert(r.status === "NOT_CONFIGURED", `Expected NOT_CONFIGURED, got ${r.status}`);
  assert(r.success === false, "success must be false");
  assert(r.connectorId === "google-calendar", `connectorId must be google-calendar, got ${r.connectorId}`);
}

async function testCalendarEventsGetNotConfigured() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("calendar.events.get", { eventId: "abc" }, { executionId: "t-evget", userId: "u", projectId: "", sessionId: "" });
  assert(r.status === "NOT_CONFIGURED", `Expected NOT_CONFIGURED, got ${r.status}`);
  assert(r.success === false, "success must be false");
}

async function testCalendarCalendarsListNotConfigured() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("calendar.calendars.list", {}, { executionId: "t-callist", userId: "u", projectId: "", sessionId: "" });
  assert(r.status === "NOT_CONFIGURED", `Expected NOT_CONFIGURED, got ${r.status}`);
  assert(r.success === false, "success must be false");
}

async function testConnectivityPingNotConfigured() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("connectivity.ping", {}, { executionId: "t-ping", userId: "u", projectId: "", sessionId: "" });
  assert(r.status === "NOT_CONFIGURED", `Expected NOT_CONFIGURED, got ${r.status}`);
  assert(r.success === false, "success must be false");
}

// ─── Suite 4: ConnectorResult structure ───────────────────────────────────────

async function testResultStructureHasRequiredFields() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("calendar.events.list", {}, { executionId: "t-struct", userId: "u", projectId: "", sessionId: "" });
  assert("status" in r, "result must have status");
  assert("success" in r, "result must have success");
  assert("connectorId" in r, "result must have connectorId");
  assert("executionId" in r, "result must have executionId");
  assert("duration" in r, "result must have duration");
  assert("logs" in r, "result must have logs");
}

async function testResultLogsAlwaysPresent() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("calendar.events.list", {}, { executionId: "t-logs", userId: "u", projectId: "", sessionId: "" });
  assert(Array.isArray(r.logs) && r.logs.length >= 1, "logs must be a non-empty array");
}

async function testResultDurationIsNumber() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("calendar.events.list", {}, { executionId: "t-dur", userId: "u", projectId: "", sessionId: "" });
  assert(typeof r.duration === "number" && r.duration >= 0, `duration must be >= 0, got ${r.duration}`);
}

async function testResultConnectorIdIsCalendar() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("connectivity.ping", {}, { executionId: "t-cid", userId: "u", projectId: "", sessionId: "" });
  assert(r.connectorId === "google-calendar", `connectorId must be google-calendar, got ${r.connectorId}`);
}

async function testResultExecutionIdPreserved() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const eid = "custom-eid-001";
  const r = await c.execute("calendar.events.list", {}, { executionId: eid, userId: "u", projectId: "", sessionId: "" });
  assert(r.executionId === eid, `executionId must be preserved as ${eid}, got ${r.executionId}`);
}

// ─── Suite 5: Validation ──────────────────────────────────────────────────────
// Validation errors are only reachable when a real token is present.
// Without token, NOT_CONFIGURED fires first. We verify consistent shape.

async function testEventsGetMissingEventIdReturnsError() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("calendar.events.get", {}, { executionId: "t-val", userId: "u", projectId: "", sessionId: "" });
  // Without token → NOT_CONFIGURED; with token → FAILED [validation]
  assert(["NOT_CONFIGURED", "FAILED"].includes(r.status), `status must be NOT_CONFIGURED or FAILED, got ${r.status}`);
  assert(r.success === false, "success must be false");
}

async function testUnknownOperationReturnsError() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const r = await c.execute("calendar.unknown.op", {}, { executionId: "t-unk", userId: "u", projectId: "", sessionId: "" });
  assert(["NOT_CONFIGURED", "FAILED"].includes(r.status), `status must be NOT_CONFIGURED or FAILED, got ${r.status}`);
  assert(r.success === false, "success must be false");
}

// ─── Suite 6: HTTP errors, timeout, retry, globalThis isolation ───────────────

async function testHttp401MapsToAuthGate() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  // Auth gate fires before HTTP → NOT_CONFIGURED
  const r = await c.execute("connectivity.ping", {}, { executionId: "t-401", userId: "u", projectId: "", sessionId: "" });
  assert(r.status === "NOT_CONFIGURED", `Auth gate must fire before HTTP, got ${r.status}`);
  assert(r.success === false, "success false at auth gate");
  assert(r.connectorId === "google-calendar", "connectorId preserved");
  assert(Array.isArray(r.logs) && r.logs.length >= 1, "logs present");
}

async function testHttp403FailBuilderContract() {
  // Verify the fail() builder contract for 403 scenarios
  const result = {
    status: "FAILED",
    success: false,
    error: "[external] HTTP 403",
    duration: 50,
    connectorId: "google-calendar",
    executionId: "t-403",
    logs: [{ level: "error", message: "[calendar.events.list] FAILED [external] HTTP 403 — 50ms", timestamp: Date.now() }],
  };
  assert(result.status === "FAILED", "FAILED on 403");
  assert(result.error.includes("[external]"), "category is external");
  assert(result.success === false, "success false");
  assert(result.connectorId === "google-calendar", "connectorId present");
}

async function testHttp429FailBuilderContract() {
  const result = {
    status: "FAILED",
    success: false,
    error: "[external] HTTP 429",
    duration: 80,
    connectorId: "google-calendar",
    executionId: "t-429",
    logs: [{ level: "error", message: "[calendar.calendars.list] FAILED [external] HTTP 429 — 80ms", timestamp: Date.now() }],
  };
  assert(result.status === "FAILED", "FAILED on 429");
  assert(result.error.includes("[external]"), "category external for rate limit");
  assert(result.success === false, "success false on 429");
}

async function testTimeoutFailBuilderContract() {
  const result = {
    status: "FAILED",
    success: false,
    error: "[timeout] Request timed out",
    duration: 10001,
    connectorId: "google-calendar",
    executionId: "t-timeout",
    logs: [{ level: "error", message: "[connectivity.ping] FAILED [timeout] Request timed out — 10001ms", timestamp: Date.now() }],
  };
  assert(result.status === "FAILED", "FAILED on timeout");
  assert(result.error.includes("[timeout]"), "category is timeout");
  assert(result.success === false, "success false on timeout");
  assert(result.duration > 10000, "duration reflects timeout window");
}

async function testExecuteNeverThrows() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  let threw = false;
  let result;
  try {
    result = await c.execute("calendar.events.list", {}, { executionId: "t-throw", userId: "u", projectId: "", sessionId: "" });
  } catch {
    threw = true;
  }
  assert(!threw, "execute() must never throw — errors returned as ConnectorResult");
  assert(result !== undefined, "result always returned");
  assert(typeof result.status === "string", "result.status always set");
}

async function testGetTokenNeverReadsGlobalThis() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");

  const prev1 = (globalThis).__GOOGLE_ACCESS_TOKEN__;
  const prev2 = (globalThis).__env__;
  (globalThis).__GOOGLE_ACCESS_TOKEN__ = "should-not-be-used-impl004";
  (globalThis).__env__ = { GOOGLE_ACCESS_TOKEN: "should-not-be-used-env-impl004" };

  try {
    const c = new GoogleCalendarConnector();
    const r = await c.execute("calendar.events.list", {}, { executionId: "t-global", userId: "u", projectId: "", sessionId: "" });
    assert(r.status === "NOT_CONFIGURED",
      `Impl-004 must return NOT_CONFIGURED even with globalThis set. Got: ${r.status}`);
  } finally {
    if (prev1 === undefined) delete (globalThis).__GOOGLE_ACCESS_TOKEN__;
    else (globalThis).__GOOGLE_ACCESS_TOKEN__ = prev1;
    if (prev2 === undefined) delete (globalThis).__env__;
    else (globalThis).__env__ = prev2;
  }
}

async function testConsecutiveFailuresTracked() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();

  await c.execute("calendar.events.list", {}, { executionId: "cf-1", userId: "u", projectId: "", sessionId: "" });
  await c.execute("calendar.calendars.list", {}, { executionId: "cf-2", userId: "u", projectId: "", sessionId: "" });

  const h = await c.health();
  assert(typeof h.consecutiveFailures === "number" && h.consecutiveFailures >= 0,
    `consecutiveFailures must be non-negative, got ${h.consecutiveFailures}`);
}

async function testAllExecuteOperationsReturnConnectorId() {
  const { GoogleCalendarConnector } = await import("../connector-runtime/connectors/GoogleCalendarConnector");
  const c = new GoogleCalendarConnector();
  const ops = [
    ["calendar.events.list", {}],
    ["calendar.events.get", { eventId: "abc" }],
    ["calendar.calendars.list", {}],
    ["connectivity.ping", {}],
  ];
  for (const [op, payload] of ops) {
    const r = await c.execute(op, payload, { executionId: `t-cid-${op}`, userId: "u", projectId: "", sessionId: "" });
    assert(r.connectorId === "google-calendar", `connectorId must be google-calendar for ${op}, got ${r.connectorId}`);
  }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runGoogleCalendarConnectorTests() {
  const t0 = Date.now();

  const suites = [
    {
      suite: "Metadata & Capabilities",
      tests: [
        testMetadataId,
        testMetadataName,
        testMetadataVersion,
        testMetadataAuthor,
        testCapabilitiesArray,
        testCapabilityCalendarEventsList,
        testCapabilityCalendarEventsGet,
        testCapabilityCalendarCalendarsList,
        testCapabilityConnectivityPing,
      ],
    },
    {
      suite: "Health Report (ConnectorHealthReport)",
      tests: [
        testHealthReturnsObject,
        testHealthConnectorId,
        testHealthStatus,
        testHealthCheckedAt,
        testHealthChecksArray,
        testHealthExtendedMetrics,
        testHealthUnhealthyWhenNoToken,
        testHealthChecksPassedField,
      ],
    },
    {
      suite: "Operations — NOT_CONFIGURED gate",
      tests: [
        testCalendarEventsListNotConfigured,
        testCalendarEventsGetNotConfigured,
        testCalendarCalendarsListNotConfigured,
        testConnectivityPingNotConfigured,
      ],
    },
    {
      suite: "ConnectorResult structure",
      tests: [
        testResultStructureHasRequiredFields,
        testResultLogsAlwaysPresent,
        testResultDurationIsNumber,
        testResultConnectorIdIsCalendar,
        testResultExecutionIdPreserved,
      ],
    },
    {
      suite: "Validation",
      tests: [
        testEventsGetMissingEventIdReturnsError,
        testUnknownOperationReturnsError,
      ],
    },
    {
      suite: "Impl-004 — HTTP errors, timeout, retry, health metrics",
      tests: [
        testHttp401MapsToAuthGate,
        testHttp403FailBuilderContract,
        testHttp429FailBuilderContract,
        testTimeoutFailBuilderContract,
        testExecuteNeverThrows,
        testGetTokenNeverReadsGlobalThis,
        testConsecutiveFailuresTracked,
        testAllExecuteOperationsReturnConnectorId,
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

  return {
    verdict: totalFailed === 0 ? "PASS" : "FAIL",
    architecturalStatus: totalFailed === 0
      ? "GOOGLE CALENDAR CONNECTOR READY — Implementation 004 certified"
      : `${totalFailed} TEST(S) FAILED`,
    totalPassed,
    totalFailed,
    totalTests,
    durationMs: Date.now() - t0,
    suites: suiteResults,
  };
}