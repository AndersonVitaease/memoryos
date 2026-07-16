/**
 * SprintE029Page — Engineering Sprint E-02.9
 * Connector Knowledge Layer — Validation Dashboard
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, CheckCircle, XCircle, Trophy, Layers, ChevronDown, ChevronRight, Database, Search, Zap } from "lucide-react";

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Badge({ children, color = "zinc" }) {
  const c = {
    zinc:    "bg-zinc-500/15 text-zinc-400",
    violet:  "bg-violet-500/15 text-violet-300",
    emerald: "bg-emerald-500/15 text-emerald-400",
    red:     "bg-red-500/15 text-red-400",
    amber:   "bg-amber-500/15 text-amber-400",
    blue:    "bg-blue-500/15 text-blue-400",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${c[color] ?? c.zinc}`}>{children}</span>;
}

function SRPBadge({ label }) {
  return <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 text-[10px] font-mono border border-violet-500/20">{label}</span>;
}

function TestRow({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border text-xs ${r.passed ? "border-border/30 bg-muted/5" : "border-red-500/30 bg-red-500/10"}`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 p-2.5 text-left">
        {r.passed
          ? <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
          : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
        <span className="flex-1 font-medium">{r.name}</span>
        <Badge color="violet">{r.aliases?.length ?? 0} aliases</Badge>
        <Badge color="amber">{r.domains?.length ?? 0} dominios</Badge>
        <Badge color="blue">{r.queries?.length ?? 0} queries</Badge>
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-border/30 space-y-2">
          {r.error && <p className="text-red-400 font-mono text-[11px]">{r.error}</p>}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Aliases</p>
              {r.aliases?.map((a, i) => <div key={i} className="font-mono text-[11px] text-violet-300">{a}</div>)}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Dominios</p>
              {r.domains?.map((d, i) => <div key={i} className="font-mono text-[11px] text-amber-300">{d}</div>)}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Queries (ordem)</p>
              {r.queries?.map((q, i) => <div key={i} className="font-mono text-[11px] text-blue-300"><span className="text-zinc-600">{i+1}.</span> {q}</div>)}
            </div>
          </div>
          {r.details && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Detalhes</p>
              {r.details.map((d, i) => (
                <div key={i} className={`font-mono text-[11px] ${d.startsWith("Expected") || d.startsWith("Alias resolution") ? "text-red-400" : "text-muted-foreground"}`}>{d}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SimulatorRow({ res }) {
  if (!res) return null;
  return (
    <div className="p-3 rounded-xl border border-border bg-muted/10 text-xs space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold">{res.entity}</span>
        {res.winningQuery
          ? <Badge color="emerald">WINNER: {res.winningQuery}</Badge>
          : <Badge color="red">NO RESULTS</Badge>}
        <Badge color="zinc">{res.totalDurationMs}ms total</Badge>
      </div>
      {res.strategy?.attempts?.map((a) => (
        <div key={a.attempt} className="flex items-center gap-2 font-mono">
          <span className="text-zinc-600 w-3">{a.attempt}.</span>
          <Badge color={a.succeeded ? "emerald" : "zinc"}>{a.strategy}</Badge>
          <span className="text-foreground">{a.query}</span>
          <span className={a.succeeded ? "text-emerald-400" : "text-muted-foreground"}>{a.results} results</span>
          {a.durationMs != null && <span className="text-zinc-600">{a.durationMs}ms</span>}
        </div>
      ))}
      <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
        {res.log?.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SIM_ENTITIES = ["Hostinger", "Shopee", "Mercado Livre", "GitHub", "Notion", "Nubank", "PicPay", "Amazon"];

export default function SprintE029Page() {
  const [tests,   setTests]   = useState(null);
  const [sims,    setSims]    = useState({});
  const [stats,   setStats]   = useState(null);
  const [running, setRunning] = useState(false);
  const [regress, setRegress] = useState(null);
  const [simRunning, setSimRunning] = useState(false);

  async function runTests() {
    setRunning(true); setTests(null);
    const { runSmartQueryTests } = await import("@/lib/gmail/SmartQueryTests");
    const res = runSmartQueryTests();
    const passed = res.filter((r) => r.passed).length;
    setTests({ results: res, passed, total: res.length, verdict: passed === res.length ? "PASS" : "FAIL" });
    setRunning(false);
  }

  async function runSimulations() {
    setSimRunning(true); setSims({});
    const { runExecutorSimulation } = await import("@/lib/gmail/SmartQueryTests");
    const results = {};
    for (const entity of SIM_ENTITIES) {
      results[entity] = await runExecutorSimulation(entity);
    }
    setSims(results);
    setSimRunning(false);
  }

  async function loadStats() {
    const { EmailAliasRegistry } = await import("@/lib/gmail/EmailAliasRegistry");
    const { DomainRegistry }     = await import("@/lib/gmail/DomainRegistry");
    setStats({
      aliases: EmailAliasRegistry.size,
      domains: DomainRegistry.size,
      aliasSlugs: EmailAliasRegistry.listSlugs(),
      domainSlugs: DomainRegistry.listSlugs(),
    });
  }

  async function runRegression() {
    const { runNormalizationTests } = await import("@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer");
    const { runImplicitIntentTests } = await import("@/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector");
    const { GoalRegistry } = await import("@/lib/goals/GoalRegistry");
    const norm   = runNormalizationTests();
    const intent = runImplicitIntentTests(GoalRegistry.listAll());
    const all    = [...norm, ...intent];
    const passed = all.filter((r) => r.passed).length;
    setRegress({ total: all.length, passed, verdict: passed === all.length ? "PASS" : "FAIL" });
  }

  useState(() => { loadStats(); }, []);

  const LAYERS = [
    { icon: <Layers className="w-3.5 h-3.5" />, label: "EmailAliasRegistry",    srp: "Conhecer aliases",        color: "violet" },
    { icon: <Database className="w-3.5 h-3.5" />, label: "DomainRegistry",      srp: "Conhecer dominios",       color: "amber"  },
    { icon: <Search className="w-3.5 h-3.5" />,  label: "SmartQueryBuilder",   srp: "Construir estrategia",    color: "blue"   },
    { icon: <Zap className="w-3.5 h-3.5" />,     label: "SmartQueryExecutor",  srp: "Executar tentativas",     color: "emerald"},
  ];

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Layers className="w-6 h-6 text-violet-400" />
        <h1 className="text-2xl font-bold">Sprint E-02.9 — Connector Knowledge Layer</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Refatoracao: Conhecimento, Estrategia e Execucao totalmente separados.
      </p>

      {/* Architecture */}
      <section className="mb-6 p-4 rounded-xl border border-violet-500/20 bg-violet-500/5">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-3">Arquitetura — Connector Knowledge Layer</p>
        <div className="space-y-2">
          {LAYERS.map((l) => (
            <div key={l.label} className="flex items-center gap-3 text-xs">
              <span className={`text-${l.color}-400`}>{l.icon}</span>
              <span className="font-mono font-semibold w-44">{l.label}</span>
              <SRPBadge label={`SRP: ${l.srp}`} />
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-violet-500/20 text-[11px] text-muted-foreground space-y-0.5">
          <p>GmailConnector — orquestrador fino: chama Builder → Executor → retorna resultado</p>
          <p>Runtime / Planning / Router / Registry / GoalEngine — INALTERADOS</p>
        </div>
      </section>

      {/* Registry stats */}
      {stats && (
        <section className="mb-6 grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-border bg-muted/10 text-xs">
            <p className="text-[10px] uppercase tracking-wide text-violet-400 font-semibold mb-1">EmailAliasRegistry</p>
            <p className="text-2xl font-bold">{stats.aliases}</p>
            <p className="text-muted-foreground">entidades com aliases</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-muted/10 text-xs">
            <p className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold mb-1">DomainRegistry</p>
            <p className="text-2xl font-bold">{stats.domains}</p>
            <p className="text-muted-foreground">entidades com dominios</p>
          </div>
        </section>
      )}

      {/* Files */}
      <section className="mb-6 p-3 rounded-xl border border-border bg-muted/10 text-xs space-y-1">
        <p className="font-semibold text-[11px] uppercase tracking-wide mb-2 text-muted-foreground">Arquivos Entregues</p>
        {[
          ["CRIADO",    "SmartQueryTypes.ts",    "Apenas tipos — sem logica"],
          ["CRIADO",    "DomainRegistry.ts",     "SRP: conhecer dominios"],
          ["CRIADO",    "EmailAliasRegistry.ts", "SRP: conhecer aliases"],
          ["CRIADO",    "SmartQueryBuilder.ts",  "SRP: construir estrategia"],
          ["CRIADO",    "SmartQueryExecutor.ts", "SRP: executar tentativas"],
          ["CRIADO",    "SmartQueryTests.ts",    "Suite de testes"],
          ["REFATORADO","GmailConnector.ts",     "Tornou-se orquestrador fino"],
        ].map(([status, file, desc]) => (
          <div key={file} className="flex items-center gap-2">
            <Badge color={status === "CRIADO" ? "emerald" : "amber"}>{status}</Badge>
            <span className="font-mono">{file}</span>
            <span className="text-muted-foreground">— {desc}</span>
          </div>
        ))}
        <div className="pt-1 border-t border-border/30 mt-1">
          {["ConversationPipeline","ConversationManager","GoalEngine","PlanningEngine",
            "Runtime","ExecutionDispatcher","UniversalConnectorRouter","ConnectorRegistry"].map((f) => (
            <div key={f} className="flex items-center gap-2 py-0.5">
              <CheckCircle className="w-3 h-3 text-emerald-500" />
              <span className="text-muted-foreground font-mono text-[11px]">{f} — INALTERADO</span>
            </div>
          ))}
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={runTests} disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50">
          <Play className="w-3.5 h-3.5" />
          {running ? "Executando…" : "Testes E-02.9"}
        </button>
        <button onClick={runSimulations} disabled={simRunning}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50">
          <Zap className="w-3.5 h-3.5" />
          {simRunning ? "Simulando…" : "Simulador Executor"}
        </button>
        <button onClick={runRegression}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700">
          <Trophy className="w-3.5 h-3.5" />
          Regressao E-02.7/8
        </button>
      </div>

      {/* Test results */}
      {tests && (
        <section className="mb-6">
          <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium mb-3 ${tests.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
            {tests.verdict === "PASS" ? <Trophy className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            E-02.9 Knowledge Layer Tests — {tests.verdict} — {tests.passed}/{tests.total}
          </div>
          <div className="space-y-1.5">
            {tests.results.map((r, i) => <TestRow key={i} r={r} />)}
          </div>
        </section>
      )}

      {/* Simulations */}
      {Object.keys(sims).length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Simulacao SmartQueryExecutor</h2>
          <div className="space-y-2">
            {SIM_ENTITIES.map((e) => sims[e] && <SimulatorRow key={e} res={sims[e]} />)}
          </div>
        </section>
      )}

      {/* Regression */}
      {regress && (
        <section className="mb-6">
          <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium ${regress.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
            {regress.verdict === "PASS" ? <Trophy className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            Regressao E-02.7/8 — {regress.verdict} — {regress.passed}/{regress.total}
          </div>
        </section>
      )}

      {/* Compliance */}
      <section className="p-4 rounded-xl border border-border bg-muted/10 text-xs">
        <p className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Conformidade Arquitetural</p>
        {[
          ["SRP",                "Cada modulo tem exatamente uma responsabilidade"],
          ["Baixo acoplamento",  "Modulos comunicam-se por contratos (tipos), sem dependencias circulares"],
          ["Alta coesao",        "Aliases com aliases, dominios com dominios, estrategia com estrategia"],
          ["Imutabilidade",      "Todos os retornos sao Object.freeze — sem mutacao compartilhada"],
          ["Extensibilidade",    "Nova empresa = register() em 2 registries, zero outros arquivos"],
          ["Arquitetura invariavel", "Runtime, Planning, Router, Registry — todos inalterados"],
          ["Reutilizacao",       "SmartQueryBuilder/Executor funcionam para Drive, Calendar, GitHub, Slack..."],
        ].map(([p, d]) => (
          <div key={p} className="flex items-start gap-2 py-0.5">
            <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
            <span className="font-semibold text-foreground w-36 shrink-0">{p}</span>
            <span className="text-muted-foreground">{d}</span>
          </div>
        ))}
      </section>
    </div>
  );
}