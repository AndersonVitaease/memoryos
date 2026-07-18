/**
 * PhaseEF381Page.jsx — Sprint EF-38.1
 * Knowledge Store Integration Layer Dashboard
 * Route: /ef381-store
 */
import React, { useState, useCallback } from "react";

function Badge({ label, color }) {
  return <span className={"text-xs font-mono px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 " + (color || "text-zinc-400")}>{label}</span>;
}
function MetCard({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={"text-xl font-bold font-mono " + (color || "text-zinc-300")}>{value ?? "—"}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

const TABS = ["Overview","Architecture","Facade","Registry","Resolver","Middleware","Metrics","Health","Configuration","Tests"];

const ENGINES = [
  { id:"memory",      env:"dev/test",       stable:true,  persist:false },
  { id:"sqlite",      env:"development",    stable:true,  persist:true  },
  { id:"postgres",    env:"production",     stable:true,  persist:true  },
  { id:"neo4j",       env:"prod/enterprise",stable:false, persist:true  },
  { id:"vector",      env:"prod/enterprise",stable:false, persist:true  },
  { id:"cloud",       env:"prod/enterprise",stable:false, persist:true  },
  { id:"distributed", env:"enterprise",     stable:false, persist:true  },
];

const ENV_MAP = { development:"memory", testing:"memory", production:"postgres", enterprise:"distributed" };

export default function PhaseEF381Page() {
  const [tab, setTab]           = useState("Overview");
  const [running, setRunning]   = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [metrics, setMetrics]   = useState(null);
  const [health, setHealth]     = useState(null);
  const [providerState, setProviderState] = useState(null);

  const runTests = useCallback(async () => {
    setRunning(true);
    try {
      const { runKnowledgeStoreIntegrationTests } = await import("@/lib/knowledge-store/knowledgeStoreIntegrationTests");
      const { KnowledgeStoreFacade }              = await import("@/lib/knowledge-store/KnowledgeStoreFacade");
      const r = await runKnowledgeStoreIntegrationTests();
      setTestResult(r);
      setMetrics(KnowledgeStoreFacade.metrics());
      setHealth(KnowledgeStoreFacade.healthSnapshot());
      setProviderState(KnowledgeStoreFacade.providerState());
      setTab("Tests");
    } catch (e) { console.error(e); }
    finally { setRunning(false); }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="border border-violet-700/60 rounded-xl p-5 bg-violet-950/10">
          <div className="text-zinc-500 text-xs tracking-widest mb-1">SPRINT EF-38.1 — KNOWLEDGE STORE INTEGRATION LAYER</div>
          <div className="text-xl font-bold">UKS Integration · Facade · Provider · Registry · Resolver · Middleware</div>
          <div className="text-zinc-400 text-sm mt-1">No concrete storage · Engineering First · SOLID compliant · Zero regressions</div>
        </div>

        {/* Architecture flow */}
        <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4">
          <div className="text-zinc-500 text-xs tracking-widest mb-3">OFFICIAL DEPENDENCY CHAIN</div>
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {[
              { label: "MemoryOS", color: "border-sky-700 text-sky-300" },
              { label: "KnowledgeStoreFacade ★", color: "border-violet-700 text-violet-300" },
              { label: "Middleware Pipeline", color: "border-amber-700 text-amber-300" },
              { label: "IKnowledgeStore", color: "border-emerald-700 text-emerald-300" },
              { label: "Future Engine", color: "border-zinc-700 text-zinc-500" },
            ].map((s, i, arr) => (
              <React.Fragment key={s.label}>
                <span className={"border rounded px-2 py-1 " + s.color}>{s.label}</span>
                {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Stats row */}
        {testResult && (
          <div className="grid grid-cols-3 gap-3">
            <MetCard label="Tests Passed" value={testResult.passed} color="text-emerald-400" />
            <MetCard label="Tests Failed" value={testResult.failed} color={testResult.failed > 0 ? "text-red-400" : "text-zinc-500"} />
            <MetCard label="Total"        value={testResult.total}  color="text-zinc-300" />
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          <button onClick={runTests} disabled={running}
            className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-bold">
            {running ? "Running..." : "▶ Run Integration Tests (~100)"}
          </button>
        </div>

        {/* Cert banner */}
        {testResult && (
          <div className={"border-2 rounded-xl p-4 text-center " + (testResult.certified ? "border-emerald-500 bg-emerald-950/20" : "border-red-700 bg-red-950/10")}>
            <div className={"text-xl font-bold " + (testResult.certified ? "text-emerald-400" : "text-red-400")}>
              {testResult.certified ? "✓ EF-38.1 INTEGRATION LAYER CERTIFIED" : "✗ TESTS FAILED"}
            </div>
            <div className="text-zinc-400 text-sm mt-1">{testResult.passed}/{testResult.total} passed · {testResult.failed} failed</div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={"flex-1 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap " + (tab === t ? "bg-violet-700 text-white" : "text-zinc-400 hover:text-white")}>
              {t}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ───────────────────────────────────────────────────────── */}
        {tab === "Overview" && (
          <div className="space-y-3">
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-1">
              <div className="text-zinc-400 tracking-widest mb-2">SPRINT OBJECTIVE</div>
              {[
                "Every MemoryOS component communicates with storage through KnowledgeStoreFacade only",
                "KnowledgeStoreFacade depends only on IKnowledgeStore — never on concrete engines",
                "No storage implementation exists — provider returns a null stub",
                "Middleware pipeline: Validation → Authorization → Audit → Metrics → Tracing",
                "Registry stores metadata for 7 engines (no implementation code)",
                "Resolver maps environment to engine id deterministically",
                "Provider enforces singleton lifecycle with safe replacement",
                "Metrics and HealthMonitor updated automatically on every operation",
              ].map((p,i) => <div key={i} className="text-zinc-300">✓ {p}</div>)}
            </div>
          </div>
        )}

        {/* ── ARCHITECTURE ───────────────────────────────────────────────────── */}
        {tab === "Architecture" && (
          <div className="space-y-3">
            {[
              { name:"KnowledgeStoreFacade", role:"Official public API. Receives requests, validates, runs middleware, emits events, collects metrics, calls IKnowledgeStore.", color:"border-violet-700 text-violet-300" },
              { name:"KnowledgeStoreProvider", role:"Singleton lifecycle. Lazy init. Runtime configuration. Safe store replacement. Zero concrete deps.", color:"border-sky-700 text-sky-300" },
              { name:"KnowledgeStoreRegistry", role:"Metadata store for 7 engine identifiers. No implementation classes. Supports future engines without code changes.", color:"border-blue-700 text-blue-300" },
              { name:"KnowledgeStoreResolver", role:"Maps environment → engine id. Development→memory, Production→postgres, Enterprise→distributed. Deterministic, override supported.", color:"border-amber-700 text-amber-300" },
              { name:"KnowledgeStoreMiddleware", role:"5-step pipeline: Validation → Authorization → Audit → Metrics → Tracing. Each step independent, immutable, replaceable.", color:"border-orange-700 text-orange-300" },
              { name:"KnowledgeStoreMetrics", role:"Collects 14 metrics: counts per operation, avg/max latency, failure rate, success rate, availability. Immutable snapshots.", color:"border-emerald-700 text-emerald-300" },
              { name:"KnowledgeStoreHealthMonitor", role:"Tracks healthy/degraded/offline status. Records latency, error count, uptime. Never modifies store state.", color:"border-teal-700 text-teal-300" },
            ].map(s => (
              <div key={s.name} className={"border rounded-xl bg-zinc-900 p-4 " + s.color}>
                <div className={"font-bold text-sm " + s.color.split(" ")[1]}>{s.name}</div>
                <div className="text-zinc-500 text-xs mt-1">{s.role}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── FACADE ─────────────────────────────────────────────────────────── */}
        {tab === "Facade" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">KnowledgeStoreFacade — PUBLIC API</div>
            {["store()","update()","archive()","restore()","delete()","exists()","get()","search()","query()","stats()","health()","metrics()","healthSnapshot()","providerState()"].map(m => (
              <div key={m} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/40 last:border-0">
                <span className="text-violet-400 font-bold text-xs w-36">{m}</span>
                <span className="text-zinc-500 text-xs">
                  {m === "metrics()" ? "Returns immutable MetricsSnapshot" :
                   m === "healthSnapshot()" ? "Returns immutable HealthSnapshot" :
                   m === "providerState()" ? "Returns immutable ProviderState" :
                   "Validates → Middleware → IKnowledgeStore → frozen Result"}
                </span>
              </div>
            ))}
            <div className="px-4 py-3 bg-zinc-800/30 text-xs text-zinc-500">
              Facade never knows the active engine · Middleware runs on every operation · All results frozen
            </div>
          </div>
        )}

        {/* ── REGISTRY ───────────────────────────────────────────────────────── */}
        {tab === "Registry" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900 overflow-x-auto">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">REGISTERED ENGINES — {ENGINES.length}</div>
            <table className="w-full text-xs font-mono">
              <thead><tr className="border-b border-zinc-800">
                <th className="px-3 py-2 text-left text-zinc-500">Engine</th>
                <th className="px-3 py-2 text-zinc-500">Environment</th>
                <th className="px-3 py-2 text-zinc-500">Stable</th>
                <th className="px-3 py-2 text-zinc-500">Persist</th>
              </tr></thead>
              <tbody>
                {ENGINES.map(e => (
                  <tr key={e.id} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20">
                    <td className="px-3 py-2 text-blue-300 font-bold">{e.id}</td>
                    <td className="px-3 py-2 text-zinc-400">{e.env}</td>
                    <td className={"px-3 py-2 text-center " + (e.stable ? "text-emerald-400" : "text-amber-400")}>{e.stable ? "✓" : "⚗"}</td>
                    <td className={"px-3 py-2 text-center " + (e.persist ? "text-emerald-400" : "text-red-400")}>{e.persist ? "✓" : "✗"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 text-zinc-600 text-xs">⚗ = experimental · No implementation code exists — metadata only</div>
          </div>
        )}

        {/* ── RESOLVER ───────────────────────────────────────────────────────── */}
        {tab === "Resolver" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">ENVIRONMENT → ENGINE RESOLUTION</div>
            {Object.entries(ENV_MAP).map(([env, engine]) => (
              <div key={env} className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800/40 last:border-0">
                <Badge label={env} color="text-sky-400" />
                <span className="text-zinc-600">→</span>
                <Badge label={engine} color="text-violet-400" />
              </div>
            ))}
            <div className="px-4 py-3 text-zinc-600 text-xs">Override via config.override · Resolver never instantiates implementations</div>
          </div>
        )}

        {/* ── MIDDLEWARE ─────────────────────────────────────────────────────── */}
        {tab === "Middleware" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">MIDDLEWARE PIPELINE — 5 STEPS</div>
            {[
              { step:"1", name:"Validation",     desc:"Validates draft, patch, query, and search inputs before reaching the store", color:"text-sky-400" },
              { step:"2", name:"Authorization",  desc:"Checks caller permissions (permit-all in EF-38.1 — rules injected in future sprint)", color:"text-blue-400" },
              { step:"3", name:"Audit",          desc:"Emits KnowledgeStoreEvent for every operation — immutable, append-only", color:"text-violet-400" },
              { step:"4", name:"Metrics",        desc:"Pre-operation metrics registration — finalized in facade after result", color:"text-amber-400" },
              { step:"5", name:"Tracing",        desc:"OpenTelemetry-ready trace entry point — no-op until production sprint", color:"text-emerald-400" },
            ].map(s => (
              <div key={s.name} className="flex items-start gap-4 px-4 py-3 border-b border-zinc-800/40 last:border-0">
                <span className={"font-bold text-lg w-6 shrink-0 " + s.color}>{s.step}</span>
                <div>
                  <div className={"font-bold text-xs " + s.color}>{s.name}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">{s.desc}</div>
                </div>
              </div>
            ))}
            <div className="px-4 py-3 bg-zinc-800/30 text-xs text-zinc-500">Each step is independent · Each result is frozen · Blocked requests never reach the store</div>
          </div>
        )}

        {/* ── METRICS ────────────────────────────────────────────────────────── */}
        {tab === "Metrics" && (
          <div className="space-y-3">
            {metrics ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <MetCard label="Store ops"   value={metrics.storeCount}   color="text-sky-400" />
                <MetCard label="Update ops"  value={metrics.updateCount}  color="text-blue-400" />
                <MetCard label="Archive ops" value={metrics.archiveCount} color="text-amber-400" />
                <MetCard label="Delete ops"  value={metrics.deleteCount}  color="text-red-400" />
                <MetCard label="Query ops"   value={metrics.queryCount}   color="text-violet-400" />
                <MetCard label="Search ops"  value={metrics.searchCount}  color="text-indigo-400" />
                <MetCard label="Total ops"   value={metrics.totalOps}     color="text-zinc-300" />
                <MetCard label="Failures"    value={metrics.failureCount} color="text-red-400" />
                <MetCard label="Success rate" value={(metrics.successRate * 100).toFixed(1) + "%"} color="text-emerald-400" />
                <MetCard label="Failure rate" value={(metrics.failureRate * 100).toFixed(1) + "%"} color="text-orange-400" />
                <MetCard label="Avg latency" value={metrics.avgLatencyMs + "ms"} color="text-zinc-400" />
                <MetCard label="Max latency" value={metrics.maxLatencyMs + "ms"} color="text-zinc-400" />
              </div>
            ) : (
              <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">Run tests to populate metrics.</div>
            )}
          </div>
        )}

        {/* ── HEALTH ─────────────────────────────────────────────────────────── */}
        {tab === "Health" && (
          <div className="space-y-3">
            {health ? (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={"text-2xl font-bold " + (health.status === "healthy" ? "text-emerald-400" : health.status === "degraded" ? "text-amber-400" : "text-red-400")}>
                    {health.status.toUpperCase()}
                  </div>
                  <Badge label={health.engineId} color="text-sky-400" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <MetCard label="Latency"      value={health.latencyMs + "ms"}                 color="text-zinc-300" />
                  <MetCard label="Availability" value={(health.availability * 100).toFixed(1) + "%"} color="text-sky-400" />
                  <MetCard label="Uptime"       value={Math.round(health.uptimeMs / 1000) + "s"} color="text-emerald-400" />
                  <MetCard label="Errors"       value={health.errorCount}                        color="text-red-400" />
                  <MetCard label="Warnings"     value={health.warningCount}                      color="text-amber-400" />
                </div>
                <div className="text-zinc-500 text-xs">{health.details}</div>
              </div>
            ) : (
              <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">Run tests to populate health status.</div>
            )}
          </div>
        )}

        {/* ── CONFIGURATION ──────────────────────────────────────────────────── */}
        {tab === "Configuration" && (
          <div className="space-y-3">
            {providerState ? (
              <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 space-y-3">
                <div className="text-zinc-400 text-xs tracking-widest">ACTIVE PROVIDER STATE</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-zinc-800 rounded p-2"><div className="text-zinc-500">Environment</div><div className="text-sky-400 font-bold">{providerState.environment}</div></div>
                  <div className="bg-zinc-800 rounded p-2"><div className="text-zinc-500">Engine</div><div className="text-violet-400 font-bold">{providerState.engineId ?? "none"}</div></div>
                  <div className="bg-zinc-800 rounded p-2"><div className="text-zinc-500">Initialized</div><div className={"font-bold " + (providerState.initialized ? "text-emerald-400" : "text-red-400")}>{providerState.initialized ? "Yes" : "No"}</div></div>
                  <div className="bg-zinc-800 rounded p-2"><div className="text-zinc-500">Config Engine</div><div className="text-amber-400 font-bold">{providerState.config?.engine ?? "—"}</div></div>
                </div>
              </div>
            ) : (
              <div className="border border-zinc-700 rounded-xl p-8 text-center bg-zinc-900 text-zinc-500 text-sm">Run tests to show configuration.</div>
            )}
            <div className="border border-zinc-700 rounded-xl bg-zinc-900 p-4 text-xs space-y-1">
              <div className="text-zinc-400 tracking-widest mb-2">ENVIRONMENT CONFIGURATION</div>
              {[["development","memory","fast ephemeral — dev only"],["testing","memory","fast ephemeral — test isolation"],["production","postgres","persistent ACID — GDPR compliant"],["enterprise","distributed","multi-region — highest resilience"]].map(([env,engine,note]) => (
                <div key={env} className="flex items-center gap-3">
                  <Badge label={env} color="text-sky-400" />
                  <span className="text-zinc-600">→</span>
                  <Badge label={engine} color="text-violet-400" />
                  <span className="text-zinc-600 text-xs">{note}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TESTS ──────────────────────────────────────────────────────────── */}
        {tab === "Tests" && (
          <div className="border border-zinc-700 rounded-xl bg-zinc-900">
            {testResult ? (
              <>
                <div className="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 tracking-widest">
                  INTEGRATION TESTS — {testResult.passed}/{testResult.total} — Registry · Resolver · Provider · Middleware · Metrics · Health · Facade · SOLID
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {testResult.results.map(r => (
                    <div key={r.id} className={"flex items-center gap-3 px-4 py-2 border-b border-zinc-800/40 last:border-0 " + (!r.passed ? "bg-red-950/10" : "")}>
                      <div className={"w-1.5 h-1.5 rounded-full shrink-0 " + (r.passed ? "bg-emerald-500" : "bg-red-500")} />
                      <span className="text-zinc-500 text-xs w-28 shrink-0">{r.suite}</span>
                      <span className="text-zinc-300 text-xs flex-1">{r.name}</span>
                      {!r.passed && <span className="text-red-400 text-xs truncate max-w-xs">{r.error}</span>}
                      <span className={"text-xs font-bold " + (r.passed ? "text-emerald-400" : "text-red-400")}>{r.passed ? "PASS" : "FAIL"}</span>
                      <span className="text-zinc-600 text-xs font-mono">{r.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-zinc-600 text-sm">Click "Run Integration Tests" to execute all suites.</div>
            )}
          </div>
        )}

        {/* Acceptance criteria */}
        <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900 text-xs space-y-1">
          <div className="text-zinc-400 tracking-widest mb-2">ACCEPTANCE CRITERIA — EF-38.1</div>
          {[
            "Every component depends only on KnowledgeStoreFacade",
            "KnowledgeStoreFacade depends only on IKnowledgeStore (via Provider)",
            "No concrete storage implementation exists",
            "Registry supports future engines with zero code changes",
            "Resolver selects engine through environment configuration only",
            "Provider enforces singleton lifecycle and safe replacement",
            "Middleware runs before every operation (5 independent steps)",
            "Metrics collected automatically on every facade call",
            "HealthMonitor reflects runtime status without modifying store",
            "All DTOs and snapshots are immutable (Object.freeze)",
            "All public APIs are deterministic",
            "Architecture is ready for MemoryStore, SQLite, PostgreSQL, Neo4j, Vector, Cloud, Distributed",
          ].map((c,i) => <div key={i} className="text-zinc-300">✓ {c}</div>)}
        </div>

      </div>
    </div>
  );
}