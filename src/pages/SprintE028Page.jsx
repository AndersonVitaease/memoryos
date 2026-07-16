/**
 * SprintE028Page — Engineering Sprint E-02.8
 * Smart Gmail Query Engine — Validation Dashboard
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, CheckCircle, XCircle, Trophy, Search, ChevronDown, ChevronRight } from "lucide-react";

function Badge({ children, color = "zinc" }) {
  const colors = {
    zinc:    "bg-zinc-500/20 text-zinc-400",
    violet:  "bg-violet-500/20 text-violet-400",
    emerald: "bg-emerald-500/20 text-emerald-400",
    red:     "bg-red-500/20 text-red-400",
    amber:   "bg-amber-500/20 text-amber-400",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${colors[color]}`}>{children}</span>;
}

function AttemptRow({ attempt }) {
  const colors = {
    exact_name:          "violet",
    domain_primary:      "amber",
    domain_com:          "amber",
    from_prefix:         "emerald",
    domain_com_br:       "zinc",
    quoted_exact:        "violet",
    condensed_slug:      "zinc",
    camel_case:          "zinc",
    from_domain_combined:"emerald",
  };
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-zinc-600 text-[10px] w-4 text-right">{attempt.attempt}.</span>
      <Badge color={colors[attempt.strategy] ?? "zinc"}>{attempt.strategy}</Badge>
      <span className="font-mono text-xs text-foreground">{attempt.query}</span>
    </div>
  );
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border text-xs ${r.passed ? "border-border/30 bg-muted/5" : "border-red-500/30 bg-red-500/10"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-2.5 text-left"
      >
        {r.passed
          ? <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
          : <XCircle     className="w-3 h-3 text-red-500 shrink-0" />}
        <span className="font-medium flex-1">{r.name}</span>
        <Badge color="zinc">{r.attempts} tentativas</Badge>
        <span className="font-mono text-muted-foreground text-[10px] truncate max-w-[160px]">{r.firstQuery}</span>
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-2.5 border-t border-border/30 pt-2">
          {r.error && <p className="text-red-400 mb-1">Erro: {r.error}</p>}
          <p className="text-[10px] text-muted-foreground mb-1 font-semibold uppercase tracking-wide">Todas as queries geradas:</p>
          {r.allQueries.map((q, i) => (
            <div key={i} className="font-mono text-[11px] text-foreground">
              <span className="text-zinc-600 mr-1.5">{i + 1}.</span>{q}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveStrategyPanel({ entity }) {
  const [strategy, setStrategy] = useState(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    const { buildSearchStrategy } = await import("@/lib/gmail/SmartGmailQueryBuilder");
    setStrategy(buildSearchStrategy(entity));
    setLoading(false);
  }

  return (
    <div className="p-3 rounded-xl border border-border bg-muted/10">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-sm font-semibold">{entity}</span>
        <button onClick={run} disabled={loading}
          className="px-2 py-0.5 bg-zinc-700 text-white rounded text-xs hover:bg-zinc-600 disabled:opacity-50">
          {loading ? "..." : "Build"}
        </button>
      </div>
      {strategy && (
        <div className="space-y-0.5">
          {strategy.attempts.map((a) => <AttemptRow key={a.attempt} attempt={a} />)}
        </div>
      )}
    </div>
  );
}

export default function SprintE028Page() {
  const [results, setResults]   = useState(null);
  const [e027res, setE027res]   = useState(null);
  const [running, setRunning]   = useState(false);

  async function runAll() {
    setRunning(true); setResults(null); setE027res(null);
    try {
      // E-02.8 tests
      const { runSmartQueryTests } = await import("@/lib/gmail/SmartGmailQueryBuilder");
      const tests = runSmartQueryTests();
      const passed = tests.filter((t) => t.passed).length;
      setResults({ tests, passed, total: tests.length, verdict: passed === tests.length ? "PASS" : "FAIL" });

      // E-02.7 regression
      const { runNormalizationTests } = await import("@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer");
      const { runImplicitIntentTests } = await import("@/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector");
      const { GoalRegistry } = await import("@/lib/goals/GoalRegistry");
      const norm   = runNormalizationTests();
      const intent = runImplicitIntentTests(GoalRegistry.listAll());
      const all    = [...norm, ...intent];
      const p27    = all.filter((r) => r.passed).length;
      setE027res({ total: all.length, passed: p27, verdict: p27 === all.length ? "PASS" : "FAIL" });
    } catch (e) {
      setResults({ tests: [{ name: "Error", passed: false, attempts: 0, firstQuery: "", allQueries: [], error: e.message }], passed: 0, total: 1, verdict: "FAIL" });
    } finally { setRunning(false); }
  }

  const DEMOS = ["Hostinger", "Shopee", "Mercado Livre", "Amazon", "PicPay", "Nubank", "Notion", "HubSpot"];

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Search className="w-6 h-6 text-amber-400" />
        <h1 className="text-2xl font-bold">Sprint E-02.8 — Smart Gmail Query Engine</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Busca progressiva: tenta variantes de query ate encontrar resultados.
      </p>

      {/* Files */}
      <section className="mb-6 p-4 rounded-xl border border-border bg-muted/10 text-xs space-y-1">
        <p className="font-semibold text-[11px] uppercase tracking-wide mb-2">Arquivos</p>
        <p className="text-emerald-400">✓ SmartGmailQueryBuilder.ts — novo (SRP: entidade → estrategia progressiva)</p>
        <p className="text-amber-400">✱ GmailConnector.ts — searchEmails usa SmartSearch (progressivo)</p>
        <p className="text-muted-foreground">— Pipeline / Runtime / Planning / Router / Registry / GoalEngine: INALTERADOS</p>
      </section>

      {/* Strategy */}
      <section className="mb-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs">
        <p className="font-semibold text-amber-400 mb-3 text-[11px] uppercase">Estrategia de Query (generica)</p>
        <div className="space-y-1 font-mono text-muted-foreground">
          {[
            ["1", "exact_name",          "Hostinger"],
            ["2", "domain_primary",      "hostinger.com"],
            ["3", "from_prefix",         "from:hostinger"],
            ["4", "domain_com_br",       "hostinger.com.br"],
            ["5", "quoted_exact",        '"Mercado Livre"  (multi-word)'],
            ["6", "condensed_slug",      "mercadolivre  (multi-word)"],
            ["7", "camel_case",          "MercadoLivre  (multi-word)"],
            ["8", "from_domain_combined","from:(hostinger.com OR hostinger.com.br)"],
          ].map(([n, label, ex]) => (
            <div key={n} className="flex items-center gap-2">
              <span className="text-zinc-600 w-3">{n}.</span>
              <Badge color="amber">{label}</Badge>
              <span className="text-foreground">{ex}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-muted-foreground">Para na primeira tentativa que retornar &gt; 0 resultados.</p>
      </section>

      {/* Live demos */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Demo — Estrategias Geradas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEMOS.map((e) => <LiveStrategyPanel key={e} entity={e} />)}
        </div>
      </section>

      {/* Test runner */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suites de Testes</h2>
        <button onClick={runAll} disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50">
          <Play className="w-3.5 h-3.5" />
          {running ? "Executando…" : "Executar Todos"}
        </button>
      </div>

      {/* E-02.8 results */}
      {results && (
        <section className="mb-6">
          <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium mb-3 ${results.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
            {results.verdict === "PASS" ? <Trophy className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            E-02.8 Smart Query Suite — {results.verdict} — {results.passed}/{results.total}
          </div>
          <div className="space-y-1.5">
            {results.tests.map((r, i) => <TestRow key={i} r={r} />)}
          </div>
        </section>
      )}

      {/* E-02.7 regression */}
      {e027res && (
        <section className="mb-6">
          <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium ${e027res.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
            {e027res.verdict === "PASS" ? <Trophy className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            Regressao E-02.7 (Normalizacao + Intent) — {e027res.verdict} — {e027res.passed}/{e027res.total}
          </div>
        </section>
      )}

      {/* Architectural invariance */}
      <section className="p-4 rounded-xl border border-border bg-muted/10 text-xs">
        <p className="font-semibold text-[11px] uppercase tracking-wide mb-2 text-muted-foreground">Invariancia Arquitetural</p>
        {[
          "ConversationPipeline.ts", "ConversationManager.ts", "GoalEngine.ts",
          "PlanningEngine.ts", "Runtime / ExecutionDispatcher.ts",
          "UniversalConnectorRouter.ts", "ConnectorRegistry.ts",
        ].map((f) => (
          <div key={f} className="flex items-center gap-2 py-0.5">
            <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="text-muted-foreground">{f} — INALTERADO</span>
          </div>
        ))}
      </section>
    </div>
  );
}