/**
 * Phase711Page.jsx — Cognitive Observability Platform Dashboard
 * Sprint 7.1.1: Cognitive Inspector with 10 tabs.
 */

import React, { useState, useCallback } from "react";
import {
  Brain, Activity, Eye, FileText, Database, Users, Plug, Radio,
  RefreshCw, CheckCircle, XCircle, Clock, Zap, BarChart2,
  ChevronRight, Play, AlertTriangle, Info, Terminal, Layers
} from "lucide-react";
import { runCOPTests } from "@/lib/cognitive-observability/copTests";
import { CognitiveObservabilityManager } from "@/lib/cognitive-observability/CognitiveObservabilityManager";

// ─── UI atoms ─────────────────────────────────────────────────────────────────

const Badge = ({ color = "zinc", children }) => {
  const colors = {
    green: "bg-green-100 text-green-700 border-green-200",
    red: "bg-red-100 text-red-700 border-red-200",
    yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    violet: "bg-violet-100 text-violet-700 border-violet-200",
    zinc: "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[color] ?? colors.zinc}`}>
      {children}
    </span>
  );
};

const StatCard = ({ label, value, sub, color = "violet" }) => {
  const colors = { violet: "text-violet-600", blue: "text-blue-600", green: "text-green-600", amber: "text-amber-600" };
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color] ?? colors.violet}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
};

const Section = ({ title, icon: Icon, children }) => (
  <div className="bg-white rounded-xl border border-zinc-200 p-5 mb-4">
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-violet-600" />
      <h3 className="font-semibold text-zinc-800 text-sm">{title}</h3>
    </div>
    {children}
  </div>
);

const EmptyState = ({ message }) => (
  <div className="text-center py-8 text-zinc-400 text-sm">{message}</div>
);

// ─── Tab content components ───────────────────────────────────────────────────

