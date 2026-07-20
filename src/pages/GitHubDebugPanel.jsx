import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── AUDIT_MODE activation helper ─────────────────────────────────────────────
// Sets globalThis.__GITHUB_AUDIT_MODE__ = true and reloads.
// The flag persists via sessionStorage across the reload.
function activateAuditMode() {
  sessionStorage.setItem("__GITHUB_AUDIT_MODE__", "true");
  window.location.reload();
}

// Bootstrap from sessionStorage (set before page load in main.jsx fallback)
if (typeof window !== "undefined" && sessionStorage.getItem("__GITHUB_AUDIT_MODE__") === "true") {
  (globalThis).__GITHUB_AUDIT_MODE__ = true;
}

// ── Stage config ──────────────────────────────────────────────────────────────

const STAGES = [
  { key: "route",      label: "Route",      color: "bg-violet-600",  desc: "GitHubQueryRouter decision" },
  { key: "repos.list", label: "repos.list", color: "bg-blue-600",    desc: "Fetch user repositories" },
  { key: "resolver",   label: "Resolver",   color: "bg-cyan-600",    desc: "RepositoryResolver auto-select" },
  { key: "capability", label: "Capability", color: "bg-emerald-600", desc: "Final capability + payload" },
  { key: "runtime",    label: "Runtime",    color: "bg-amber-600",   desc: "ConnectorCapabilityExecutor result" },
  { key: "connector",  label: "Connector",  color: "bg-rose-600",    desc: "GitHubConnector.execute() return" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, error }) {
  if (!status && !error) return <Badge variant="outline" className="text-zinc-400 border-zinc-700">—</Badge>;
  const isOk = !error && (status === "SUCCESS" || status === "ok" || status === "completed");
  return (
    <Badge className={isOk ? "bg-emerald-700 text-white" : "bg-rose-700 text-white"}>
      {error ? "ERROR" : status ?? "—"}
    </Badge>
  );
}

function JsonPreview({ value, label }) {
  const [expanded, setExpanded] = useState(false);
  if (value === undefined || value === null) return null;
  const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const short = str.length > 200 ? str.slice(0, 200) + "…" : str;
  return (
    <div className="mt-1">
      <span className="text-zinc-500 text-xs">{label}: </span>
      <button
        onClick={() => setExpanded(e => !e)}
        className="text-xs text-violet-400 underline mr-1"
      >{expanded ? "collapse" : "expand"}</button>
      <pre className="text-xs text-zinc-300 bg-zinc-900 rounded p-2 mt-1 overflow-auto max-h-48 whitespace-pre-wrap">
        {expanded ? str : short}
      </pre>
    </div>
  );
}

function StageRow({ stage, events, executionId }) {
  const stageEvents = events.filter(e =>
    e.stage === stage.key && (!executionId || e.executionId === executionId)
  );

  const hasEvent = stageEvents.length > 0;
  const latest = stageEvents[stageEvents.length - 1];

  return (
    <div className={`rounded-lg border p-4 mb-2 ${hasEvent ? "border-zinc-600 bg-zinc-800/60" : "border-zinc-700/40 bg-zinc-900/40"}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-3 h-3 rounded-full ${hasEvent ? stage.color : "bg-zinc-700"}`} />
        <span className="font-mono font-semibold text-sm text-zinc-100">{stage.label}</span>
        <span className="text-zinc-500 text-xs">{stage.desc}</span>
        {hasEvent && <StatusBadge status={latest?.status} error={latest?.error} />}
        {!hasEvent && <Badge variant="outline" className="text-zinc-600 border-zinc-700 text-xs">not reached</Badge>}
      </div>
      {hasEvent && (
        <div className="ml-6 space-y-1">
          <div className="text-xs text-zinc-400">
            <span className="text-zinc-500">ts: </span>{latest.timestamp}
            {latest.executionId && <span className="ml-3 text-zinc-500">execId: <span className="text-violet-400 font-mono">{latest.executionId.slice(-12)}</span></span>}
          </div>
          {latest.capability && (
            <div className="text-xs"><span className="text-zinc-500">capability: </span><span className="text-amber-300 font-mono">{latest.capability}</span></div>
          )}
          {latest.error && (
            <div className="text-xs text-rose-400 font-mono bg-rose-950/30 rounded px-2 py-1 mt-1">⚠ {latest.error}</div>
          )}
          {latest.repoCount !== undefined && (
            <div className="text-xs"><span className="text-zinc-500">repoCount: </span><span className="text-cyan-300">{latest.repoCount}</span></div>
          )}
          {latest.selectedRepo && (
            <div className="text-xs"><span className="text-zinc-500">selectedRepo: </span><span className="text-emerald-300 font-mono">{JSON.stringify(latest.selectedRepo)}</span></div>
          )}
          <JsonPreview value={latest.payload} label="payload" />
          <JsonPreview value={latest.result}  label="result" />
          {stageEvents.length > 1 && (
            <div className="text-xs text-zinc-500 mt-1">+{stageEvents.length - 1} more occurrences</div>
          )}
        </div>
      )}
    </div>
  );
}

