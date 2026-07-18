/**
 * SprintEF63Page — Engineering Sprint EF-6.3.x
 * Semantic Intent Refactor — Single Provider per Connector
 *
 * Validates:
 *   - 1 DriveSemanticProvider for all Drive intents
 *   - drive.downloadFile, drive.openDocument, drive.searchFiles, drive.listRecent
 *   - Gmail and Calendar retrocompatibility
 *   - Architecture: no per-action providers
 */

import React, { useState } from "react";

// ── Test runner ───────────────────────────────────────────────────────────────

async function runEF63Tests() {
  const { DriveSemanticProvider } = await import("@/lib/semantic-registry/providers/DriveSemanticProvider");
  const { GmailSemanticProvider } = await import("@/lib/semantic-registry/providers/GmailSemanticProvider");
  const { CalendarSemanticProvider } = await import("@/lib/semantic-registry/providers/CalendarSemanticProvider");
  const { isModernProvider, isLegacyProvider } = await import("@/lib/semantic-registry/SemanticTypes");
  const { ConnectorSemanticRegistry } = await import("@/lib/semantic-registry/index");

  const NORM_STUB = { entity: "", isSocialPhrase: false, isEmailQuery: false, normalized: "" };

  const results = [];

  // ── Suite 1: Drive Intent Detection ───────────────────────────────────────
  const DRIVE_CASES = [
    { input: "procure o arquivo orcamento",       expectGoal: "drive.searchFiles",   label: "search-PT" },
    { input: "buscar arquivo relatorio",           expectGoal: "drive.searchFiles",   label: "search-PT2" },
    { input: "search drive for budget",            expectGoal: "drive.searchFiles",   label: "search-EN" },
    { input: "abra o arquivo orcamento",           expectGoal: "drive.openDocument",  label: "open-PT" },
    { input: "abrir o documento proposta",         expectGoal: "drive.openDocument",  label: "open-PT2" },
    { input: "visualizar arquivo contrato",        expectGoal: "drive.openDocument",  label: "open-visualizar" },
    { input: "baixe o arquivo orcamento",          expectGoal: "drive.downloadFile",  label: "download-PT" },
    { input: "baixar o documento report",          expectGoal: "drive.downloadFile",  label: "download-PT2" },
    { input: "download arquivo relatorio",         expectGoal: "drive.downloadFile",  label: "download-EN" },
    { input: "exportar arquivo planilha",          expectGoal: "drive.downloadFile",  label: "download-exportar" },
    { input: "liste meus arquivos",                expectGoal: "drive.listRecent",    label: "list-PT" },
    { input: "meus arquivos recentes",             expectGoal: "drive.listRecent",    label: "list-recentes" },
    { input: "ver drive",                          expectGoal: "drive.listRecent",    label: "list-ver-drive" },
    { input: "Baixe o arquivo Report on notes CMC", expectGoal: "drive.downloadFile", label: "original-bug-case" },
  ];

  for (const { input, expectGoal, label } of DRIVE_CASES) {
    const detection = DriveSemanticProvider.detect(input.toLowerCase(), NORM_STUB);
    const passed = detection.goalType === expectGoal && detection.confidence >= 0.20;
    results.push({
      suite: "Drive Intent",
      name:  label,
      input,
      expectGoal,
      actualGoal:  detection.goalType,
      confidence:  detection.confidence,
      evidences:   detection.evidences.join(", "),
      passed,
      error: passed ? null : `Expected ${expectGoal}, got ${detection.goalType} (conf=${detection.confidence})`,
    });
  }

  // ── Suite 2: Architecture Invariants ──────────────────────────────────────
  const archTests = [
    {
      name: "DriveSemanticProvider is modern (detect)",
      passed: isModernProvider(DriveSemanticProvider),
      error: "DriveSemanticProvider must implement detect()",
    },
    {
      name: "GmailSemanticProvider is legacy-compatible",
      passed: isLegacyProvider(GmailSemanticProvider),
      error: "GmailSemanticProvider must implement score() + implicitGoalType",
    },
    {
      name: "CalendarSemanticProvider is legacy-compatible",
      passed: isLegacyProvider(CalendarSemanticProvider),
      error: "CalendarSemanticProvider must implement score() + implicitGoalType",
    },
    {
      name: "Registry has exactly 4 providers (gmail, calendar, drive, memory)",
      passed: ConnectorSemanticRegistry.size === 4,
      error:  `Expected 4, got ${ConnectorSemanticRegistry.size}: ${ConnectorSemanticRegistry.listIds().join(", ")}`,
    },
    {
      name: "No DriveOpenDocumentSemanticProvider exported",
      passed: !("DriveOpenDocumentSemanticProvider" in (await import("@/lib/semantic-registry/providers/DriveSemanticProvider"))),
      error: "DriveOpenDocumentSemanticProvider must not exist (EF-6.3.x)",
    },
    {
      name: "Registry IDs are: calendar, drive, gmail, memory",
      passed: JSON.stringify(ConnectorSemanticRegistry.listIds()) === JSON.stringify(["calendar","drive","gmail","memory"]),
      error: `Got: ${ConnectorSemanticRegistry.listIds().join(", ")}`,
    },
  ];

  for (const t of archTests) {
    results.push({ suite: "Architecture", name: t.name, passed: t.passed, error: t.error ?? null,
      input: "-", expectGoal: "-", actualGoal: "-", confidence: null, evidences: "-" });
  }

  // ── Suite 3: Gmail Retrocompatibility ─────────────────────────────────────
  const GMAIL_CASES = [
    { input: "shopee", expectDetect: true,  label: "gmail-shopee" },
    { input: "recebi email da amazon", expectDetect: true, label: "gmail-amazon" },
    { input: "boleto bradesco", expectDetect: true, label: "gmail-boleto" },
    { input: "bom dia", expectDetect: false, label: "gmail-social" },
  ];

  for (const { input, expectDetect, label } of GMAIL_CASES) {
    const { score } = GmailSemanticProvider.score(input.toLowerCase(), NORM_STUB);
    const detected = score >= 0.20;
    const passed = detected === expectDetect;
    results.push({
      suite: "Gmail Retrocompat",
      name: label,
      input,
      expectGoal: expectDetect ? "gmail.searchMessages" : "(none)",
      actualGoal: detected ? "gmail.searchMessages" : "(none)",
      confidence: score,
      evidences: "-",
      passed,
      error: passed ? null : `Expected detect=${expectDetect}, got score=${score}`,
    });
  }

  // ── Suite 4: Calendar Retrocompatibility ──────────────────────────────────
  const CAL_CASES = [
    { input: "reuniao hoje",       expectDetect: true,  label: "cal-reuniao-hoje" },
    { input: "agenda da semana",   expectDetect: true,  label: "cal-agenda-semana" },
    { input: "compromisso amanha", expectDetect: true,  label: "cal-compromisso" },
    { input: "baixar arquivo",     expectDetect: false, label: "cal-no-match-drive" },
  ];

  for (const { input, expectDetect, label } of CAL_CASES) {
    const { score } = CalendarSemanticProvider.score(input.toLowerCase(), NORM_STUB);
    const detected = score >= 0.20;
    const passed = detected === expectDetect;
    results.push({
      suite: "Calendar Retrocompat",
      name: label,
      input,
      expectGoal: expectDetect ? "calendar.listToday" : "(none)",
      actualGoal: detected ? "calendar.listToday" : "(none)",
      confidence: score,
      evidences: "-",
      passed,
      error: passed ? null : `Expected detect=${expectDetect}, got score=${score}`,
    });
  }

  const total  = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const certified = failed === 0;

  return { results, total, passed, failed, certified };
}

