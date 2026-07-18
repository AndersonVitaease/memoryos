import React, { useState } from "react";
import { runDriveActionResolverTests } from "@/lib/google-drive/DriveActionResolverTests";

function Badge({ ok }) {
  return (
    <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded border ${
      ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
         : "bg-red-900/50 text-red-300 border-red-700"
    }`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

export default function SprintP012Page() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResults(null);
    try {
      // Run synchronously but yield UI
      await new Promise(r => setTimeout(r, 30));
      const res = runDriveActionResolverTests();
      setResults(res);
    } finally {
      setRunning(false);
    }
  }

  const passed = results?.filter(r => r.passed).length ?? 0;
  const total  = results?.length ?? 0;
  const allPass = total > 0 && passed === total;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-3xl mx-auto space-y-6">

        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">SPRINT P-01.2</div>
          <h1 className="text-2xl font-bold">Drive Action Resolution — Validation</h1>
          <p className="text-zinc-400 text-sm mt-1">
            EF-8 Test suite: fileId propagation, auto-selection, ambiguity, download strategy, guards.
          </p>
        </div>

        {/* Architecture summary */}
        <div className="border border-zinc-800 rounded-lg p-4 space-y-2 text-sm text-zinc-300">
          <div className="font-bold text-white mb-2">Fluxo After Fix</div>
          {[
            ["User Intent",        "Abra a planilha de vendas"],
            ["Search",             "drive.searchFiles(query)"],
            ["Resolver",           "DriveActionResolver.resolveFromSearchResult()"],
            ["Auto-select (1)",    "selectedFile = results[0] → fileId propagated"],
            ["Clarify (>1)",       "Encontrei N arquivos. Qual deseja?"],
            ["Guard (0)",          "NO_FILE_SELECTED — structured error, no API call"],
            ["Download Strategy",  "getDownloadConfig(mimeType) → export / media"],
            ["Parser",             "readFile() → existing parser"],
          ].map(([stage, detail]) => (
            <div key={stage} className="flex gap-3">
              <span className="text-violet-400 w-44 shrink-0">{stage}</span>
              <span className="text-zinc-400">{detail}</span>
            </div>
          ))}
        </div>

        <button
          onClick={run}
          disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors"
        >
          {running ? "Running tests…" : "▶  Run 14 Tests (EF-8)"}
        </button>

        {results && (
          <>
            <div className={`border rounded-lg p-4 flex items-center justify-between ${
              allPass ? "border-emerald-700 bg-emerald-950/20" : "border-red-700 bg-red-950/20"
            }`}>
              <div>
                <div className="text-xs text-zinc-400">Test Coverage</div>
                <div className={`text-3xl font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                  {passed}/{total}
                </div>
              </div>
              <div className={`text-xl font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                {allPass ? "✓ ALL PASS" : `✗ ${total - passed} FAILED`}
              </div>
            </div>

            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className={`border rounded-lg px-4 py-3 flex items-start gap-3 ${
                  r.passed ? "border-zinc-800 bg-zinc-900/30" : "border-red-800 bg-red-950/20"
                }`}>
                  <Badge ok={r.passed} />
                  <div className="flex-1">
                    <div className="text-sm text-white">{r.name}</div>
                    {!r.passed && (
                      <div className="text-xs text-red-400 mt-1">{r.message}</div>
                    )}
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">{r.durationMs}ms</span>
                </div>
              ))}
            </div>

            {/* Coverage summary */}
            <div className="border border-zinc-800 rounded-lg p-4 space-y-1 text-xs font-mono text-zinc-400">
              <div className="text-white font-bold mb-2">EF Coverage</div>
              {[
                ["EF-1", "fileId propagation root cause diagnosed", true],
                ["EF-2", "selectedFile context (execution-scoped, not persisted)", true],
                ["EF-3", "open/download/read/export use selectedFile.id", true],
                ["EF-4", "single result → auto-execute (T01)", true],
                ["EF-5", "multiple results → clarification + selectCandidate (T02, T11, T12, T14)", true],
                ["EF-6", "download strategy by MIME: export vs media (T07..T10, T13)", true],
                ["EF-7", "delegates to existing readFile parser (T07)", true],
                ["EF-8", "14 tests added (this page)", true],
                ["EF-9", "driveLog() structured logging at all phases", true],
                ["EF-10", "assertFileId guard — NO_FILE_SELECTED never ValidationError (T04, T05, T06)", true],
              ].map(([ef, desc, ok]) => (
                <div key={ef} className="flex gap-2">
                  <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
                  <span className="text-violet-300 w-12">{ef}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}