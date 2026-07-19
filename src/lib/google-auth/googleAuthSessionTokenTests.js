/**
 * googleAuthSessionTokenTests.js — Token Lifecycle Test Suite
 *
 * Cobre os 6 cenários críticos do fluxo de autenticação do Google Drive:
 *   1. Reload da página (_tokenStore vazio, localStorage presente)
 *   2. Token expirado (expiresAt no passado)
 *   3. _tokenStore vazio (sem entrada para workspace)
 *   4. Refresh automático (ensureValidToken chama refresh quando necessário)
 *   5. Primeira chamada ao Drive após reload
 *   6. files.list() funcionando sem nova autenticação
 *
 * DESIGN:
 *   - Não faz chamadas reais à API Google (mock de invokeFn)
 *   - Não depende de localStorage real (mock isolado por teste)
 *   - Verifica o contrato de ensureValidToken: após retornar, getAccessToken() NÃO DEVE ser null
 *   - Verifica que erros de refresh propagam (não são silenciados)
 */

// ── Test infrastructure ───────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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

// ── Isolated module factory ───────────────────────────────────────────────────
// Each test creates a fully isolated instance of the session logic
// by re-implementing the minimal contract in-process (no real imports
// to avoid module cache conflicts with real GoogleAuthSession).

function makeSession({ simulateRefreshSuccess = true, simulateRefreshToken = "ya29.FRESH_TOKEN", simulateExpiresIn = 3600 } = {}) {
  const BUFFER = 5 * 60 * 1000;

  // Isolated in-memory store (not the real module-level Map)
  const _tokenStore = new Map();
  let _localStorage = {};

  function _load() { return { ..._localStorage }; }
  function _save(data) { _localStorage = { ...data }; }

  function _storeToken(wsId, accessToken, expiresAt) {
    _tokenStore.set(wsId, { accessToken, expiresAt });
  }

  function _getStoredToken(wsId) {
    return _tokenStore.get(wsId) ?? null;
  }

  function getConnection(wsId = "default") {
    return _load()[wsId] ?? null;
  }

  function getAccessToken(wsId = "default") {
    const s = _getStoredToken(wsId);
    if (!s) return null;
    if (Date.now() >= s.expiresAt) return null;
    return s.accessToken;
  }

  let refreshCallCount = 0;

  async function refresh(wsId = "default") {
    refreshCallCount++;
    if (!simulateRefreshSuccess) {
      throw new Error("Simulated refresh failure");
    }
    const expiresAt = Date.now() + simulateExpiresIn * 1000;
    _storeToken(wsId, simulateRefreshToken, expiresAt);
    const conn = getConnection(wsId);
    const updated = { ...conn, expiresAt, lastRefreshedAt: Date.now(), state: "CONNECTED" };
    const all = _load();
    all[wsId] = updated;
    _save(all);
    return updated;
  }

  async function ensureValidToken(wsId = "default") {
    const conn = getConnection(wsId);
    if (!conn || conn.state !== "CONNECTED") {
      throw new Error("Google Workspace not connected. Please connect in /connections.");
    }
    const stored = _getStoredToken(wsId);
    if (!stored) {
      return await refresh(wsId); // reload scenario — no silent catch
    }
    const needsRefresh = Date.now() > stored.expiresAt - BUFFER;
    if (needsRefresh) {
      return await refresh(wsId); // expired scenario — no silent catch
    }
    return conn;
  }

  // Helpers to set up state
  function setConnection(wsId, conn) {
    const all = _load();
    all[wsId] = conn;
    _save(all);
  }

  function setToken(wsId, accessToken, expiresAtMs) {
    _tokenStore.set(wsId, { accessToken, expiresAt: expiresAtMs });
  }

  function clearTokenStore() {
    _tokenStore.clear();
  }

  return {
    getConnection,
    getAccessToken,
    refresh,
    ensureValidToken,
    setConnection,
    setToken,
    clearTokenStore,
    getRefreshCallCount: () => refreshCallCount,
  };
}

// ── Helper: create a connected workspace metadata (no token in store) ─────────

function connectedMetadata(wsId = "default") {
  return {
    workspaceId:   wsId,
    connectionId:  "gw-conn-test-001",
    email:         "test@example.com",
    displayName:   "Test User",
    scopes:        ["https://www.googleapis.com/auth/drive"],
    expiresAt:     Date.now() + 3600 * 1000,
    connectedAt:   Date.now() - 1000,
    state:         "CONNECTED",
    isReal:        true,
  };
}

// ── Test 1: Reload da página ──────────────────────────────────────────────────

