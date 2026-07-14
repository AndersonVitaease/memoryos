import React, { useState } from "react";
import {
  Loader2, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  GitBranch, Layers, Activity, Zap, Network, ShieldCheck, Play
} from "lucide-react";
import { MultiIntentDetector } from "@/lib/cognitive-task-planner/MultiIntentDetector";
import { CognitiveTaskPlanner } from "@/lib/cognitive-task-planner/CognitiveTaskPlanner";
import { EF59ValidationSuite } from "@/lib/cognitive-task-planner/ef59Tests";
import ReactMarkdown from "react-markdown";

const detector  = new MultiIntentDetector();
const suite     = new EF59ValidationSuite();

const TABS = [
  { id: "planner",    label: "Task Planner",       icon: Layers },
  { id: "graph",      label: "Execution Graph",    icon: Network },
  { id: "validation", label: "Validation Suite",   icon: ShieldCheck },
  { id: "live",       label: "Live Execution",     icon: Zap },
];

const STATUS_COLORS = {
  PASS:           "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  FAIL:           "bg-red-900/40 text-red-300 border-red-700",
  NOT_CONFIGURED: "bg-amber-900/40 text-amber-300 border-amber-700",
};

const TASK_COLORS = {
  pending:   "bg-zinc-800 text-zinc-400",
  running:   "bg-blue-900/40 text-blue-300",
  completed: "bg-emerald-900/40 text-emerald-300",
  failed:    "bg-red-900/40 text-red-300",
  skipped:   "bg-zinc-700 text-zinc-500",
};

const CONNECTOR_COLORS = {
  github:          "bg-zinc-700 text-zinc-200",
  base44:          "bg-violet-900/40 text-violet-300",
  memory:          "bg-blue-900/40 text-blue-300",
  official_library:"bg-amber-900/40 text-amber-300",
  specialist:      "bg-pink-900/40 text-pink-300",
};

