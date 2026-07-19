import React, { useState } from "react";

export default function GmailReadEmailTestPage() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const runTests = async () => {
    setRunning(true);
    setResults(null);
    try {
      const { runGmailReadEmailIntegrationTests } = await import(
        "@/tests/integration/GmailReadEmailIntegrationTest"
      );
      const r = runGmailReadEmailIntegrationTests();
      setResults(r);
    } catch (err) {
      setResults({ error: err.message, passed: 0, failed: 0, results: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-violet-400 mb-1">
          Gmail ReadEmail — Integration Tests
        </h1>
        <p className="text-zinc-500 text-sm mb-6">
          Valida o fluxo completo: GoalType → Planner → ExecutionPlan → capability=readEmail → MimeParser
        </p>

        <button
          onClick={runTests}
          disabled={running}
          className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded text-sm font-bold mb-6 transition"
        >
          {running ? "Executando..." : "▶ Executar Testes"}
        </button>

        {results?.error && (
          <div className="bg-red-900/40 border border-red-700 rounded p-4 text-red-300 text-sm mb-4">
            <strong>ERRO:</strong> {results.error}
          </div>
        )}

        {results && !results.error && (
          <>
            <div className="flex gap-4 mb-6">
              <div className="bg-green-900/40 border border-green-700 rounded px-4 py-2 text-green-300">
                ✓ Passed: <strong>{results.passed}</strong>
              </div>
              <div className={`border rounded px-4 py-2 ${results.failed > 0 ? "bg-red-900/40 border-red-700 text-red-300" : "bg-zinc-800 border-zinc-700 text-zinc-400"}`}>
                ✗ Failed: <strong>{results.failed}</strong>
              </div>
            </div>

            <div className="space-y-2">
              {results.results.map((r, i) => (
                <div
                  key={i}
                  className={`rounded px-3 py-2 text-sm border ${
                    r.pass
                      ? "bg-green-900/20 border-green-800 text-green-300"
                      : "bg-red-900/20 border-red-800 text-red-300"
                  }`}
                >
                  <span className="mr-2">{r.pass ? "✓" : "✗"}</span>
                  <span>{r.label}</span>
                  {r.detail && (
                    <div className="mt-1 ml-5 text-xs text-zinc-400">{r.detail}</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}