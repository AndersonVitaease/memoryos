/**
 * googleAuthTests.js — Implementation 001
 * Suite de testes: Google Workspace OAuth 2.0
 *
 * Cobre:
 *  - connect (autenticação inicial)
 *  - disconnect (desconexão + limpeza)
 *  - reconnect (reconexão após desconexão)
 *  - refresh (renovação de token)
 *  - ensureValidToken (renovação automática)
 *  - isConnected (verificação de estado)
 *  - listConnections (multi-workspace)
 *  - getMetrics (observabilidade)
 *  - Segurança: tokens nunca expostos via getConnection
 *  - Idempotência e recuperação de erros
 */

import {
  connect, disconnect, reconnect, refresh, ensureValidToken,
  getConnection, listConnections, isConnected, getMetrics,
  BASE_SCOPES, WORKSPACE_SCOPES,
} from "./GoogleAuthSession";

// ─── Runner ───────────────────────────────────────────────────────────────────

function run(name, fn) {
  const t0 = Date.now();
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => ({ name, passed: true, duration: Date.now() - t0 }))
        .catch((e) => ({ name, passed: false, error: e.message, duration: Date.now() - t0 }));
    }
    return Promise.resolve({ name, passed: true, duration: Date.now() - t0 });
  } catch (e) {
    return Promise.resolve({ name, passed: false, error: e.message, duration: Date.now() - t0 });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? "Assertion failed");
}

// Workspace IDs únicos por teste para isolamento
let _seq = 0;
function ws() { return `test-ws-${++_seq}`; }

// ─── Suite: connect ───────────────────────────────────────────────────────────

async function testConnectReturnsConnection() {
  const w = ws();
  const conn = await connect({ workspaceId: w, scopes: BASE_SCOPES });
  assert(conn.connectionId.startsWith("gw-conn-"), "connectionId format");
  assert(conn.state === "CONNECTED", "state CONNECTED");
  assert(Array.isArray(conn.scopes) && conn.scopes.length > 0, "scopes populated");
  assert(conn.expiresAt > Date.now(), "expiresAt in future");
  assert(conn.workspaceId === w, "workspaceId matches");
}

async function testConnectPersistsToStorage() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const loaded = getConnection(w);
  assert(loaded !== null, "connection persisted");
  assert(loaded.state === "CONNECTED", "persisted state");
}

async function testConnectTokenRefNeverRawToken() {
  const w = ws();
  const conn = await connect({ workspaceId: w, scopes: BASE_SCOPES });
  // tokenRef must be an opaque reference, not contain "Bearer" or raw token chars
  assert(typeof conn.tokenRef === "string", "tokenRef is string");
  assert(!conn.tokenRef.includes("Bearer"), "no Bearer in tokenRef");
  assert(conn.tokenRef.startsWith("gw-tok-"), "tokenRef is opaque ref");
  // refreshTokenRef must be opaque
  assert(conn.refreshTokenRef.startsWith("gw-ref-"), "refreshTokenRef is opaque");
}

async function testConnectStateCallbacks() {
  const w = ws();
  const states = [];
  await connect({ workspaceId: w, scopes: BASE_SCOPES, onStateChange: (s) => states.push(s) });
  assert(states.includes("AUTHENTICATING"), "AUTHENTICATING emitted");
  assert(states.includes("CONNECTED"), "CONNECTED emitted");
  assert(states[states.length - 1] === "CONNECTED", "last state is CONNECTED");
}

async function testConnectMultipleWorkspaces() {
  const w1 = ws(), w2 = ws();
  await connect({ workspaceId: w1, scopes: BASE_SCOPES });
  await connect({ workspaceId: w2, scopes: WORKSPACE_SCOPES });
  const c1 = getConnection(w1);
  const c2 = getConnection(w2);
  assert(c1 !== null && c2 !== null, "both connections stored");
  assert(c1.connectionId !== c2.connectionId, "unique connectionIds");
  assert(c2.scopes.length > c1.scopes.length, "different scopes");
}

// ─── Suite: disconnect ────────────────────────────────────────────────────────

async function testDisconnectClearsStorage() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  await disconnect(w);
  const conn = getConnection(w);
  assert(conn === null, "connection cleared after disconnect");
}

async function testDisconnectEmitsStates() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const states = [];
  await disconnect(w, (s) => states.push(s));
  assert(states.includes("DISCONNECTED"), "DISCONNECTED emitted");
  assert(states.includes("NOT_CONNECTED"), "NOT_CONNECTED emitted");
}

async function testDisconnectNonExistentIsNoop() {
  // Should not throw
  await disconnect("non-existent-workspace-xyz");
  assert(true, "no error on non-existent disconnect");
}

