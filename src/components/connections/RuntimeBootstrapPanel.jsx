/**
 * RuntimeBootstrapPanel — Engineering Sprint 8.2
 *
 * Exibe o estado real do ConnectorRegistry em tempo de execucao.
 * Nenhum dado estatico. Nenhum mock. Nenhum array fixo.
 */

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, RefreshCw, Zap, Shield, Activity } from "lucide-react";

export default function RuntimeBootstrapPanel() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [certData, setCert]   = useState(null);
  const [certLoading, setCertLoading] = useState(false);

  const runBootstrap = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const { ConnectorRegistry }  = await import("@/lib/connector-runtime/ConnectorRegistry");
      const { ConnectorBootstrap } = await import("@/lib/connector-runtime/ConnectorBootstrap");

      const registry = new ConnectorRegistry();
      const result   = await ConnectorBootstrap.bootstrap(registry);
      const stats    = registry.statistics();

      const connectors = result.connectorIds.map((id) => {
        const c   = registry.get(id);
        const meta = c ? c.metadata() : null;
        return {
          id,
          name: meta?.name ?? id,
          version: meta?.version ?? "?",
          capabilities: meta?.capabilities ?? [],
        };
      });

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

      {/* Header + Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">Runtime Bootstrap</span>
          <span className="text-[10px] font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded">Sprint 8.2</span>
        </div>
        <button
          onClick={runBootstrap}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Recarregar
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Inicializando ConnectorBootstrap...
        </div>
      )}

      {/* Error */}
      {data?.error && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-400">
          Erro: {data.error}
        </div>
      )}

      {/* Stats cards */}
      {data && !data.error && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Connectors", data.result.connectorsLoaded, "emerald"],
              ["Capabilities", data.result.capabilitiesLoaded, "blue"],
              ["Bootstrap", `${data.result.bootstrapTimeMs}ms`, "violet"],
            ].map(([label, value, color]) => (
              <div
                key={label}
                className={`p-3 rounded-xl border text-center ${
                  color === "emerald" ? "border-emerald-500/30 bg-emerald-500/5" :
                  color === "blue"    ? "border-blue-500/30 bg-blue-500/5" :
                  "border-violet-500/30 bg-violet-500/5"
                }`}
              >
                <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold ${
                  color === "emerald" ? "text-emerald-300" :
                  color === "blue"    ? "text-blue-300" :
                  "text-violet-300"
                }`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Errors */}
          {data.result.errors.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <p className="text-[10px] font-semibold text-amber-400 mb-1.5">Erros no Bootstrap ({data.result.errors.length})</p>
              {data.result.errors.map((e, i) => (
                <p key={i} className="text-[10px] text-amber-300 font-mono">{e}</p>
              ))}
            </div>
          )}

          {/* Connectors */}
          <div className="space-y-2">
            {data.connectors.map((c) => (
              <div key={c.id} className="p-3 rounded-xl border border-border/40 bg-muted/5">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-sm font-semibold">{c.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">v{c.version}</span>
                  <span className="font-mono text-[10px] border border-border px-1.5 py-0.5 rounded text-muted-foreground">{c.id}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.capabilities.map((cap) => (
                    <span key={cap} className="px-1.5 py-0.5 rounded text-[9px] bg-muted/40 border border-border/50 text-muted-foreground font-mono">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            ))}
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
          <button
            onClick={runCertification}
            disabled={certLoading}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 transition disabled:opacity-50"
          >
            <Activity className={`w-3 h-3 ${certLoading ? "animate-spin" : ""}`} />
            {certLoading ? "Certificando..." : "Rodar Certificação"}
          </button>
        </div>

        {certData?.error && (
          <p className="text-xs text-red-400">Erro: {certData.error}</p>
        )}

        {certData && !certData.error && (
          <div className="space-y-2">
            {/* Summary */}
            <div className={`p-3 rounded-xl border text-center ${certData.certified ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <p className={`text-sm font-bold ${certData.certified ? "text-emerald-300" : "text-red-300"}`}>
                {certData.certified ? "✅ CERTIFIED" : "❌ NOT CERTIFIED"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {certData.passed}/{certData.totalCases} — {certData.passRate}% — {certData.totalDurationMs}ms
              </p>
            </div>

            {/* Cases */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {certData.cases.map((c) => (
                <div key={c.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg border border-border/30 text-[11px]">
                  {c.passed
                    ? <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                    : <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                  }
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