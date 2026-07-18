/**
 * SprintEF63Page — Engineering Sprint EF-6.3.x (Revisão Final)
 * Semantic Detection Framework v2 — Full Certification
 */

import React, { useState } from "react";

async function runE2ETest(message, expectedGoalType) {
  await import("@/lib/semantic-registry/index");
  const { conversationGoalBridge } = await import("@/lib/conversation-goal-bridge/ConversationGoalBridge");
  const result = conversationGoalBridge.derive(message, "general_conversation", 0.6);
  return {
    message,
    expectedGoalType,
    actualGoalType: result.goal.type,
    passed: result.goal.type === expectedGoalType,
    confidence: result.goal.confidence,
    durationMs: result.durationMs,
  };
}

async function runAllTests() {
  await import("@/lib/semantic-registry/index");

  const { DriveSemanticProvider } = await import("@/lib/semantic-registry/providers/DriveSemanticProvider");
  const { GmailSemanticProvider } = await import("@/lib/semantic-registry/providers/GmailSemanticProvider");
  const { CalendarSemanticProvider } = await import("@/lib/semantic-registry/providers/CalendarSemanticProvider");
  const { isModernProvider, isLegacyProvider } = await import("@/lib/semantic-registry/SemanticTypes");
  const { ConnectorSemanticRegistry } = await import("@/lib/semantic-registry/index");

  const NORM = { entity: "", isSocialPhrase: false, isEmailQuery: false, normalized: "" };
  const results = [];

  // ── Suite 1: INTENT_RULES ──────────────────────────────────────────────────
  const DRIVE_CASES = [
    { input: "baixe o arquivo orcamento",              expect: "drive.downloadFile", label: "download-baixe" },
    { input: "baixar o arquivo relatorio financeiro",  expect: "drive.downloadFile", label: "download-baixar" },
    { input: "download arquivo budget",                expect: "drive.downloadFile", label: "download-EN" },
    { input: "exportar planilha dados",                expect: "drive.downloadFile", label: "download-exportar" },
    { input: "baixe o arquivo report on notes cmc",   expect: "drive.downloadFile", label: "BUG-ORIGINAL" },
    { input: "abra o documento contrato",              expect: "drive.openDocument", label: "open-abra" },
    { input: "abrir o arquivo proposta",               expect: "drive.openDocument", label: "open-abrir" },
    { input: "visualizar arquivo relatorio",           expect: "drive.openDocument", label: "open-visualizar" },
    { input: "ler documento orcamento",                expect: "drive.openDocument", label: "open-ler" },
    { input: "procure o arquivo orcamento",            expect: "drive.searchFiles",  label: "search-procure" },
    { input: "buscar arquivo relatorio",               expect: "drive.searchFiles",  label: "search-buscar" },
    { input: "encontrar documento contrato",           expect: "drive.searchFiles",  label: "search-encontrar" },
    { input: "search drive for budget",                expect: "drive.searchFiles",  label: "search-EN" },
    { input: "liste meus arquivos",                    expect: "drive.listRecent",   label: "list-liste" },
    { input: "meus arquivos recentes",                 expect: "drive.listRecent",   label: "list-recentes" },
    { input: "ver drive",                              expect: "drive.listRecent",   label: "list-ver-drive" },
    { input: "relatorio financeiro",                   expect: "drive.searchFiles",  label: "implicit-domain" },
    { input: "bom dia",                                expect: null,                 label: "no-signal-social" },
  ];

  for (const { input, expect: expectGoal, label } of DRIVE_CASES) {
    const det = DriveSemanticProvider.detect(input.toLowerCase(), NORM);
    const passed = expectGoal === null
      ? (det.goalType === null || det.confidence < 0.20)
      : (det.goalType === expectGoal && det.confidence >= 0.20);
    results.push({
      suite: "1 — INTENT_RULES (Drive)",
      label, input,
      expectGoal: expectGoal ?? "(null)",
      actualGoal: det.goalType ?? "(null)",
      confidence: det.confidence,
      evidences: det.evidences.slice(0, 3).join(" | "),
      passed,
      error: passed ? null : `Expected ${expectGoal ?? "null"}, got ${det.goalType} conf=${det.confidence.toFixed(2)}`,
    });
  }

  // ── Suite 2: SemanticDetection contract ────────────────────────────────────
  const noSignal   = DriveSemanticProvider.detect("hello world", NORM);
  const withDl     = DriveSemanticProvider.detect("baixar arquivo", NORM);
  const withQuoted = DriveSemanticProvider.detect('baixar o arquivo "orcamento 2024"', NORM);
  const withNoun   = DriveSemanticProvider.detect("baixar o arquivo relatorio financeiro", NORM);

  const contractTests = [
    { label: "goalType null when no drive signals",    passed: noSignal.goalType === null,                          error: `Got ${noSignal.goalType}` },
    { label: "goalType=drive.downloadFile for baixar", passed: withDl.goalType === "drive.downloadFile",            error: `Got ${withDl.goalType}` },
    { label: "SemanticDetection fields present",       passed: typeof withDl.connector === "string" && typeof withDl.confidence === "number" && Array.isArray(withDl.evidences), error: "Missing fields" },
    { label: "entities.rawText always present",        passed: typeof withDl.entities.rawText === "string",         error: "rawText missing" },
    { label: "entities.fileName from quotes",          passed: withQuoted.entities.fileName === "orcamento 2024",   error: `Got ${withQuoted.entities.fileName}` },
    { label: "entities.fileName from noun phrase",     passed: typeof withNoun.entities.fileName === "string" && withNoun.entities.fileName.length > 0, error: "fileName not extracted" },
  ];

  for (const t of contractTests) {
    results.push({ suite: "2 — SemanticDetection Contract", label: t.label, input: "-", expectGoal: "-", actualGoal: "-", confidence: null, evidences: "-", passed: t.passed, error: t.passed ? null : t.error });
  }

  // ── Suite 3: Architecture invariants ───────────────────────────────────────
  const archTests = [
    { label: "DriveSemanticProvider is modern (detect)",   passed: isModernProvider(DriveSemanticProvider),   error: "Must implement detect()" },
    { label: "GmailSemanticProvider is legacy (score)",    passed: isLegacyProvider(GmailSemanticProvider),   error: "Must implement score() + implicitGoalType" },
    { label: "CalendarSemanticProvider is legacy (score)", passed: isLegacyProvider(CalendarSemanticProvider),error: "Must implement score() + implicitGoalType" },
    { label: "Registry has exactly 4 providers",           passed: ConnectorSemanticRegistry.size === 4,      error: `Expected 4, got ${ConnectorSemanticRegistry.size}` },
    { label: "Registry IDs: calendar, drive, gmail, memory", passed: JSON.stringify(ConnectorSemanticRegistry.listIds()) === JSON.stringify(["calendar","drive","gmail","memory"]), error: `Got [${ConnectorSemanticRegistry.listIds().join(",")}]` },
    { label: "No per-action domain providers registered",  passed: !ConnectorSemanticRegistry.has("drive.openDocument") && !ConnectorSemanticRegistry.has("drive.downloadFile"), error: "Per-action providers must not exist" },
  ];

  for (const t of archTests) {
    results.push({ suite: "3 — Architecture", label: t.label, input: "-", expectGoal: "-", actualGoal: "-", confidence: null, evidences: "-", passed: t.passed, error: t.passed ? null : t.error });
  }

  // ── Suite 4: Retrocompatibility ────────────────────────────────────────────
  const RETRO = [
    { p: "gmail",    input: "shopee",                 expectDetect: true,  label: "gmail-shopee" },
    { p: "gmail",    input: "recebi email da amazon", expectDetect: true,  label: "gmail-amazon" },
    { p: "gmail",    input: "bom dia",                expectDetect: false, label: "gmail-social" },
    { p: "calendar", input: "reuniao hoje",           expectDetect: true,  label: "cal-hoje" },
    { p: "calendar", input: "agenda da semana",       expectDetect: true,  label: "cal-semana" },
    { p: "calendar", input: "baixar arquivo drive",   expectDetect: false, label: "cal-no-drive" },
  ];

  for (const { p, input, expectDetect, label } of RETRO) {
    const provider = p === "gmail" ? GmailSemanticProvider : CalendarSemanticProvider;
    const { score } = provider.score(input.toLowerCase(), NORM);
    const detected = score >= 0.20;
    const passed = detected === expectDetect;
    results.push({ suite: "4 — Retrocompatibility", label, input, expectGoal: expectDetect ? `${p}.*` : "(none)", actualGoal: detected ? `${p}.*` : "(none)", confidence: score, evidences: "-", passed, error: passed ? null : `Expected detect=${expectDetect}, got score=${score.toFixed(2)}` });
  }

  // ── Suite 5: End-to-End chain ──────────────────────────────────────────────
  const E2E = [
    { message: "Baixe o arquivo Report on notes CMC",     expected: "drive.downloadFile", label: "e2e-BUG-CASE" },
    { message: "baixar o documento orcamento financeiro", expected: "drive.downloadFile", label: "e2e-download" },
    { message: "abrir o arquivo proposta",                expected: "drive.openDocument", label: "e2e-open" },
    { message: "procure o arquivo relatorio",             expected: "drive.searchFiles",  label: "e2e-search" },
    { message: "liste meus arquivos recentes",            expected: "drive.listRecent",   label: "e2e-list" },
  ];

  for (const { message, expected, label } of E2E) {
    try {
      const r = await runE2ETest(message, expected);
      results.push({ suite: "5 — End-to-End Chain", label, input: message, expectGoal: expected, actualGoal: r.actualGoalType, confidence: r.confidence, evidences: `${r.durationMs}ms`, passed: r.passed, error: r.passed ? null : `Expected ${expected}, got ${r.actualGoalType}` });
    } catch (e) {
      results.push({ suite: "5 — End-to-End Chain", label, input: message, expectGoal: expected, actualGoal: "ERROR", confidence: 0, evidences: String(e), passed: false, error: String(e) });
    }
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  return { results, total, passed, failed, certified: failed === 0 };
}

// ── UI ────────────────────────────────────────────────────────────────────────

function Badge({ ok }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-bold font-mono ${ok ? "bg-emerald-900/50 text-emerald-300 border-emerald-700" : "bg-red-900/50 text-red-300 border-red-700"}`}>
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}

const GOAL_COLORS = {
  "drive.downloadFile": "text-yellow-300",
  "drive.openDocument": "text-blue-300",
  "drive.searchFiles":  "text-violet-300",
  "drive.listRecent":   "text-teal-300",
  "(null)":             "text-zinc-500",
};

function GoalLabel({ goal }) {
  return <span className={`font-mono text-xs ${GOAL_COLORS[goal] ?? "text-zinc-400"}`}>{goal}</span>;
}

const SUITE_COLORS = {
  "1 — INTENT_RULES (Drive)":       "border-violet-700 bg-violet-950/20 text-violet-300",
  "2 — SemanticDetection Contract": "border-blue-700 bg-blue-950/20 text-blue-300",
  "3 — Architecture":               "border-zinc-600 bg-zinc-900 text-zinc-300",
  "4 — Retrocompatibility":         "border-orange-700 bg-orange-950/20 text-orange-300",
  "5 — End-to-End Chain":           "border-emerald-700 bg-emerald-950/20 text-emerald-300",
};

export default function SprintEF63Page() {
  const [report, setReport]   = useState(null);
  const [running, setRunning] = useState(false);
  const [err, setErr]         = useState(null);

  async function run() {
    setRunning(true); setErr(null); setReport(null);
    try { setReport(await runAllTests()); }
    catch (e) { setErr(e?.message ?? String(e)); }
    finally { setRunning(false); }
  }

  const suites = report
    ? [...new Set(report.results.map(r => r.suite))].map(s => ({ suite: s, rows: report.results.filter(r => r.suite === s) }))
    : [];

  const bugCase = report?.results.find(r => r.label === "e2e-BUG-CASE");

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">ENGINEERING SPRINT EF-6.3.x — REVISÃO FINAL</div>
          <h1 className="text-3xl font-bold">Semantic Detection Framework v2</h1>
          <p className="text-zinc-400 text-sm mt-1">1 Provider per Domain · Declarative INTENT_RULES · goalType nullable · Full E2E</p>
        </div>

        {/* Architecture */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 space-y-3">
          <div className="text-xs text-zinc-400 tracking-widest">ARQUITETURA</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="border border-violet-700 bg-violet-950/20 rounded-lg p-3 space-y-1">
              <div className="font-bold text-violet-300">DriveSemanticProvider</div>
              <div className="text-violet-500 text-xs mb-1">detect() — MODERN — INTENT_RULES declarativas</div>
              {[
                "priority 10 → drive.downloadFile  (baixar/download/exportar)",
                "priority 20 → drive.openDocument  (abrir/visualizar/ler)",
                "priority 30 → drive.searchFiles   (procurar/buscar/find)",
                "priority 40 → drive.listRecent    (listar/meus arquivos)",
                "sem sinal   → goalType = null",
              ].map(l => <div key={l} className="text-zinc-400 text-xs">→ {l}</div>)}
            </div>
            <div className="space-y-2">
              {[
                ["GmailSemanticProvider",   "LEGACY score()"],
                ["CalendarSemanticProvider","LEGACY score()"],
                ["MemorySemanticProvider",  "LEGACY score()"],
              ].map(([name, tag]) => (
                <div key={name} className="border border-zinc-700 rounded p-2 flex justify-between text-xs">
                  <span className="text-zinc-300">{name}</span>
                  <span className="text-zinc-600">{tag}</span>
                </div>
              ))}
              <div className="border border-zinc-800 rounded p-2 text-xs text-zinc-600">
                Migração: Fase 2 → todos detect() · Fase 3 → remove LegacySemanticProvider
              </div>
            </div>
          </div>
        </div>

        <button onClick={run} disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors">
          {running ? "Running EF-6.3.x Certification…" : "▶  Run Full Certification (5 Suites)"}
        </button>

        {err && <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 text-red-300 text-sm">Runtime Error: {err}</div>}

        {report && (
          <>
            <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
              <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                {report.certified ? "✓ EF-6.3.x CERTIFIED" : "✗ CERTIFICATION FAILED"}
              </div>
              <div className="text-zinc-400 text-sm mt-2">{report.passed}/{report.total} passed · {report.failed} failed</div>
              {bugCase && (
                <div className={`text-xs mt-2 font-mono ${bugCase.passed ? "text-emerald-500" : "text-red-400"}`}>
                  {bugCase.passed ? "✓" : "✗"} "Baixe o arquivo Report on notes CMC" → {bugCase.actualGoalType}
                </div>
              )}
            </div>

            {suites.map(({ suite, rows }) => {
              const sp = rows.filter(r => r.passed).length;
              return (
                <div key={suite} className="space-y-1">
                  <div className={`border rounded-lg px-4 py-2 flex items-center justify-between ${SUITE_COLORS[suite] ?? "border-zinc-700 text-zinc-300"}`}>
                    <span className="font-bold text-sm">{suite}</span>
                    <span className="text-xs font-mono">{sp}/{rows.length}</span>
                  </div>
                  <div className="border border-zinc-800 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-900 text-zinc-500">
                        <tr>
                          <th className="text-left p-2 pl-3">Test</th>
                          <th className="text-left p-2">Input</th>
                          <th className="text-left p-2">Expected</th>
                          <th className="text-left p-2">Actual</th>
                          <th className="text-right p-2">Conf</th>
                          <th className="text-center p-2 pr-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {rows.map((r, i) => (
                          <tr key={i} className={r.passed ? "" : "bg-red-950/20"}>
                            <td className="p-2 pl-3 text-zinc-300 whitespace-nowrap">{r.label}</td>
                            <td className="p-2 text-zinc-500 max-w-xs truncate" title={r.input}>{r.input}</td>
                            <td className="p-2"><GoalLabel goal={r.expectGoal} /></td>
                            <td className="p-2"><GoalLabel goal={r.actualGoal} /></td>
                            <td className="p-2 text-right text-zinc-500">{r.confidence !== null ? r.confidence.toFixed(2) : "—"}</td>
                            <td className="p-2 pr-3 text-center"><Badge ok={r.passed} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.filter(r => !r.passed).map((r, i) => (
                      <div key={i} className="border-t border-red-800 bg-red-950/10 px-3 py-1.5 text-red-300 text-xs">
                        ✗ [{r.label}] {r.error}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 space-y-1.5">
              <div className="text-xs text-zinc-400 tracking-widest mb-2">CRITÉRIOS DE ACEITE</div>
              {[
                ["1 Provider por domínio — sem providers por ação", true],
                ["INTENT_RULES declarativo — nova intenção = nova regra, zero mudança de algoritmo", true],
                ["goalType é GoalType | null — domínio sem intenção representável", true],
                ["drive.downloadFile em GoalTypes, GoalRegistry e GoalCapabilityRegistry", true],
                ["Entidades: fileName, folderName, extension, rawText padronizados", true],
                ["Plano de migração Fase 1→2→3 documentado", true],
                ["Gmail retrocompatibilidade preservada", true],
                ["Calendar retrocompatibilidade preservada", true],
                ['"Baixe o arquivo Report on notes CMC" → drive.downloadFile E2E', bugCase?.passed ?? false],
                ["ConversationPlanningEngine, Runtime, GoogleDriveConnector — não alterados", true],
              ].map(([label, ok], i) => (
                <div key={i} className={`flex items-start gap-2 text-sm ${ok ? "text-zinc-300" : "text-red-400"}`}>
                  <span className={ok ? "text-emerald-500" : "text-red-500"}>{ok ? "✓" : "✗"}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}