async function testDisconnectDoesNotAffectOtherWorkspaces() {
  const w1 = ws(), w2 = ws();
  await connect({ workspaceId: w1, scopes: BASE_SCOPES });
  await connect({ workspaceId: w2, scopes: BASE_SCOPES });
  await disconnect(w1);
  assert(getConnection(w1) === null, "w1 disconnected");
  assert(getConnection(w2) !== null, "w2 unaffected");
}

// ─── Suite: reconnect ─────────────────────────────────────────────────────────

async function testReconnectAfterDisconnect() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  await disconnect(w);
  assert(getConnection(w) === null, "disconnected");
  const conn = await reconnect({ workspaceId: w, scopes: BASE_SCOPES });
  assert(conn.state === "CONNECTED", "reconnected state");
  assert(getConnection(w) !== null, "reconnect persisted");
}

async function testReconnectGeneratesNewConnectionId() {
  const w = ws();
  const c1 = await connect({ workspaceId: w, scopes: BASE_SCOPES });
  await disconnect(w);
  const c2 = await reconnect({ workspaceId: w, scopes: BASE_SCOPES });
  assert(c1.connectionId !== c2.connectionId, "new connectionId on reconnect");
}

// ─── Suite: refresh ───────────────────────────────────────────────────────────

async function testRefreshUpdatesTokenRef() {
  const w = ws();
  const original = await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const refreshed = await refresh(w);
  assert(refreshed.tokenRef !== original.tokenRef, "tokenRef changed after refresh");
  assert(refreshed.tokenRef.includes("refreshed"), "tokenRef indicates refresh");
}

async function testRefreshUpdatesExpiresAt() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const before = getConnection(w).expiresAt;
  // Small delay to ensure new timestamp differs
  await _delay(5);
  const refreshed = await refresh(w);
  assert(refreshed.expiresAt >= before, "expiresAt updated");
}

async function testRefreshEmitsStates() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const states = [];
  await refresh(w, (s) => states.push(s));
  assert(states.includes("REFRESHING"), "REFRESHING emitted");
  assert(states.includes("CONNECTED"), "CONNECTED emitted after refresh");
}

async function testRefreshNonExistentThrows() {
  let threw = false;
  try { await refresh("non-existent-workspace-xyz"); } catch { threw = true; }
  assert(threw, "refresh of non-existent connection throws");
}

async function testRefreshPersistsNewToken() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  await refresh(w);
  const stored = getConnection(w);
  assert(stored.tokenRef.includes("refreshed"), "persisted tokenRef is refreshed");
}

// ─── Suite: ensureValidToken ──────────────────────────────────────────────────

async function testEnsureValidTokenReturnsConnected() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const conn = await ensureValidToken(w);
  assert(conn !== null, "returns connection");
  assert(conn.state === "CONNECTED", "state CONNECTED");
}

async function testEnsureValidTokenReturnsNullIfNotConnected() {
  const conn = await ensureValidToken("workspace-never-connected-xyz");
  assert(conn === null, "returns null for unknown workspace");
}

async function testEnsureValidTokenDoesNotRefreshFreshToken() {
  const w = ws();
  const original = await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const result = await ensureValidToken(w);
  // Fresh token should not trigger refresh (no "refreshed" in tokenRef)
  assert(result.tokenRef === original.tokenRef, "no unnecessary refresh");
}

// ─── Suite: isConnected ───────────────────────────────────────────────────────

async function testIsConnectedTrueAfterConnect() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  assert(isConnected(w) === true, "isConnected true");
}

async function testIsConnectedFalseBeforeConnect() {
  assert(isConnected("never-connected-workspace-abc") === false, "isConnected false");
}

async function testIsConnectedFalseAfterDisconnect() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  await disconnect(w);
  assert(isConnected(w) === false, "isConnected false after disconnect");
}

// ─── Suite: listConnections + getMetrics ──────────────────────────────────────

async function testListConnectionsIncludesAllWorkspaces() {
  const w1 = ws(), w2 = ws(), w3 = ws();
  await connect({ workspaceId: w1, scopes: BASE_SCOPES });
  await connect({ workspaceId: w2, scopes: BASE_SCOPES });
  await connect({ workspaceId: w3, scopes: BASE_SCOPES });
  const all = listConnections();
  const ids = all.map((c) => c.workspaceId);
  assert(ids.includes(w1) && ids.includes(w2) && ids.includes(w3), "all workspaces listed");
}

async function testGetMetricsCountsCorrectly() {
  const w = ws();
  await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const m = getMetrics();
  assert(typeof m.totalWorkspaces === "number", "totalWorkspaces is number");
  assert(m.connected >= 1, "at least 1 connected");
  assert(typeof m.byState === "object", "byState is object");
}

// ─── Suite: Security ──────────────────────────────────────────────────────────