function OverviewTab({ cop, metrics }) {
  const audit = cop.auditReadiness();
  const isReady = audit.status.includes("READY");

  return (
    <div className="space-y-4">
      {/* Audit status */}
      <div className={`rounded-xl p-4 border flex items-center gap-3 ${isReady ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
        {isReady
          ? <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          : <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />}
        <div>
          <p className={`font-semibold text-sm ${isReady ? "text-green-700" : "text-red-700"}`}>{audit.status}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{audit.passed.length} inspectors active · {audit.failed.length} failed</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Observations" value={metrics.replay.totalRecords} color="violet" />
        <StatCard label="Total Events" value={metrics.events.totalEvents} color="blue" />
        <StatCard label="Avg Latency" value={`${metrics.performance.avgLatencyMs}ms`} color="green" />
        <StatCard label="Avg Tokens" value={metrics.prompt.avgTokens} color="amber" />
      </div>

      {/* Inspector grid */}
      <Section title="Active Inspectors" icon={Eye}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { label: "Context Inspector", key: "context", icon: Layers },
            { label: "Prompt Inspector", key: "prompt", icon: FileText },
            { label: "Pipeline Timeline", key: "pipeline", icon: Activity },
            { label: "Streaming Inspector", key: "streaming", icon: Radio },
            { label: "Memory Inspector", key: "memory", icon: Database },
            { label: "Specialist Inspector", key: "specialist", icon: Brain },
            { label: "Connector Inspector", key: "connector", icon: Plug },
            { label: "Decision Inspector", key: "decision", icon: Zap },
            { label: "Performance Timeline", key: "performance", icon: BarChart2 },
            { label: "Event Replay", key: "events", icon: RefreshCw },
            { label: "Conversation Replay", key: "replay", icon: Play },
          ].map(({ label, key, icon: Icon }) => (
            <div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 border border-zinc-100">
              <div className="w-6 h-6 rounded bg-violet-100 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-violet-600" />
              </div>
              <span className="text-xs text-zinc-700 font-medium truncate">{label}</span>
              <Badge color="green">OK</Badge>
            </div>
          ))}
        </div>
      </Section>

      {/* Metrics summary */}
      <Section title="Inspector Metrics" icon={BarChart2}>
        <div className="space-y-2">
          {[
            { label: "Context snapshots", value: metrics.context.totalSnapshots },
            { label: "Prompt snapshots", value: metrics.prompt.totalSnapshots },
            { label: "Pipeline timelines", value: metrics.pipeline.totalTimelines },
            { label: "Streaming snapshots", value: metrics.streaming.totalSnapshots },
            { label: "Memory snapshots", value: metrics.memory.totalSnapshots },
            { label: "Specialist snapshots", value: metrics.specialist.totalSnapshots },
            { label: "Connector snapshots", value: metrics.connector.totalSnapshots },
            { label: "Decision snapshots", value: metrics.decision.totalSnapshots },
            { label: "Event conversations", value: metrics.events.totalConversations },
            { label: "Replay conversations", value: metrics.replay.totalConversations },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-zinc-50 last:border-0">
              <span className="text-xs text-zinc-600">{label}</span>
              <span className="text-xs font-mono font-semibold text-violet-700">{value}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function PipelineTab({ cop }) {
  const latest = cop.pipeline.getLatest();
  if (!latest) return <EmptyState message="No pipeline data yet. Send a message to start observing." />;

  const total = latest.totalDurationMs ?? 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Duration" value={`${latest.totalDurationMs ?? 0}ms`} color="violet" />
        <StatCard label="Steps" value={latest.steps.length} color="blue" />
        <StatCard label="Errors" value={latest.steps.filter(s => s.status === "error").length} color="amber" />
      </div>

      <Section title="Stage Timeline" icon={Activity}>
        <div className="space-y-2">
          {latest.steps.map((step, i) => {
            const pct = total > 0 ? Math.round(((step.durationMs ?? 0) / total) * 100) : 0;
            const statusColor = { done: "bg-green-500", error: "bg-red-500", running: "bg-blue-500", skipped: "bg-zinc-300", pending: "bg-zinc-200" }[step.status] ?? "bg-zinc-200";
            return (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                <span className="text-xs text-zinc-600 w-40 shrink-0">{step.label}</span>
                <div className="flex-1 bg-zinc-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${statusColor}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-mono text-zinc-500 w-16 text-right">{step.durationMs ?? "--"}ms</span>
                <Badge color={step.status === "done" ? "green" : step.status === "error" ? "red" : step.status === "skipped" ? "zinc" : "blue"}>
                  {step.status}
                </Badge>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function ContextTab({ cop }) {
  const latest = cop.context.getLatest();
  if (!latest) return <EmptyState message="No context data yet. Send a message to start observing." />;

  const byType = {};
  latest.items.forEach((item) => { byType[item.type] = (byType[item.type] ?? 0) + 1; });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Items" value={latest.totalItems} color="violet" />
        <StatCard label="Est. Tokens" value={latest.totalTokensEstimate} color="blue" />
        <StatCard label="Types" value={Object.keys(byType).length} color="green" />
      </div>

      <Section title="Context Items (ordered by inclusion)" icon={Layers}>
        {latest.items.length === 0
          ? <EmptyState message="No items recorded." />
          : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {latest.items.map((item) => (
                <div key={item.id} className="border border-zinc-100 rounded-lg p-3 bg-zinc-50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-zinc-700">#{item.order + 1} {item.label}</span>
                    <Badge color="violet">{item.type}</Badge>
                    <span className="ml-auto text-xs text-zinc-400">weight: {item.weight.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mb-1 italic">{item.reason}</p>
                  <p className="text-xs text-zinc-600 truncate">{item.content}</p>
                </div>
              ))}
            </div>
          )}
      </Section>
    </div>
  );
}

function PromptTab({ cop }) {
  const latest = cop.prompt.getLatest();
  if (!latest) return <EmptyState message="No prompt data yet. Send a message to start observing." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Tokens" value={latest.totalTokens} color="violet" />
        <StatCard label="Total Chars" value={latest.totalChars} color="blue" />
        <StatCard label="Blocks" value={latest.blocks.length} color="green" />
      </div>

      <Section title="Prompt Blocks" icon={FileText}>
        {latest.blocks.length === 0
          ? <EmptyState message="No blocks recorded." />
          : (
            <div className="space-y-3">
              {[...latest.blocks].sort((a, b) => a.order - b.order).map((block) => (
                <div key={block.id} className="border border-zinc-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-100">
                    <span className="text-xs font-semibold text-zinc-700">{block.label}</span>
                    <Badge color={block.role === "system" ? "violet" : block.role === "user" ? "blue" : "zinc"}>{block.role}</Badge>
                    <span className="ml-auto text-xs text-zinc-400">~{block.tokenEstimate} tokens · {block.charCount} chars</span>
                  </div>
                  <pre className="text-xs text-zinc-600 p-3 whitespace-pre-wrap break-words max-h-24 overflow-y-auto font-mono bg-white">
                    {block.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
      </Section>
    </div>
  );
}

function MemoryTab({ cop }) {
  const latest = cop.memory.getLatest();
  if (!latest) return <EmptyState message="No memory data yet. Send a message to start observing." />;

  const TIER_COLORS = { working: "blue", long_term: "violet", conversation: "green", knowledge: "amber" };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(latest.byTier).map(([tier, count]) => (
          <StatCard key={tier} label={tier.replace("_", " ")} value={count} color={TIER_COLORS[tier] ?? "zinc"} />
        ))}
      </div>

      <Section title="Memory Items" icon={Database}>
        {latest.items.length === 0
          ? <EmptyState message="No memory items recorded." />
          : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {latest.items.map((item) => (
                <div key={item.id} className="border border-zinc-100 rounded-lg p-3 bg-zinc-50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-zinc-700">{item.label}</span>
                    <Badge color={TIER_COLORS[item.tier] ?? "zinc"}>{item.tier}</Badge>
                    <Badge color="zinc">{item.type}</Badge>
                    <span className="ml-auto text-xs text-zinc-400">conf: {(item.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-zinc-600 truncate">{item.content}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] text-zinc-400">source: {item.source}</span>
                    <span className="text-[10px] text-zinc-400">created: {item.createdAt.split("T")[0]}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
      </Section>
    </div>
  );
}

function SpecialistsTab({ cop }) {
  const latest = cop.specialist.getLatest();
  if (!latest) return <EmptyState message="No specialist data yet. Send a message to start observing." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Activated" value={latest.totalActivated} color="green" />
        <StatCard label="Discarded" value={latest.totalDiscarded} color="amber" />
        <StatCard label="Total Evaluated" value={latest.totalActivated + latest.totalDiscarded} color="violet" />
      </div>

      <Section title="Activated Specialists" icon={Users}>
        {latest.activated.length === 0
          ? <EmptyState message="No specialists activated." />
          : (
            <div className="space-y-2">
              {latest.activated.map((s) => (
                <div key={s.id} className="border border-zinc-100 rounded-lg p-3 bg-zinc-50">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <span className="text-xs font-semibold text-zinc-700">{s.name}</span>
                    {s.durationMs != null && <span className="ml-auto text-xs text-zinc-400">{s.durationMs}ms</span>}
                  </div>
                  <p className="text-xs text-zinc-500 italic mb-1">{s.activationReason}</p>
                  {s.result && <p className="text-xs text-zinc-600 truncate">{s.result}</p>}
                  {s.error && <p className="text-xs text-red-500">{s.error}</p>}
                </div>
              ))}
            </div>
          )}
      </Section>

      <Section title="Discarded Specialists" icon={XCircle}>
        {latest.discarded.length === 0
          ? <EmptyState message="No specialists discarded." />
          : (
            <div className="space-y-2">
              {latest.discarded.map((s) => (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 border border-zinc-100">
                  <XCircle className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="text-xs text-zinc-600">{s.name}</span>
                  <span className="text-xs text-zinc-400 ml-auto">{s.discardedReason}</span>
                </div>
              ))}
            </div>
          )}
      </Section>
    </div>
  );
}

function ConnectorsTab({ cop }) {
  const latest = cop.connector.getLatest();
  if (!latest) return <EmptyState message="No connector data yet. Send a message to start observing." />;

  const STATUS_COLORS = { success: "green", error: "red", retry: "yellow", skipped: "zinc" };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Invocations" value={latest.totalConnectors} color="violet" />
        <StatCard label="Failures" value={latest.totalFailures} color="red" />
        <StatCard label="Retries" value={latest.totalRetries} color="amber" />
      </div>

      <Section title="Connector Records" icon={Plug}>
        {latest.records.length === 0
          ? <EmptyState message="No connector invocations recorded." />
          : (
            <div className="space-y-2">
              {latest.records.map((r) => (
                <div key={r.id} className="border border-zinc-100 rounded-lg p-3 bg-zinc-50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-zinc-700">{r.connectorName}</span>
                    <Badge color="zinc">{r.capability}</Badge>
                    <Badge color={STATUS_COLORS[r.status] ?? "zinc"}>{r.status}</Badge>
                    {r.durationMs != null && <span className="ml-auto text-xs text-zinc-400">{r.durationMs}ms</span>}
                  </div>
                  {r.account && <p className="text-xs text-zinc-400">account: {r.account}</p>}
                  {r.result && <p className="text-xs text-zinc-600 truncate">{r.result}</p>}
                  {r.error && <p className="text-xs text-red-500">{r.error}</p>}
                  {r.retryCount > 0 && <p className="text-xs text-yellow-600">Retries: {r.retryCount}</p>}
                </div>
              ))}
            </div>
          )}
      </Section>
    </div>
  );
}

function StreamingTab({ cop }) {
  const latest = cop.streaming.getLatest();
  if (!latest) return <EmptyState message="No streaming data yet. Send a message to start observing." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Time to First Token" value={`${latest.timeToFirstTokenMs ?? "--"}ms`} color="violet" />
        <StatCard label="Tokens/sec" value={latest.tokensPerSecond ?? "--"} color="blue" />
        <StatCard label="Total Chunks" value={latest.chunkCount} color="green" />
        <StatCard label="Interruptions" value={latest.interruptionCount} color="amber" />
      </div>

      <Section title="Streaming Metrics" icon={Radio}>
        <div className="space-y-2">
          {[
            { label: "Started At", value: new Date(latest.startedAt).toISOString() },
            { label: "First Token At", value: latest.firstTokenAt ? new Date(latest.firstTokenAt).toISOString() : "--" },
            { label: "Ended At", value: latest.endedAt ? new Date(latest.endedAt).toISOString() : "--" },
            { label: "Total Duration", value: `${latest.totalDurationMs ?? "--"}ms` },
            { label: "Total Characters", value: latest.totalChars },
            { label: "Was Interrupted", value: latest.interrupted ? "Yes" : "No" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-zinc-50 last:border-0">
              <span className="text-xs text-zinc-500">{label}</span>
              <span className="text-xs font-mono text-zinc-700">{String(value)}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function ReplayTab({ cop }) {
  const convIds = cop.replay.listConversations();
  const [selectedConv, setSelectedConv] = useState(convIds[0] ?? null);
  const [selectedFrame, setSelectedFrame] = useState(0);

  const records = selectedConv ? cop.replay.getRecords(selectedConv) : [];
  const record = records[selectedFrame];

  if (!convIds.length) return <EmptyState message="No replay data yet. Send a message to start observing." />;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        {convIds.map((id) => (
          <button key={id} onClick={() => { setSelectedConv(id); setSelectedFrame(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${selectedConv === id ? "bg-violet-600 text-white border-violet-600" : "bg-white text-zinc-600 border-zinc-200 hover:border-violet-300"}`}>
            {id.slice(0, 20)}...
          </button>
        ))}
      </div>

      {records.length > 0 && (
        <>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {records.map((r, i) => (
              <button key={r.id} onClick={() => setSelectedFrame(i)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${selectedFrame === i ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"}`}>
                Frame {i + 1}
              </button>
            ))}
          </div>

          {record && (
            <Section title={`Frame ${selectedFrame + 1} — ${record.capturedAt}`} icon={Play}>
              <div className="space-y-3">
                <div className="p-3 bg-zinc-50 rounded-lg">
                  <p className="text-xs font-semibold text-zinc-500 mb-1">User Input</p>
                  <p className="text-sm text-zinc-700">{record.userInput}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div className="p-2 bg-zinc-50 rounded-lg text-center">
                    <p className="text-[10px] text-zinc-400">Context items</p>
                    <p className="text-sm font-bold text-violet-600">{record.context?.totalItems ?? 0}</p>
                  </div>
                  <div className="p-2 bg-zinc-50 rounded-lg text-center">
                    <p className="text-[10px] text-zinc-400">Prompt tokens</p>
                    <p className="text-sm font-bold text-blue-600">{record.prompt?.totalTokens ?? 0}</p>
                  </div>
                  <div className="p-2 bg-zinc-50 rounded-lg text-center">
                    <p className="text-[10px] text-zinc-400">Pipeline steps</p>
                    <p className="text-sm font-bold text-green-600">{record.pipeline?.steps.length ?? 0}</p>
                  </div>
                  <div className="p-2 bg-zinc-50 rounded-lg text-center">
                    <p className="text-[10px] text-zinc-400">Memory items</p>
                    <p className="text-sm font-bold text-amber-600">{record.memory?.totalItems ?? 0}</p>
                  </div>
                  <div className="p-2 bg-zinc-50 rounded-lg text-center">
                    <p className="text-[10px] text-zinc-400">Decisions</p>
                    <p className="text-sm font-bold text-violet-600">{record.decisions?.totalDecisions ?? 0}</p>
                  </div>
                  <div className="p-2 bg-zinc-50 rounded-lg text-center">
                    <p className="text-[10px] text-zinc-400">Events</p>
                    <p className="text-sm font-bold text-zinc-600">{record.events.length}</p>
                  </div>
                </div>
                <div className="p-3 bg-zinc-50 rounded-lg">
                  <p className="text-xs font-semibold text-zinc-500 mb-2">Events Log</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {record.events.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-zinc-400">{new Date(ev.timestamp).toISOString().slice(11, 23)}</span>
                        <Badge color="zinc">{ev.category}</Badge>
                        <span className="text-zinc-600">{ev.type}</span>
                      </div>
                    ))}
                    {record.events.length === 0 && <p className="text-xs text-zinc-400">No events recorded for this frame.</p>}
                  </div>
                </div>
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function TestsTab() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const run = useCallback(async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runCOPTests();
      setResults(r);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition"
        >
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Running..." : "Run All Tests"}
        </button>
        {results && (
          <span className={`text-sm font-semibold ${results.totalFailed === 0 ? "text-green-600" : "text-red-600"}`}>
            {results.totalPassed} passed · {results.totalFailed} failed · {results.totalMs}ms
          </span>
        )}
      </div>

      {results && (
        <>
          <div className={`rounded-xl p-3 border ${results.totalFailed === 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <p className={`text-sm font-semibold ${results.totalFailed === 0 ? "text-green-700" : "text-red-700"}`}>
              {results.auditStatus}
            </p>
          </div>

          {results.suites.map((suite) => (
            <Section key={suite.suite} title={`${suite.suite} — ${suite.passed}/${suite.passed + suite.failed}`} icon={Terminal}>
              <div className="space-y-1">
                {suite.results.map((r) => (
                  <div key={r.name} className="flex items-center gap-2 py-1">
                    {r.passed
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                    <span className="text-xs text-zinc-700 flex-1">{r.name}</span>
                    <span className="text-xs text-zinc-400 font-mono">{r.durationMs}ms</span>
                    {r.error && <span className="text-xs text-red-500 truncate max-w-xs">{r.error}</span>}
                  </div>
                ))}
              </div>
            </Section>
          ))}
        </>
      )}

      {!results && !running && (
        <EmptyState message="Press Run All Tests to validate the Cognitive Observability Platform." />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: Eye },
  { id: "pipeline", label: "Pipeline", icon: Activity },
  { id: "context", label: "Context", icon: Layers },
  { id: "prompt", label: "Prompt", icon: FileText },
  { id: "memory", label: "Memory", icon: Database },
  { id: "specialists", label: "Specialists", icon: Brain },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "streaming", label: "Streaming", icon: Radio },
  { id: "replay", label: "Replay", icon: Play },
  { id: "tests", label: "Tests", icon: Terminal },
];

export default function Phase711Page() {
  const [activeTab, setActiveTab] = useState("overview");
  const cop = CognitiveObservabilityManager.getInstance();
  const [metrics, setMetrics] = useState(() => cop.metrics());

  const refresh = () => setMetrics(cop.metrics());

  const renderTab = () => {
    switch (activeTab) {
      case "overview": return <OverviewTab cop={cop} metrics={metrics} />;
      case "pipeline": return <PipelineTab cop={cop} />;
      case "context": return <ContextTab cop={cop} />;
      case "prompt": return <PromptTab cop={cop} />;
      case "memory": return <MemoryTab cop={cop} />;
      case "specialists": return <SpecialistsTab cop={cop} />;
      case "connectors": return <ConnectorsTab cop={cop} />;
      case "streaming": return <StreamingTab cop={cop} />;
      case "replay": return <ReplayTab cop={cop} />;
      case "tests": return <TestsTab />;
      default: return null;
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
            <Eye className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 font-heading">Cognitive Observability Platform</h1>
            <p className="text-xs text-zinc-400">Sprint 7.1.1 · Full decision transparency</p>
          </div>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 mb-6 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
              activeTab === id
                ? "bg-violet-600 text-white shadow-sm"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {renderTab()}
    </div>
  );
}