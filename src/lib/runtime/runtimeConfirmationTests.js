/**
 * runtimeConfirmationTests — Implementation 010.5
 * Suite de testes para RuntimeConfirmationEngine.
 */

import {
  requestConfirmation,
  confirm,
  cancel,
  getPending,
  listPending,
  getAuditLog,
  getMetrics,
} from "./RuntimeConfirmationEngine";

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

const BASE_REQ = {
  capability:  "test.action",
  title:       "Confirmar teste",
  description: "Descricao do teste",
  payload:     { key: "value" },
  userId:      "user-test-001",
};

// ── Suite: Confirmar ──────────────────────────────────────────────────────────

async function suiteConfirmar() {
  return Promise.all([
    runTest("confirm() retorna confirmed=true", async () => {
      const p = requestConfirmation(BASE_REQ);
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      assert(id, "deve haver uma solicitacao pendente");
      confirm(id);
      const result = await p;
      assert(result.confirmed === true, `confirmed deve ser true: ${JSON.stringify(result)}`);
      assert(result.cancelled === false, "cancelled deve ser false");
      assert(result.expired === false, "expired deve ser false");
    }),

    runTest("getPending() retorna solicitacao antes da confirmacao", async () => {
      const p = requestConfirmation(BASE_REQ);
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      const req = getPending(id);
      assert(req !== null, "deve retornar a solicitacao");
      assert(req.capability === "test.action", "capability incorreta");
      confirm(id);
      await p;
    }),

    runTest("payload preservado na solicitacao", async () => {
      const payload = { amount: 100, recipient: "joao@example.com" };
      const p = requestConfirmation({ ...BASE_REQ, payload });
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      const req = getPending(id);
      assert(req.payload?.amount === 100, "payload.amount incorreto");
      assert(req.payload?.recipient === "joao@example.com", "payload.recipient incorreto");
      confirm(id);
      await p;
    }),

    runTest("IDs unicos para solicitacoes simultâneas", async () => {
      const p1 = requestConfirmation(BASE_REQ);
      const p2 = requestConfirmation(BASE_REQ);
      const pending = listPending();
      const ids = pending.slice(-2).map(r => r.id);
      assert(ids[0] !== ids[1], `IDs devem ser unicos: ${ids[0]} === ${ids[1]}`);
      confirm(ids[0]);
      confirm(ids[1]);
      await Promise.all([p1, p2]);
    }),
  ]);
}

// ── Suite: Cancelar ───────────────────────────────────────────────────────────

async function suiteCancelar() {
  return Promise.all([
    runTest("cancel() retorna cancelled=true", async () => {
      const p = requestConfirmation(BASE_REQ);
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      cancel(id);
      const result = await p;
      assert(result.cancelled === true, `cancelled deve ser true: ${JSON.stringify(result)}`);
      assert(result.confirmed === false, "confirmed deve ser false");
      assert(result.expired === false, "expired deve ser false");
    }),

    runTest("getPending() retorna null apos cancelamento", async () => {
      const p = requestConfirmation(BASE_REQ);
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      cancel(id);
      await p;
      const req = getPending(id);
      assert(req === null, "deve ser null apos cancelar");
    }),
  ]);
}

// ── Suite: Expirar ────────────────────────────────────────────────────────────

async function suiteExpirar() {
  return Promise.all([
    runTest("expira automaticamente apos timeoutMs", async () => {
      const p = requestConfirmation({ ...BASE_REQ, timeoutMs: 50 });
      const result = await p;
      assert(result.expired === true, `expired deve ser true: ${JSON.stringify(result)}`);
      assert(result.confirmed === false, "confirmed deve ser false");
      assert(result.cancelled === false, "cancelled deve ser false");
    }),

    runTest("getPending() retorna null apos expiracao", async () => {
      const p = requestConfirmation({ ...BASE_REQ, timeoutMs: 50 });
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      await p;
      const req = getPending(id);
      assert(req === null, "deve ser null apos expirar");
    }),
  ]);
}

// ── Suite: Reutilizacao bloqueada ─────────────────────────────────────────────

async function suiteReutilizacao() {
  return Promise.all([
    runTest("confirm() em ID ja confirmado retorna false", async () => {
      const p = requestConfirmation(BASE_REQ);
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      const first  = confirm(id);
      const second = confirm(id);
      await p;
      assert(first  === true,  "primeiro confirm deve retornar true");
      assert(second === false, "segundo confirm deve retornar false (ja consumido)");
    }),

    runTest("cancel() em ID ja cancelado retorna false", async () => {
      const p = requestConfirmation(BASE_REQ);
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      const first  = cancel(id);
      const second = cancel(id);
      await p;
      assert(first  === true,  "primeiro cancel deve retornar true");
      assert(second === false, "segundo cancel deve retornar false");
    }),

    runTest("cancel() apos confirm() retorna false", async () => {
      const p = requestConfirmation(BASE_REQ);
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      confirm(id);
      const cancelResult = cancel(id);
      await p;
      assert(cancelResult === false, "cancel apos confirm deve retornar false");
    }),
  ]);
}

