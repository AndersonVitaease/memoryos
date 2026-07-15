/**
 * gmailConnectorTests — Implementation 009
 * Suite de testes para GmailConnector.
 *
 * CORRECAO: ES module exports sao read-only live bindings — nao e possivel
 * sobrescrever GoogleAuthSession.ensureValidToken diretamente.
 *
 * Estrategia correta:
 *  - Simular estado de sessao via localStorage (que getConnection() le)
 *  - Simular token via mock de window.fetch: quando ensureValidToken() tenta
 *    refresh automatico, o fetch mockado retorna um token falso
 *  - Para testes com token valido: pre-popular _tokenStore nao e possivel de
 *    fora do modulo, mas podemos injetar o estado via connect() simulado
 *    usando o localStorage + fetch mockado para o endpoint de refresh
 *
 * SIMPLIFICACAO ADOTADA:
 *  - Testes com "token valido" usam fetch mockado que inclui o endpoint de
 *    refresh do GoogleAuthSession (googleOAuthRefresh via base44.functions.invoke)
 *    retornando um access token fake, e depois simula as respostas Gmail
 *  - Alternativa mais simples: pre-popular localStorage com estado CONNECTED
 *    e mockar fetch para cobrir tanto o refresh quanto as chamadas Gmail
 */

import { listMessages, searchMessages, getMessage, listLabels } from "./GmailConnector";

// ── Test runner ───────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runTest(name, fn) {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: e.message, durationMs: Date.now() - start };
  }
}

// ── Session state helpers (via localStorage — nao sobrescreve exports) ────────

const STORAGE_KEY = "memoryos_gauth_v1";

function setFakeSession(accessToken, expiresOffsetMs = 3600_000) {
  const expiresAt = Date.now() + expiresOffsetMs;
  const conn = {
    workspaceId:     "default",
    connectionId:    "test-conn-001",
    email:           "test@example.com",
    displayName:     "Test User",
    scopes:          ["https://www.googleapis.com/auth/gmail.readonly"],
    expiresAt,
    connectedAt:     Date.now(),
    state:           "CONNECTED",
    lastRefreshedAt: Date.now(),
    isReal:          true,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ default: conn }));

  // Retorna o token e expiresAt para que o fetch mock de refresh possa usa-los
  return { accessToken, expiresAt };
}

function clearFakeSession() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Fetch mock ────────────────────────────────────────────────────────────────
// Intercepta TODAS as chamadas fetch — tanto o refresh do GoogleAuthSession
// quanto as chamadas diretas para a Gmail API.

function mockFetch(gmailHandler, accessToken) {
  window.fetch = async (url, opts) => {
    const urlStr = typeof url === "string" ? url : url?.toString?.() ?? "";

    // Base44 SDK calls (base44.functions.invoke usa fetch internamente)
    // Simula o endpoint de refresh do GoogleAuthSession
    if (urlStr.includes("googleOAuthRefresh") || urlStr.includes("functions/invoke")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            accessToken,
            expiresAt: Date.now() + 3600_000,
          },
        }),
      };
    }

    // Chamadas reais para a Gmail API
    if (urlStr.includes("gmail.googleapis.com")) {
      const result = await gmailHandler(urlStr, opts);
      return {
        status: result.status ?? 200,
        ok: (result.status ?? 200) >= 200 && (result.status ?? 200) < 300,
        json: async () => result.body ?? {},
      };
    }

    // Fallback
    return { status: 404, ok: false, json: async () => ({}) };
  };
}

function mockFetchDisconnected() {
  // Sem sessao no localStorage + fetch que retorna 401 para qualquer chamada Gmail
  clearFakeSession();
  window.fetch = async () => ({
    status: 401,
    ok: false,
    json: async () => ({ error: "unauthorized" }),
  });
}

function restoreFetch(original) {
  window.fetch = original;
}

// ── Fake data ─────────────────────────────────────────────────────────────────

const FAKE_MSG_REF = { id: "msg-001", threadId: "thread-001" };