function TestRow({ result }) {
  const [open, setOpen] = useState(false);
  const Icon = result.status === "PASS" ? CheckCircle : result.status === "FAIL" ? XCircle : AlertTriangle;
  const iconColor = result.status === "PASS" ? "text-emerald-400" : result.status === "FAIL" ? "text-red-400" : "text-amber-400";
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800/60 transition text-left">
        <Icon className={`w-4 h-4 ${iconColor} shrink-0`} />
        <span className="flex-1 text-sm text-zinc-200">{result.name}</span>
        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${STATUS_COLORS[result.status]}`}>{result.status}</span>
        <span className="text-xs text-zinc-600 ml-2 shrink-0">{result.durationMs}ms</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 py-3 bg-zinc-950 text-xs space-y-1">
          <p className="text-zinc-500">Category: <span className="text-zinc-400">{result.category}</span></p>
          {result.evidence.map((e, i) => <p key={i} className="text-zinc-400">• {e}</p>)}
          {result.error && <p className="text-red-400 font-mono mt-1 break-all">{result.error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Planner Tab ───────────────────────────────────────────────────────────────

function PlannerTab() {
  const [msg, setMsg] = useState("Where is ConnectionManager implemented? Who uses it? What changed last sprint?");
  const [intents, setIntents] = useState(null);

  const detect = () => setIntents(detector.detect(msg));

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">Decompose a message into multiple detected intents.</p>
      <div className="flex gap-2">
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={3}
          className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500 resize-none"
        />
        <button onClick={detect} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition self-start">
          Detect
        </button>
      </div>
      {intents && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{intents.length} intent(s) detected</p>
          {intents.map((intent, i) => (
            <div key={intent.intentId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-zinc-200">#{i + 1} — {intent.category.replace(/_/g, " ")}</span>
                <span className="text-xs text-zinc-500">priority {intent.priority} · conf {Math.round(intent.confidence * 100)}%</span>
              </div>
              <p className="text-xs text-zinc-400 mb-2">{intent.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {intent.requiredConnectors.map(c => (
                  <span key={c} className={`text-xs px-2 py-0.5 rounded font-mono ${CONNECTOR_COLORS[c] ?? "bg-zinc-800 text-zinc-400"}`}>{c}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {intent.requiredCapabilities.slice(0, 4).map(cap => (
                  <span key={cap} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">{cap}</span>
                ))}
              </div>
              {intent.dependencies.length > 0 && (
                <p className="text-xs text-amber-400 mt-2">↳ depends on {intent.dependencies.length} prior intent(s)</p>
              )}
              {Object.keys(intent.extractedEntities).length > 0 && (
                <p className="text-xs text-zinc-500 mt-1">Entities: {JSON.stringify(intent.extractedEntities)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Graph Tab ─────────────────────────────────────────────────────────────────

function GraphTab() {
  const [msg, setMsg] = useState("Where is ConnectionManager? What changed last sprint?");
  const [graph, setGraph] = useState(null);

  const build = () => {
    const intents = detector.detect(msg);
    const g = new CognitiveTaskPlanner().buildGraph(intents, msg);
    setGraph(g);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">Build an execution graph from a multi-intent message.</p>
      <div className="flex gap-2">
        <input value={msg} onChange={e => setMsg(e.target.value)} className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500" />
        <button onClick={build} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition">Build</button>
      </div>
      {graph && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Tasks",         value: graph.tasks.length },
              { label: "Intents",       value: graph.intents.length },
              { label: "Parallel Grps", value: graph.parallelGroups.length },
            ].map(m => (
              <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-500">{m.label}</p>
                <p className="text-xl font-bold font-mono text-zinc-200">{m.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-400 mb-2">Task Nodes</p>
            {graph.tasks.map(task => (
              <div key={task.taskId} className="flex items-center gap-2 py-1.5 border-b border-zinc-800 last:border-0">
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${CONNECTOR_COLORS[task.connector] ?? "bg-zinc-800"}`}>{task.connector}</span>
                <span className="text-xs font-mono text-zinc-300 flex-1 truncate">{task.capability}</span>
                {task.dependsOn.length > 0 && (
                  <span className="text-xs text-amber-400 shrink-0">deps:{task.dependsOn.length}</span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded ${TASK_COLORS[task.status]}`}>{task.status}</span>
              </div>
            ))}
          </div>
          {graph.criticalPath.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 mb-2">Critical Path</p>
              <div className="flex flex-wrap gap-1">
                {graph.criticalPath.map((id, i) => {
                  const t = graph.tasks.find(t => t.taskId === id);
                  return (
                    <React.Fragment key={id}>
                      <span className="text-xs font-mono bg-violet-900/30 text-violet-300 px-2 py-0.5 rounded">{t?.capability ?? id.slice(-6)}</span>
                      {i < graph.criticalPath.length - 1 && <span className="text-zinc-600 text-xs">→</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Validation Tab ────────────────────────────────────────────────────────────

function ValidationTab() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => { setLoading(true); setReport(null); setReport(await suite.run()); setLoading(false); };
  const categories = report ? [...new Set(report.results.map(r => r.category))] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">Runs all EF-59 tests against the live runtime.</p>
        <button onClick={run} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {loading ? "Running..." : "Run Suite"}
        </button>
      </div>
      {report && (
        <>
          <div className={`rounded-xl border p-4 ${report.certified ? "bg-emerald-900/20 border-emerald-700" : "bg-red-900/20 border-red-800"}`}>
            <div className="flex items-center gap-2 mb-1">
              {report.certified ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
              <span className={`font-bold ${report.certified ? "text-emerald-300" : "text-red-300"}`}>
                {report.certified ? "EF-59 CERTIFIED" : "NOT CERTIFIED"}
              </span>
            </div>
            <p className="text-sm text-zinc-300 mb-3">{report.summary}</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total",  value: report.totalTests,    color: "text-zinc-200" },
                { label: "Passed", value: report.passed,        color: "text-emerald-300" },
                { label: "Failed", value: report.failed,        color: "text-red-300" },
                { label: "N/C",    value: report.notConfigured, color: "text-amber-300" },
              ].map(m => (
                <div key={m.label} className="bg-zinc-900/60 rounded-lg p-2 border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-500">{m.label}</p>
                  <p className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>
          {categories.map(cat => (
            <div key={cat} className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{cat}</h3>
              {report.results.filter(r => r.category === cat).map(r => <TestRow key={r.id} result={r} />)}
            </div>
          ))}
        </>
      )}
      {!report && !loading && (
        <div className="text-center py-12 text-zinc-600">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Press "Run Suite" to execute all EF-59 validation tests.</p>
        </div>
      )}
    </div>
  );
}

// ── Live Execution Tab ────────────────────────────────────────────────────────

function LiveTab() {
  const [msg, setMsg]       = useState("Where is ConnectionManager implemented? What changed last sprint?");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    setLoading(true); setResult(null);
    const intents = detector.detect(msg);
    const planner = new CognitiveTaskPlanner();
    const graph   = planner.buildGraph(intents, msg);
    const r       = await planner.execute(graph, null);
    setResult(r);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">Execute the full Cognitive Task Planner against live connectors.</p>
      <div className="flex gap-2">
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={3}
          className="flex-1 bg-zinc-800 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-violet-500 resize-none"
        />
        <button onClick={execute} disabled={loading} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition self-start flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Execute
        </button>
      </div>
      {result && (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${result.overallStatus === "SUCCESS" ? "bg-emerald-900/20 border-emerald-700" : result.overallStatus === "PARTIAL" ? "bg-amber-900/20 border-amber-700" : "bg-red-900/20 border-red-800"}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.overallStatus === "SUCCESS"
                ? <CheckCircle className="w-5 h-5 text-emerald-400" />
                : result.overallStatus === "PARTIAL"
                  ? <AlertTriangle className="w-5 h-5 text-amber-400" />
                  : <XCircle className="w-5 h-5 text-red-400" />}
              <span className="font-bold text-zinc-200">{result.overallStatus}</span>
              <span className="text-xs text-zinc-500 ml-auto">{result.durationMs}ms · conf {Math.round(result.confidence * 100)}%</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {[
                { label: "Tasks",     value: result.graph.tasks.length },
                { label: "Done",      value: result.completedTasks.length },
                { label: "Failed",    value: result.failedTasks.length },
                { label: "Evidence",  value: result.fusedEvidence.items.length },
              ].map(m => (
                <div key={m.label} className="bg-zinc-900/60 rounded-lg p-2 border border-zinc-800 text-center">
                  <p className="text-xs text-zinc-500">{m.label}</p>
                  <p className="text-lg font-bold font-mono text-zinc-200">{m.value}</p>
                </div>
              ))}
            </div>
          </div>
          {result.narrative && result.narrative.length > 30 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 mb-3">Cognitive Answer</p>
              <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0">
                <ReactMarkdown>{result.narrative}</ReactMarkdown>
              </div>
            </div>
          )}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-zinc-400 mb-2">Task Execution Log</p>
            {result.graph.tasks.map(task => (
              <div key={task.taskId} className="flex items-center gap-2 py-1.5 border-b border-zinc-800 last:border-0">
                <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${TASK_COLORS[task.status]}`}>{task.status}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${CONNECTOR_COLORS[task.connector] ?? "bg-zinc-800"}`}>{task.connector}</span>
                <span className="text-xs font-mono text-zinc-400 flex-1 truncate">{task.capability}</span>
                {task.durationMs != null && <span className="text-xs text-zinc-600 shrink-0">{task.durationMs}ms</span>}
              </div>
            ))}
          </div>
          {result.recoveryEvents.length > 0 && (
            <div className="bg-zinc-900 border border-amber-800/50 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-400 mb-2">Recovery Events</p>
              {result.recoveryEvents.map((ev, i) => (
                <div key={i} className="text-xs text-zinc-400 py-1 border-b border-zinc-800 last:border-0">
                  <span className="text-amber-300">{ev.strategy}</span>: {ev.outcome}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!result && !loading && (
        <div className="text-center py-12 text-zinc-600">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Press "Execute" to run the Cognitive Task Planner live.</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Phase59Page() {
  const [tab, setTab] = useState("planner");
  const content = { planner: <PlannerTab />, graph: <GraphTab />, validation: <ValidationTab />, live: <LiveTab /> };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Network className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100 font-heading">Phase 5.9.0 — Cognitive Task Planner</h1>
        </div>
        <p className="text-sm text-zinc-500 ml-11">Multi-Intent Detection · Execution Graphs · Capability Chaining · Parallel Orchestration</p>
      </div>

      {/* Architecture banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500 font-mono flex flex-wrap gap-2 items-center">
        {["User Message", "MultiIntentDetector", "CognitiveTaskPlanner", "Execution Graph", "Connector Runtime", "Evidence Fusion", "Composer"].map((s, i, arr) => (
          <React.Fragment key={s}>
            <span className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded">{s}</span>
            {i < arr.length - 1 && <span className="text-zinc-700">→</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="flex gap-1 flex-wrap border-b border-zinc-800">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${tab === t.id ? "text-violet-300 border-violet-500 bg-violet-900/10" : "text-zinc-500 border-transparent hover:text-zinc-300"}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      <div>{content[tab]}</div>
    </div>
  );
}