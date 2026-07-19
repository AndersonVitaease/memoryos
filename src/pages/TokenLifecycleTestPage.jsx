/**
 * TokenLifecycleTestPage — Token Lifecycle Test Runner
 * Executa e exibe os resultados de googleAuthSessionTokenTests.js
 */
import React, { useState } from "react";
import { runGoogleAuthSessionTokenTests } from "@/lib/google-auth/googleAuthSessionTokenTests";

export default function TokenLifecycleTestPage() {
  const [result, setResult]   = useState(null);
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      const r = await runGoogleAuthSessionTokenTests();
      setResult(r);
    } catch (e) {
      setResult({ verdict: "FAIL", architecturalStatus: `Runner error: ${e.message}`, totalPassed: 0, totalFailed: 1, totalTests: 1, durationMs: 0, suites: [] });
    } finally {
      setRunning(false);
    }
  }

  const isPass = result?.verdict === "PASS";

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Token Lifecycle Test Suite</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Cobre os 6 cenários críticos: reload, token expirado, _tokenStore vazio, refresh automático, primeira chamada ao Drive, files.list sem nova autenticação.
        </p>
      </div>

      <button
        onClick={handleRun}
        disabled={running}
        className="mb-6 px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm transition-colors"
      >
        {running ? "Executando…" : "▶ Executar Testes"}
      </button>

      {result && (
        <>
          {/* Summary */}
          <div className={`rounded-lg border p-4 mb-6 ${isPass ? "border-emerald-600 bg-emerald-950/30" : "border-red-600 bg-red-950/30"}`}>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-black ${isPass ? "text-emerald-400" : "text-red-400"}`}>
                {isPass ? "✓ PASS" : "✗ FAIL"}
              </span>
              <div>
                <p className={`text-sm font-semibold ${isPass ? "text-emerald-300" : "text-red-300"}`}>
                  {result.architecturalStatus}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {result.totalPassed}/{result.totalTests} passou · {result.totalFailed} falhou · {result.durationMs}ms
                </p>
              </div>
            </div>
          </div>

          {/* Suites */}
          <div className="space-y-4">
            {result.suites.map((s, si) => (
              <div key={si} className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                <div className={`px-4 py-3 flex items-center justify-between ${s.failed > 0 ? "bg-red-950/40" : "bg-emerald-950/20"}`}>
                  <span className="text-sm font-semibold text-zinc-200">{s.suite}</span>
                  <span className={`text-xs font-bold ${s.failed > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {s.passed}/{s.total}
                  </span>
                </div>
                <div className="divide-y divide-zinc-800">
                  {s.results.map((t, ti) => (
                    <div key={ti} className="px-4 py-2.5 flex items-start gap-3">
                      <span className={`text-xs font-bold mt-0.5 shrink-0 ${t.passed ? "text-emerald-400" : "text-red-400"}`}>
                        {t.passed ? "✓" : "✗"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-zinc-300 font-mono">{t.name}</span>
                        {!t.passed && (
                          <p className="text-xs text-red-400 mt-0.5 break-all">{t.error}</p>
                        )}
                      </div>
                      <span className="text-xs text-zinc-600 shrink-0">{t.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}