// ── Suite: Auditoria ──────────────────────────────────────────────────────────

async function suiteAuditoria() {
  return Promise.all([
    runTest("confirmacao registrada na auditoria", async () => {
      const p = requestConfirmation({ ...BASE_REQ, userId: "audit-user-1" });
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      confirm(id);
      await p;
      const log = getAuditLog();
      const entry = log.find(e => e.id === id);
      assert(entry !== undefined, "deve existir entrada de auditoria");
      assert(entry.decision === "confirmed", `decision incorreta: ${entry.decision}`);
      assert(entry.userId === "audit-user-1", "userId incorreto");
      assert(entry.capability === "test.action", "capability incorreta");
      assert(typeof entry.durationMs === "number", "durationMs deve ser number");
    }),

    runTest("cancelamento registrado na auditoria", async () => {
      const p = requestConfirmation({ ...BASE_REQ, userId: "audit-user-2" });
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      cancel(id);
      await p;
      const log = getAuditLog();
      const entry = log.find(e => e.id === id);
      assert(entry?.decision === "cancelled", `decision deve ser cancelled: ${entry?.decision}`);
    }),

    runTest("expiracao registrada na auditoria", async () => {
      const p = requestConfirmation({ ...BASE_REQ, timeoutMs: 50, userId: "audit-user-3" });
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      await p;
      const log = getAuditLog();
      const entry = log.find(e => e.id === id);
      assert(entry?.decision === "expired", `decision deve ser expired: ${entry?.decision}`);
    }),

    runTest("getMetrics() retorna contagens corretas", async () => {
      const metrics = getMetrics();
      assert(typeof metrics.confirmed   === "number", "confirmed deve ser number");
      assert(typeof metrics.cancelled   === "number", "cancelled deve ser number");
      assert(typeof metrics.expired     === "number", "expired deve ser number");
      assert(typeof metrics.total       === "number", "total deve ser number");
      assert(typeof metrics.avgDurationMs === "number", "avgDurationMs deve ser number");
    }),
  ]);
}

// ── Suite: Concorrencia ───────────────────────────────────────────────────────

async function suiteConcorrencia() {
  return Promise.all([
    runTest("multiplas confirmacoes simultâneas resolvem independentemente", async () => {
      const promises = [
        requestConfirmation({ ...BASE_REQ, capability: "cap.a" }),
        requestConfirmation({ ...BASE_REQ, capability: "cap.b" }),
        requestConfirmation({ ...BASE_REQ, capability: "cap.c" }),
      ];

      const pending = listPending().slice(-3);
      confirm(pending[0].id);
      cancel(pending[1].id);
      confirm(pending[2].id);

      const [r1, r2, r3] = await Promise.all(promises);

      assert(r1.confirmed === true,  "r1 deve ser confirmed");
      assert(r2.cancelled === true,  "r2 deve ser cancelled");
      assert(r3.confirmed === true,  "r3 deve ser confirmed");
    }),

    runTest("listPending() apenas retorna solicitacoes ativas", async () => {
      const p = requestConfirmation(BASE_REQ);
      const before = listPending().length;
      const pending = listPending();
      const id = pending[pending.length - 1]?.id;
      confirm(id);
      await p;
      const after = listPending().length;
      assert(after < before, `pendentes devem diminuir apos resolucao: before=${before} after=${after}`);
    }),
  ]);
}

// ── Runner principal ──────────────────────────────────────────────────────────

export async function runRuntimeConfirmationTests() {
  const start = Date.now();

  const suites = [
    { suite: "Confirmar",             fn: suiteConfirmar },
    { suite: "Cancelar",              fn: suiteCancelar },
    { suite: "Expirar",               fn: suiteExpirar },
    { suite: "Reutilizacao bloqueada", fn: suiteReutilizacao },
    { suite: "Auditoria",             fn: suiteAuditoria },
    { suite: "Concorrencia",          fn: suiteConcorrencia },
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
      ? "Implementation 010.5 — RuntimeConfirmationEngine APROVADO"
      : `Implementation 010.5 — ${totalFailed} teste(s) falharam`,
    totalPassed,
    totalFailed,
    totalTests,
    durationMs: Date.now() - start,
    suites: suiteResults,
  };
}