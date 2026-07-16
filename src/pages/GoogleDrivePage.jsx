/**
 * GoogleDrivePage — Engineering Sprint 7.1
 * Google Drive Connector Dashboard
 * Rota: /google-drive
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, HardDrive, CheckCircle, XCircle, AlertTriangle,
  Zap, Shield, Activity, FileText, Folder, BarChart2, Award,
} from "lucide-react";

const STATE_COLOR = {
  production:   "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  certified:    "bg-teal-500/15 border-teal-500/30 text-teal-300",
  beta:         "bg-amber-500/15 border-amber-500/30 text-amber-400",
  experimental: "bg-purple-500/15 border-purple-500/30 text-purple-300",
  disabled:     "bg-red-500/15 border-red-500/30 text-red-400",
};
const FILE_ICONS = { document:"📄", spreadsheet:"📊", presentation:"📽️", pdf:"🔴", image:"🖼️", folder:"📁", unknown:"📎" };

function StateBadge({ state }) {
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATE_COLOR[state] ?? "bg-zinc-700/30 border-zinc-600 text-zinc-400"}`}>{state}</span>;
}
function StatusDot({ ok }) {
  return ok
    ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle className="w-3 h-3" />Connected</span>
    : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle className="w-3 h-3" />Disconnected</span>;
}
function Card({ children, className = "" }) {
  return <div className={`p-4 rounded-xl border border-border/40 bg-muted/5 ${className}`}>{children}</div>;
}
function SectionTitle({ icon: Icon, label, color = "violet" }) {
  const c = { violet:"text-violet-400", emerald:"text-emerald-400", blue:"text-blue-400", amber:"text-amber-400" };
  return (
    <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${c[color]}`}>
      <Icon className="w-4 h-4" />{label}
    </h2>
  );
}

function ReuseBar({ driveLines, reusedLines, percent }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground w-40">Drive-specific</span>
        <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${100 - percent}%` }} />
        </div>
        <span className="text-blue-300 font-mono w-14 text-right">{driveLines} lines</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground w-40">GWS Foundation (reused)</span>
        <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-emerald-300 font-mono w-14 text-right">{reusedLines} lines</span>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>Reuse: <span className="text-emerald-400 font-bold text-sm">{percent}%</span></span>
        <span>Total: {driveLines + reusedLines} lines referenced</span>
      </div>
    </div>
  );
}

export default function GoogleDrivePage() {
  const [data,       setData]       = useState(null);
  const [certResult, setCertResult] = useState(null);
  const [certRunning,setCertRunning]= useState(false);
  const [driveFiles, setDriveFiles] = useState([]);
  const [filesLoading,setFilesLoading]=useState(false);
  const [filesError, setFilesError] = useState(null);
  const [searchQ,    setSearchQ]    = useState("");
  const [searchResult, setSearchResult] = useState(null);

  useEffect(() => {
    (async () => {
      const { getDriveDashboardData } = await import("@/lib/google-drive/GoogleDriveDashboard");
      setData(await getDriveDashboardData());
    })();
  }, []);

  const runCert = useCallback(async () => {
    setCertRunning(true);
    const { runDriveCertificationSuite } = await import("@/lib/google-drive/GoogleDriveTests");
    setCertResult(await runDriveCertificationSuite());
    setCertRunning(false);
  }, []);

  const loadFiles = useCallback(async () => {
    setFilesLoading(true); setFilesError(null); setDriveFiles([]);
    const { listFiles } = await import("@/lib/google-drive/GoogleDriveConnector");
    const r = await listFiles({ pageSize: 20 }).catch((e) => ({ files: [], error: e.message }));
    if (r.error) setFilesError(r.error);
    else setDriveFiles(r.files ?? []);
    setFilesLoading(false);
  }, []);

  const runSearch = useCallback(async () => {
    if (!searchQ.trim()) return;
    setFilesLoading(true); setSearchResult(null);
    const { searchFiles } = await import("@/lib/google-drive/GoogleDriveConnector");
    const r = await searchFiles(searchQ, { pageSize: 20 }).catch((e) => ({ files: [], error: e.message }));
    setSearchResult(r);
    setFilesLoading(false);
  }, [searchQ]);

  const rm = data?.reuseMetrics;
  const health = data?.connectorHealth;
  const caps   = data?.capabilities ?? [];
  const lc     = data?.lifecycleRecords ?? [];

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-4xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <HardDrive className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold">Google Drive Connector</h1>
        <span className="text-xs font-mono border border-border text-muted-foreground px-2 py-0.5 rounded">v1.0 — Sprint 7.1</span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Primeiro connector construido 100% sobre a Google Workspace Foundation — prova de reutilizabilidade da plataforma.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          ["Capabilities",    caps.length,             "blue"],
          ["Reuso GWS",       rm ? `${rm.reusePercent}%` : "…", "emerald"],
          ["Certificadas",    caps.filter((c) => c.state === "production").length, "teal"],
          ["Audit",           data?.auditStats?.total ?? 0, ""],
        ].map(([l, v, color]) => (
          <div key={l} className={`p-3 rounded-xl border text-center ${color === "blue" ? "border-blue-500/30 bg-blue-500/5" : color === "emerald" ? "border-emerald-500/30 bg-emerald-500/5" : color === "teal" ? "border-teal-500/30 bg-teal-500/5" : "border-border bg-muted/10"}`}>
            <p className="text-[10px] uppercase text-muted-foreground">{l}</p>
            <p className={`text-2xl font-bold ${color === "blue" ? "text-blue-300" : color === "emerald" ? "text-emerald-300" : color === "teal" ? "text-teal-300" : ""}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* OAuth status */}
      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold mb-0.5">OAuth Status</p>
            {health ? <StatusDot ok={health.ok} /> : <span className="text-xs text-muted-foreground">...</span>}
            {health && !health.ok && <p className="text-[11px] text-muted-foreground mt-1">{health.reason}</p>}
          </div>
          <Shield className="w-8 h-8 text-muted-foreground/30" />
        </div>
      </Card>

      {/* Reuse metric */}
      <Card className="mb-6">
        <SectionTitle icon={BarChart2} label="Metrica de Reutilizacao da Plataforma" color="emerald" />
        {rm ? <ReuseBar driveLines={rm.driveSpecificLines} reusedLines={rm.reusedLines} percent={rm.reusePercent} /> : <p className="text-xs text-muted-foreground">...</p>}
        <p className="text-[10px] text-muted-foreground mt-3">
          Modulos reutilizados: GoogleWorkspaceAuth · GoogleWorkspaceTokenManager · GoogleWorkspaceRateLimiter · GoogleWorkspaceAuditLogger · GoogleWorkspaceCapabilityRegistry · CapabilityLifecycle
        </p>
      </Card>

      {/* Capabilities */}
      <div className="mb-6">
        <SectionTitle icon={Zap} label="Capabilities — v1.0" color="blue" />
        <div className="space-y-2">
          {caps.map((cap) => {
            const lc_rec = lc.find((r) => r.id === cap.id);
            const total  = lc_rec?.executionCount ?? 0;
            const suc    = lc_rec?.successCount ?? 0;
            const rate   = total > 0 ? Math.round(suc / total * 100) : null;
            const avgMs  = total > 0 ? Math.round((lc_rec?.totalLatencyMs ?? 0) / total) : null;
            return (
              <div key={cap.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/40 bg-muted/5">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{cap.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{cap.id}</span>
                    <StateBadge state={cap.state} />
                    {cap.state === "production" && <Award className="w-3 h-3 text-teal-400" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{cap.description}</p>
                </div>
                <div className="text-right text-[10px] text-muted-foreground font-mono space-y-0.5">
                  {rate !== null && <p className={rate >= 90 ? "text-emerald-400" : "text-red-400"}>{rate}%</p>}
                  {avgMs !== null && <p>{avgMs}ms</p>}
                  <p>{total} exec</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* File browser */}
      <Card className="mb-6">
        <SectionTitle icon={HardDrive} label="Drive — Arquivos" color="blue" />
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 text-xs bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500"
            placeholder='Pesquisa em linguagem natural — ex: "planilha de vendas desta semana"'
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
          <button onClick={runSearch} className="px-3 py-2 text-xs bg-blue-500/15 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/25 transition">Pesquisar</button>
          <button onClick={loadFiles} className="px-3 py-2 text-xs bg-muted/30 border border-border text-muted-foreground rounded-lg hover:bg-muted/50 transition">Listar tudo</button>
        </div>

        {filesLoading && <p className="text-xs text-muted-foreground py-3 text-center">Carregando...</p>}
        {filesError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{filesError}</p>}

        {searchResult && (
          <div className="mb-2">
            <p className="text-[10px] text-muted-foreground mb-1">Query: <span className="font-mono text-blue-300">{searchResult.searchQuery}</span> — {searchResult.durationMs}ms</p>
          </div>
        )}

        {(driveFiles.length > 0 || searchResult?.files?.length > 0) && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {(searchResult?.files ?? driveFiles).map((f) => (
              <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/20 transition">
                <span className="text-base">{FILE_ICONS[f.fileType] ?? "📎"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground">{f.fileType} · {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString("pt-BR") : "—"}</p>
                </div>
                {f.webViewLink && (
                  <a href={f.webViewLink} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-400 hover:underline">Abrir</a>
                )}
              </div>
            ))}
          </div>
        )}
        {!filesLoading && !filesError && driveFiles.length === 0 && !searchResult && (
          <p className="text-[11px] text-muted-foreground text-center py-4">Conecte sua conta Google para listar arquivos.</p>
        )}
      </Card>

      {/* Certification */}
      <Card className="mb-6">
        <SectionTitle icon={Shield} label="Certification Suite" color="violet" />
        <button onClick={runCert} disabled={certRunning}
          className="mb-3 px-4 py-2 text-xs bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-lg hover:bg-violet-500/25 disabled:opacity-50 transition">
          {certRunning ? "Executando..." : "Executar Certification Suite"}
        </button>
        {certResult && (
          <div>
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
                  {!r.pass && <span className="text-red-400 ml-auto text-[10px]">{r.detail}</span>}
                  <span className="text-muted-foreground ml-auto text-[10px]">{r.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Audit log */}
      {data?.auditEntries?.length > 0 && (
        <Card className="mb-6">
          <SectionTitle icon={Activity} label="Audit Log (Drive)" color="amber" />
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
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

      {/* Zero Core changes */}
      <div className="p-3 rounded-xl border border-border/30 bg-muted/5 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-2">Zero alteracoes no Core</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {["ConversationPipeline","Runtime","GoalEngine","PlanningEngine","ExecutionDispatcher",
            "UniversalConnectorRouter","ConnectorRegistry","GWS Foundation","CapabilityLifecycle","CertificationFramework"].map((f) => (
            <span key={f} className="inline-flex items-center gap-1">
              <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />{f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}