const FAKE_MSG_FULL = {
  id: "msg-001",
  threadId: "thread-001",
  labelIds: ["INBOX", "UNREAD"],
  snippet: "Seu pedido foi confirmado",
  internalDate: "1720000000000",
  sizeEstimate: 12345,
  payload: {
    headers: [
      { name: "Subject", value: "Confirmacao de pedido" },
      { name: "From",    value: "noreply@amazon.com" },
      { name: "To",      value: "user@example.com" },
      { name: "Date",    value: "Mon, 15 Jul 2026 10:00:00 +0000" },
    ],
  },
};

const FAKE_LABEL = {
  id: "INBOX",
  name: "INBOX",
  type: "system",
  messagesTotal: 42,
  messagesUnread: 5,
  threadsTotal: 38,
  threadsUnread: 4,
};

// ── Suite: Token valido — listMessages ────────────────────────────────────────

async function suiteTokenValido() {
  const originalFetch = window.fetch;
  const { accessToken } = setFakeSession("valid-token-xyz");

  mockFetch(async (url) => {
    if (url.includes("/messages/msg-001")) return { status: 200, body: FAKE_MSG_FULL };
    if (url.includes("/messages"))        return { status: 200, body: { messages: [FAKE_MSG_REF], resultSizeEstimate: 1 } };
    return { status: 404, body: {} };
  }, accessToken);

  const results = await Promise.all([
    runTest("listMessages retorna ok=true", async () => {
      const r = await listMessages();
      assert(r.ok === true, `ok deve ser true, recebeu: ${r.ok} — ${r.error}`);
    }),
    runTest("listMessages retorna array de mensagens", async () => {
      const r = await listMessages();
      assert(Array.isArray(r.data?.messages), "data.messages deve ser array");
    }),
    runTest("mensagem tem campos obrigatorios", async () => {
      const r = await listMessages();
      const m = r.data?.messages?.[0];
      assert(m?.id === "msg-001", "id incorreto");
      assert(m?.subject === "Confirmacao de pedido", "subject incorreto");
      assert(m?.from === "noreply@amazon.com", "from incorreto");
      assert(typeof m?.snippet === "string", "snippet deve ser string");
      assert(Array.isArray(m?.labelIds), "labelIds deve ser array");
    }),
    runTest("status retornado e connected", async () => {
      const r = await listMessages();
      assert(r.status === "connected", `status deve ser connected, recebeu: ${r.status}`);
    }),
  ]);

  restoreFetch(originalFetch);
  clearFakeSession();
  return results;
}

// ── Suite: Gmail vazio ────────────────────────────────────────────────────────

async function suiteGmailVazio() {
  const originalFetch = window.fetch;
  const { accessToken } = setFakeSession("valid-token-xyz");

  mockFetch(async () => ({ status: 200, body: { messages: [], resultSizeEstimate: 0 } }), accessToken);

  const results = await Promise.all([
    runTest("listMessages com inbox vazia retorna ok=true", async () => {
      const r = await listMessages();
      assert(r.ok === true, "ok deve ser true mesmo com inbox vazia");
    }),
    runTest("listMessages com inbox vazia retorna array vazio", async () => {
      const r = await listMessages();
      assert(r.data?.messages?.length === 0, "messages deve ser array vazio");
    }),
  ]);

  restoreFetch(originalFetch);
  clearFakeSession();
  return results;
}

// ── Suite: Pesquisa ───────────────────────────────────────────────────────────