// ── UI ────────────────────────────────────────────────────────────────────────

function Badge({ status }) {
  const styles = {
    PASS: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
    FAIL: "bg-red-900/50 text-red-300 border-red-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

function GoalBadge({ goal }) {
  const colors = {
    "drive.downloadFile":  "text-yellow-300",
    "drive.openDocument":  "text-blue-300",
    "drive.searchFiles":   "text-violet-300",
    "drive.listRecent":    "text-teal-300",
    "gmail.searchMessages":"text-orange-300",
    "calendar.listToday":  "text-pink-300",
  };
  return <span className={`font-mono text-xs ${colors[goal] ?? "text-zinc-400"}`}>{goal}</span>;
}

const SUITE_COLORS = {
  "Drive Intent":        "border-violet-700 bg-violet-950/20 text-violet-300",
  "Architecture":        "border-blue-700 bg-blue-950/20 text-blue-300",
  "Gmail Retrocompat":   "border-orange-700 bg-orange-950/20 text-orange-300",
  "Calendar Retrocompat":"border-pink-700 bg-pink-950/20 text-pink-300",
};

export default function SprintEF63Page() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);

  async function run() {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const r = await runEF63Tests();
      setReport(r);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  // Group results by suite
  const suites = report
    ? [...new Set(report.results.map(r => r.suite))].map(suite => ({
        suite,
        rows: report.results.filter(r => r.suite === suite),
      }))
    : [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">
            ENGINEERING SPRINT EF-6.3.x
          </div>
          <h1 className="text-3xl font-bold">Semantic Intent Refactor</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Single SemanticProvider per connector — multi-intent detection
          </p>
        </div>

        {/* Architecture diagram */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 space-y-3">
          <div className="text-xs text-zinc-400 tracking-widest">ARCHITECTURE: 1 PROVIDER PER DOMAIN</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {[
              { label: "DriveSemanticProvider", type: "modern", goals: ["drive.downloadFile","drive.openDocument","drive.searchFiles","drive.listRecent"] },
              { label: "GmailSemanticProvider", type: "legacy", goals: ["gmail.searchMessages"] },
              { label: "CalendarSemanticProvider", type: "legacy", goals: ["calendar.listToday"] },
              { label: "MemorySemanticProvider", type: "legacy", goals: ["memory.*"] },
            ].map(p => (
              <div key={p.label} className={`rounded border p-3 space-y-2 ${p.type === "modern" ? "border-violet-700 bg-violet-950/20" : "border-zinc-700 bg-zinc-900"}`}>
                <div className="font-bold text-white text-xs leading-tight">{p.label}</div>
                <div className={`text-xs px-1.5 py-0.5 rounded ${p.type === "modern" ? "bg-violet-800/50 text-violet-300" : "bg-zinc-700 text-zinc-300"}`}>
                  {p.type === "modern" ? "detect() — EF-6.3.x" : "score() — legacy"}
                </div>
                {p.goals.map(g => <div key={g} className="text-zinc-400">→ {g}</div>)}
              </div>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={run}
          disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors"
        >
          {running ? "Running EF-6.3.x Certification…" : "▶  Run Full Certification"}
        </button>

        {error && (
          <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 text-red-300 text-sm">
            Error: {error}
          </div>
        )}

        {/* Results */}
        {report && (
          <>
            {/* Summary */}
            <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-violet-500 bg-violet-950/20" : "border-red-700 bg-red-950/10"}`}>
              <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                {report.certified ? "✓ EF-6.3.x CERTIFIED" : "✗ CERTIFICATION FAILED"}
              </div>
              <div className="text-zinc-400 text-sm mt-2">
                {report.passed} / {report.total} passed · {report.failed} failed
              </div>
              {report.certified && (
                <div className="text-zinc-500 text-xs mt-2 font-mono">
                  Single provider per domain · Multi-intent detection · Retrocompatibility verified
                </div>
              )}
            </div>

            {/* Suite tables */}
            {suites.map(({ suite, rows }) => {
              const suitePassed = rows.filter(r => r.passed).length;
              return (
                <div key={suite} className="space-y-2">
                  <div className={`border rounded-lg px-4 py-3 flex items-center justify-between ${SUITE_COLORS[suite] ?? "border-zinc-700 text-zinc-300"}`}>
                    <span className="font-bold text-sm">{suite}</span>
                    <span className="text-xs font-mono">{suitePassed}/{rows.length}</span>
                  </div>
                  <div className="border border-zinc-800 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-900 text-zinc-400">
                        <tr>
                          <th className="text-left p-2 pl-3">Test</th>
                          <th className="text-left p-2">Input</th>
                          <th className="text-left p-2">Expected</th>
                          <th className="text-left p-2">Actual</th>
                          <th className="text-right p-2">Conf</th>
                          <th className="text-center p-2 pr-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {rows.map((r, i) => (
                          <tr key={i} className={r.passed ? "bg-zinc-950" : "bg-red-950/20"}>
                            <td className="p-2 pl-3 text-zinc-300">{r.name}</td>
                            <td className="p-2 text-zinc-500 max-w-[180px] truncate" title={r.input}>{r.input}</td>
                            <td className="p-2"><GoalBadge goal={r.expectGoal} /></td>
                            <td className="p-2"><GoalBadge goal={r.actualGoal} /></td>
                            <td className="p-2 text-right text-zinc-400">
                              {r.confidence !== null ? r.confidence.toFixed(2) : "-"}
                            </td>
                            <td className="p-2 pr-3 text-center">
                              <Badge status={r.passed ? "PASS" : "FAIL"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Failed details */}
                    {rows.filter(r => !r.passed).map((r, i) => (
                      <div key={i} className="border-t border-red-800 bg-red-950/10 px-3 py-2 text-red-300 text-xs font-mono">
                        ✗ {r.name}: {r.error}
                        {r.evidences && r.evidences !== "-" && (
                          <div className="text-red-500 mt-0.5">evidences: {r.evidences}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 space-y-2">
          <div className="text-xs text-zinc-400 tracking-widest mb-3">ACCEPTANCE CRITERIA EF-6.3.x</div>
          {[
            "1 DriveSemanticProvider — no per-action providers",
            "drive.downloadFile resolved by download verbs (baixar, download, exportar)",
            "drive.openDocument resolved by open verbs (abrir, visualizar, ler)",
            "drive.searchFiles resolved by search verbs (procurar, buscar, encontrar)",
            "drive.listRecent resolved by list verbs (listar, meus arquivos, recentes)",
            "Gmail retrocompatibility — score() + implicitGoalType preserved",
            "Calendar retrocompatibility — score() + implicitGoalType preserved",
            "detect() contract for modern providers (EF-6.3.x standard)",
            "Extensible: new connector = new provider file, zero detector changes",
          ].map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className="text-emerald-500 mt-0.5">✓</span>
              <span>{c}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}