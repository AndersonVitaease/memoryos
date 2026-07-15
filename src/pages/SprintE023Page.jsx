/**
 * SprintE023Page — Engineering Sprint E-02.3
 * Runtime Engine Foundation — Validation Dashboard
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, Layers } from "lucide-react";

export default function SprintE023Page() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null);
  const [demoOut, setDemoOut]   = useState(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [normRunning, setNormRunning] = useState(false);
  const [normResults, setNormResults] = useState(null);

  async function runNormTests() {
    setNormRunning(true);
    setNormResults(null);
    try {
      const { runRuntimeNormalizationTests } = await import("@/lib/runtime-engine/runtimeNormalizationTests");
      setNormResults(await runRuntimeNormalizationTests());
    } catch (e) {
      setNormResults({ verdict: "FAIL", passed: 0, failed: 1, total: 1, results: [{ name: "Suite load error", passed: false, error: e.message, durationMs: 0 }] });
    } finally {
      setNormRunning(false);
    }
  }

  async function runTests() {
    setRunning(true);
    setResults(null);
    try {
      const { runRuntimeEngineTests } = await import("@/lib/runtime-engine/runtimeEngineTests");
      const out = await runRuntimeEngineTests();
      setResults(out);
    } catch (e) {
      setResults({ verdict: "FAIL", passed: 0, failed: 1, total: 1, results: [{ name: "Suite load error", passed: false, error: e.message, durationMs: 0 }] });
    } finally {
      setRunning(false);
    }
  }

  async function runDemo() {
    setDemoRunning(true);
    setDemoOut(null);
    try {
      const { ConversationRuntimeEngine } = await import("@/lib/runtime-engine/ConversationRuntimeEngine");
      const { MockCapabilityExecutor }    = await import("@/lib/runtime-engine/MockCapabilityExecutor");
      const engine = new ConversationRuntimeEngine(new MockCapabilityExecutor(80));

      const plan = Object.freeze({
        id: "demo-plan-1", goalId: "demo-goal-1", goalType: "gmail.readInbox",
        status: "planned",
        steps: Object.freeze([
          Object.freeze({ id: "s1", connector: "gmail",    capability: "readInbox",  parameters: Object.freeze({ maxResults: 5 }) }),
          Object.freeze({ id: "s2", connector: "calendar", capability: "listToday",  parameters: Object.freeze({}) }),
          Object.freeze({ id: "s3", connector: "drive",    capability: "searchFiles",parameters: Object.freeze({ query: "report" }) }),
        ]),
        createdAt: Date.now(), durationMs: 0,
      });

      const events = [];
      engine.onEvent((e) => events.push(e));
      const result = await engine.execute(plan);
      setDemoOut({ result, events });
    } catch (e) {
      setDemoOut({ error: e.message });
    } finally {
      setDemoRunning(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <h1 className="text-2xl font-bold mb-1">Sprint E-02.3 — Runtime Engine</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Valida o coração operacional do MemoryOS: interpretação de ExecutionPlan,
        percurso de steps, controle de estados, cancelamento, timeout e observabilidade.
        Nenhum Connector real é chamado.
      </p>

      {/* Demo */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Demo: Execução com MockExecutor</h2>
        <button
          onClick={runDemo}
          disabled={demoRunning}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 mb-4"
        >
          <Play className="w-4 h-4" />
          {demoRunning ? "Executando…" : "Executar plano demo"}
        </button>

        {demoOut && !demoOut.error && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-border bg-muted/30 text-xs font-mono">
              <p className="font-semibold text-foreground mb-2">ExecutionResult</p>
              <p><span className="text-muted-foreground">executionId:</span> {demoOut.result.executionId}</p>
              <p><span className="text-muted-foreground">status:     </span> <span className={demoOut.result.status === "completed" ? "text-emerald-500" : "text-red-500"}>{demoOut.result.status}</span></p>
              <p><span className="text-muted-foreground">steps:      </span> {demoOut.result.steps.length}</p>
              <p><span className="text-muted-foreground">durationMs: </span> {demoOut.result.durationMs}ms</p>
              <p><span className="text-muted-foreground">errors:     </span> {demoOut.result.errors.length === 0 ? "none" : demoOut.result.errors.join(", ")}</p>
              <div className="mt-3 space-y-1">
                {demoOut.result.steps.map((s) => (
                  <div key={s.stepId} className="flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="text-muted-foreground">{s.connector}.{s.capability}</span>
                    <span className="text-foreground">{s.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30 text-xs font-mono">
              <p className="font-semibold text-foreground mb-2">Events ({demoOut.events.length})</p>
              {demoOut.events.map((e, i) => (
                <p key={i} className="text-muted-foreground">{e.type}{e.capability ? ` → ${e.connector}.${e.capability}` : ""}</p>
              ))}
            </div>
          </div>
        )}
        {demoOut?.error && (
          <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-xs font-mono">{demoOut.error}</div>
        )}
      </section>

      {/* Normalization Tests E-02.3A */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          E-02.3A — Normalização (Dispatcher · ContextFactory · Provider · Policy · Retry)
        </h2>
        <button onClick={runNormTests} disabled={normRunning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 mb-4">
          <Layers className="w-4 h-4" />
          {normRunning ? "Executando…" : "Executar testes de normalização (20 casos)"}
        </button>
        {normResults && (
          <div className="space-y-2">
            <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${normResults.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
              {normResults.verdict === "PASS" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {normResults.verdict} — {normResults.passed}/{normResults.total} aprovados
            </div>
            {normResults.results.map((r, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${r.passed ? "border-border/50 bg-muted/20" : "border-red-500/30 bg-red-500/10"}`}>
                {r.passed ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={r.passed ? "text-foreground" : "text-red-400"}>{r.name}</p>
                  {!r.passed && r.error && <p className="text-red-400/70 mt-0.5 font-mono text-[10px]">{r.error}</p>}
                </div>
                <span className="flex items-center gap-1 text-muted-foreground shrink-0"><Clock className="w-3 h-3" />{r.durationMs}ms</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tests */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Suite de testes (15 casos)</h2>
        <button
          onClick={runTests}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 mb-4"
        >
          <Play className="w-4 h-4" />
          {running ? "Executando testes…" : "Executar todos os testes"}
        </button>

        {results && (
          <div className="space-y-2">
            <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${results.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
              {results.verdict === "PASS" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {results.verdict} — {results.passed}/{results.total} aprovados
            </div>
            {results.results.map((r, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${r.passed ? "border-border/50 bg-muted/20" : "border-red-500/30 bg-red-500/10"}`}>
                {r.passed
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  : <XCircle    className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={r.passed ? "text-foreground" : "text-red-400"}>{r.name}</p>
                  {!r.passed && r.error && <p className="text-red-400/70 mt-0.5 font-mono text-[10px]">{r.error}</p>}
                </div>
                <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                  <Clock className="w-3 h-3" />{r.durationMs}ms
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}