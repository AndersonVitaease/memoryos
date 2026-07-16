/**
 * SprintE027Page — Engineering Sprint E-02.7
 * Natural Language Normalization for Connector Goals — Validation Dashboard
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, CheckCircle, XCircle, Trophy, Languages } from "lucide-react";

function TestRow({ r }) {
  return (
    <div className={`p-2.5 rounded-lg border text-xs ${r.passed ? "border-border/30 bg-muted/5" : "border-red-500/30 bg-red-500/10"}`}>
      <div className="flex items-start gap-2">
        {r.passed
          ? <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
          : <XCircle    className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className="font-mono text-muted-foreground">"{r.input}"</span>
          <span className="text-muted-foreground mx-1">→</span>
          <span className={`font-mono font-semibold ${r.passed ? "text-emerald-400" : "text-red-400"}`}>
            {r.actualEntity}
          </span>
          {!r.passed && <span className="text-red-400 ml-2">(expected: {r.expectedEntity})</span>}
        </div>
      </div>
    </div>
  );
}

function IntentRow({ r }) {
  return (
    <div className={`p-2.5 rounded-lg border text-xs ${r.passed ? "border-border/30 bg-muted/5" : "border-red-500/30 bg-red-500/10"}`}>
      <div className="flex items-start gap-2">
        {r.passed
          ? <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
          : <XCircle    className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />}
        <div className="flex-1 font-mono text-xs flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">"{r.input}"</span>
          <span className={`px-1 rounded text-[10px] ${r.expectDetect ? "bg-violet-500/20 text-violet-400" : "bg-zinc-500/20 text-zinc-400"}`}>
            {r.expectDetect ? "expect: DETECT" : "expect: SKIP"}
          </span>
          {r.detected && <span className="text-amber-400">→ {r.goalType} ({r.searchTerm})</span>}
          {r.error && <span className="text-red-400">{r.error}</span>}
        </div>
      </div>
    </div>
  );
}

function LiveNormResult({ result }) {
  if (!result) return null;
  return (
    <div className="mt-3 p-3 rounded-lg border border-border bg-muted/10 text-xs font-mono space-y-1">
      <p><span className="text-muted-foreground">entity:       </span><span className="text-emerald-400 font-semibold">"{result.entity}"</span></p>
      <p><span className="text-muted-foreground">normalized:   </span><span className="text-foreground">"{result.normalized}"</span></p>
      <p><span className="text-muted-foreground">isEmailQuery: </span><span className={result.isEmailQuery ? "text-violet-400" : "text-zinc-500"}>{String(result.isEmailQuery)}</span></p>
      <p><span className="text-muted-foreground">isSocial:     </span><span className={result.isSocialPhrase ? "text-red-400" : "text-zinc-500"}>{String(result.isSocialPhrase)}</span></p>
      <p><span className="text-muted-foreground">isKnownEntity:</span><span className={result.isKnownEntity ? "text-emerald-400" : "text-zinc-500"}>{String(result.isKnownEntity)}</span></p>
    </div>
  );
}

export default function SprintE027Page() {
  const [normResults,   setNormResults]   = useState(null);
  const [intentResults, setIntentResults] = useState(null);
  const [running,       setRunning]       = useState(false);
  const [liveInput,     setLiveInput]     = useState("Tenho algum email da Shopee?");
  const [liveNorm,      setLiveNorm]      = useState(null);

  async function runAll() {
    setRunning(true); setNormResults(null); setIntentResults(null);
    try {
      const { runNormalizationTests } = await import("@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer");
      const { runImplicitIntentTests } = await import("@/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector");
      const { GoalRegistry } = await import("@/lib/goals/GoalRegistry");

      const norm   = runNormalizationTests();
      const intent = runImplicitIntentTests(GoalRegistry.listAll());

      const normPassed   = norm.filter((r) => r.passed).length;
      const intentPassed = intent.filter((r) => r.passed).length;

      setNormResults({ tests: norm, passed: normPassed, total: norm.length, verdict: normPassed === norm.length ? "PASS" : "FAIL" });
      setIntentResults({ tests: intent, passed: intentPassed, total: intent.length, verdict: intentPassed === intent.length ? "PASS" : "FAIL" });
    } catch (e) {
      const err = [{ input: "Error", expectedEntity: "", passed: false, actualEntity: "", error: e.message }];
      setNormResults({ tests: err, passed: 0, total: 1, verdict: "FAIL" });
    } finally { setRunning(false); }
  }

  async function runLive() {
    const { normalize } = await import("@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer");
    setLiveNorm(normalize(liveInput));
  }

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Languages className="w-6 h-6 text-teal-400" />
        <h1 className="text-2xl font-bold">Sprint E-02.7 — NL Goal Normalization</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Frases semanticamente equivalentes produzem exatamente o mesmo Goal.
      </p>

      {/* Files */}
      <section className="mb-6 p-4 rounded-xl border border-border bg-muted/10 text-xs space-y-1">
        <p className="font-semibold text-[11px] uppercase tracking-wide mb-2">Arquivos</p>
        <p className="text-emerald-400">✓ NaturalLanguageGoalNormalizer.ts — novo (SRP: strip ruído → entidade canônica)</p>
        <p className="text-amber-400">✱ ImplicitConnectorIntentDetector.ts — usa normalize(), limite ≤8 palavras com fallback</p>
        <p className="text-amber-400">✱ GoalRegistry.ts — signals gmail.searchMessages expandidos (tenho, existe, há, recebi…)</p>
        <p className="text-muted-foreground">— ConversationPipeline / Runtime / Planning / Router / Connectors: inalterados</p>
      </section>

      {/* Equivalence examples */}
      <section className="mb-6 p-4 rounded-xl border border-teal-500/20 bg-teal-500/5 text-xs">
        <p className="font-semibold text-teal-400 mb-3 text-[11px] uppercase">Frases equivalentes → mesmo Goal</p>
        <div className="font-mono space-y-0.5 text-muted-foreground">
          {[
            "Shopee", "emails da Shopee", "tenho emails da Shopee",
            "tenho algum email da Shopee", "há emails da Shopee",
            "existe email da Shopee", "procure emails da Shopee",
            "recebi algum email da Shopee",
          ].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="text-foreground">"{s}"</span>
              <span className="text-teal-400">→ gmail.searchMessages query="Shopee"</span>
            </div>
          ))}
        </div>
      </section>

      {/* Live normalizer */}
      <section className="mb-6 p-4 rounded-xl border border-violet-500/30 bg-violet-500/5">
        <h2 className="text-sm font-semibold text-violet-400 mb-3">Normalizer — Tempo Real</h2>
        <div className="flex gap-2">
          <input
            value={liveInput}
            onChange={(e) => setLiveInput(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Tenho algum email da Shopee?"
          />
          <button onClick={runLive} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
            Normalize
          </button>
        </div>
        <LiveNormResult result={liveNorm} />
      </section>

      {/* Test runner */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Suites de Testes
        </h2>
        <button onClick={runAll} disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50">
          <Play className="w-3.5 h-3.5" />
          {running ? "Executando…" : "Executar Todos"}
        </button>
      </div>

      {/* Normalization results */}
      {normResults && (
        <section className="mb-6">
          <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium mb-3 ${normResults.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
            {normResults.verdict === "PASS" ? <Trophy className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            Normalization Suite — {normResults.verdict} — {normResults.passed}/{normResults.total}
          </div>
          <div className="space-y-1.5">
            {normResults.tests.map((r, i) => <TestRow key={i} r={r} />)}
          </div>
        </section>
      )}

      {/* Intent detection results */}
      {intentResults && (
        <section className="mb-6">
          <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium mb-3 ${intentResults.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
            {intentResults.verdict === "PASS" ? <Trophy className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            Implicit Intent Suite (regressão E-02.6) — {intentResults.verdict} — {intentResults.passed}/{intentResults.total}
          </div>
          <div className="space-y-1.5">
            {intentResults.tests.map((r, i) => <IntentRow key={i} r={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}