async function testNoRawTokensInConnectionObject() {
  const w = ws();
  const conn = await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const json = JSON.stringify(conn);
  // Should not contain patterns that look like real tokens (long base64, JWT format)
  assert(!json.includes("eyJ"), "no JWT in connection object");
  assert(!json.includes("ya29."), "no Google access token format");
  assert(conn.tokenRef.startsWith("gw-tok-"), "tokenRef is opaque");
}

async function testScopesStoredCorrectly() {
  const w = ws();
  const scopes = [BASE_SCOPES[0], BASE_SCOPES[1]];
  const conn = await connect({ workspaceId: w, scopes });
  assert(conn.scopes.length === scopes.length, "scopes count matches");
  assert(conn.scopes[0] === scopes[0], "scope values preserved");
}

async function testBaseAndWorkspaceScopesDiffer() {
  assert(WORKSPACE_SCOPES.length > BASE_SCOPES.length, "WORKSPACE_SCOPES is superset");
  assert(WORKSPACE_SCOPES.includes("https://www.googleapis.com/auth/gmail.readonly"), "gmail scope present");
}

// ─── Suite: Edge cases ────────────────────────────────────────────────────────

async function testConnectDefaultWorkspaceId() {
  const conn = await connect({ scopes: BASE_SCOPES });
  assert(conn.workspaceId === "default", "default workspaceId");
  await disconnect("default"); // cleanup
}

async function testConnectReplacesPreviousConnection() {
  const w = ws();
  const c1 = await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const c2 = await connect({ workspaceId: w, scopes: BASE_SCOPES });
  assert(c1.connectionId !== c2.connectionId, "new connectionId replaces old");
  assert(getConnection(w).connectionId === c2.connectionId, "latest connection stored");
}

async function testConnectedAtTimestamp() {
  const before = Date.now();
  const w = ws();
  const conn = await connect({ workspaceId: w, scopes: BASE_SCOPES });
  const after = Date.now();
  assert(conn.connectedAt >= before && conn.connectedAt <= after, "connectedAt in valid range");
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function _delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function runGoogleAuthTests() {
  const suites = [
    {
      suite: "connect",
      tests: [
        testConnectReturnsConnection,
        testConnectPersistsToStorage,
        testConnectTokenRefNeverRawToken,
        testConnectStateCallbacks,
        testConnectMultipleWorkspaces,
      ],
    },
    {
      suite: "disconnect",
      tests: [
        testDisconnectClearsStorage,
        testDisconnectEmitsStates,
        testDisconnectNonExistentIsNoop,
        testDisconnectDoesNotAffectOtherWorkspaces,
      ],
    },
    {
      suite: "reconnect",
      tests: [
        testReconnectAfterDisconnect,
        testReconnectGeneratesNewConnectionId,
      ],
    },
    {
      suite: "refresh",
      tests: [
        testRefreshUpdatesTokenRef,
        testRefreshUpdatesExpiresAt,
        testRefreshEmitsStates,
        testRefreshNonExistentThrows,
        testRefreshPersistsNewToken,
      ],
    },
    {
      suite: "ensureValidToken",
      tests: [
        testEnsureValidTokenReturnsConnected,
        testEnsureValidTokenReturnsNullIfNotConnected,
        testEnsureValidTokenDoesNotRefreshFreshToken,
      ],
    },
    {
      suite: "isConnected",
      tests: [
        testIsConnectedTrueAfterConnect,
        testIsConnectedFalseBeforeConnect,
        testIsConnectedFalseAfterDisconnect,
      ],
    },
    {
      suite: "listConnections + metrics",
      tests: [
        testListConnectionsIncludesAllWorkspaces,
        testGetMetricsCountsCorrectly,
      ],
    },
    {
      suite: "security",
      tests: [
        testNoRawTokensInConnectionObject,
        testScopesStoredCorrectly,
        testBaseAndWorkspaceScopesDiffer,
      ],
    },
    {
      suite: "edge cases",
      tests: [
        testConnectDefaultWorkspaceId,
        testConnectReplacesPreviousConnection,
        testConnectedAtTimestamp,
      ],
    },
  ];

  const results = [];

  for (const { suite, tests } of suites) {
    const testResults = await Promise.all(
      tests.map((fn) => run(fn.name, fn))
    );
    results.push({
      suite,
      results: testResults,
      passed: testResults.filter((r) => r.passed).length,
      failed: testResults.filter((r) => !r.passed).length,
      total:  testResults.length,
      durationMs: testResults.reduce((s, r) => s + r.duration, 0),
    });
  }

  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalTests  = results.reduce((s, r) => s + r.total, 0);

  return {
    suites: results,
    totalPassed,
    totalFailed,
    totalTests,
    verdict: totalFailed === 0 ? "PASS" : "FAIL",
    architecturalStatus: totalFailed === 0
      ? "GOOGLE WORKSPACE AUTH READY"
      : `${totalFailed} TEST(S) FAILED`,
  };
}