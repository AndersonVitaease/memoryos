/**
 * MissionsPage — Engineering Sprint 8.1
 * Mission Planner Dashboard
 * Rota: /missions
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Target, CheckCircle, XCircle, Shield, Activity, GitBranch, Zap, BarChart2, ChevronDown, ChevronRight } from "lucide-react";

const CONNECTOR_EMOJI = { calendar: "📅", drive: "📁", gmail: "📧" };
const STATUS_COLOR = {
  success: "text-emerald-400", partial: "text-amber-400",
  failed:  "text-red-400",     running: "text-violet-400", pending: "text-muted-foreground"
};
const STATUS_BG = {
  success: "border-emerald-500/30 bg-emerald-500/5",
  partial: "border-amber-500/30 bg-amber-500/5",
  failed:  "border-red-500/30 bg-red-500/5",
  running: "border-violet-500/30 bg-violet-500/5",
  pending: "border-border bg-muted/5",
};

const EXAMPLES = [
  { q: "Preparar reuniao de amanha com o time.",        m: "PrepareMeeting" },
  { q: "Encontrar todas as informacoes do cliente XPTO.", m: "FindCustomerInformation" },
  { q: "Resumir o projeto Alpha.",                      m: "SummarizeProject" },
  { q: "Revisar tarefas pendentes da semana.",          m: "ReviewPendingTasks" },
  { q: "Preparar viagem para Lisboa.",                  m: "PrepareTrip" },
  { q: "Revisar faturas em aberto.",                    m: "ReviewInvoices" },
];

function Card({ children, className = "" }) {
  return <div className={`p-4 rounded-xl border border-border/40 bg-muted/5 ${className}`}>{children}</div>;
}
function SectionTitle({ icon: Icon, label, color = "violet" }) {
  const c = { violet: "text-violet-400", emerald: "text-emerald-400", blue: "text-blue-400", amber: "text-amber-400" };
  return <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${c[color]}`}><Icon className="w-4 h-4" />{label}</h2>;
}
function ScoreBadge({ score }) {
  const color = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  return <span className={`font-bold text-sm ${color}`}>{score}%</span>;
}

function MissionCard({ mission }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/40 bg-muted/5 overflow-hidden">
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/10 transition"
        onClick={() => setOpen((v) => !v)}>
        <Target className="w-4 h-4 text-violet-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{mission.name}</p>
          <p className="text-xs text-muted-foreground truncate">{mission.description}</p>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{mission.recommendedCapabilities.length} caps</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border/20 px-4 py-3 text-xs space-y-2">
          <div>
            <p className="text-muted-foreground mb-1">Entidades requeridas: {mission.requiredEntities.join(", ") || "—"}</p>
            <p className="text-muted-foreground mb-1">Opcionais: {mission.optionalEntities.join(", ") || "—"}</p>
            <p className="text-muted-foreground">Estrategia: {mission.aggregationStrategy}</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Capabilities Recomendadas:</p>
            {mission.recommendedCapabilities.map((c) => (
              <div key={c.capabilityId} className="flex items-center gap-2 mb-0.5">
                <span>{CONNECTOR_EMOJI[c.connectorId] ?? "🔌"}</span>
                <span className="font-mono">{c.capabilityId}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${c.mode === "parallel" ? "border-violet-500/30 text-violet-300 bg-violet-500/10" : "border-blue-500/30 text-blue-300 bg-blue-500/10"}`}>{c.mode}</span>
                {c.dependsOn.length > 0 && <span className="text-muted-foreground">dep: {c.dependsOn.join(", ")}</span>}
              </div>
            ))}
          </div>
          <div>
            <p className="font-semibold mb-1">Criterios de Sucesso:</p>
            {mission.successCriteria.map((s) => (
              <p key={s} className="text-muted-foreground flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5 text-emerald-500" />{s}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ContextCard({ ctx }) {
  const [open, setOpen] = useState(false);
  const uc = ctx.unifiedContext;
  return (
    <div className={`rounded-xl border overflow-hidden ${STATUS_BG[ctx.status] ?? STATUS_BG.pending}`}>
      <button className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:opacity-80 transition"
        onClick={() => setOpen((v) => !v)}>
        <Target className="w-3.5 h-3.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{ctx.rawQuery}</p>
          <p className="text-[10px] text-muted-foreground">{ctx.missionId}</p>
        </div>
        <ScoreBadge score={ctx.successScore} />
        <span className={`text-[10px] font-semibold ${STATUS_COLOR[ctx.status] ?? ""}`}>{ctx.status}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{ctx.durationMs ? `${ctx.durationMs}ms` : "—"}</span>
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border/20 px-3 py-2 text-xs space-y-2">
          <div className="flex gap-4 text-muted-foreground">
            <span>Connectors: {ctx.connectorsUsed.join(", ") || "—"}</span>
            <span>Caps: {ctx.resolvedCapabilities.length}</span>
            <span>Entities: {ctx.entities.map((e) => `${e.type}=${e.value}`).join(", ") || "—"}</span>
          </div>
          {uc && (
            <div className="text-muted-foreground">
              📅 {(uc.calendarEvents ?? []).length} eventos &nbsp;
              📁 {(uc.driveFiles ?? []).length} arquivos &nbsp;
              📧 {(uc.gmailMessages ?? []).length} emails
              <p className="mt-1">{uc.summary}</p>
            </div>
          )}
          {ctx.finalResponse && (
            <pre className="text-xs whitespace-pre-wrap text-foreground font-mono bg-muted/10 rounded p-2 max-h-40 overflow-y-auto">{ctx.finalResponse}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function MissionsPage() {
  const [query,      setQuery]      = useState("");
  const [missionId,  setMissionId]  = useState("");
  const [running,    setRunning]    = useState(false);
  const [activeCtx,  setActiveCtx]  = useState(null);
  const [history,    setHistory]    = useState([]);
  const [missions,   setMissions]   = useState([]);
  const [stats,      setStats]      = useState(null);
  const [detected,   setDetected]   = useState(null);
  const [certResult, setCertResult] = useState(null);
  const [certRunning,setCertRunning]= useState(false);
  const [activeTab,  setActiveTab]  = useState("run");

  const reload = useCallback(async () => {
    const { MissionRegistry }  = await import("@/lib/mission-planner/MissionRegistry");
    const { loadContextHistory } = await import("@/lib/mission-planner/MissionContext");
    const { getMissionStats }  = await import("@/lib/mission-planner/MissionDashboard");
    setMissions(MissionRegistry.list());
    setHistory(loadContextHistory());
    setStats(getMissionStats());
  }, []);

  useEffect(() => { reload(); }, []);

  const onQueryChange = useCallback(async (q) => {
    setQuery(q);
    if (q.trim().length < 5) { setDetected(null); return; }
    const { detectMission } = await import("@/lib/mission-planner/MissionPlanner");
    setDetected(detectMission(q));
  }, []);

  const runMission = useCallback(async (q = query, mid = missionId || undefined) => {
    if (!q.trim()) return;
    setRunning(true); setActiveCtx(null);
    const { missionPlanner } = await import("@/lib/mission-planner/MissionPlanner");
    const ctx = await missionPlanner.run(q, mid || undefined);
    setActiveCtx(ctx);
    setRunning(false);
    setActiveTab("result");
    reload();
  }, [query, missionId, reload]);

  const runCert = useCallback(async () => {
    setCertRunning(true);
    const { runMissionCertificationSuite } = await import("@/lib/mission-planner/MissionCertificationSuite");
    setCertResult(await runMissionCertificationSuite());
    setCertRunning(false);
  }, []);

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-4xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Target className="w-6 h-6 text-violet-400" />
        <h1 className="text-2xl font-bold">Mission Planner</h1>
        <span className="text-xs font-mono border border-border text-muted-foreground px-2 py-0.5 rounded">Sprint 8.1</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Planejamento baseado em Missoes — objetivos do usuario, nao connectors.
      </p>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            ["Missoes",        stats.total,                                           ""],
            ["Sucesso",        stats.success,                                         "emerald"],
            ["Score Medio",    `${stats.avgScore}%`,                                  "violet"],
            ["Tempo Medio",    stats.avgDurationMs > 0 ? `${stats.avgDurationMs}ms` : "—", "blue"],
          ].map(([l,v,c]) => (
            <div key={l} className={`p-3 rounded-xl border text-center ${c === "emerald" ? "border-emerald-500/30 bg-emerald-500/5" : c === "violet" ? "border-violet-500/30 bg-violet-500/5" : c === "blue" ? "border-blue-500/30 bg-blue-500/5" : "border-border bg-muted/10"}`}>
              <p className="text-[10px] uppercase text-muted-foreground">{l}</p>
              <p className={`text-xl font-bold ${c === "emerald" ? "text-emerald-300" : c === "violet" ? "text-violet-300" : c === "blue" ? "text-blue-300" : ""}`}>{v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 text-xs flex-wrap">
        {["run","registry","result","history","certification"].map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-3 py-1.5 rounded-lg border transition capitalize ${activeTab === t ? "border-violet-500 bg-violet-500/15 text-violet-300" : "border-border text-muted-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* RUN TAB */}
      {activeTab === "run" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 mb-2">
            {EXAMPLES.map((ex) => (
              <button key={ex.m} onClick={() => { setQuery(ex.q); setMissionId(ex.m); runMission(ex.q, ex.m); }}
                className="text-[11px] px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition truncate max-w-xs">
                {ex.q}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <input className="w-full text-sm bg-muted/30 border border-border rounded-lg px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500"
                placeholder="Ex: Preparar reuniao de amanha..."
                value={query} onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runMission()} />
              {detected && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Missao detectada: <span className="text-violet-400 font-semibold">{detected.missionId}</span>
                  <span className="ml-2">({Math.round(detected.confidence * 100)}% confianca)</span>
                  {detected.matchedTerms.length > 0 && <span className="ml-2">· {detected.matchedTerms.join(", ")}</span>}
                </p>
              )}
            </div>
            <select className="text-xs bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-violet-500"
              value={missionId} onChange={(e) => setMissionId(e.target.value)}>
              <option value="">Auto-detect</option>
              {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button onClick={() => runMission()} disabled={running || !query.trim()}
              className="px-5 py-2.5 text-sm bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-lg hover:bg-violet-500/25 disabled:opacity-50 transition font-medium">
              {running ? "Executando..." : "Executar Missao"}
            </button>
          </div>
        </div>
      )}

      {/* REGISTRY TAB */}
      {activeTab === "registry" && (
        <div className="space-y-2">
          {missions.map((m) => <MissionCard key={m.id} mission={m} />)}
        </div>
      )}

      {/* RESULT TAB */}
      {activeTab === "result" && activeCtx && (
        <div className="space-y-4">
          <div className={`p-4 rounded-xl border ${STATUS_BG[activeCtx.status] ?? STATUS_BG.pending}`}>
            <div className="flex items-center gap-3 mb-3">
              <Target className="w-5 h-5 text-violet-400" />
              <div>
                <p className="font-semibold">{activeCtx.missionId}</p>
                <p className="text-xs text-muted-foreground">{activeCtx.rawQuery}</p>
              </div>
              <ScoreBadge score={activeCtx.successScore} />
              <span className={`ml-auto text-sm font-semibold ${STATUS_COLOR[activeCtx.status] ?? ""}`}>{activeCtx.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
              <div><p className="text-muted-foreground">Connectors</p><p className="font-medium">{activeCtx.connectorsUsed.join(", ") || "—"}</p></div>
              <div><p className="text-muted-foreground">Capabilities</p><p className="font-medium">{activeCtx.resolvedCapabilities.length}</p></div>
              <div><p className="text-muted-foreground">Duracao</p><p className="font-medium font-mono">{activeCtx.durationMs ? `${activeCtx.durationMs}ms` : "—"}</p></div>
            </div>

            {/* Execution graph visualization */}
            <div className="mb-3">
              <p className="text-xs font-semibold mb-1">Capabilities Executadas:</p>
              {activeCtx.resolvedCapabilities.map((c, i) => (
                <div key={c.capabilityId} className="flex items-center gap-2 text-xs mb-0.5">
                  <span className="text-muted-foreground font-mono w-4">{i+1}</span>
                  <span>{CONNECTOR_EMOJI[c.connectorId] ?? "🔌"}</span>
                  <span className="font-mono">{c.capabilityId}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${c.mode === "parallel" ? "border-violet-500/30 text-violet-300" : "border-blue-500/30 text-blue-300"}`}>{c.mode}</span>
                </div>
              ))}
              <div className="text-xs text-muted-foreground mt-1 pl-6">↓ Aggregator → UnifiedContext → Resposta</div>
            </div>

            {activeCtx.unifiedContext && (
              <div className="text-xs text-muted-foreground mb-2">
                📅 {(activeCtx.unifiedContext.calendarEvents ?? []).length} eventos &nbsp;
                📁 {(activeCtx.unifiedContext.driveFiles ?? []).length} arquivos &nbsp;
                📧 {(activeCtx.unifiedContext.gmailMessages ?? []).length} emails
                <p className="mt-0.5">{activeCtx.unifiedContext.summary}</p>
              </div>
            )}

            {activeCtx.finalResponse && (
              <div>
                <p className="text-xs font-semibold mb-1">Resposta Final:</p>
                <pre className="text-xs whitespace-pre-wrap text-foreground font-mono bg-muted/10 rounded p-3 max-h-48 overflow-y-auto">{activeCtx.finalResponse}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <div className="space-y-2">
          {history.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Nenhuma missao executada ainda.</p>}
          {history.map((ctx) => <ContextCard key={ctx.id} ctx={ctx} />)}
        </div>
      )}

      {/* CERTIFICATION TAB */}
      {activeTab === "certification" && (
        <div className="space-y-4">
          <button onClick={runCert} disabled={certRunning}
            className="px-4 py-2 text-xs bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-lg hover:bg-violet-500/25 disabled:opacity-50 transition">
            {certRunning ? "Executando..." : "Executar Mission Certification Suite"}
          </button>
          {certResult && (
            <Card>
              <div className="flex gap-4 mb-3 text-xs">
                <span className="text-emerald-400 font-bold">{certResult.passed} passed</span>
                <span className="text-red-400 font-bold">{certResult.failed} failed</span>
                <span className="text-muted-foreground">{certResult.durationMs}ms</span>
                <span className={certResult.score >= 90 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>Score: {certResult.score}%</span>
              </div>
              <div className="space-y-0.5 max-h-72 overflow-y-auto">
                {certResult.results.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[11px]">
                    {r.pass ? <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                    <span className="font-mono text-muted-foreground w-12">{r.id}</span>
                    <span className="text-muted-foreground w-24 shrink-0">[{r.suite}]</span>
                    <span className={r.pass ? "" : "text-red-300"}>{r.name}</span>
                    {!r.pass && <span className="text-red-400 text-[10px]">{r.detail}</span>}
                    <span className="ml-auto text-[10px] text-muted-foreground">{r.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Core invariance footer */}
      <div className="mt-6 p-3 rounded-xl border border-border/30 bg-muted/5 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-2">Zero alteracoes no Core</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {["ConversationPipeline","Runtime","GoalEngine","PlanningEngine","ConnectorRuntime",
            "GWS Foundation","CapabilityLifecycle","MCOE","GmailConnector","DriveConnector","CalendarConnector"].map((f) => (
            <span key={f} className="inline-flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5 text-emerald-500" />{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}