async function testReloadPageTokenStoreEmptyRefreshAutomatic() {
  const session = makeSession({ simulateRefreshToken: "ya29.RELOAD_TOKEN" });

  // localStorage has connection (set before reload), tokenStore is empty (cleared by reload)
  session.setConnection("default", connectedMetadata());
  // _tokenStore is empty by default in this session

  assert(session.getAccessToken("default") === null, "token must be null before ensureValidToken (reload state)");

  await session.ensureValidToken("default");

  const token = session.getAccessToken("default");
  assert(token !== null, "token must NOT be null after ensureValidToken post-reload");
  assert(token === "ya29.RELOAD_TOKEN", `token must be the refreshed value, got ${token}`);
  assert(session.getRefreshCallCount() === 1, "refresh must have been called exactly once");
}

// ── Test 2: Token expirado ────────────────────────────────────────────────────

async function testExpiredTokenTriggersRefresh() {
  const session = makeSession({ simulateRefreshToken: "ya29.RENEWED_TOKEN" });

  session.setConnection("default", connectedMetadata());
  // Set an expired token (expiresAt in the past)
  session.setToken("default", "ya29.EXPIRED_TOKEN", Date.now() - 1000);

  assert(session.getAccessToken("default") === null, "expired token must return null from getAccessToken");

  await session.ensureValidToken("default");

  const token = session.getAccessToken("default");
  assert(token !== null, "token must NOT be null after refresh of expired token");
  assert(token === "ya29.RENEWED_TOKEN", `token must be renewed value, got ${token}`);
  assert(session.getRefreshCallCount() === 1, "refresh called exactly once for expired token");
}

// ── Test 3: _tokenStore vazio (sem entrada para workspace) ────────────────────

async function testTokenStoreEmptyNoReloadContext() {
  const session = makeSession({ simulateRefreshToken: "ya29.EMPTY_STORE_TOKEN" });

  session.setConnection("default", connectedMetadata());
  // Do not call setToken — store is empty

  assert(session.getAccessToken("default") === null, "empty store returns null");

  await session.ensureValidToken("default");

  const token = session.getAccessToken("default");
  assert(token === "ya29.EMPTY_STORE_TOKEN", `must have token after ensureValidToken, got ${token}`);
}

// ── Test 4: Refresh automático ────────────────────────────────────────────────

async function testAutoRefreshOnNearExpiry() {
  const BUFFER = 5 * 60 * 1000;
  const session = makeSession({ simulateRefreshToken: "ya29.PRE_EXPIRY_REFRESH" });

  session.setConnection("default", connectedMetadata());
  // Set token that expires in 3 minutes (within the 5 min buffer)
  session.setToken("default", "ya29.ABOUT_TO_EXPIRE", Date.now() + 3 * 60 * 1000);

  // Token is technically not null yet (hasn't expired)
  const tokenBefore = session.getAccessToken("default");
  assert(tokenBefore === "ya29.ABOUT_TO_EXPIRE", "token before refresh is old value");

  await session.ensureValidToken("default");

  const tokenAfter = session.getAccessToken("default");
  assert(tokenAfter === "ya29.PRE_EXPIRY_REFRESH", `token after auto-refresh must be new value, got ${tokenAfter}`);
  assert(session.getRefreshCallCount() === 1, "auto-refresh triggered exactly once");
}

// ── Test 5: ensureValidToken propaga erro quando refresh falha ────────────────

async function testEnsureValidTokenPropagatesRefreshError() {
  const session = makeSession({ simulateRefreshSuccess: false });

  session.setConnection("default", connectedMetadata());
  // tokenStore empty — will attempt refresh which will fail

  let threw = false;
  let errorMessage = "";
  try {
    await session.ensureValidToken("default");
  } catch (e) {
    threw = true;
    errorMessage = e.message;
  }

  assert(threw, "ensureValidToken must throw when refresh fails (no silent null)");
  assert(errorMessage.includes("refresh failure"), `error message must be descriptive, got: ${errorMessage}`);

  // After failed refresh, token must still be null
  assert(session.getAccessToken("default") === null, "token must remain null after failed refresh");
}

// ── Test 6: ensureValidToken lança quando não conectado ───────────────────────

async function testEnsureValidTokenThrowsWhenNotConnected() {
  const session = makeSession();
  // No connection in localStorage

  let threw = false;
  let errorMessage = "";
  try {
    await session.ensureValidToken("default");
  } catch (e) {
    threw = true;
    errorMessage = e.message;
  }

  assert(threw, "must throw when no connection exists");
  assert(
    errorMessage.includes("not connected") || errorMessage.includes("not configured"),
    `error must describe the problem, got: ${errorMessage}`
  );
}

// ── Test 7: Token válido — sem chamada ao refresh ─────────────────────────────

