/**
 * MultiConnectorPage — Engineering Sprint 8.0
 * Multi-Connector Orchestration Engine (MCOE) Dashboard
 * Rota: /multi-connector
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Layers, CheckCircle, XCircle, Zap, Shield, Activity, GitBranch, ChevronRight, BarChart2 } from "lucide-react";

const SCENARIO_LABELS = {
  documents_from_meeting: "Documentos da Reunião",
  client_summary:         "Resumo do Cliente",
  pending_before_meeting: "Pendentes antes da Reunião",
  custom:                 "Custom",
};
const SCENARIO_EXAMPLES = [
  { q: "Mostre os documentos da reunião de amanhã.", s: "documents_from_meeting" },
  { q: "Resuma tudo relacionado ao cliente XPTO.",   s: "client_summary" },
  { q: "Tenho algo pendente antes da reunião de sexta?", s: "pending_before_meeting" },
];

const STATUS_COLOR = { success:"text-emerald-400", failed:"text-red-400", running:"text-amber-400", pending:"text-muted-foreground", skipped:"text-zinc-600" };
const CONNECTOR_EMOJI = { calendar:"📅", drive:"📁", gmail:"📧" };

function Card({ children, className="" }) {
  return <div className={`p-4 rounded-xl border border-border/40 bg-muted/5 ${className}`}>{children}</div>;
}
function SectionTitle({ icon: Icon, label, color="violet" }) {
  const c = { violet:"text-violet-400", emerald:"text-emerald-400", blue:"text-blue-400", amber:"text-amber-400" };
  return <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${c[color]}`}><Icon className="w-4 h-4" />{label}</h2>;
}

function GraphViz({ plan }) {
  if (!plan) return null;
  // Group nodes by layer (using dependsOn)
  const layers = [];
  const seen = new Set();
  const assigned = new Map();

  function getLayer(n) {
    if (assigned.has(n.id)) return assigned.get(n.id);
    if (n.dependsOn.length === 0) { assigned.set(n.id, 0); return 0; }
    const max = Math.max(...n.dependsOn.map((id) => { const dep = plan.nodes.find((x) => x.id === id); return dep ? getLayer(dep) : 0; }));
    assigned.set(n.id, max + 1);
    return max + 1;
  }
  plan.nodes.forEach(getLayer);
  const maxL = Math.max(...Array.from(assigned.values()));
  for (let i = 0; i <= maxL; i++) {
    layers.push(plan.nodes.filter((n) => assigned.get(n.id) === i));
  }

  return (
    <div className="space-y-2">
      {layers.map((nodes, li) => (
        <div key={li}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-mono w-12">Layer {li}</span>
            {nodes.map((n) => (
              <div key={n.id} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border/40 bg-muted/10 text-[11px]">
                <span>{CONNECTOR_EMOJI[n.connectorId] ?? "🔌"}</span>
                <span className="font-medium">{n.label}</span>
                <span className="text-muted-foreground font-mono text-[9px]">({n.mode})</span>
              </div>
            ))}
            {nodes.length > 1 && <span className="text-[10px] text-violet-400 font-mono">‖ parallel</span>}
          </div>
          {li < layers.length - 1 && <div className="pl-12 text-muted-foreground text-xs">↓</div>}
        </div>
      ))}
      <div className="pl-12 text-xs text-muted-foreground">↓ Aggregator → UnifiedContext → Response</div>
    </div>
  );
}

function NodeResultRow({ r }) {
  return (
    <div className={`flex items-start gap-3 px-3 py-2 rounded-lg border border-border/30 text-xs`}>
      {r.status === "success" ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold">{r.nodeId}</span>
          <span className={`text-[10px] font-semibold ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</span>
          {r.retryCount > 0 && <span className="text-amber-400 text-[10px]">retried {r.retryCount}x</span>}
        </div>
        {r.error && <p className="text-red-400 text-[10px] truncate">{r.error}</p>}
      </div>
      <span className="font-mono text-muted-foreground text-[10px] shrink-0">{r.durationMs}ms</span>
    </div>
  );
}

export default function MultiConnectorPage() {
  const [query,       setQuery]       = useState("");
  const [plan,        setPlan]        = useState(null);
  const [result,      setResult]      = useState(null);
  const [response,    setResponse]    = useState(null);
  const [running,     setRunning]     = useState(false);
  const [certResult,  setCertResult]  = useState(null);
  const [certRunning, setCertRunning] = useState(false);
  const [history,     setHistory]     = useState([]);
  const [useLLM,      setUseLLM]      = useState(false);
  const [activeTab,   setActiveTab]   = useState("plan");

  useEffect(() => {
    import("@/lib/multi-connector/MultiConnectorDashboard").then(({ getHistory }) => setHistory(getHistory()));
  }, []);

  const runOrchestration = useCallback(async (q = query) => {
    if (!q.trim()) return;
    setRunning(true); setPlan(null); setResult(null); setResponse(null);
    const { mcoe, detectScenario } = await import("@/lib/multi-connector/MultiConnectorPlanner");
    const { aggregateResults }     = await import("@/lib/multi-connector/ConnectorResultAggregator");
    const { recordExecution }      = await import("@/lib/multi-connector/MultiConnectorDashboard");
    const p = await mcoe.plan(q);
    setPlan(p);
    const r = await mcoe.execute(p);
    setResult(r);
    const agg = await aggregateResults(r, q, useLLM);
    setResponse(agg);
    recordExecution(p, r);
    setHistory((await import("@/lib/multi-connector/MultiConnectorDashboard")).getHistory());
    setRunning(false);
    setActiveTab("result");
  }, [query, useLLM]);

  const runCert = useCallback(async () => {
    setCertRunning(true);
    const { runMCOECertificationSuite } = await import("@/lib/multi-connector/MCOECertificationSuite");
    setCertResult(await runMCOECertificationSuite());
    setCertRunning(false);
  }, []);

  const stats = result ? {
    total:    result.nodeResults.length,
    success:  result.nodeResults.filter((r) => r.status === "success").length,
    failed:   result.partialFailures.length,
    parallelMs: result.parallelSavingsMs,
    totalMs:  result.totalDurationMs,
  } : null;

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-4xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Layers className="w-6 h-6 text-violet-400" />
        <h1 className="text-2xl font-bold">Multi-Connector Orchestration</h1>
        <span className="text-xs font-mono border border-border text-muted-foreground px-2 py-0.5 rounded">Sprint 8.0</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Uma unica intencao → plano composto → multiplos connectors → resposta unificada.
      </p>

      {/* Scenario examples */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {SCENARIO_EXAMPLES.map((ex) => (
          <button key={ex.s} onClick={() => { setQuery(ex.q); runOrchestration(ex.q); }}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition truncate max-w-xs">
            {ex.q}
          </button>
        ))}
      </div>

      {/* Query input */}
      <div className="flex gap-2 mb-6">
        <input className="flex-1 text-sm bg-muted/30 border border-border rounded-lg px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500"
          placeholder="Ex: Mostre os documentos da reunião de amanhã..."
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runOrchestration()} />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={useLLM} onChange={(e) => setUseLLM(e.target.checked)} className="accent-violet-500" />LLM
        </label>
        <button onClick={() => runOrchestration()} disabled={running || !query.trim()}
          className="px-5 py-2.5 text-sm bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-lg hover:bg-violet-500/25 disabled:opacity-50 transition font-medium">
          {running ? "Executando..." : "Orquestrar"}
        </button>
      </div>

      {/* Execution stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            ["Nodes",       stats.total,                         ""],
            ["Sucesso",     stats.success,                       "emerald"],
            ["Falhas",      stats.failed,                        stats.failed > 0 ? "red" : ""],
            ["Paralelo ↓",  `${stats.parallelMs}ms`,            "violet"],
          ].map(([l,v,c]) => (
            <div key={l} className={`p-3 rounded-xl border text-center ${c === "emerald" ? "border-emerald-500/30 bg-emerald-500/5" : c === "red" ? "border-red-500/30 bg-red-500/5" : c === "violet" ? "border-violet-500/30 bg-violet-500/5" : "border-border bg-muted/10"}`}>
              <p className="text-[10px] uppercase text-muted-foreground">{l}</p>
              <p className={`text-xl font-bold ${c === "emerald" ? "text-emerald-300" : c === "red" ? "text-red-300" : c === "violet" ? "text-violet-300" : ""}`}>{v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main tabs */}
      {plan && (
        <>
          <div className="flex gap-2 mb-4 text-xs">
            {["plan","graph","result","response"].map((t) => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-1.5 rounded-lg border transition capitalize ${activeTab === t ? "border-violet-500 bg-violet-500/15 text-violet-300" : "border-border text-muted-foreground"}`}>
                {t}
              </button>
            ))}
          </div>

          {activeTab === "plan" && (
            <Card className="mb-6">
              <SectionTitle icon={GitBranch} label={`Plano: ${SCENARIO_LABELS[plan.scenarioId] ?? plan.scenarioId}`} color="violet" />
              <p className="text-xs text-muted-foreground mb-3 font-mono">"{plan.rawQuery}"</p>
              <div className="space-y-2">
                {plan.nodes.map((n, i) => (
                  <div key={n.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/30 bg-muted/5 text-xs">
                    <span className="text-muted-foreground font-mono w-4">{i+1}</span>
                    <span className="text-lg">{CONNECTOR_EMOJI[n.connectorId] ?? "🔌"}</span>
                    <div className="flex-1">
                      <p className="font-medium">{n.label}</p>
                      <p className="text-muted-foreground font-mono text-[10px]">{n.capabilityId}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${n.mode === "parallel" ? "border-violet-500/30 bg-violet-500/10 text-violet-300" : "border-blue-500/30 bg-blue-500/10 text-blue-300"}`}>{n.mode}</span>
                    {n.dependsOn.length > 0 && <span className="text-[10px] text-muted-foreground">dep: {n.dependsOn.join(", ")}</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "graph" && (
            <Card className="mb-6">
              <SectionTitle icon={GitBranch} label="Execution Graph (DAG)" color="blue" />
              <GraphViz plan={plan} />
            </Card>
          )}

          {activeTab === "result" && result && (
            <Card className="mb-6">
              <SectionTitle icon={Activity} label="Node Results" color="amber" />
              <div className="flex gap-3 mb-3 text-xs">
                <span className="text-muted-foreground">Total: {result.totalDurationMs}ms</span>
                <span className="text-violet-400">Paralelo economizou: {result.parallelSavingsMs}ms</span>
                {result.partialFailures.length > 0 && <span className="text-amber-400">Falhas parciais: {result.partialFailures.join(", ")}</span>}
              </div>
              <div className="space-y-1.5">
                {result.nodeResults.map((r) => <NodeResultRow key={r.nodeId} r={r} />)}
              </div>
              <div className="mt-4 pt-3 border-t border-border/30">
                <p className="text-xs font-semibold mb-1">Unified Context</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>📅 {result.unifiedContext.calendarEvents.length} eventos</span>
                  <span>📁 {result.unifiedContext.driveFiles.length} arquivos</span>
                  <span>📧 {result.unifiedContext.gmailMessages.length} emails</span>
                  <span>Fontes: {result.unifiedContext.sources.join(", ") || "—"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{result.unifiedContext.summary}</p>
              </div>
            </Card>
          )}

          {activeTab === "response" && response && (
            <Card className="mb-6">
              <SectionTitle icon={Zap} label={`Resposta Final${response.usedLLM ? " (LLM)" : " (template)"}`} color="emerald" />
              <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">{response.answer}</pre>
              <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
                <span>Fontes: {response.sources.join(", ") || "—"}</span>
                <span>Aggregator: {response.durationMs}ms</span>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Certification */}
      <Card className="mb-6">
        <SectionTitle icon={Shield} label="MCOE Certification Suite" color="violet" />
        <button onClick={runCert} disabled={certRunning}
          className="mb-3 px-4 py-2 text-xs bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-lg hover:bg-violet-500/25 disabled:opacity-50 transition">
          {certRunning ? "Executando..." : "Executar Certification Suite"}
        </button>
        {certResult && (
          <>
            <div className="flex gap-4 mb-3 text-xs">
              <span className="text-emerald-400 font-bold">{certResult.passed} passed</span>
              <span className="text-red-400 font-bold">{certResult.failed} failed</span>
              <span className="text-muted-foreground">{certResult.durationMs}ms</span>
              <span className={certResult.score >= 90 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>Score: {certResult.score}%</span>
            </div>
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {certResult.results.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[11px]">
                  {r.pass ? <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  <span className="font-mono text-muted-foreground w-12">{r.id}</span>
                  <span className="text-muted-foreground w-28 shrink-0">[{r.suite}]</span>
                  <span className={r.pass ? "" : "text-red-300"}>{r.name}</span>
                  {!r.pass && <span className="text-red-400 text-[10px] ml-1">{r.detail}</span>}
                  <span className="ml-auto text-muted-foreground text-[10px]">{r.durationMs}ms</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card className="mb-6">
          <SectionTitle icon={BarChart2} label="Historico de Execucoes" color="amber" />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {history.map((h) => (
              <div key={h.planId} className="flex items-center gap-3 text-[11px] px-2 py-1.5 rounded-lg hover:bg-muted/10 transition">
                <span className="text-muted-foreground font-mono">{new Date(h.executedAt).toLocaleTimeString("pt-BR")}</span>
                <span className="flex-1 truncate">{h.rawQuery}</span>
                <span className="text-violet-300 font-mono">{h.totalMs}ms</span>
                <span className="text-muted-foreground">{h.sources.join("+") || "—"}</span>
                {h.failureCount > 0 && <span className="text-amber-400">{h.failureCount}⚠</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Core invariance */}
      <div className="p-3 rounded-xl border border-border/30 bg-muted/5 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-2">Zero alteracoes no Core</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {["ConversationPipeline","Runtime","GoalEngine","PlanningEngine","ExecutionDispatcher",
            "UniversalConnectorRouter","GWS Foundation","CapabilityLifecycle","GmailConnector",
            "DriveConnector","CalendarConnector"].map((f) => (
            <span key={f} className="inline-flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5 text-emerald-500" />{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}