/**
 * RuntimeBootstrapPanel — Engineering Sprint 8.3
 *
 * Displays the REAL state of the ConnectorRegistry at runtime.
 * No static data. No mocks. No hardcoded arrays.
 * All information comes directly from ConnectorBootstrap + ConnectorRegistry.
 */

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle, XCircle, RefreshCw, Zap, Shield,
  Activity, Heart, BarChart2, ChevronDown, ChevronRight,
} from "lucide-react";

function StatCard({ label, value, color = "zinc" }) {
  const colors = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    blue:    "border-blue-500/30 bg-blue-500/5 text-blue-300",
    violet:  "border-violet-500/30 bg-violet-500/5 text-violet-300",
    amber:   "border-amber-500/30 bg-amber-500/5 text-amber-300",
    zinc:    "border-border bg-muted/10 text-foreground",
  };
  return (
    <div className={`p-3 rounded-xl border text-center ${colors[color] ?? colors.zinc}`}>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function ConnectorCard({ connector, health, metrics }) {
  const [open, setOpen] = useState(false);
  const statusColor = health?.status === "healthy"   ? "emerald"
                    : health?.status === "degraded"  ? "amber"
                    : health?.status === "unhealthy" ? "red"
                    : "zinc";
  const dotColors = {
    emerald: "bg-emerald-500", amber: "bg-amber-400",
    red: "bg-red-500", zinc: "bg-zinc-500",
  };

  return (
    <div className="rounded-xl border border-border/40 bg-muted/5 overflow-hidden">
      <div
        className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/10 transition"
        onClick={() => setOpen(v => !v)}
      >
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColors[statusColor]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{connector.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">v{connector.version}</span>
            <span className="font-mono text-[10px] border border-border/50 px-1.5 py-0.5 rounded text-muted-foreground">{connector.id}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{connector.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground">{connector.capabilities.length} caps</span>
          {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </div>
      </div>

      {open && (
        <div className="border-t border-border/20 px-3 py-2 space-y-3">
          {/* Health */}
          {health && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Health</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                <span className="text-muted-foreground">Status</span>
                <span className={`font-semibold ${statusColor === "emerald" ? "text-emerald-400" : statusColor === "amber" ? "text-amber-400" : "text-red-400"}`}>{health.status}</span>
                <span className="text-muted-foreground">Details</span>
                <span className="text-foreground truncate">{health.details ?? "—"}</span>
              </div>
            </div>
          )}

          {/* Metrics */}
          {metrics && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Metrics</p>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                {[
                  ["Executions", metrics.totalExecutions],
                  ["Success",    metrics.successCount],
                  ["Failures",   metrics.failureCount],
                  ["Avg Latency",metrics.averageLatencyMs ? `${metrics.averageLatencyMs}ms` : "—"],
                  ["Last Exec",  metrics.lastExecutionAt ? new Date(metrics.lastExecutionAt).toLocaleTimeString("pt-BR") : "—"],
                  ["Last Error", metrics.lastError ?? "—"],
                ].map(([l, v]) => (
                  <div key={l} className="bg-muted/20 rounded p-1.5">
                    <p className="text-[9px] text-muted-foreground uppercase">{l}</p>
                    <p className="font-mono text-[10px] truncate">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capabilities */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Capabilities</p>
            <div className="flex flex-wrap gap-1">
              {connector.capabilities.map((cap) => (
                <span key={cap} className="px-1.5 py-0.5 rounded text-[9px] bg-muted/40 border border-border/50 text-muted-foreground font-mono">
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RuntimeBootstrapPanel() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [certData,   setCert]       = useState(null);
  const [certLoading,setCertLoading]= useState(false);

  const runBootstrap = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const { ConnectorRegistry }    = await import("@/lib/connector-runtime/ConnectorRegistry");
      const { ConnectorBootstrap }   = await import("@/lib/connector-runtime/ConnectorBootstrap");
      const { connectorMetrics }     = await import("@/lib/connector-runtime/ConnectorMetricsStore");

      const registry = new ConnectorRegistry();
      const result   = await ConnectorBootstrap.bootstrap(registry);
      const stats    = registry.statistics();

      const connectors = await Promise.all(
        result.connectorIds.map(async (id) => {
          const c    = registry.get(id);
          const meta = c ? c.metadata() : null;
          let health = null;
          try { health = c ? await c.health() : null; } catch {}
          const metrics = connectorMetrics.get(id);
          return {
            id,
            name:         meta?.name ?? id,
            version:      meta?.version ?? "?",
            description:  meta?.description ?? "",
            capabilities: meta?.capabilities ?? [],
            health,
            metrics,
          };
        }),
      );

      setData({ result, stats, connectors });
    } catch (e) {
      setData({ error: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const runCertification = useCallback(async () => {
    setCertLoading(true);
    setCert(null);
    try {
      const { runConnectorBootstrapCertification } = await import(
        "@/lib/connector-runtime/ConnectorBootstrapCertificationSuite"
      );
      const report = await runConnectorBootstrapCertification();
      setCert(report);
    } catch (e) {
      setCert({ error: e.message });
    } finally {
      setCertLoading(false);
    }
  }, []);

  useEffect(() => { runBootstrap(); }, [runBootstrap]);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">Connector Runtime</span>
          <span className="text-[10px] font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded">Sprint 8.3</span>
        </div>
        <button onClick={runBootstrap} disabled={loading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Recarregar
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Inicializando ConnectorBootstrap...
        </div>
      )}

      {data?.error && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-400">
          Erro: {data.error}
        </div>
      )}

      {data && !data.error && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Connectors"   value={data.result.connectorsLoaded}   color="emerald" />
            <StatCard label="Capabilities" value={data.result.capabilitiesLoaded} color="blue" />
            <StatCard label="Bootstrap"    value={`${data.result.bootstrapTimeMs}ms`} color="violet" />
          </div>

          {/* Bootstrap errors */}
          {data.result.errors.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <p className="text-[10px] font-semibold text-amber-400 mb-1">
                Bootstrap errors ({data.result.errors.length})
              </p>
              {data.result.errors.map((e, i) => (
                <p key={i} className="text-[10px] text-amber-300 font-mono">{e}</p>
              ))}
            </div>
          )}

          {/* Connector cards */}
          <div className="space-y-2">
            {data.connectors.map((c) => (
              <ConnectorCard
                key={c.id}
                connector={c}
                health={c.health}
                metrics={c.metrics}
              />
            ))}
          </div>

          {/* Capability catalog */}
          <div className="p-3 rounded-xl border border-border/30 bg-muted/5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
              <BarChart2 className="w-3 h-3" />Global Capability Catalog ({data.stats.capabilitiesLoaded})
            </p>
            <div className="flex flex-wrap gap-1">
              {data.stats.capabilityIds.map((cap) => (
                <span key={cap} className="px-1.5 py-0.5 rounded text-[9px] bg-muted/50 border border-border/40 text-muted-foreground font-mono">
                  {cap}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Certification */}
      <div className="border-t border-border/30 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-400" />
            <span className="text-sm font-semibold">Certification Suite</span>
          </div>
          <button onClick={runCertification} disabled={certLoading}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 transition disabled:opacity-50">
            <Activity className={`w-3 h-3 ${certLoading ? "animate-spin" : ""}`} />
            {certLoading ? "Certificando..." : "Rodar Certificação"}
          </button>
        </div>

        {certData?.error && (
          <p className="text-xs text-red-400 mb-2">Erro: {certData.error}</p>
        )}

        {certData && !certData.error && (
          <div className="space-y-2">
            <div className={`p-3 rounded-xl border text-center ${certData.certified ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <p className={`text-sm font-bold ${certData.certified ? "text-emerald-300" : "text-red-300"}`}>
                {certData.certified ? "✅ CERTIFIED" : "❌ NOT CERTIFIED"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {certData.passed}/{certData.totalCases} — {certData.passRate}% — {certData.totalDurationMs}ms
              </p>
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {certData.cases.map((c) => (
                <div key={c.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg border border-border/30 text-[11px]">
                  {c.passed
                    ? <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                    : <XCircle    className="w-3 h-3 text-red-400    shrink-0 mt-0.5" />}
                  <span className="font-mono text-muted-foreground w-10 shrink-0">{c.id}</span>
                  <span className={c.passed ? "text-foreground" : "text-red-300"}>{c.description}</span>
                  <span className="ml-auto text-muted-foreground shrink-0">{c.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}