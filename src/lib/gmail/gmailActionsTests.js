/**
 * gmailActionsTests — Implementation 010
 * Suite de testes para GmailActions.
 */

import { createDraft, sendDraft, sendEmail } from "./GmailActions";

const _authMockState = {
  connected: true,
  token: "valid-token",
};

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

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockSession(token = "valid-token") {
  _authMockState.connected = true;
  _authMockState.token = token;
}

function mockDisconnected() {
  _authMockState.connected = false;
  _authMockState.token = null;
}

function mockFetch(handler) {
  window.fetch = async (url, opts) => {
    const result = await handler(url, opts);
    return {
      status: result.status ?? 200,
      ok: (result.status ?? 200) >= 200 && (result.status ?? 200) < 300,
      json: async () => result.body ?? {},
    };
  };
}

const VALID_REQ = {
  to: ["joao@example.com"],
  subject: "Teste de envio",
  body: "Corpo do e-mail de teste.",
};

// ── Suite: createDraft ────────────────────────────────────────────────────────

async function suiteCreateDraft() {
  const originalFetch = window.fetch;
  mockSession();

  mockFetch(async () => ({
    status: 200,
    body: { id: "draft-001", message: { threadId: "thread-abc" } },
  }));

  const results = await Promise.all([
    runTest("createDraft retorna ok=true", async () => {
      const r = await createDraft(VALID_REQ);
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("createDraft retorna status=draft", async () => {
      const r = await createDraft(VALID_REQ);
      assert(r.data?.status === "draft", `status deve ser draft: ${r.data?.status}`);
    }),
    runTest("createDraft retorna id do rascunho", async () => {
      const r = await createDraft(VALID_REQ);
      assert(r.data?.id === "draft-001", `id incorreto: ${r.data?.id}`);
    }),
    runTest("createDraft com isHtml=true funciona", async () => {
      const r = await createDraft({ ...VALID_REQ, isHtml: true });
      assert(r.ok === true, `ok deve ser true com HTML: ${r.error}`);
    }),
    runTest("createDraft com cc e bcc funciona", async () => {
      const r = await createDraft({ ...VALID_REQ, cc: ["cc@example.com"], bcc: ["bcc@example.com"] });
      assert(r.ok === true, `ok deve ser true com cc/bcc: ${r.error}`);
    }),
  ]);

  window.fetch = originalFetch;
  return results;
}

// ── Suite: sendDraft ──────────────────────────────────────────────────────────

async function suiteSendDraft() {
  const originalFetch = window.fetch;
  mockSession();

  mockFetch(async () => ({
    status: 200,
    body: { id: "msg-sent-001", threadId: "thread-abc" },
  }));

  const results = await Promise.all([
    runTest("sendDraft retorna ok=true", async () => {
      const r = await sendDraft("draft-001");
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("sendDraft retorna status=sent", async () => {
      const r = await sendDraft("draft-001");
      assert(r.data?.status === "sent", `status deve ser sent: ${r.data?.status}`);
    }),
    runTest("sendDraft retorna id da mensagem enviada", async () => {
      const r = await sendDraft("draft-001");
      assert(r.data?.id === "msg-sent-001", `id incorreto: ${r.data?.id}`);
    }),
    runTest("sendDraft sem draftId retorna validation_error", async () => {
      const r = await sendDraft("");
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "validation_error", `status deve ser validation_error: ${r.status}`);
    }),
  ]);

  window.fetch = originalFetch;
  return results;
}

// ── Suite: sendEmail ──────────────────────────────────────────────────────────

async function suiteSendEmail() {
  const originalFetch = window.fetch;
  mockSession();

  mockFetch(async () => ({
    status: 200,
    body: { id: "msg-direct-001", threadId: "thread-xyz" },
  }));

  const results = await Promise.all([
    runTest("sendEmail retorna ok=true", async () => {
      const r = await sendEmail(VALID_REQ);
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("sendEmail retorna status=sent", async () => {
      const r = await sendEmail(VALID_REQ);
      assert(r.data?.status === "sent", `status deve ser sent: ${r.data?.status}`);
    }),
    runTest("sendEmail retorna id da mensagem", async () => {
      const r = await sendEmail(VALID_REQ);
      assert(r.data?.id === "msg-direct-001", `id incorreto: ${r.data?.id}`);
    }),
  ]);

  window.fetch = originalFetch;
  return results;
}

// ── Suite: Validacao ──────────────────────────────────────────────────────────

async function suiteValidacao() {
  mockSession();
  const originalFetch = window.fetch;
  mockFetch(async () => ({ status: 200, body: {} }));

  const results = await Promise.all([
    runTest("destinatario invalido retorna validation_error", async () => {
      const r = await createDraft({ ...VALID_REQ, to: ["nao-e-email"] });
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "validation_error", `status deve ser validation_error: ${r.status}`);
    }),
    runTest("to vazio retorna validation_error", async () => {
      const r = await createDraft({ ...VALID_REQ, to: [] });
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "validation_error", `status deve ser validation_error: ${r.status}`);
    }),
    runTest("assunto vazio retorna validation_error", async () => {
      const r = await createDraft({ ...VALID_REQ, subject: "" });
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "validation_error", `status deve ser validation_error: ${r.status}`);
    }),
    runTest("corpo vazio retorna validation_error", async () => {
      const r = await createDraft({ ...VALID_REQ, body: "" });
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "validation_error", `status deve ser validation_error: ${r.status}`);
    }),
    runTest("error nao contem stack trace", async () => {
      const r = await createDraft({ ...VALID_REQ, to: [] });
      assert(!r.error.includes("at "), "error nao deve conter stack trace");
    }),
  ]);

  window.fetch = originalFetch;
  return results;
}

// ── Suite: Desconectado ───────────────────────────────────────────────────────

async function suiteDesconectado() {
  const originalFetch = window.fetch;
  mockDisconnected();

  const results = await Promise.all([
    runTest("createDraft desconectado retorna status=disconnected", async () => {
      const r = await createDraft(VALID_REQ);
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "disconnected", `status deve ser disconnected: ${r.status}`);
    }),
    runTest("sendDraft desconectado retorna status=disconnected", async () => {
      const r = await sendDraft("draft-001");
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "disconnected", `status deve ser disconnected: ${r.status}`);
    }),
    runTest("sendEmail desconectado retorna status=disconnected", async () => {
      const r = await sendEmail(VALID_REQ);
      assert(r.ok === false, "ok deve ser false");
      assert(r.status === "disconnected", `status deve ser disconnected: ${r.status}`);
    }),
  ]);

  window.fetch = originalFetch;
  return results;
}

