/**
 * googleProfileTests — Implementation 008
 * Suite de testes para GoogleProfileConnector.
 */

import { fetchGoogleProfile } from "./GoogleProfileConnector";
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

// ── Mocks ─────────────────────────────────────────────────────────────────────

function mockSession(accessToken, conn = { state: "CONNECTED" }) {
  GoogleAuthSession.ensureValidToken = async () => conn;
  GoogleAuthSession.getAccessToken   = () => accessToken;
}

function mockFetch(status, body) {
  window.fetch = async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

function restoreFetch(original) {
  window.fetch = original;
}

// ── Test suites ───────────────────────────────────────────────────────────────

async function suiteConnectedUser() {
  const originalFetch = window.fetch;

  const fakeProfile = {
    sub: "google-id-123",
    name: "Joao Silva",
    given_name: "Joao",
    family_name: "Silva",
    email: "joao@example.com",
    email_verified: true,
    picture: "https://example.com/photo.jpg",
    locale: "pt-BR",
  };

  mockSession("valid-token-abc");
  mockFetch(200, fakeProfile);

  const results = await Promise.all([
    runTest("retorna ok=true quando conectado", async () => {
      const r = await fetchGoogleProfile();
      assert(r.ok === true, "ok deve ser true");
    }),
    runTest("retorna status=connected", async () => {
      const r = await fetchGoogleProfile();
      assert(r.status === "connected", `status deve ser connected, recebeu: ${r.status}`);
    }),
    runTest("retorna perfil com todos os campos", async () => {
      const r = await fetchGoogleProfile();
      assert(r.profile?.sub === fakeProfile.sub, "sub incorreto");
      assert(r.profile?.email === fakeProfile.email, "email incorreto");
      assert(r.profile?.given_name === fakeProfile.given_name, "given_name incorreto");
      assert(r.profile?.email_verified === true, "email_verified incorreto");
      assert(r.profile?.locale === fakeProfile.locale, "locale incorreto");
    }),
    runTest("error é null quando bem-sucedido", async () => {
      const r = await fetchGoogleProfile();
      assert(r.error === null, "error deve ser null");
    }),
  ]);

  restoreFetch(originalFetch);
  return results;
}

async function suiteDisconnectedUser() {
  const originalFetch = window.fetch;

  GoogleAuthSession.ensureValidToken = async () => null;
  GoogleAuthSession.getAccessToken   = () => null;

  const results = await Promise.all([
    runTest("retorna ok=false quando desconectado", async () => {
      const r = await fetchGoogleProfile();
      assert(r.ok === false, "ok deve ser false");
    }),
    runTest("retorna status=disconnected", async () => {
      const r = await fetchGoogleProfile();
      assert(r.status === "disconnected", `status deve ser disconnected, recebeu: ${r.status}`);
    }),
    runTest("retorna mensagem amigavel sem stack trace", async () => {
      const r = await fetchGoogleProfile();
      assert(typeof r.error === "string" && r.error.length > 0, "error deve ser string nao vazia");
      assert(!r.error.includes("at "), "error nao deve conter stack trace");
    }),
    runTest("profile é null quando desconectado", async () => {
      const r = await fetchGoogleProfile();
      assert(r.profile === null, "profile deve ser null");
    }),
  ]);

  restoreFetch(originalFetch);
  return results;
}

async function suiteTokenErrors() {
  const originalFetch = window.fetch;

  const results = [];

  // 401
  mockSession("expired-token");
  mockFetch(401, { error: "invalid_token" });
  results.push(await runTest("retorna status=expired em 401", async () => {
    const r = await fetchGoogleProfile();
    assert(r.ok === false, "ok deve ser false em 401");
    assert(r.status === "expired", `status deve ser expired, recebeu: ${r.status}`);
    assert(r.profile === null, "profile deve ser null em 401");
  }));

  // 403
  mockFetch(403, { error: "forbidden" });
  results.push(await runTest("retorna status=error em 403", async () => {
    const r = await fetchGoogleProfile();
    assert(r.ok === false, "ok deve ser false em 403");
    assert(r.status === "error", `status deve ser error, recebeu: ${r.status}`);
  }));

  // Token ausente após ensureValidToken retornar conn
  GoogleAuthSession.ensureValidToken = async () => ({ state: "CONNECTED" });
  GoogleAuthSession.getAccessToken   = () => null;
  results.push(await runTest("retorna status=expired quando token ausente em memoria", async () => {
    const r = await fetchGoogleProfile();
    assert(r.ok === false, "ok deve ser false");
    assert(r.status === "expired", `status deve ser expired, recebeu: ${r.status}`);
  }));

  // Refresh automatico — ensureValidToken retorna conn (ja renovou internamente)
  mockSession("refreshed-token");
  mockFetch(200, { sub: "id-999", name: "Renovado", email: "r@r.com", email_verified: true });
  results.push(await runTest("refresh automatico — sucesso apos renovacao", async () => {
    const r = await fetchGoogleProfile();
    assert(r.ok === true, "deve funcionar apos refresh");
    assert(r.profile?.sub === "id-999", "profile do token renovado incorreto");
  }));

  restoreFetch(originalFetch);
  return results;
}

// ── Runner principal ──────────────────────────────────────────────────────────

export async function runGoogleProfileTests() {
  const start = Date.now();

  const suites = [
    { suite: "Usuário conectado",    fn: suiteConnectedUser },
    { suite: "Usuário desconectado", fn: suiteDisconnectedUser },
    { suite: "Erros de token",       fn: suiteTokenErrors },
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
      ? "Implementation 008 — GoogleProfileConnector APROVADO"
      : `Implementation 008 — ${totalFailed} teste(s) falharam`,
    totalPassed,
    totalFailed,
    totalTests,
    durationMs: Date.now() - start,
    suites: suiteResults,
  };
}