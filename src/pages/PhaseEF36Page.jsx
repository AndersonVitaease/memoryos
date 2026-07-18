/**
 * PhaseEF36Page.jsx — Sprint EF-36
 * Knowledge Disclosure Engine Dashboard
 * Route: /ef36-kde
 */
import React, { useState, useCallback } from "react";

const STATUS_COLOR = {
  ALLOW:   "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  PARTIAL: "bg-amber-900/40  text-amber-300  border-amber-700",
  DENY:    "bg-red-900/40    text-red-300    border-red-700",
  PASS:    "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:    "bg-red-900/40    text-red-300    border-red-700",
};
const STATUS_TEXT = {
  ALLOW: "text-emerald-400", PARTIAL: "text-amber-400", DENY: "text-red-400",
  PASS: "text-emerald-400", FAIL: "text-red-400",
};

function Badge({ label, style }) {
  return <span className={"text-xs font-mono px-1.5 py-0.5 rounded border " + (style || "bg-zinc-800 text-zinc-400 border-zinc-600")}>{label}</span>;
}

function MetCard({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={"text-xl font-bold font-mono " + (color || "text-zinc-300")}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

const TABS = ["Overview","Policies","Profiles","Classifications","Disclosure Decisions","Transformations","Audit","Statistics","Tests"];

const PROFILES = ["Visitor","Customer","Power User","Developer","Administrator","MemoryOS Engineer"];
const LEVELS   = ["PUBLIC","BASIC","ADVANCED","DEVELOPER","INTERNAL","ARCHITECTURE","ENGINEERING","SYSTEM"];

const LEVEL_COLORS = {
  PUBLIC: "text-emerald-400", BASIC: "text-sky-400", ADVANCED: "text-blue-400",
  DEVELOPER: "text-violet-400", INTERNAL: "text-amber-400",
  ARCHITECTURE: "text-orange-400", ENGINEERING: "text-red-400", SYSTEM: "text-rose-400",
};

export default function PhaseEF36Page() {
  const [tab, setTab]               = useState("Overview");
  const [running, setRunning]       = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [decisions, setDecisions]   = useState([]);
  const [auditLog, setAuditLog]     = useState([]);
  const [stats, setStats]           = useState(null);
  const [liveInput, setLiveInput]   = useState({ text: "O Decision Engine executou análise de capacidades.", component: "Decision Engine", profile: "Customer" });

  const runTests = useCallback(async () => {
    setRunning(true);
    try {
      const { runDisclosureTests } = await import("@/lib/disclosure/disclosureTests");
      const { DisclosureAuditEngine } = await import("@/lib/disclosure/DisclosureAuditEngine");
      const result = await runDisclosureTests();
      setTestResults(result);
      setAuditLog(DisclosureAuditEngine.getRecent(100));
      setStats(DisclosureAuditEngine.stats());
      setTab("Tests");
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }, []);

  const runLive = useCallback(async () => {
    try {
      const { KnowledgeDisclosureEngine } = await import("@/lib/disclosure/KnowledgeDisclosureEngine");
      const { KnowledgeClassifier } = await import("@/lib/disclosure/KnowledgeClassification");
      const { DisclosureAuditEngine } = await import("@/lib/disclosure/DisclosureAuditEngine");
      const classification = KnowledgeClassifier.classifyComponent(liveInput.component);
      const r = KnowledgeDisclosureEngine.process({
        profileType: liveInput.profile,
        componentName: liveInput.component,
        classification,
        responseText: liveInput.text,
      });
      setDecisions(prev => [r, ...prev].slice(0, 30));
      setAuditLog(DisclosureAuditEngine.getRecent(50));
      setStats(DisclosureAuditEngine.stats());
    } catch (e) { console.error(e); }
  }, [liveInput]);

  const runAllProfiles = useCallback(async () => {
    try {
      const { KnowledgeDisclosureEngine } = await import("@/lib/disclosure/KnowledgeDisclosureEngine");
      const { KnowledgeClassifier } = await import("@/lib/disclosure/KnowledgeClassification");
      const { DisclosureAuditEngine } = await import("@/lib/disclosure/DisclosureAuditEngine");
      const results = [];
      for (const profile of PROFILES) {
        const classification = KnowledgeClassifier.classifyComponent(liveInput.component);
        const r = KnowledgeDisclosureEngine.process({ profileType: profile, componentName: liveInput.component, classification, responseText: liveInput.text });
        results.push(r);
      }
      setDecisions(results);
      setAuditLog(DisclosureAuditEngine.getRecent(50));
      setStats(DisclosureAuditEngine.stats());
      setTab("Disclosure Decisions");
    } catch (e) { console.error(e); }
  }, [liveInput]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="border border-violet-700/60 rounded-xl p-5 bg-violet-950/10">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EF-36 — KNOWLEDGE DISCLOSURE ENGINE</div>
          <div className="text-xl font-bold text-white">KDE — Knowledge Disclosure Engine</div>
          <div className="text-zinc-400 text-sm mt-1">
            Controls what MemoryOS reveals · Deterministic · Auditable · Never lies · Never invents
          </div>
        </div>

        {/* Pipeline visualization */}
        <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
          <div className="text-zinc-500 text-xs tracking-widest mb-3">OFFICIAL PIPELINE — KDE STAGE</div>
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {["Intent","Planning","Decision","Knowledge","Response Draft","Knowledge Disclosure Engine ★","Response Composer","Final Response"].map((s, i, arr) => (
              <React.Fragment key={s}>
                <span className={"border rounded px-2 py-1 " + (s.includes("★") ? "border-violet-500 text-violet-300 bg-violet-900/30 font-bold" : "border-zinc-700 text-zinc-400")}>
                  {s.replace(" ★", "")}
                </span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Quick stats */}
        {stats && (
          <div className="grid grid-cols-5 gap-2">
            <MetCard label="Total"       value={stats.total}       color="text-zinc-300" />
            <MetCard label="ALLOW"       value={stats.allow}       color="text-emerald-400" />
            <MetCard label="PARTIAL"     value={stats.partial}     color="text-amber-400" />
            <MetCard label="DENY"        value={stats.deny}        color="text-red-400" />
            <MetCard label="Transformed" value={stats.transformed} color="text-violet-400" />
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={runTests} disabled={running}
            className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "▶ Run 80+ Tests"}
          </button>
          <button onClick={runAllProfiles} disabled={running}
            className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold">
            Compare All Profiles
          </button>
        </div>

        {/* Test summary banner */}
        {testResults && (
          <div className={"border-2 rounded-xl p-4 text-center " + (testResults.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10")}>
            <div className={"text-xl font-bold " + (testResults.certified ? "text-emerald-400" : "text-red-400")}>
              {testResults.certified ? "✓ KDE CERTIFIED — ALL TESTS PASS" : "✗ TESTS FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-1">
              {testResults.passed}/{testResults.total} passed · {testResults.failed} failed
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors " + (tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white")}>
              {t}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {tab === "Overview" && (
          <div className="space-y-4">
            {/* Live disclosure playground */}
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-3">
              <div className="text-zinc-400 text-xs tracking-widest">LIVE DISCLOSURE PLAYGROUND</div>
              <textarea value={liveInput.text} onChange={e => setLiveInput(p => ({ ...p, text: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 resize-none" rows={3} />
              <div className="flex gap-2 flex-wrap">
                <select value={liveInput.component} onChange={e => setLiveInput(p => ({ ...p, component: e.target.value }))}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200">
                  {["Decision Engine","Memory Engine","connect Gmail","GmailConnector","ExecutionChain","Planner","connect Drive"].map(c =>
                    <option key={c} value={c}>{c}</option>
                  )}
                </select>
                <select value={liveInput.profile} onChange={e => setLiveInput(p => ({ ...p, profile: e.target.value }))}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200">
                  {PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button onClick={runLive} className="bg-sky-700 hover:bg-sky-600 text-white px-3 py-1 rounded text-xs font-bold">
                  Process via KDE
                </button>
              </div>
            </div>
            {decisions.slice(0, 1).map((r, i) => r && (
              <div key={i} className={"border-2 rounded-xl p-4 " + (r.decision === "ALLOW" ? "border-emerald-700 bg-emerald-950/10" : r.decision === "PARTIAL" ? "border-amber-700 bg-amber-950/10" : "border-red-700 bg-red-950/10")}>
                <div className="flex items-center gap-3 mb-2">
                  <Badge label={r.decision} style={STATUS_COLOR[r.decision]} />
                  <span className="text-zinc-400 text-xs">Auth Level: <span className={LEVEL_COLORS[r.userMaxLevel]}>{r.userMaxLevel}</span></span>
                  <span className="text-zinc-400 text-xs">Classified: <span className={LEVEL_COLORS[r.disclosureLevel] || "text-zinc-400"}>{r.originalClassification}</span></span>
                  {r.transformed && <Badge label="TRANSFORMED" style="bg-amber-900/30 text-amber-400 border-amber-700" />}
                </div>
                <div className="bg-zinc-800 rounded p-3 text-sm text-zinc-200">{r.responseText}</div>
                <div className="text-zinc-600 text-xs mt-2">{r.reason}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── POLICIES ─────────────────────────────────────────────────────── */}
        {tab === "Policies" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">POLICY MATRIX — Profile × Classification → Decision</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2 text-zinc-500 text-left">Profile</th>
                      {["PUBLIC","PRODUCT","DEVELOPER","INTERNAL","ARCHITECTURE","ENGINEERING"].map(c => (
                        <th key={c} className={"px-2 py-2 " + (LEVEL_COLORS[c] || "text-zinc-500")}>{c.slice(0,4)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PROFILES.map(p => (
                      <PolicyRow key={p} profile={p} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-1">
              <div className="text-zinc-400 tracking-widest mb-2">POLICY RULES</div>
              <div className="text-zinc-300">✓ userIndex &gt;= requiredIndex → ALLOW</div>
              <div className="text-zinc-300">✓ requiredIndex - userIndex == 1 → PARTIAL (vocabulary substitution)</div>
              <div className="text-zinc-300">✓ requiredIndex - userIndex &gt;= 2 → DENY (full rewrite to safe equivalent)</div>
              <div className="text-zinc-300">✓ DENY never returns "Access Denied" — always produces a truthful public-level response</div>
            </div>
          </div>
        )}

        {/* ── PROFILES ─────────────────────────────────────────────────────── */}
        {tab === "Profiles" && (
          <div className="space-y-2">
            {[
              { type: "Visitor",          maxLevel: "PUBLIC",       desc: "Unauthenticated — public content only" },
              { type: "Customer",         maxLevel: "BASIC",        desc: "Authenticated — product features" },
              { type: "Power User",       maxLevel: "ADVANCED",     desc: "Advanced product features" },
              { type: "Developer",        maxLevel: "DEVELOPER",    desc: "Technical integration details" },
              { type: "Administrator",    maxLevel: "INTERNAL",     desc: "Internal configuration and policies" },
              { type: "MemoryOS Engineer",maxLevel: "SYSTEM",       desc: "Full system access" },
            ].map(p => (
              <div key={p.type} className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-zinc-200 text-sm font-bold">{p.type}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{p.desc}</div>
                </div>
                <div className="text-center">
                  <div className={"font-bold text-sm " + (LEVEL_COLORS[p.maxLevel] || "text-zinc-400")}>{p.maxLevel}</div>
                  <div className="text-zinc-600 text-xs">max level</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CLASSIFICATIONS ───────────────────────────────────────────────── */}
        {tab === "Classifications" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">SENSITIVE COMPONENTS → ENGINEERING</div>
              {["Planner","Decision Engine","Connector Runtime","Capability Registry","Knowledge Engine",
                "Memory Engine","Policy Engine","Engineering Runtime","Governance Engine","Audit Engine",
                "Execution Pipeline","Official Library","System Prompts"].map(c => (
                <div key={c} className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/30 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-zinc-300 text-xs flex-1">{c}</span>
                  <span className="text-red-400 text-xs font-bold">ENGINEERING</span>
                </div>
              ))}
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">SAFE TOPICS → PUBLIC</div>
              {["Connect Gmail","Connect Drive","Create specialist","Use memory","Edit profile","Share conversation","Upload file","Search memories"].map(c => (
                <div key={c} className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/30 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-zinc-300 text-xs flex-1">{c}</span>
                  <span className="text-emerald-400 text-xs font-bold">PUBLIC</span>
                </div>
              ))}
            </div>
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs">
              <div className="text-zinc-400 tracking-widest mb-2">LEVEL HIERARCHY</div>
              <div className="flex gap-2 flex-wrap">
                {LEVELS.map(l => (
                  <span key={l} className={"border border-zinc-700 rounded px-2 py-1 " + (LEVEL_COLORS[l] || "text-zinc-400")}>{l}</span>
                ))}
              </div>
              <div className="text-zinc-500 text-xs mt-2">Each level inherits all permissions below it.</div>
            </div>
          </div>
        )}

        {/* ── DISCLOSURE DECISIONS ─────────────────────────────────────────── */}
        {tab === "Disclosure Decisions" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              DISCLOSURE DECISIONS — {decisions.length} RECORDS
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {decisions.map((r, i) => r && (
                <div key={i} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge label={r.decision} style={STATUS_COLOR[r.decision]} />
                    <span className={"text-xs font-bold " + (LEVEL_COLORS[r.userMaxLevel] || "text-zinc-400")}>{r.userMaxLevel}</span>
                    <span className="text-zinc-500 text-xs">→</span>
                    <span className={"text-xs " + (LEVEL_COLORS[r.disclosureLevel] || "text-zinc-400")}>{r.originalClassification}</span>
                    {r.transformed && <Badge label="TRANSFORMED" style="bg-amber-900/30 text-amber-300 border-amber-700" />}
                    <span className="text-zinc-600 text-xs ml-auto font-mono">{r.auditId?.slice(-12)}</span>
                  </div>
                  <div className="text-zinc-300 text-xs bg-zinc-800 rounded p-2 mt-1">{r.responseText}</div>
                  <div className="text-zinc-600 text-xs mt-1">{r.reason}</div>
                </div>
              ))}
              {decisions.length === 0 && <div className="p-6 text-zinc-600 text-sm text-center">Use the playground or run tests to generate decisions.</div>}
            </div>
          </div>
        )}

        {/* ── TRANSFORMATIONS ──────────────────────────────────────────────── */}
        {tab === "Transformations" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900">
              <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">TEMPLATE EXAMPLES — SAME FACT, DIFFERENT DEPTH</div>
              {[
                {
                  question: "Como o MemoryOS escolheu este conector?",
                  engineer: "O Decision Engine executou análise de capacidades, políticas e score de confiança.",
                  public:   "O MemoryOS analisou automaticamente qual serviço era mais adequado para executar sua solicitação.",
                },
                {
                  question: "Como o pipeline foi executado?",
                  engineer: "O ExecutionChain orquestrou todos os estágios com trace completo, contratos e evidências.",
                  public:   "O MemoryOS processou sua solicitação automaticamente.",
                },
              ].map((ex, i) => (
                <div key={i} className="px-4 py-4 border-b border-zinc-800 last:border-0">
                  <div className="text-sky-400 text-xs mb-2">❓ {ex.question}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-950/20 border border-red-800/40 rounded p-2">
                      <div className="text-red-400 text-xs font-bold mb-1">ENGINEERING (raw)</div>
                      <div className="text-zinc-300 text-xs">{ex.engineer}</div>
                    </div>
                    <div className="bg-emerald-950/20 border border-emerald-800/40 rounded p-2">
                      <div className="text-emerald-400 text-xs font-bold mb-1">PUBLIC (transformed)</div>
                      <div className="text-zinc-300 text-xs">{ex.public}</div>
                    </div>
                  </div>
                  <div className="text-zinc-600 text-xs mt-2">✓ Both are true. No information is hidden — only depth is adjusted.</div>
                </div>
              ))}
            </div>
            {decisions.filter(d => d?.transformed).length > 0 && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">LIVE TRANSFORMATIONS</div>
                {decisions.filter(d => d?.transformed).map((r, i) => (
                  <div key={i} className="px-4 py-3 border-b border-zinc-800/40 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge label={r.decision} style={STATUS_COLOR[r.decision]} />
                      <span className="text-amber-400 text-xs">TRANSFORMED</span>
                    </div>
                    <div className="text-zinc-300 text-xs">{r.responseText}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AUDIT ────────────────────────────────────────────────────────── */}
        {tab === "Audit" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
              KDE AUDIT LOG — {auditLog.length} ENTRIES (IMMUTABLE)
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {auditLog.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0">
                  <Badge label={e.decision} style={STATUS_COLOR[e.decision]} />
                  <span className="text-zinc-400 text-xs w-28 truncate">{e.profileType}</span>
                  <span className="text-zinc-300 text-xs flex-1 truncate">{e.componentName}</span>
                  <span className={"text-xs " + (LEVEL_COLORS[e.classification] || "text-zinc-500")}>{e.classification}</span>
                  {e.transformed && <span className="text-amber-400 text-xs">~</span>}
                  <span className="text-zinc-600 text-xs font-mono">{new Date(e.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
              {auditLog.length === 0 && <div className="p-6 text-zinc-600 text-sm text-center">Run tests or use the playground to generate audit entries.</div>}
            </div>
          </div>
        )}

        {/* ── STATISTICS ───────────────────────────────────────────────────── */}
        {tab === "Statistics" && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <MetCard label="Total Decisions"  value={stats.total}       color="text-zinc-300" />
              <MetCard label="ALLOW"            value={stats.allow}       color="text-emerald-400" />
              <MetCard label="PARTIAL"          value={stats.partial}     color="text-amber-400" />
              <MetCard label="DENY"             value={stats.deny}        color="text-red-400" />
              <MetCard label="Transformations"  value={stats.transformed} color="text-violet-400" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <MetCard label="Allow Rate"
                value={stats.total > 0 ? Math.round((stats.allow / stats.total) * 100) + "%" : "—"}
                color="text-emerald-400" />
              <MetCard label="Deny Rate"
                value={stats.total > 0 ? Math.round((stats.deny / stats.total) * 100) + "%" : "—"}
                color="text-red-400" />
              <MetCard label="Transform Rate"
                value={stats.total > 0 ? Math.round((stats.transformed / stats.total) * 100) + "%" : "—"}
                color="text-violet-400" />
            </div>
          </div>
        )}
        {tab === "Statistics" && !stats && (
          <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">
            Run tests or use the playground to generate statistics.
          </div>
        )}

        {/* ── TESTS ────────────────────────────────────────────────────────── */}
        {tab === "Tests" && (
          <div className="space-y-3">
            {testResults && (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900">
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  TEST RESULTS — {testResults.passed}/{testResults.total} PASSED
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {testResults.results.map(r => (
                    <div key={r.id} className={"flex items-center gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0 " + (r.passed ? "" : "bg-red-950/10")}>
                      <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + (r.passed ? "bg-emerald-500" : "bg-red-500")} />
                      <span className="text-zinc-500 text-xs w-28 shrink-0">{r.suite}</span>
                      <span className="text-zinc-300 text-xs flex-1">{r.name}</span>
                      <span className={"text-xs font-bold " + (r.passed ? "text-emerald-400" : "text-red-400")}>{r.passed ? "PASS" : "FAIL"}</span>
                      <span className="text-zinc-600 text-xs font-mono">{r.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!testResults && (
              <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">
                Click "Run 80+ Tests" to execute the full test suite.
              </div>
            )}
          </div>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">ACCEPTANCE CRITERIA — EF-36 KDE</div>
          {[
            "KnowledgeDisclosureEngine: mandatory pipeline stage — every response passes through KDE",
            "DisclosurePolicyEngine: deterministic ALLOW/PARTIAL/DENY — no LLM creativity",
            "DisclosureTransformer: rewrites depth only — facts, conclusions, actions never altered",
            "UserDisclosureProfile: 6 profiles × 8 levels — inheritance enforced",
            "KnowledgeClassification: auto-classifies 40+ components — unknown defaults to PUBLIC",
            "DisclosureAuditEngine: immutable log for every disclosure decision",
            "80+ tests across 10 suites — zero regressions",
            "DENY never returns 'Access Denied' — always produces truthful public response",
            "Pipeline: Intent → Planning → Decision → Knowledge → Response Draft → KDE → Composer → Final Response",
          ].map((c, i) => <div key={i} className="text-zinc-300">✓ {c}</div>)}
        </div>

      </div>
    </div>
  );
}

// ── Policy matrix row (inline to keep file focused) ─────────────────────────
function PolicyRow({ profile }) {
  const [results, setResults] = React.useState(null);
  React.useEffect(() => {
    import("@/lib/disclosure/DisclosurePolicyEngine").then(({ DisclosurePolicyEngine }) => {
      const clss = ["PUBLIC","PRODUCT","DEVELOPER","INTERNAL","ARCHITECTURE","ENGINEERING"];
      setResults(clss.map(c => DisclosurePolicyEngine.evaluate(c, profile).decision));
    });
  }, [profile]);

  const colors = { ALLOW: "text-emerald-400", PARTIAL: "text-amber-400", DENY: "text-red-400" };
  return (
    <tr className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
      <td className="px-3 py-2 text-zinc-300">{profile}</td>
      {results ? results.map((d, i) => (
        <td key={i} className={"px-2 py-2 text-center font-bold " + colors[d]}>{d.slice(0,1)}</td>
      )) : <td colSpan={6} className="px-3 py-2 text-zinc-600 text-xs">loading…</td>}
    </tr>
  );
}