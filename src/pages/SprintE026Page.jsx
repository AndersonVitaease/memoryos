/**
 * SprintE026Page — Engineering Sprint E-02.6
 * Semantic Email Search Engine — Validation Dashboard
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, Trophy, Search, Database } from "lucide-react";

function TestRow({ r }) {
  return (
    <div className={`p-3 rounded-lg border text-xs space-y-1 ${r.passed ? "border-border/40 bg-muted/10" : "border-red-500/30 bg-red-500/10"}`}>
      <div className="flex items-start gap-2">
        {r.passed
          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
          : <XCircle    className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className={r.passed ? "text-foreground font-medium" : "text-red-400 font-medium"}>{r.name}</p>
          <p className="text-muted-foreground mt-0.5">Input: <span className="font-mono text-violet-400">"{r.input}"</span></p>
          <p className="text-muted-foreground">Output: <span className="font-mono text-amber-400">"{r.output}"</span></p>
          {r.error && <p className="text-red-400 font-mono text-[10px] mt-1">{r.error}</p>}
        </div>
      </div>
    </div>
  );
}

function AliasRow({ entry }) {
  return (
    <div className="p-3 rounded-lg border border-border/40 bg-muted/10 text-xs">
      <p className="font-semibold text-foreground mb-1">{entry.name}</p>
      <p className="text-muted-foreground">Sinais: <span className="font-mono">{entry.signals.join(", ")}</span></p>
      <p className="text-violet-400 font-mono text-[11px] mt-1 break-all">from:({entry.aliases.join(" OR ")})</p>
    </div>
  );
}

export default function SprintE026Page() {
  const [testResults, setTestResults] = useState(null);
  const [running, setRunning]         = useState(false);
  const [aliases, setAliases]         = useState(null);
  const [liveInput, setLiveInput]     = useState("Procure emails da Shopee");
  const [liveOutput, setLiveOutput]   = useState(null);

  async function runTests() {
    setRunning(true); setTestResults(null);
    try {
      const { runSemanticQueryTests } = await import("@/lib/gmail/SemanticEmailQueryBuilder");
      const results = runSemanticQueryTests();
      const passed = results.filter((r) => r.passed).length;
      setTestResults({ results, passed, total: results.length, verdict: passed === results.length ? "PASS" : "FAIL" });
    } catch (e) {
      setTestResults({ results: [{ name: "Load error", input: "", passed: false, output: "", error: e.message }], passed: 0, total: 1, verdict: "FAIL" });
    } finally { setRunning(false); }
  }

  async function loadAliases() {
    const { listAllAliases } = await import("@/lib/gmail/EmailAliasRegistry");
    setAliases(listAllAliases());
  }

  async function buildLive() {
    const { buildGmailQuery } = await import("@/lib/gmail/SemanticEmailQueryBuilder");
    setLiveOutput(buildGmailQuery(liveInput));
  }

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Search className="w-6 h-6 text-violet-400" />
        <h1 className="text-2xl font-bold">Sprint E-02.6 — Semantic Email Search</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Connector Intelligence Layer — toda a inteligência de busca reside exclusivamente dentro do GmailConnector.
      </p>

      {/* Architecture */}
      <section className="mb-8 p-4 rounded-xl border border-border bg-muted/10 text-xs space-y-1">
        <p className="font-semibold text-foreground mb-2 text-[11px] uppercase tracking-wide">Arquivos criados / alterados</p>
        <p className="text-emerald-400">✓ src/lib/gmail/EmailAliasRegistry.ts — novo</p>
        <p className="text-emerald-400">✓ src/lib/gmail/SemanticEmailQueryBuilder.ts — novo</p>
        <p className="text-amber-400">✱ src/lib/connector-router/connectors/GmailConnector.ts — apenas case searchEmails</p>
        <p className="text-muted-foreground">— Nenhuma camada arquitetural alterada</p>
      </section>

      {/* Live builder */}
      <section className="mb-8 p-4 rounded-xl border border-violet-500/30 bg-violet-500/5">
        <h2 className="text-sm font-semibold text-violet-400 mb-3">Query Builder — Tempo Real</h2>
        <div className="flex gap-2 mb-3">
          <input
            value={liveInput}
            onChange={(e) => setLiveInput(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
            placeholder="Procure emails da Shopee..."
          />
          <button onClick={buildLive} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
            Build
          </button>
        </div>
        {liveOutput && (
          <div className="space-y-2 text-xs font-mono">
            <p><span className="text-muted-foreground">original:      </span><span className="text-foreground">"{liveOutput.originalQuery}"</span></p>
            <p><span className="text-muted-foreground">alias:         </span><span className="text-violet-400">{liveOutput.aliasName ?? "nenhum"}</span></p>
            <p><span className="text-muted-foreground">expandido:     </span><span className={liveOutput.aliasExpanded ? "text-emerald-400" : "text-muted-foreground"}>{String(liveOutput.aliasExpanded)}</span></p>
            <p><span className="text-muted-foreground">gmail query:   </span><span className="text-amber-400">"{liveOutput.gmailQuery}"</span></p>
            <p><span className="text-muted-foreground">has:attachment:</span> {String(liveOutput.modifiers.hasAttachment)}</p>
            <p><span className="text-muted-foreground">is:unread:     </span> {String(liveOutput.modifiers.isUnread)}</p>
            <p><span className="text-muted-foreground">newer_than:    </span> {liveOutput.modifiers.newerThan ?? "—"}</p>
          </div>
        )}
      </section>

      {/* Test suite */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suite de Testes (14 casos)</h2>
          <button onClick={runTests} disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50">
            <Play className="w-3.5 h-3.5" />
            {running ? "Executando…" : "Executar Testes"}
          </button>
        </div>

        {testResults && (
          <>
            <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium mb-3 ${testResults.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
              {testResults.verdict === "PASS" ? <Trophy className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResults.verdict} — {testResults.passed}/{testResults.total} aprovados
            </div>
            <div className="space-y-2">
              {testResults.results.map((r, i) => <TestRow key={i} r={r} />)}
            </div>
          </>
        )}
      </section>

      {/* Alias registry viewer */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <Database className="w-4 h-4" /> EmailAliasRegistry
          </h2>
          <button onClick={loadAliases} className="px-3 py-1.5 bg-zinc-800 text-white rounded-lg text-xs hover:bg-zinc-700">
            Ver todos
          </button>
        </div>
        {aliases && (
          <div className="space-y-2">
            {aliases.map((a) => <AliasRow key={a.name} entry={a} />)}
          </div>
        )}
      </section>
    </div>
  );
}