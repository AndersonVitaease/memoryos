/**
 * SprintE024Page — Engineering Sprint E-02.4
 * Universal Connector Router — Validation Dashboard
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, Network } from "lucide-react";

function TestResultList({ results }) {
  return (
    <div className="space-y-2">
      {results.map((r, i) => (
        <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${r.passed ? "border-border/50 bg-muted/20" : "border-red-500/30 bg-red-500/10"}`}>
          {r.passed
            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
            : <XCircle    className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className={r.passed ? "text-foreground" : "text-red-400"}>{r.name}</p>
            {!r.passed && r.error && <p className="text-red-400/70 mt-0.5 font-mono text-[10px]">{r.error}</p>}
          </div>
          <span className="flex items-center gap-1 text-muted-foreground shrink-0">
            <Clock className="w-3 h-3" />{r.durationMs}ms
          </span>
        </div>
      ))}
    </div>
  );
}

function Verdict({ results }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium mb-3 ${results.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
      {results.verdict === "PASS" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {results.verdict} — {results.passed}/{results.total} aprovados
    </div>
  );
}

export default function SprintE024Page() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null);
  const [demoOut, setDemoOut]   = useState(null);
  const [demoRunning, setDemoRunning] = useState(false);

  async function runTests() {
    setRunning(true);
    setResults(null);
    try {
      const { runConnectorRouterTests } = await import("@/lib/connector-router/connectorRouterTests");
      setResults(await runConnectorRouterTests());
    } catch (e) {
      setResults({ verdict: "FAIL", passed: 0, failed: 1, total: 1, results: [{ name: "Suite load error", passed: false, error: e.message, durationMs: 0 }] });
    } finally {
      setRunning(false);
    }
  }

  async function runDemo() {
    setDemoRunning(true);
    setDemoOut(null);
    try {
      const { ConnectorRegistry }           = await import("@/lib/connector-router/ConnectorRegistry");
      const { UniversalConnectorRouter }    = await import("@/lib/connector-router/UniversalConnectorRouter");
      const { ConnectorCapabilityExecutor } = await import("@/lib/connector-router/ConnectorCapabilityExecutor");
      const { MockGmailConnector }          = await import("@/lib/connector-router/mock/MockGmailConnector");
      const { MockCalendarConnector }       = await import("@/lib/connector-router/mock/MockCalendarConnector");
      const { MockDriveConnector }          = await import("@/lib/connector-router/mock/MockDriveConnector");
      const { ConversationRuntimeEngine }   = await import("@/lib/runtime-engine/ConversationRuntimeEngine");

      const registry = new ConnectorRegistry();
      registry.register(new MockGmailConnector(60));
      registry.register(new MockCalendarConnector(60));
      registry.register(new MockDriveConnector(60));

      const router   = new UniversalConnectorRouter(registry);
      const executor = new ConnectorCapabilityExecutor(router);
      const engine   = new ConversationRuntimeEngine(executor);

      const plan = Object.freeze({
        id: "demo-ucr-1", goalId: "demo-goal-1", goalType: "multi_connector",
        status: "planned",
        steps: Object.freeze([
          Object.freeze({ id: "s1", connector: "gmail",    capability: "readInbox",    parameters: Object.freeze({ maxResults: 5 }) }),
          Object.freeze({ id: "s2", connector: "calendar", capability: "listToday",    parameters: Object.freeze({}) }),
          Object.freeze({ id: "s3", connector: "drive",    capability: "searchFiles",  parameters: Object.freeze({ query: "report" }) }),
        ]),
        createdAt: Date.now(), durationMs: 0,
      });

      const events = [];
      engine.onEvent((e) => events.push(e));
      const result = await engine.execute(plan);
      setDemoOut({ result, events, connectors: registry.list() });
    } catch (e) {
      setDemoOut({ error: e.message });
    } finally {
      setDemoRunning(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <h1 className="text-2xl font-bold mb-1">Sprint E-02.4 — Universal Connector Router</h1>
      <p className="text-sm text-muted-foreground mb-2">
        Camada de roteamento entre o Runtime e qualquer Connector externo.
        O Runtime continua conhecendo apenas <code className="text-xs bg-muted px-1 rounded">ICapabilityExecutor</code>.
      </p>
      <p className="text-xs text-muted-foreground mb-8 font-mono">
        Conversation → Goal → Planning → Runtime → Dispatcher → ConnectorCapabilityExecutor → UCR → ConnectorRegistry → Connector
      </p>

      {/* Architecture diagram */}
      <section className="mb-8 p-4 rounded-xl border border-border bg-muted/20 text-xs font-mono space-y-1">
        <p className="text-muted-foreground font-semibold mb-2 font-sans text-[11px] uppercase tracking-wide">Arquitetura E-02.4</p>
        {[
          ["ConversationPipeline", "violet"],
          ["↓", "muted"],
          ["ConversationRuntimeEngine", "blue"],
          ["↓ (ICapabilityExecutor)", "muted"],
          ["ExecutionDispatcher", "blue"],
          ["↓", "muted"],
          ["ConnectorCapabilityExecutor  [Adapter]", "amber"],
          ["↓", "muted"],
          ["UniversalConnectorRouter", "emerald"],
          ["↓", "muted"],
          ["ConnectorRegistry", "emerald"],
          ["↓", "muted"],
          ["MockGmailConnector | MockCalendarConnector | MockDriveConnector", "zinc"],
        ].map(([label, color], i) => (
          <p key={i} className={
            color === "violet" ? "text-violet-400" :
            color === "blue"   ? "text-blue-400" :
            color === "amber"  ? "text-amber-400" :
            color === "emerald"? "text-emerald-400" :
            color === "zinc"   ? "text-zinc-400" :
            "text-muted-foreground"
          }>{label}</p>
        ))}
      </section>

      {/* Demo */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Demo: Execução end-to-end via UCR (3 connectors)
        </h2>
        <button onClick={runDemo} disabled={demoRunning}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 mb-4">
          <Network className="w-4 h-4" />
          {demoRunning ? "Executando…" : "Executar plano multi-connector"}
        </button>

        {demoOut && !demoOut.error && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-border bg-muted/30 text-xs font-mono">
              <p className="font-semibold text-foreground mb-2">ExecutionResult</p>
              <p><span className="text-muted-foreground">status:      </span> <span className={demoOut.result.status === "completed" ? "text-emerald-500" : "text-red-500"}>{demoOut.result.status}</span></p>
              <p><span className="text-muted-foreground">steps:       </span> {demoOut.result.steps.length}</p>
              <p><span className="text-muted-foreground">durationMs:  </span> {demoOut.result.durationMs}ms</p>
              <p><span className="text-muted-foreground">errors:      </span> {demoOut.result.errors.length === 0 ? "none" : demoOut.result.errors.join(", ")}</p>
              <p><span className="text-muted-foreground">connectors:  </span> {demoOut.connectors.join(", ")}</p>
              <div className="mt-3 space-y-1 border-t border-border/50 pt-3">
                {demoOut.result.steps.map((s) => (
                  <div key={s.stepId} className="flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="text-muted-foreground">{s.connector}.{s.capability}</span>
                    <span className="text-foreground">{s.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30 text-xs font-mono">
              <p className="font-semibold text-foreground mb-2">Runtime Events ({demoOut.events.length})</p>
              {demoOut.events.map((e, i) => (
                <p key={i} className="text-muted-foreground">{e.type}{e.capability ? ` → ${e.connector}.${e.capability}` : ""}</p>
              ))}
            </div>
          </div>
        )}
        {demoOut?.error && (
          <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-xs font-mono">{demoOut.error}</div>
        )}
      </section>

      {/* Tests */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Suite de testes (22 casos)
        </h2>
        <button onClick={runTests} disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 mb-4">
          <Play className="w-4 h-4" />
          {running ? "Executando testes…" : "Executar todos os testes"}
        </button>
        {results && (
          <>
            <Verdict results={results} />
            <TestResultList results={results.results} />
          </>
        )}
      </section>
    </div>
  );
}