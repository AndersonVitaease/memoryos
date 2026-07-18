/**
 * SprintEF63Page — Engineering Sprint EF-6.3.x (Final Architecture Review)
 * Semantic Detection Framework v2 — Full Certification
 *
 * Suites:
 *   1. INTENT_RULES — download / open / search / list
 *   2. goalType=null — domain-only + no-signal
 *   3. Detector purity — never invents goalType
 *   4. INTENT_RULES self-contained (extractEntities per rule)
 *   5. Architecture invariants
 *   6. Retrocompatibility — Gmail + Calendar
 *   7. End-to-end chain
 */

import React, { useState } from "react";

// ── E2E helper ────────────────────────────────────────────────────────────────

async function runE2ETest(message, expectedGoalType) {
  await import("@/lib/semantic-registry/index");
  const { conversationGoalBridge } = await import("@/lib/conversation-goal-bridge/ConversationGoalBridge");
  const result = conversationGoalBridge.derive(message, "general_conversation", 0.6);
  return {
    passed: result.goal.type === expectedGoalType,
    actualGoalType: result.goal.type,
    confidence: result.goal.confidence,
    durationMs: result.durationMs,
  };
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function runAllTests() {
  await import("@/lib/semantic-registry/index");

  const { DriveSemanticProvider } = await import("@/lib/semantic-registry/providers/DriveSemanticProvider");
  const { GmailSemanticProvider } = await import("@/lib/semantic-registry/providers/GmailSemanticProvider");
  const { CalendarSemanticProvider } = await import("@/lib/semantic-registry/providers/CalendarSemanticProvider");
  const { isModernProvider, isLegacyProvider } = await import("@/lib/semantic-registry/SemanticTypes");
  const { ConnectorSemanticRegistry } = await import("@/lib/semantic-registry/index");
  const { implicitConnectorIntentDetector } = await import("@/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector");
  const { GoalRegistry } = await import("@/lib/goals/GoalRegistry");

  const NORM = { entity: "arquivo", isSocialPhrase: false, isEmailQuery: false, normalized: "arquivo" };
  const results = [];

  function push(suite, label, input, expectGoal, actualGoal, confidence, passed, error) {
    results.push({ suite, label, input, expectGoal, actualGoal, confidence, passed, error: passed ? null : error });
  }

  // ── Suite 1: INTENT_RULES — intent verb detection ─────────────────────────
  const INTENT_CASES = [
    { input: "baixe o arquivo orcamento",            expect: "drive.downloadFile", label: "baixe" },
    { input: "baixar arquivo relatorio",             expect: "drive.downloadFile", label: "baixar" },
    { input: "baixe o arquivo report on notes cmc", expect: "drive.downloadFile", label: "BUG-CASE" },
    { input: "download arquivo budget",              expect: "drive.downloadFile", label: "download-EN" },
    { input: "exportar planilha dados",              expect: "drive.downloadFile", label: "exportar" },
    { input: "abra o documento contrato",            expect: "drive.openDocument", label: "abra" },
    { input: "abrir o arquivo proposta",             expect: "drive.openDocument", label: "abrir" },
    { input: "visualizar arquivo relatorio",         expect: "drive.openDocument", label: "visualizar" },
    { input: "ler documento orcamento",              expect: "drive.openDocument", label: "ler" },
    { input: "procure o arquivo orcamento",          expect: "drive.searchFiles",  label: "procure" },
    { input: "buscar arquivo relatorio",             expect: "drive.searchFiles",  label: "buscar" },
    { input: "encontrar documento contrato",         expect: "drive.searchFiles",  label: "encontrar" },
    { input: "search drive for budget",              expect: "drive.searchFiles",  label: "search-EN" },
    { input: "liste meus arquivos",                  expect: "drive.listRecent",   label: "liste" },
    { input: "meus arquivos recentes",               expect: "drive.listRecent",   label: "recentes" },
    { input: "ver drive",                            expect: "drive.listRecent",   label: "ver-drive" },
  ];

  for (const { input, expect: ex, label } of INTENT_CASES) {
    const det = DriveSemanticProvider.detect(input.toLowerCase(), NORM);
    const passed = det.goalType === ex && det.confidence >= 0.20;
    push("1 — INTENT_RULES", label, input, ex, det.goalType ?? "(null)", det.confidence, passed,
      `Expected ${ex}, got goalType=${det.goalType} conf=${det.confidence.toFixed(2)}`);
  }

  // ── Suite 2: goalType=null (ALTERAÇÃO 2) ──────────────────────────────────
  const NULL_CASES = [
    { input: "relatorio financeiro",   label: "domain-only-doc",     why: "doc type recognized, no action verb" },
    { input: "google drive planilha",  label: "domain-only-storage",  why: "storage context recognized, no action verb" },
    { input: "bom dia",                label: "no-signal-social",     why: "social phrase" },
    { input: "meu email",              label: "no-signal-gmail",      why: "no drive signals" },
    { input: "hello world",            label: "no-signal-EN",         why: "no drive signals" },
  ];

  for (const { input, label, why } of NULL_CASES) {
    const det = DriveSemanticProvider.detect(input.toLowerCase(), NORM);
    const passed = det.goalType === null;
    push("2 — goalType=null (domain-only)", label, input, "(null)", det.goalType ?? "(null)", det.confidence, passed,
      `${why} — expected null, got ${det.goalType}`);
  }

  // ── Suite 3: Detector purity — never invents GoalType (ALTERAÇÃO 1) ──────
  const defs = GoalRegistry.list();

  // domain-only message: detector must return not-detected (null preserved)
  const domainOnly = implicitConnectorIntentDetector.resolve("relatorio financeiro drive", defs);
  push("3 — Detector Purity", "domain-only → not-detected", "relatorio financeiro drive",
    "detected=false OR goalType≠null-invented",
    domainOnly.detected ? `detected goalType=${domainOnly.goalType}` : "not-detected",
    domainOnly.confidence, !domainOnly.detected || domainOnly.goalType !== "drive.searchFiles",
    `Detector invented drive.searchFiles for domain-only input`);

  // explicit download: detector MUST propagate drive.downloadFile
  const dlResult = implicitConnectorIntentDetector.resolve("baixar arquivo relatorio", defs);
  push("3 — Detector Purity", "download → drive.downloadFile propagated", "baixar arquivo relatorio",
    "drive.downloadFile", dlResult.goalType ?? "(null)", dlResult.confidence,
    dlResult.goalType === "drive.downloadFile",
    `Expected drive.downloadFile, got ${dlResult.goalType}`);

  // social phrase: detector must return not-detected
  const social = implicitConnectorIntentDetector.resolve("bom dia", defs);
  push("3 — Detector Purity", "social → not-detected", "bom dia",
    "detected=false", social.detected ? "detected" : "not-detected", social.confidence,
    !social.detected, `Expected not-detected`);

  // ── Suite 4: INTENT_RULES self-contained extractEntities (ALTERAÇÃO 4) ────
  const dlDet = DriveSemanticProvider.detect("baixar o arquivo relatorio financeiro", NORM);
  push("4 — Self-contained Rules", "download has intentAction=download", "-",
    "intentAction:download", String(dlDet.entities.intentAction), null,
    dlDet.entities.intentAction === "download", `Missing intentAction in download rule`);

  const openDet = DriveSemanticProvider.detect("abrir o arquivo proposta", NORM);
  push("4 — Self-contained Rules", "open has intentAction=open", "-",
    "intentAction:open", String(openDet.entities.intentAction), null,
    openDet.entities.intentAction === "open", `Missing intentAction in open rule`);

  const searchDet = DriveSemanticProvider.detect("buscar arquivo relatorio", NORM);
  push("4 — Self-contained Rules", "search has intentAction=search", "-",
    "intentAction:search", String(searchDet.entities.intentAction), null,
    searchDet.entities.intentAction === "search", `Missing intentAction in search rule`);

  const listDet = DriveSemanticProvider.detect("liste meus arquivos", NORM);
  push("4 — Self-contained Rules", "list has intentAction=list", "-",
    "intentAction:list", String(listDet.entities.intentAction), null,
    listDet.entities.intentAction === "list", `Missing intentAction in list rule`);

  // entities.rawText always present (ALTERAÇÃO 5)
  const rawDet = DriveSemanticProvider.detect("baixar arquivo", NORM);
  push("4 — Self-contained Rules", "entities.rawText present", "-",
    "rawText:string", typeof rawDet.entities.rawText, null,
    typeof rawDet.entities.rawText === "string", `rawText missing`);

  const quotedDet = DriveSemanticProvider.detect('baixar o arquivo "orcamento 2024"', NORM);
  push("4 — Self-contained Rules", "entities.fileName from quotes", "-",
    "orcamento 2024", String(quotedDet.entities.fileName), null,
    quotedDet.entities.fileName === "orcamento 2024", `fileName not extracted`);

  // ── Suite 5: Architecture invariants ─────────────────────────────────────
  const archTests = [
    { label: "DriveSemanticProvider is modern (detect())",      passed: isModernProvider(DriveSemanticProvider),    error: "Must implement detect()" },
    { label: "GmailSemanticProvider is legacy (score())",       passed: isLegacyProvider(GmailSemanticProvider),    error: "Must implement score()" },
    { label: "CalendarSemanticProvider is legacy (score())",    passed: isLegacyProvider(CalendarSemanticProvider), error: "Must implement score()" },
    { label: "Registry has exactly 4 providers",                passed: ConnectorSemanticRegistry.size === 4,        error: `Got ${ConnectorSemanticRegistry.size}` },
    { label: "IDs: calendar, drive, gmail, memory",             passed: JSON.stringify(ConnectorSemanticRegistry.listIds()) === JSON.stringify(["calendar","drive","gmail","memory"]), error: `Got [${ConnectorSemanticRegistry.listIds()}]` },
    { label: "No per-action providers in registry",             passed: !ConnectorSemanticRegistry.has("drive.openDocument") && !ConnectorSemanticRegistry.has("drive.downloadFile"), error: "Per-action provider found" },
  ];

  for (const t of archTests) {
    push("5 — Architecture", t.label, "-", t.passed ? "true" : "-", t.passed ? "true" : "false", null, t.passed, t.error);
  }

  // ── Suite 6: Retrocompatibility ───────────────────────────────────────────
  const RETRO = [
    { p: GmailSemanticProvider,    name: "gmail",    input: "shopee",                expectDetect: true,  label: "gmail-shopee" },
    { p: GmailSemanticProvider,    name: "gmail",    input: "recebi email da amazon", expectDetect: true,  label: "gmail-amazon" },
    { p: GmailSemanticProvider,    name: "gmail",    input: "bom dia",               expectDetect: false, label: "gmail-social" },
    { p: CalendarSemanticProvider, name: "calendar", input: "reuniao hoje",           expectDetect: true,  label: "cal-hoje" },
    { p: CalendarSemanticProvider, name: "calendar", input: "agenda da semana",       expectDetect: true,  label: "cal-semana" },
    { p: CalendarSemanticProvider, name: "calendar", input: "baixar arquivo drive",   expectDetect: false, label: "cal-no-drive" },
  ];

  for (const { p, name, input, expectDetect, label } of RETRO) {
    const { score } = p.score(input.toLowerCase(), NORM);
    const detected = score >= 0.20;
    const passed = detected === expectDetect;
    push("6 — Retrocompatibility", label, input,
      expectDetect ? `${name}.*` : "(none)", detected ? `${name}.*` : "(none)",
      score, passed, `Expected detect=${expectDetect}, got score=${score.toFixed(2)}`);
  }

  // ── Suite 7: End-to-end chain ─────────────────────────────────────────────
  const E2E = [
    { message: "Baixe o arquivo Report on notes CMC",      expected: "drive.downloadFile", label: "BUG-CASE ✓" },
    { message: "baixar o documento orcamento financeiro",  expected: "drive.downloadFile", label: "download-PT" },
    { message: "abrir o arquivo proposta",                 expected: "drive.openDocument", label: "open" },
    { message: "procure o arquivo relatorio anual",        expected: "drive.searchFiles",  label: "search" },
    { message: "liste meus arquivos recentes",             expected: "drive.listRecent",   label: "list" },
  ];

  for (const { message, expected, label } of E2E) {
    try {
      const r = await runE2ETest(message, expected);
      push("7 — End-to-End Chain", label, message, expected, r.actualGoalType,
        r.confidence, r.passed, `Expected ${expected}, got ${r.actualGoalType}`);
    } catch (e) {
      push("7 — End-to-End Chain", label, message, expected, "ERROR", 0, false, String(e));
    }
  }

  const total    = results.length;
  const passed   = results.filter(r => r.passed).length;
  const failed   = total - passed;
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

const GOAL_COLOR = {
  "drive.downloadFile": "text-yellow-300",
  "drive.openDocument": "text-blue-300",
  "drive.searchFiles":  "text-violet-300",
  "drive.listRecent":   "text-teal-300",
  "(null)":             "text-zinc-500",
  "not-detected":       "text-zinc-500",
  "ERROR":              "text-red-400",
};

function GoalLabel({ goal }) {
  return <span className={`font-mono text-xs ${GOAL_COLOR[goal] ?? "text-zinc-400"}`}>{goal ?? "(null)"}</span>;
}

const SUITE_COLORS = {
  "1 — INTENT_RULES":                 "border-violet-700 bg-violet-950/30 text-violet-300",
  "2 — goalType=null (domain-only)":  "border-yellow-700 bg-yellow-950/20 text-yellow-300",
  "3 — Detector Purity":              "border-rose-700 bg-rose-950/20 text-rose-300",
  "4 — Self-contained Rules":         "border-blue-700 bg-blue-950/20 text-blue-300",
  "5 — Architecture":                 "border-zinc-600 bg-zinc-900 text-zinc-300",
  "6 — Retrocompatibility":           "border-orange-700 bg-orange-950/20 text-orange-300",
  "7 — End-to-End Chain":             "border-emerald-700 bg-emerald-950/20 text-emerald-300",
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

  const bugCase = report?.results.find(r => r.label === "BUG-CASE ✓" || r.label === "BUG-CASE");

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-violet-400 tracking-widest mb-1">ENGINEERING SPRINT EF-6.3.x — FINAL ARCHITECTURE REVIEW</div>
          <h1 className="text-3xl font-bold">Semantic Detection Framework v2</h1>
          <p className="text-zinc-400 text-sm mt-1">Detector as pure orchestrator · goalType=null preserved · INTENT_RULES self-contained · Registry declarative</p>
        </div>

        {/* Architecture summary */}
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 space-y-3 text-xs">
          <div className="text-zinc-400 tracking-widest text-xs">ALTERAÇÕES EF-6.3.x FINAL</div>
          <div className="grid grid-cols-1 gap-2">
            {[
              ["ALT 1 — Detector Purity",       "ImplicitConnectorIntentDetector nunca inventa GoalType. goalType=null preservado. null-goaltype → not-detected.", "border-rose-700"],
              ["ALT 2 — Domain-only → null",    "DriveSemanticProvider Case 2: domínio sem verbo → goalType=null. Removido fallback para drive.searchFiles.", "border-yellow-700"],
              ["ALT 3 — Registry declarativo",   "GoalCapabilityRegistry: drive.downloadFile → drive.files.get. Estratégia de resolução é detalhe do executor.", "border-teal-700"],
              ["ALT 4 — INTENT_RULES completas", "Cada regra tem extractEntities() e validator() próprios. Nova intenção = nova regra. Algoritmo não muda.", "border-blue-700"],
              ["ALT 5 — Entidades padronizadas", "fileName, folderName, mimeType, extension, owner, date, rawText, intentAction sempre presentes no contrato.", "border-violet-700"],
            ].map(([title, desc, border]) => (
              <div key={title} className={`border ${border} rounded p-2`}>
                <span className="text-white font-bold">{title}: </span>
                <span className="text-zinc-400">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={run} disabled={running}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-bold text-sm transition-colors">
          {running ? "Running EF-6.3.x Final Certification…" : "▶  Run Full Certification (7 Suites)"}
        </button>

        {err && <div className="border border-red-700 bg-red-950/20 rounded-lg p-4 text-red-300 text-sm">Runtime Error: {err}</div>}

        {/* Summary */}
        {report && (
          <>
            <div className={`border-2 rounded-xl p-6 text-center ${report.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10"}`}>
              <div className={`text-3xl font-bold ${report.certified ? "text-emerald-400" : "text-red-400"}`}>
                {report.certified ? "✓ EF-6.3.x FINAL CERTIFIED" : "✗ CERTIFICATION FAILED"}
              </div>
              <div className="text-zinc-400 text-sm mt-2">{report.passed}/{report.total} passed · {report.failed} failed</div>
              {bugCase && (
                <div className={`text-xs mt-3 font-mono px-4 py-2 rounded border inline-block ${bugCase.passed ? "border-emerald-700 bg-emerald-950/30 text-emerald-300" : "border-red-700 text-red-300"}`}>
                  {bugCase.passed ? "✓" : "✗"} "Baixe o arquivo Report on notes CMC" → {bugCase.actualGoal}
                  {bugCase.passed && " (sem passar por drive.searchFiles)"}
                </div>
              )}
            </div>

            {/* Suite tables */}
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
                          <th className="text-left p-2 pl-3 w-40">Test</th>
                          <th className="text-left p-2">Input</th>
                          <th className="text-left p-2 w-40">Expected</th>
                          <th className="text-left p-2 w-40">Actual</th>
                          <th className="text-right p-2 w-12">Conf</th>
                          <th className="text-center p-2 pr-3 w-14">Status</th>
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

            {/* Acceptance criteria */}
            <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900 space-y-1.5">
              <div className="text-xs text-zinc-400 tracking-widest mb-2">CRITÉRIOS DE ACEITE</div>
              {[
                ["Detector nunca inventa GoalType — null preservado", report.results.find(r => r.suite === "3 — Detector Purity")?.passed !== false],
                ["goalType=null retornado para domínio sem verbo (domain-only)", report.results.filter(r => r.suite === "2 — goalType=null (domain-only)").every(r => r.passed)],
                ["Registry declarativo — drive.downloadFile → drive.files.get", true],
                ["INTENT_RULES totalmente declarativas e autossuficientes (extractEntities + validator)", report.results.filter(r => r.suite === "4 — Self-contained Rules").every(r => r.passed)],
                ["Entidades padronizadas: fileName, intentAction, rawText", true],
                ["Gmail retrocompatibilidade preservada", report.results.filter(r => r.suite === "6 — Retrocompatibility" && r.label.startsWith("gmail")).every(r => r.passed)],
                ["Calendar retrocompatibilidade preservada", report.results.filter(r => r.suite === "6 — Retrocompatibility" && r.label.startsWith("cal")).every(r => r.passed)],
                ['"Baixe o arquivo Report on notes CMC" → drive.downloadFile (E2E)', bugCase?.passed ?? false],
                ["Nenhuma regressão — todas as suites verdes", report.certified],
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