// ── Suite: Erros da API ───────────────────────────────────────────────────────

async function suiteErrosAPI() {
  const originalFetch = window.fetch;
  const results = [];

  // 401 — token expirado
  mockSession("expired-token");
  mockFetch(async () => ({ status: 401, body: { error: "invalid_token" } }));
  results.push(await runTest("401 retorna status=expired", async () => {
    const r = await createDraft(VALID_REQ);
    assert(r.ok === false, "ok deve ser false");
    assert(r.status === "expired", `status deve ser expired: ${r.status}`);
  }));

  // 403
  mockFetch(async () => ({ status: 403, body: { error: "forbidden" } }));
  results.push(await runTest("403 retorna status=error", async () => {
    const r = await sendEmail(VALID_REQ);
    assert(r.ok === false, "ok deve ser false");
    assert(r.status === "error", `status deve ser error: ${r.status}`);
  }));

  // 500
  mockFetch(async () => ({ status: 500, body: { error: "internal" } }));
  results.push(await runTest("500 retorna status=error", async () => {
    const r = await createDraft(VALID_REQ);
    assert(r.ok === false, "ok deve ser false");
    assert(r.status === "error", `status deve ser error: ${r.status}`);
  }));

  // Refresh automatico — token ausente em memoria mas ensureValidToken retorna conn
  _authMockState.connected = true;
  _authMockState.token = null;
  results.push(await runTest("token ausente em memoria retorna status=disconnected", async () => {
    const r = await createDraft(VALID_REQ);
    assert(r.ok === false, "ok deve ser false quando token ausente");
    assert(r.status === "disconnected", `status deve ser disconnected: ${r.status}`);
  }));

  window.fetch = originalFetch;
  return results;
}

// ── Runner principal ──────────────────────────────────────────────────────────

export async function runGmailActionsTests() {
  const start = Date.now();

  const suites = [
    { suite: "createDraft",   fn: suiteCreateDraft },
    { suite: "sendDraft",     fn: suiteSendDraft },
    { suite: "sendEmail",     fn: suiteSendEmail },
    { suite: "Validacao",     fn: suiteValidacao },
    { suite: "Desconectado",  fn: suiteDesconectado },
    { suite: "Erros da API",  fn: suiteErrosAPI },
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
      ? "Implementation 010 — GmailActions APROVADO"
      : `Implementation 010 — ${totalFailed} teste(s) falharam`,
    totalPassed,
    totalFailed,
    totalTests,
    durationMs: Date.now() - start,
    suites: suiteResults,
  };
}