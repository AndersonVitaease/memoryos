/**
 * SprintE026bPage — Engineering Sprint E-02.6b
 * Implicit Connector Intent Recognition — Validation Dashboard
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, CheckCircle, XCircle, Trophy, Zap, Info } from "lucide-react";

function TestRow({ r }) {
  return (
    <div className={`p-3 rounded-lg border text-xs space-y-1 ${r.passed ? "border-border/40 bg-muted/10" : "border-red-500/30 bg-red-500/10"}`}>
      <div className="flex items-start gap-2">
        {r.passed
          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
          : <XCircle    className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={r.passed ? "text-foreground font-medium" : "text-red-400 font-medium"}>{r.name}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.expectDetect ? "bg-violet-500/20 text-violet-400" : "bg-zinc-500/20 text-zinc-400"}`}>
              {r.expectDetect ? "positive" : "negative"}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5">Input: <span className="font-mono text-amber-400">"{r.input}"</span></p>
          {r.detected && (
            <>
              <p className="text-muted-foreground">Goal: <span className="font-mono text-violet-400">{r.goalType}</span></p>
              <p className="text-muted-foreground">searchTerm: <span className="font-mono text-emerald-400">"{r.searchTerm}"</span></p>
            </>
          )}
          {r.error && <p className="text-red-400 font-mono text-[10px] mt-1">{r.error}</p>}
        </div>
      </div>
    </div>
  );
}

function LiveResult({ result }) {
  if (!result) return null;
  return (
    <div className="mt-3 p-3 rounded-lg border border-border bg-muted/10 text-xs font-mono space-y-1">
      <p><span className="text-muted-foreground">detected:   </span><span className={result.detected ? "text-emerald-400" : "text-zinc-500"}>{String(result.detected)}</span></p>
      <p><span className="text-muted-foreground">goalType:   </span><span className="text-violet-400">{result.goalType ?? "null"}</span></p>
      <p><span className="text-muted-foreground">searchTerm: </span><span className="text-amber-400">"{result.searchTerm}"</span></p>
      <p><span className="text-muted-foreground">confidence: </span><span className="text-foreground">{result.confidence}</span></p>
      <p><span className="text-muted-foreground">label:      </span><span className="text-foreground">{result.label}</span></p>
    </div>
  );
}

export default function SprintE026bPage() {
  const [results,    setResults]    = useState(null);
  const [running,    setRunning]    = useState(false);
  const [liveInput,  setLiveInput]  = useState("Shopee");
  const [liveResult, setLiveResult] = useState(null);

  async function runTests() {
    setRunning(true); setResults(null);
    try {
      const { runImplicitIntentTests } = await import("@/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector");
      const { GoalRegistry }           = await import("@/lib/goals/GoalRegistry");
      const defs = GoalRegistry.listAll();
      const tests = runImplicitIntentTests(defs);
      const passed = tests.filter((t) => t.passed).length;
      setResults({ tests, passed, total: tests.length, verdict: passed === tests.length ? "PASS" : "FAIL" });
    } catch (e) {
      setResults({ tests: [{ name: "Load error", input: "", expectDetect: false, passed: false, detected: false, goalType: null, searchTerm: "", error: e.message }], passed: 0, total: 1, verdict: "FAIL" });
    } finally { setRunning(false); }
  }

  async function runLive() {
    const { implicitConnectorIntentDetector } = await import("@/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector");
    const { GoalRegistry }                   = await import("@/lib/goals/GoalRegistry");
    const r = implicitConnectorIntentDetector.resolve(liveInput, GoalRegistry.listAll());
    setLiveResult(r);
  }

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Zap className="w-6 h-6 text-amber-400" />
        <h1 className="text-2xl font-bold">Sprint E-02.6b — Implicit Intent Recognition</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Conectores ativados por linguagem implícita (sem verbos de ação).
      </p>

      {/* Flow diagram */}
      <section className="mb-8 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs">
        <p className="font-semibold text-amber-400 mb-3 flex items-center gap-2"><Info className="w-3.5 h-3.5" /> Fluxo E-02.6b</p>
        <div className="space-y-1 font-mono text-muted-foreground">
          <p><span className="text-foreground">Usuário:</span> "Shopee"</p>
          <p className="pl-4">↓ ConversationGoalBridge</p>
          <p className="pl-4">↓ GoalRegistry.matchBySignals → null</p>
          <p className="pl-4">↓ <span className="text-amber-400">ImplicitConnectorIntentDetector.resolve()</span></p>
          <p className="pl-8">• wordCount ≤ 5 ✓</p>
          <p className="pl-8">• no action verbs ✓</p>
          <p className="pl-8">• not social phrase ✓</p>
          <p className="pl-8">• gmail connector registered ✓</p>
          <p className="pl-4">↓ Goal: <span className="text-violet-400">gmail.searchMessages</span> query="Shopee"</p>
          <p className="pl-4">↓ Planning → Runtime → GmailConnector</p>
          <p className="pl-4">↓ <span className="text-emerald-400">Resposta com emails da Shopee</span></p>
        </div>
      </section>

      {/* Modified files */}
      <section className="mb-8 p-4 rounded-xl border border-border bg-muted/10 text-xs space-y-1">
        <p className="font-semibold text-foreground mb-2 text-[11px] uppercase tracking-wide">Arquivos</p>
        <p className="text-emerald-400">✓ src/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector.ts — novo</p>
        <p className="text-amber-400">✱ src/lib/conversation-goal-bridge/ConversationGoalBridge.ts — apenas bloco else do derive()</p>
        <p className="text-muted-foreground">— ConversationPipeline: intocado</p>
        <p className="text-muted-foreground">— Runtime / Planning / Router / Registry: intocados</p>
        <p className="text-muted-foreground">— Todos os Connectors: intocados</p>
      </section>

      {/* Live tester */}
      <section className="mb-8 p-4 rounded-xl border border-violet-500/30 bg-violet-500/5">
        <h2 className="text-sm font-semibold text-violet-400 mb-3">Detector — Tempo Real</h2>
        <div className="flex gap-2">
          <input
            value={liveInput}
            onChange={(e) => setLiveInput(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono"
            placeholder="Shopee, Hostinger, Pix..."
          />
          <button onClick={runLive} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
            Test
          </button>
        </div>
        <LiveResult result={liveResult} />
      </section>

      {/* Test suite */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suite de Testes (18 casos)</h2>
          <button onClick={runTests} disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50">
            <Play className="w-3.5 h-3.5" />
            {running ? "Executando…" : "Executar Testes"}
          </button>
        </div>

        {results && (
          <>
            <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium mb-3 ${results.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
              {results.verdict === "PASS" ? <Trophy className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {results.verdict} — {results.passed}/{results.total} aprovados
            </div>
            <div className="space-y-2">
              {results.tests.map((r, i) => <TestRow key={i} r={r} />)}
            </div>
          </>
        )}
      </section>
    </div>
  );
}