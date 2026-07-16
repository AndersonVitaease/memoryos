/**
 * GoogleCalendarPage — Engineering Sprint 7.2
 * Google Calendar Connector Dashboard
 * Rota: /calendar
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, CheckCircle, XCircle, AlertTriangle, Zap, Shield, Activity, BarChart2, Award, Clock } from "lucide-react";

const STATE_COLOR = {
  production: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  certified:  "bg-teal-500/15 border-teal-500/30 text-teal-300",
  beta:       "bg-amber-500/15 border-amber-500/30 text-amber-400",
};

function StateBadge({ state }) {
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATE_COLOR[state] ?? "bg-zinc-700/30 border-zinc-600 text-zinc-400"}`}>{state}</span>;
}
function Card({ children, className = "" }) {
  return <div className={`p-4 rounded-xl border border-border/40 bg-muted/5 ${className}`}>{children}</div>;
}
function SectionTitle({ icon: Icon, label, color = "violet" }) {
  const c = { violet:"text-violet-400", emerald:"text-emerald-400", blue:"text-blue-400", amber:"text-amber-400", teal:"text-teal-400" };
  return <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${c[color]}`}><Icon className="w-4 h-4" />{label}</h2>;
}

function ReuseBar({ calLines, reusedLines, percent }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground w-40">Calendar-specific</span>
        <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${100 - percent}%` }} />
        </div>
        <span className="text-blue-300 font-mono w-14 text-right">{calLines} lines</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground w-40">GWS Foundation (reused)</span>
        <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-emerald-300 font-mono w-14 text-right">{reusedLines} lines</span>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>Reuso: <span className="text-emerald-400 font-bold text-sm">{percent}%</span></span>
        <span>Total: {calLines + reusedLines} lines referenced</span>
      </div>
    </div>
  );
}

function EventCard({ evt }) {
  const time = evt.allDay ? "Dia inteiro" : (evt.start?.dateTime ? new Date(evt.start.dateTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-lg border border-border/30 bg-muted/5 hover:bg-muted/10 transition">
      <div className="text-center min-w-10">
        <p className="text-[10px] text-muted-foreground font-mono">{time}</p>
        {evt.recurring && <span className="text-[9px] text-violet-400">↻</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{evt.summary}</p>
        {evt.location && <p className="text-[10px] text-muted-foreground truncate">{evt.location}</p>}
        {evt.meetLink && <a href={evt.meetLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">Meet</a>}
      </div>
      {evt.attendees?.length > 0 && <span className="text-[10px] text-muted-foreground shrink-0">{evt.attendees.length} pax</span>}
    </div>
  );
}

export default function GoogleCalendarPage() {
  const [data,        setData]        = useState(null);
  const [certResult,  setCertResult]  = useState(null);
  const [certRunning, setCertRunning] = useState(false);
  const [events,      setEvents]      = useState([]);
  const [nextEvt,     setNextEvt]     = useState(null);
  const [eventsLoading,setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(null);
  const [searchQ,     setSearchQ]     = useState("");
  const [nlResult,    setNlResult]    = useState(null);
  const [activeTab,   setActiveTab]   = useState("hoje");

  useEffect(() => {
    (async () => {
      const { getCalendarDashboardData } = await import("@/lib/google-calendar/GoogleCalendarDashboard");
      setData(await getCalendarDashboardData());
    })();
  }, []);

  const loadToday = useCallback(async () => {
    setEventsLoading(true); setEventsError(null);
    const { listToday, nextMeeting } = await import("@/lib/google-calendar/GoogleCalendarConnector");
    const [r, nm] = await Promise.all([
      listToday().catch((e) => ({ events: [], error: e.message })),
      nextMeeting().catch(() => ({ ok: false, data: null, error: null })),
    ]);
    if ("error" in r && r.error) setEventsError(r.error);
    else setEvents(r.events ?? []);
    if (nm.ok && nm.data) setNextEvt(nm.data);
    setEventsLoading(false);
  }, []);

  const loadWeek = useCallback(async () => {
    setEventsLoading(true); setEventsError(null);
    const { listThisWeek } = await import("@/lib/google-calendar/GoogleCalendarConnector");
    const r = await listThisWeek().catch((e) => ({ events: [], error: e.message }));
    if ("error" in r && r.error) setEventsError(r.error);
    else setEvents(r.events ?? []);
    setEventsLoading(false);
  }, []);

  const runNLSearch = useCallback(async () => {
    if (!searchQ.trim()) return;
    setEventsLoading(true); setNlResult(null);
    const { parseCalendarIntent, intentToTimeBounds } = await import("@/lib/google-calendar/GoogleCalendarCapabilityExecutor");
    const { listEvents, searchEvents } = await import("@/lib/google-calendar/GoogleCalendarConnector");
    const intent = parseCalendarIntent(searchQ);
    setNlResult({ intent });
    if (intent.nameHint) {
      const r = await searchEvents(intent.nameHint).catch((e) => ({ events: [], error: e.message }));
      setEvents(r.events ?? []);
    } else {
      const bounds = intentToTimeBounds(intent);
      const r = await listEvents({ timeMin: bounds.timeMin, timeMax: bounds.timeMax }).catch((e) => ({ events: [], error: e.message }));
      setEvents(r.events ?? []);
    }
    setEventsLoading(false);
  }, [searchQ]);

  const runCert = useCallback(async () => {
    setCertRunning(true);
    const { runCalendarCertificationSuite } = await import("@/lib/google-calendar/GoogleCalendarTests");
    setCertResult(await runCalendarCertificationSuite());
    setCertRunning(false);
  }, []);

  const caps = data?.capabilities ?? [];
  const rm   = data?.reuseMetrics;

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-4xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Calendar className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold">Google Calendar Connector</h1>
        <span className="text-xs font-mono border border-border text-muted-foreground px-2 py-0.5 rounded">v1.0 — Sprint 7.2</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Connector orientado a tempo — demonstra que a Platform Foundation suporta dominios temporais sem infraestrutura nova.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          ["Capabilities",  caps.length,                                             "blue"],
          ["Reuso GWS",     rm ? `${rm.reusePercent}%` : "…",                       "emerald"],
          ["Production",    caps.filter((c) => c.state === "production").length,     "teal"],
          ["Audit",         data?.auditStats?.total ?? 0,                            ""],
        ].map(([l, v, color]) => (
          <div key={l} className={`p-3 rounded-xl border text-center ${color === "blue" ? "border-blue-500/30 bg-blue-500/5" : color === "emerald" ? "border-emerald-500/30 bg-emerald-500/5" : color === "teal" ? "border-teal-500/30 bg-teal-500/5" : "border-border bg-muted/10"}`}>
            <p className="text-[10px] uppercase text-muted-foreground">{l}</p>
            <p className={`text-2xl font-bold ${color === "blue" ? "text-blue-300" : color === "emerald" ? "text-emerald-300" : color === "teal" ? "text-teal-300" : ""}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* OAuth + reuse */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <p className="text-sm font-semibold mb-1">OAuth Status</p>
          {data?.connectorHealth ? (
            data.connectorHealth.ok
              ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle className="w-3 h-3" />Connected</span>
              : <><span className="flex items-center gap-1 text-red-400 text-xs"><XCircle className="w-3 h-3" />Disconnected</span><p className="text-[11px] text-muted-foreground mt-1">{data.connectorHealth.reason}</p></>
          ) : <span className="text-xs text-muted-foreground">...</span>}
        </Card>
        <Card>
          <p className="text-sm font-semibold mb-1">Proximo Evento</p>
          {nextEvt
            ? <div className="text-xs"><p className="font-medium truncate">{nextEvt.summary}</p><p className="text-muted-foreground">{nextEvt.start?.dateTime ? new Date(nextEvt.start.dateTime).toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"short" }) : "Dia inteiro"}</p></div>
            : <p className="text-xs text-muted-foreground">Carregue para ver.</p>}
        </Card>
      </div>

      {/* Reuse */}
      <Card className="mb-6">
        <SectionTitle icon={BarChart2} label="Metrica de Reutilizacao" color="emerald" />
        {rm ? <ReuseBar calLines={rm.calendarSpecificLines} reusedLines={rm.reusedLines} percent={rm.reusePercent} /> : <p className="text-xs text-muted-foreground">...</p>}
        <p className="text-[10px] text-muted-foreground mt-3">
          Reusados: AuditLogger · RateLimiter · Auth · Scopes · CapabilityRegistry · CapabilityLifecycle
        </p>
      </Card>

      {/* Capabilities */}
      <div className="mb-6">
        <SectionTitle icon={Zap} label="Capabilities — v1.0" color="blue" />
        <div className="space-y-2">
          {caps.map((cap) => {
            const lc = data?.lifecycleRecords?.find((r) => r.id === cap.id);
            return (
              <div key={cap.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/40 bg-muted/5">
                <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{cap.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{cap.id}</span>
                    <StateBadge state={cap.state} />
                    {cap.state === "production" && <Award className="w-3 h-3 text-teal-400" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{cap.description}</p>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">{lc?.executionCount ?? 0} exec</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Events browser */}
      <Card className="mb-6">
        <SectionTitle icon={Calendar} label="Eventos" color="blue" />
        {/* NL search */}
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 text-xs bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500"
            placeholder='Ex: "O que tenho amanhã?" ou "reunião com Anderson"'
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runNLSearch()}
          />
          <button onClick={runNLSearch} className="px-3 py-2 text-xs bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-lg hover:bg-violet-500/25 transition">NL Search</button>
        </div>
        <div className="flex gap-2 mb-3">
          {[["hoje","Hoje"], ["semana","Semana"]].map(([k, l]) => (
            <button key={k} onClick={() => { setActiveTab(k); k === "hoje" ? loadToday() : loadWeek(); }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${activeTab === k ? "border-blue-500 bg-blue-500/15 text-blue-300" : "border-border text-muted-foreground hover:border-border/80"}`}>
              {l}
            </button>
          ))}
        </div>

        {nlResult && (
          <div className="mb-2 text-[10px] text-muted-foreground font-mono flex flex-wrap gap-3 p-2 rounded-lg bg-muted/10 border border-border/30">
            <span>timeRange: <span className="text-violet-300">{nlResult.intent.timeRange ?? "—"}</span></span>
            {nlResult.intent.nameHint && <span>nameHint: <span className="text-violet-300">{nlResult.intent.nameHint}</span></span>}
            {nlResult.intent.targetHour !== null && <span>hora: <span className="text-violet-300">{nlResult.intent.targetHour}h</span></span>}
            {nlResult.intent.nextMeeting && <span className="text-violet-300">nextMeeting</span>}
            {nlResult.intent.freeBusy && <span className="text-violet-300">freeBusy</span>}
          </div>
        )}

        {eventsLoading && <p className="text-xs text-muted-foreground py-3 text-center">Carregando...</p>}
        {eventsError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{eventsError}</p>}
        {events.length > 0 && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {events.map((evt) => <EventCard key={evt.id} evt={evt} />)}
          </div>
        )}
        {!eventsLoading && !eventsError && events.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-4">Conecte sua conta Google ou use os botoes acima.</p>
        )}
      </Card>

      {/* Certification */}
      <Card className="mb-6">
        <SectionTitle icon={Shield} label="Certification Suite (8 suites)" color="violet" />
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
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {certResult.results.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[11px]">
                  {r.pass ? <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  <span className="font-mono text-muted-foreground w-12">{r.id}</span>
                  <span className="text-muted-foreground w-28 shrink-0">[{r.suite}]</span>
                  <span className={r.pass ? "" : "text-red-300"}>{r.name}</span>
                  {!r.pass && <span className="text-red-400 text-[10px] ml-1 truncate">{r.detail}</span>}
                  <span className="text-muted-foreground ml-auto text-[10px]">{r.durationMs}ms</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Audit */}
      {data?.auditEntries?.length > 0 && (
        <Card className="mb-6">
          <SectionTitle icon={Activity} label="Audit Log (Calendar)" color="amber" />
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {data.auditEntries.map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-[11px] font-mono">
                {e.success ? <CheckCircle className="w-2.5 h-2.5 text-emerald-500 shrink-0" /> : <XCircle className="w-2.5 h-2.5 text-red-400 shrink-0" />}
                <span className="text-muted-foreground">{new Date(e.startedAt).toLocaleTimeString("pt-BR")}</span>
                <span className="text-blue-300">{e.capability}</span>
                <span className="ml-auto text-muted-foreground">{e.durationMs}ms</span>
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
            "UniversalConnectorRouter","ConnectorRegistry","GWS Foundation","CapabilityLifecycle",
            "CertificationFramework","GmailConnector","DriveConnector"].map((f) => (
            <span key={f} className="inline-flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5 text-emerald-500" />{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}