function EventLog({ events }) {
  if (events.length === 0) return (
    <div className="text-zinc-500 text-sm text-center py-8">No events recorded yet. Enable AUDIT_MODE and run a GitHub query.</div>
  );
  return (
    <div className="space-y-1">
      {[...events].reverse().map(e => (
        <div key={e.id} className="flex items-start gap-2 text-xs font-mono border-b border-zinc-800 pb-1">
          <span className="text-zinc-600 shrink-0 w-20">{e.timestamp.slice(11, 23)}</span>
          <span className="text-violet-400 shrink-0 w-24">{e.stage}</span>
          <span className={`shrink-0 w-20 ${!e.error ? "text-emerald-400" : "text-rose-400"}`}>{e.status ?? "—"}</span>
          {e.capability && <span className="text-amber-300 shrink-0">{e.capability}</span>}
          {e.error && <span className="text-rose-400">{e.error}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function GitHubDebugPanel() {
  const [events, setEvents]             = useState([]);
  const [executionIds, setExecutionIds] = useState([]);
  const [selectedExecId, setSelectedExecId] = useState("");
  const [auditMode, setAuditMode]       = useState(false);
  const [tab, setTab]                   = useState("timeline");

  useEffect(() => {
    const am = !!(globalThis).__GITHUB_AUDIT_MODE__;
    setAuditMode(am);

    let unsubscribe = () => {};
    import("@/lib/debug/GitHubAuditStore").then(({ githubAuditStore }) => {
      setEvents([...githubAuditStore.getAll()]);
      unsubscribe = githubAuditStore.subscribe(() => {
        const all = [...githubAuditStore.getAll()];
        setEvents(all);
        const ids = [...new Set(all.map(e => e.executionId).filter(Boolean))];
        setExecutionIds(ids);
      });
    });
    return () => unsubscribe();
  }, []);

  const handleClear = useCallback(() => {
    import("@/lib/debug/GitHubAuditStore").then(({ githubAuditStore }) => {
      githubAuditStore.clear();
    });
  }, []);

  const handleExport = useCallback(() => {
    import("@/lib/debug/GitHubAuditStore").then(({ githubAuditStore }) => {
      const json = githubAuditStore.export();
      const blob = new Blob([json], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `github-audit-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, []);

  const filteredEvents = selectedExecId
    ? events.filter(e => e.executionId === selectedExecId)
    : events;

  return (
    <div className="bg-zinc-950 min-h-screen text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-mono text-violet-300">GitHub Forensic Audit Panel</h1>
            <p className="text-zinc-500 text-sm mt-1">Sprint M1.12 · Read-only observability · Zero functional impact</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300" onClick={handleClear}>Clear</Button>
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300" onClick={handleExport}>Export JSON</Button>
          </div>
        </div>

        {/* AUDIT_MODE status */}
        {!auditMode && (
          <Card className="bg-amber-950/30 border-amber-700/50">
            <CardContent className="pt-4">
              <p className="text-amber-300 font-semibold">⚠ AUDIT_MODE is OFF — no events are being recorded.</p>
              <p className="text-amber-400/70 text-sm mt-1">
                To enable: open browser console and run <code className="bg-zinc-900 px-1 rounded">globalThis.__GITHUB_AUDIT_MODE__ = true</code>, then reload.
              </p>
              <Button
                size="sm"
                className="mt-3 bg-amber-700 hover:bg-amber-600 text-white"
                onClick={activateAuditMode}
              >
                Enable AUDIT_MODE &amp; Reload
              </Button>
            </CardContent>
          </Card>
        )}
        {auditMode && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-sm font-mono">AUDIT_MODE ACTIVE — {events.length} event(s) captured</span>
          </div>
        )}

        {/* ExecutionId filter */}
        {executionIds.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-500 text-xs">Filter by execId:</span>
            <button
              onClick={() => setSelectedExecId("")}
              className={`text-xs px-2 py-1 rounded ${!selectedExecId ? "bg-violet-700 text-white" : "bg-zinc-800 text-zinc-400"}`}
            >all</button>
            {executionIds.map(id => (
              <button
                key={id}
                onClick={() => setSelectedExecId(id === selectedExecId ? "" : id)}
                className={`text-xs px-2 py-1 rounded font-mono ${id === selectedExecId ? "bg-violet-700 text-white" : "bg-zinc-800 text-zinc-400"}`}
              >{id.slice(-12)}</button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-800 pb-2">
          {["timeline", "log"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1 text-sm rounded-t font-mono capitalize ${tab === t ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >{t}</button>
          ))}
        </div>

        {/* Timeline view */}
        {tab === "timeline" && (
          <div>
            <p className="text-zinc-500 text-xs mb-4">Pipeline execution trace — each stage shows the last captured event</p>
            <div className="relative">
              {/* Connector line */}
              <div className="absolute left-[17px] top-6 bottom-6 w-px bg-zinc-700 z-0" />
              <div className="relative z-10">
                {STAGES.map(stage => (
                  <StageRow key={stage.key} stage={stage} events={filteredEvents} executionId={selectedExecId} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Raw log view */}
        {tab === "log" && (
          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-zinc-300">Raw Event Log ({filteredEvents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <EventLog events={filteredEvents} />
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Certification summary */}
        <Card className="bg-zinc-900 border-zinc-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-zinc-300">Certification — M1.12</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-400 space-y-1">
            {[
              ["Route stage",      "ConversationCognitiveGateway → GitHubQueryRouter decision"],
              ["repos.list stage", "ConversationCognitiveGateway → officialRuntimeBridge.invokeCompat result"],
              ["Resolver stage",   "RepositoryResolver.resolve() — repoCount + selectedRepo"],
              ["Capability stage", "ConversationCognitiveGateway — final capability + payload before invocation"],
              ["Runtime stage",    "ConnectorCapabilityExecutor → UniversalConnectorRouter result"],
              ["Connector stage",  "GitHubConnector.execute() — final status + error before return"],
            ].map(([stage, desc]) => (
              <div key={stage} className="flex gap-2">
                <span className="text-violet-400 w-32 shrink-0">{stage}</span>
                <span>{desc}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}