async function suitePesquisa() {
  const originalFetch = window.fetch;
  const { accessToken } = setFakeSession("valid-token-xyz");

  mockFetch(async (url) => {
    if (url.includes("/messages/msg-001")) return { status: 200, body: FAKE_MSG_FULL };
    if (url.includes("/messages"))        return { status: 200, body: { messages: [FAKE_MSG_REF], resultSizeEstimate: 1 } };
    return { status: 404, body: {} };
  }, accessToken);

  const results = await Promise.all([
    runTest("searchMessages retorna ok=true", async () => {
      const r = await searchMessages("from:amazon");
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("searchMessages retorna query no resultado", async () => {
      const r = await searchMessages("from:amazon");
      assert(r.data?.query === "from:amazon", "query deve ser retornada");
    }),
    runTest("searchMessages com query vazia retorna erro", async () => {
      const r = await searchMessages("");
      assert(r.ok === false, "query vazia deve retornar erro");
      assert(r.status === "error", `status deve ser error, recebeu: ${r.status}`);
    }),
    runTest("searchMessages retorna mensagens formatadas", async () => {
      const r = await searchMessages("subject:ANVISA");
      assert(Array.isArray(r.data?.messages), "messages deve ser array");
    }),
  ]);

  restoreFetch(originalFetch);
  clearFakeSession();
  return results;
}

// ── Suite: getMessage ─────────────────────────────────────────────────────────

async function suiteGetMessage() {
  const originalFetch = window.fetch;
  const { accessToken } = setFakeSession("valid-token-xyz");

  mockFetch(async (url) => {
    if (url.includes("/messages/msg-001"))    return { status: 200, body: FAKE_MSG_FULL };
    if (url.includes("/messages/INEXISTENTE")) return { status: 404, body: { error: "Not Found" } };
    return { status: 200, body: FAKE_MSG_FULL };
  }, accessToken);

  const results = await Promise.all([
    runTest("getMessage retorna ok=true para ID valido", async () => {
      const r = await getMessage("msg-001");
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("getMessage retorna campos completos", async () => {
      const r = await getMessage("msg-001");
      assert(r.data?.id === "msg-001", "id incorreto");
      assert(r.data?.subject === "Confirmacao de pedido", "subject incorreto");
      assert(r.data?.from === "noreply@amazon.com", "from incorreto");
      assert(typeof r.data?.sizeEstimate === "number", "sizeEstimate deve ser number");
    }),
    runTest("getMessage com ID inexistente retorna erro", async () => {
      const r = await getMessage("INEXISTENTE");
      assert(r.ok === false, "mensagem inexistente deve retornar erro");
    }),
    runTest("getMessage sem ID retorna erro", async () => {
      const r = await getMessage("");
      assert(r.ok === false, "ID vazio deve retornar erro");
    }),
  ]);

  restoreFetch(originalFetch);
  clearFakeSession();
  return results;
}

// ── Suite: Labels ─────────────────────────────────────────────────────────────

async function suiteLabels() {
  const originalFetch = window.fetch;
  const { accessToken } = setFakeSession("valid-token-xyz");

  mockFetch(async () => ({
    status: 200,
    body: { labels: [FAKE_LABEL] },
  }), accessToken);

  const results = await Promise.all([
    runTest("listLabels retorna ok=true", async () => {
      const r = await listLabels();
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("listLabels retorna array de labels", async () => {
      const r = await listLabels();
      assert(Array.isArray(r.data?.labels), "labels deve ser array");
    }),
    runTest("label tem campos obrigatorios", async () => {
      const r = await listLabels();
      const l = r.data?.labels?.[0];
      assert(l?.id === "INBOX", "id incorreto");
      assert(l?.name === "INBOX", "name incorreto");
      assert(typeof l?.messagesUnread === "number", "messagesUnread deve ser number");
    }),
  ]);

  restoreFetch(originalFetch);
  clearFakeSession();
  return results;
}

// ── Suite: Desconectado ───────────────────────────────────────────────────────

async function suiteDesconectado() {
  const originalFetch = window.fetch;
  // Sem sessao no localStorage — getConnection() retorna null
  // ensureValidToken() retorna null imediatamente (sem tentar refresh)
  clearFakeSession();
  // Fetch nao chega a ser chamado pois requireSession() retorna null antes
  // mas precisamos de um fetch minimo para nao quebrar
  window.fetch = async () => ({ status: 401, ok: false, json: async () => ({}) });

  const results = await Promise.all([
    runTest("listMessages desconectado retorna status=disconnected", async () => {
      const r = await listMessages();
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "disconnected", `status deve ser disconnected, recebeu: ${r.status}`);
    }),
    runTest("searchMessages desconectado retorna status=disconnected", async () => {
      const r = await searchMessages("test");
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "disconnected", `status deve ser disconnected, recebeu: ${r.status}`);
    }),
    runTest("getMessage desconectado retorna status=disconnected", async () => {
      const r = await getMessage("any-id");
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "disconnected", `status deve ser disconnected, recebeu: ${r.status}`);
    }),
    runTest("listLabels desconectado retorna status=disconnected", async () => {
      const r = await listLabels();
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "disconnected", `status deve ser disconnected, recebeu: ${r.status}`);
    }),
  ]);

  restoreFetch(originalFetch);
  return results;
}

// ── Suite: Erros da API ───────────────────────────────────────────────────────

async function suiteErrosAPI() {
  const originalFetch = window.fetch;
  const results = [];

  // Helper: seta sessao + fetch que retorna codigo especifico para Gmail
  const withStatus = (httpStatus) => {
    const { accessToken } = setFakeSession("valid-token-xyz");
    window.fetch = async (url) => {
      const urlStr = typeof url === "string" ? url : url?.toString?.() ?? "";
      // Refresh endpoint — responde com token valido para que requireSession() passe
      if (!urlStr.includes("gmail.googleapis.com")) {
        return {
          ok: true, status: 200,
          json: async () => ({ data: { accessToken, expiresAt: Date.now() + 3600_000 } }),
        };
      }
      // Gmail API — retorna o status configurado
      return { status: httpStatus, ok: httpStatus < 400, json: async () => ({ error: "test" }) };
    };
  };

  // 401
  withStatus(401);
  results.push(await runTest("401 retorna status=expired", async () => {
    const r = await listMessages();
    assert(r.ok === false, "ok deve ser false");
    assert(r.status === "expired", `status deve ser expired, recebeu: ${r.status}`);
  }));

  // 403
  withStatus(403);
  results.push(await runTest("403 retorna status=error", async () => {
    const r = await listMessages();
    assert(r.ok === false, "ok deve ser false");
    assert(r.status === "error", `status deve ser error, recebeu: ${r.status}`);
  }));

  // 500
  withStatus(500);
  results.push(await runTest("500 retorna status=error", async () => {
    const r = await listMessages();
    assert(r.ok === false, "ok deve ser false");
    assert(r.status === "error", `status deve ser error, recebeu: ${r.status}`);
  }));

  // Token ausente em memoria mas conexao existe: ensureValidToken tenta refresh
  // Se refresh falha (fetch retorna erro), requireSession retorna null -> disconnected
  setFakeSession("will-not-be-used");
  // Refresh falha -> sem token em memoria -> requireSession retorna null
  window.fetch = async () => ({ status: 500, ok: false, json: async () => ({ error: "refresh failed" }) });
  results.push(await runTest("refresh falha retorna status=disconnected ou expired", async () => {
    const r = await listMessages();
    assert(r.ok === false, "ok deve ser false quando refresh falha");
    assert(["disconnected", "expired"].includes(r.status), `status deve ser disconnected ou expired, recebeu: ${r.status}`);
  }));

  restoreFetch(originalFetch);
  clearFakeSession();
  return results;
}

// ── Runner principal ──────────────────────────────────────────────────────────

export async function runGmailConnectorTests() {
  const start = Date.now();

  const suites = [
    { suite: "Token valido — listMessages", fn: suiteTokenValido },
    { suite: "Gmail vazio",                fn: suiteGmailVazio },
    { suite: "Pesquisa",                   fn: suitePesquisa },
    { suite: "getMessage",                 fn: suiteGetMessage },
    { suite: "Labels",                     fn: suiteLabels },
    { suite: "Desconectado",               fn: suiteDesconectado },
    { suite: "Erros da API",               fn: suiteErrosAPI },
  ];

  const suiteResults = [];
  for (const { suite, fn } of suites) {
    const results = await fn();
    const passed  = results.filter(r => r.passed).length;
    const failed  = results.filter(r => !r.passed).length;
    suiteResults.push({ suite, results, passed, failed, total: results.length });
  }

  const totalPassed = suiteResults.reduce((a, s) => a + s.passed, 0);
  const totalFailed = suiteResults.reduce((a, s) => a + s.failed, 0);
  const totalTests  = suiteResults.reduce((a, s) => a + s.total, 0);
  const verdict     = totalFailed === 0 ? "PASS" : "FAIL";

  return {
    verdict,
    architecturalStatus: verdict === "PASS"
      ? "Implementation 009 — GmailConnector APROVADO"
      : `Implementation 009 — ${totalFailed} teste(s) falharam`,
    totalPassed,
    totalFailed,
    totalTests,
    durationMs: Date.now() - start,
    suites: suiteResults,
  };
}