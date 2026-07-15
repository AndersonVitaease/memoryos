/**
 * gmailAdvancedTests — Implementation 011
 * Suite de testes para GmailAdvanced.
 */

import {
  replyEmail, replyAll, forwardEmail,
  createReplyDraft, createForwardDraft,
} from "./GmailAdvanced";
import * as GoogleAuthSession from "@/lib/google-auth/GoogleAuthSession";

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
  GoogleAuthSession.ensureValidToken = async () => ({ state: "CONNECTED" });
  GoogleAuthSession.getAccessToken   = () => token;
}

function mockDisconnected() {
  GoogleAuthSession.ensureValidToken = async () => null;
  GoogleAuthSession.getAccessToken   = () => null;
}

const FAKE_META = {
  threadId:   "thread-abc",
  from:       "joao@example.com",
  to:         "me@example.com",
  cc:         "",
  subject:    "Reuniao amanha",
  messageId:  "<msg-001@mail.gmail.com>",
  references: "",
};

let _fetchCallCount = 0;

/**
 * Instala um mock de fetch que:
 *  - GET /messages/:id → retorna metadados FAKE_META
 *  - POST qualquer endpoint → retorna sendBody ou draftBody conforme o path
 */
function mockFetchWithMeta({ metaStatus = 200, sendStatus = 200, draftStatus = 200, overrideMeta } = {}) {
  _fetchCallCount = 0;
  const meta = overrideMeta ?? FAKE_META;

  window.fetch = async (url, opts) => {
    _fetchCallCount += 1;
    const isPost = opts?.method === "POST";
    const isDraft = isPost && url.includes("/drafts");
    const isSend  = isPost && (url.includes("/messages/send") || url.includes("/drafts/send"));

    // GET message metadata
    if (!isPost) {
      const status = metaStatus;
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => ({
          threadId: meta.threadId,
          payload: {
            headers: [
              { name: "From",       value: meta.from },
              { name: "To",         value: meta.to },
              { name: "Cc",         value: meta.cc },
              { name: "Subject",    value: meta.subject },
              { name: "Message-ID", value: meta.messageId },
              { name: "References", value: meta.references },
            ],
          },
        }),
      };
    }

    // POST draft
    if (isDraft) {
      return {
        status: draftStatus,
        ok: draftStatus >= 200 && draftStatus < 300,
        json: async () => ({ id: "draft-adv-001", message: { threadId: meta.threadId } }),
      };
    }

    // POST send
    return {
      status: sendStatus,
      ok: sendStatus >= 200 && sendStatus < 300,
      json: async () => ({ id: "msg-adv-sent-001", threadId: meta.threadId }),
    };
  };
}

// ── Suite: replyEmail ─────────────────────────────────────────────────────────