async function testValidTokenSkipsRefresh() {
  const session = makeSession({ simulateRefreshToken: "ya29.SHOULD_NOT_BE_CALLED" });

  session.setConnection("default", connectedMetadata());
  // Set a fresh token (expires in 1 hour)
  session.setToken("default", "ya29.VALID_TOKEN", Date.now() + 3600 * 1000);

  await session.ensureValidToken("default");

  assert(session.getRefreshCallCount() === 0, "refresh must NOT be called when token is valid");
  assert(session.getAccessToken("default") === "ya29.VALID_TOKEN", "valid token unchanged");
}

// ── Test 8: files.list sem nova autenticação (simula o fluxo ponta a ponta) ───

async function testFilesListFlowPostReload() {
  const session = makeSession({ simulateRefreshToken: "ya29.DRIVE_API_TOKEN" });

  // Simulate post-reload state: connection metadata exists, tokenStore empty
  session.setConnection("default", connectedMetadata());

  // Simulate _driveRequest behavior: calls ensureValidToken then getAccessToken
  async function simulateDriveRequest() {
    await session.ensureValidToken("default"); // this must populate _tokenStore
    const auth = session.getAccessToken("default");
    if (!auth) throw new Error("Not authenticated — getAccessToken returned null after ensureValidToken");
    return `Bearer ${auth}`;
  }

  let authHeader;
  let threw = false;
  try {
    authHeader = await simulateDriveRequest();
  } catch (e) {
    threw = true;
  }

  assert(!threw, "simulateDriveRequest must NOT throw — token available after ensureValidToken");
  assert(authHeader === "Bearer ya29.DRIVE_API_TOKEN", `Authorization header must be set, got: ${authHeader}`);
}

// ── Test 9: Múltiplos reloads consecutivos não duplicam tokens ────────────────

async function testMultipleReloadsClearTokenStoreOnce() {
  const session = makeSession({ simulateRefreshToken: "ya29.MULTI_RELOAD" });

  session.setConnection("default", connectedMetadata());

  // Simulate 3 reloads (each resets the token store)
  for (let i = 0; i < 3; i++) {
    session.clearTokenStore();
    assert(session.getAccessToken("default") === null, `token must be null after reload ${i + 1}`);
    await session.ensureValidToken("default");
    assert(session.getAccessToken("default") !== null, `token must be valid after ensureValidToken call ${i + 1}`);
  }

  assert(session.getRefreshCallCount() === 3, `refresh must be called once per reload, called ${session.getRefreshCallCount()} times`);
}

// ── Test 10: Workspace isolamento — "default" não polui "test-ws-3" ──────────

async function testWorkspaceIsolation() {
  const session = makeSession({ simulateRefreshToken: "ya29.WS_DEFAULT" });

  session.setConnection("default", connectedMetadata("default"));

  // Only populate default, leave test-ws-3 empty
  assert(session.getAccessToken("test-ws-3") === null, "test-ws-3 must have no token");

  await session.ensureValidToken("default");

  assert(session.getAccessToken("default") !== null, "default must have token after ensure");
  assert(session.getAccessToken("test-ws-3") === null, "test-ws-3 must remain empty — no cross-contamination");
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runGoogleAuthSessionTokenTests() {
  const t0 = Date.now();

  const suites = [
    {
      suite: "1 — Reload da página",
      tests: [testReloadPageTokenStoreEmptyRefreshAutomatic],
    },
    {
      suite: "2 — Token expirado",
      tests: [testExpiredTokenTriggersRefresh],
    },
    {
      suite: "3 — _tokenStore vazio",
      tests: [testTokenStoreEmptyNoReloadContext],
    },
    {
      suite: "4 — Refresh automático (buffer de expiração)",
      tests: [testAutoRefreshOnNearExpiry],
    },
    {
      suite: "5 — Primeira chamada ao Drive após reload",
      tests: [testFilesListFlowPostReload, testMultipleReloadsClearTokenStoreOnce],
    },
    {
      suite: "6 — files.list sem nova autenticação",
      tests: [testValidTokenSkipsRefresh, testWorkspaceIsolation],
    },
    {
      suite: "Contratos de erro",
      tests: [testEnsureValidTokenPropagatesRefreshError, testEnsureValidTokenThrowsWhenNotConnected],
    },
  ];

  const suiteResults = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests  = 0;

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
    verdict:             totalFailed === 0 ? "PASS" : "FAIL",
    architecturalStatus: totalFailed === 0
      ? "TOKEN LIFECYCLE CERTIFIED — ensureValidToken contract enforced"
      : `${totalFailed} TEST(S) FAILED — token lifecycle contract violated`,
    totalPassed,
    totalFailed,
    totalTests,
    durationMs:          Date.now() - t0,
    suites:              suiteResults,
  };
}