async function suiteReplyEmail() {
  const original = window.fetch;
  mockSession();
  mockFetchWithMeta();

  const results = await Promise.all([
    runTest("replyEmail retorna ok=true", async () => {
      const r = await replyEmail({ messageId: "msg-001", body: "Ola!" });
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("replyEmail retorna status=sent", async () => {
      const r = await replyEmail({ messageId: "msg-001", body: "Ola!" });
      assert(r.data?.status === "sent", `status deve ser sent`);
    }),
    runTest("replyEmail inclui threadId", async () => {
      const r = await replyEmail({ messageId: "msg-001", body: "Ola!" });
      assert(r.data?.threadId === "thread-abc", `threadId incorreto: ${r.data?.threadId}`);
    }),
    runTest("replyEmail sem body retorna validation_error", async () => {
      const r = await replyEmail({ messageId: "msg-001", body: "" });
      assert(r.status === "validation_error", `deve ser validation_error: ${r.status}`);
    }),
    runTest("replyEmail sem messageId retorna validation_error", async () => {
      const r = await replyEmail({ messageId: "", body: "Ola!" });
      assert(r.status === "validation_error", `deve ser validation_error: ${r.status}`);
    }),
  ]);

  window.fetch = original;
  return results;
}

// ── Suite: replyAll ───────────────────────────────────────────────────────────

async function suiteReplyAll() {
  const original = window.fetch;
  mockSession();
  mockFetchWithMeta();

  const results = await Promise.all([
    runTest("replyAll retorna ok=true", async () => {
      const r = await replyAll({ messageId: "msg-001", body: "Resposta para todos." });
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("replyAll retorna status=sent", async () => {
      const r = await replyAll({ messageId: "msg-001", body: "Resposta para todos." });
      assert(r.data?.status === "sent", `status deve ser sent`);
    }),
  ]);

  window.fetch = original;
  return results;
}

// ── Suite: forwardEmail ───────────────────────────────────────────────────────

async function suiteForwardEmail() {
  const original = window.fetch;
  mockSession();
  mockFetchWithMeta();

  const results = await Promise.all([
    runTest("forwardEmail retorna ok=true", async () => {
      const r = await forwardEmail({ messageId: "msg-001", recipients: ["maria@example.com"] });
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("forwardEmail retorna status=sent", async () => {
      const r = await forwardEmail({ messageId: "msg-001", recipients: ["maria@example.com"] });
      assert(r.data?.status === "sent", `status deve ser sent`);
    }),
    runTest("forwardEmail sem recipients retorna validation_error", async () => {
      const r = await forwardEmail({ messageId: "msg-001", recipients: [] });
      assert(r.status === "validation_error", `deve ser validation_error: ${r.status}`);
    }),
    runTest("forwardEmail com recipient invalido retorna validation_error", async () => {
      const r = await forwardEmail({ messageId: "msg-001", recipients: ["nao-e-email"] });
      assert(r.status === "validation_error", `deve ser validation_error: ${r.status}`);
    }),
  ]);

  window.fetch = original;
  return results;
}

// ── Suite: createReplyDraft ───────────────────────────────────────────────────

async function suiteCreateReplyDraft() {
  const original = window.fetch;
  mockSession();
  mockFetchWithMeta();

  const results = await Promise.all([
    runTest("createReplyDraft retorna ok=true", async () => {
      const r = await createReplyDraft({ messageId: "msg-001", body: "Rascunho de resposta." });
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("createReplyDraft retorna status=draft", async () => {
      const r = await createReplyDraft({ messageId: "msg-001", body: "Rascunho." });
      assert(r.data?.status === "draft", `status deve ser draft: ${r.data?.status}`);
    }),
    runTest("createReplyDraft retorna id do rascunho", async () => {
      const r = await createReplyDraft({ messageId: "msg-001", body: "Rascunho." });
      assert(r.data?.id === "draft-adv-001", `id incorreto: ${r.data?.id}`);
    }),
  ]);

  window.fetch = original;
  return results;
}

// ── Suite: createForwardDraft ─────────────────────────────────────────────────

async function suiteCreateForwardDraft() {
  const original = window.fetch;
  mockSession();
  mockFetchWithMeta();

  const results = await Promise.all([
    runTest("createForwardDraft retorna ok=true", async () => {
      const r = await createForwardDraft({ messageId: "msg-001", recipients: ["pedro@example.com"] });
      assert(r.ok === true, `ok deve ser true: ${r.error}`);
    }),
    runTest("createForwardDraft retorna status=draft", async () => {
      const r = await createForwardDraft({ messageId: "msg-001", recipients: ["pedro@example.com"] });
      assert(r.data?.status === "draft", `status deve ser draft`);
    }),
  ]);

  window.fetch = original;
  return results;
}

// ── Suite: Erros de API ───────────────────────────────────────────────────────

async function suiteErrosAPI() {
  const original = window.fetch;
  mockSession("token-ok");
  const results = [];

  // Mensagem inexistente (404 no meta)
  mockFetchWithMeta({ metaStatus: 404 });
  results.push(await runTest("mensagem inexistente retorna status=not_found", async () => {
    const r = await replyEmail({ messageId: "nao-existe", body: "Ola" });
    assert(r.status === "not_found", `deve ser not_found: ${r.status}`);
  }));

  // Token expirado (401 no envio)
  mockFetchWithMeta({ sendStatus: 401 });
  results.push(await runTest("401 no envio retorna status=expired", async () => {
    const r = await replyEmail({ messageId: "msg-001", body: "Ola" });
    assert(r.status === "expired", `deve ser expired: ${r.status}`);
  }));

  // 403
  mockFetchWithMeta({ sendStatus: 403 });
  results.push(await runTest("403 retorna status=error", async () => {
    const r = await forwardEmail({ messageId: "msg-001", recipients: ["a@b.com"] });
    assert(r.status === "error", `deve ser error: ${r.status}`);
  }));

  // API indisponivel (network error)
  window.fetch = async () => { throw new Error("Network error"); };
  results.push(await runTest("network error retorna status=error", async () => {
    const r = await replyEmail({ messageId: "msg-001", body: "Ola" });
    assert(r.status === "error", `deve ser error: ${r.status}`);
  }));

  window.fetch = original;
  return results;
}

// ── Suite: Desconectado ───────────────────────────────────────────────────────

async function suiteDesconectado() {
  const original = window.fetch;
  mockDisconnected();

  const results = await Promise.all([
    runTest("replyEmail desconectado retorna disconnected", async () => {
      const r = await replyEmail({ messageId: "msg-001", body: "Ola" });
      assert(r.status === "disconnected", `deve ser disconnected: ${r.status}`);
    }),
    runTest("forwardEmail desconectado retorna disconnected", async () => {
      const r = await forwardEmail({ messageId: "msg-001", recipients: ["a@b.com"] });
      assert(r.status === "disconnected", `deve ser disconnected: ${r.status}`);
    }),
    runTest("createReplyDraft desconectado retorna disconnected", async () => {
      const r = await createReplyDraft({ messageId: "msg-001", body: "Ola" });
      assert(r.status === "disconnected", `deve ser disconnected: ${r.status}`);
    }),
    runTest("createForwardDraft desconectado retorna disconnected", async () => {
      const r = await createForwardDraft({ messageId: "msg-001", recipients: ["a@b.com"] });
      assert(r.status === "disconnected", `deve ser disconnected: ${r.status}`);
    }),
  ]);

  window.fetch = original;
  return results;
}

// ── Suite: RuntimeConfirmationEngine ─────────────────────────────────────────

async function suiteConfirmationEngine() {
  const { requestConfirmation, confirm, cancel } = await import("@/lib/runtime/RuntimeConfirmationEngine");

  const results = [];

  // Cancelamento
  results.push(await runTest("cancelamento da confirmacao impede acao", async () => {
    const p = requestConfirmation({
      capability: "gmail.replyEmail",
      title: "Confirmar resposta",
      description: "Responder?",
    });
    const { listPending } = await import("@/lib/runtime/RuntimeConfirmationEngine");
    const pending = listPending();
    const id = pending[pending.length - 1]?.id;
    cancel(id);
    const result = await p;
    assert(result.cancelled === true, "confirmacao deve ser cancelled");
    assert(result.confirmed === false, "confirmed deve ser false");
  }));

  // Timeout
  results.push(await runTest("timeout expira confirmacao", async () => {
    const p = requestConfirmation({
      capability: "gmail.forwardEmail",
      title: "Confirmar encaminhamento",
      description: "Encaminhar?",
      timeoutMs: 50,
    });
    const result = await p;
    assert(result.expired === true, "confirmacao deve estar expired");
    assert(result.confirmed === false, "confirmed deve ser false");
  }));

  // Confirmacao bem-sucedida
  results.push(await runTest("confirmacao libera acao", async () => {
    const p = requestConfirmation({
      capability: "gmail.replyAll",
      title: "Confirmar reply all",
      description: "Responder a todos?",
    });
    const { listPending: lp } = await import("@/lib/runtime/RuntimeConfirmationEngine");
    const pending = lp();
    const id = pending[pending.length - 1]?.id;
    confirm(id);
    const result = await p;
    assert(result.confirmed === true, "confirmacao deve ser confirmed");
  }));

  return results;
}

// ── Runner principal ──────────────────────────────────────────────────────────

export async function runGmailAdvancedTests() {
  const start = Date.now();

  const suites = [
    { suite: "replyEmail",               fn: suiteReplyEmail },
    { suite: "replyAll",                 fn: suiteReplyAll },
    { suite: "forwardEmail",             fn: suiteForwardEmail },
    { suite: "createReplyDraft",         fn: suiteCreateReplyDraft },
    { suite: "createForwardDraft",       fn: suiteCreateForwardDraft },
    { suite: "Erros de API",             fn: suiteErrosAPI },
    { suite: "Desconectado",             fn: suiteDesconectado },
    { suite: "ConfirmationEngine",       fn: suiteConfirmationEngine },
  ];

  const suiteResults = [];
  for (const { suite, fn } of suites) {
    const results = await fn();
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    suiteResults.push({ suite, results, passed, failed, total: results.length });
  }

  const totalPassed = suiteResults.reduce((a, s) => a + s.passed, 0);
  const totalFailed = suiteResults.reduce((a, s) => a + s.failed, 0);
  const totalTests  = suiteResults.reduce((a, s) => a + s.total, 0);
  const verdict     = totalFailed === 0 ? "PASS" : "FAIL";

  return {
    verdict,
    architecturalStatus: verdict === "PASS"
      ? "Implementation 011 — GmailAdvanced APROVADO"
      : `Implementation 011 — ${totalFailed} teste(s) falharam`,
    totalPassed,
    totalFailed,
    totalTests,
    durationMs: Date.now() - start,
    suites: suiteResults,
  };
}